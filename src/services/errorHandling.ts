export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMs: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  monitorWindowMs: number;
}

export enum ErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface ServiceError extends Error {
  type: ErrorType;
  retryable: boolean;
  statusCode?: number;
  service: string;
  originalError?: any;
}

export class WorkflowError extends Error {
  constructor(
    public readonly stage: string,
    public readonly service: string,
    public readonly originalError: ServiceError,
    public readonly resumeData?: any
  ) {
    super(`Workflow failed at stage '${stage}' in service '${service}': ${originalError.message}`);
    this.name = 'WorkflowError';
  }
}

/**
 * Create a ServiceError with proper categorization
 * Why this matters: Categorizing errors helps determine whether to retry,
 * what backoff strategy to use, and how to handle the failure gracefully.
 */
export function createServiceError(
  error: any,
  service: string,
  context?: string
): ServiceError {
  const serviceError = new Error() as ServiceError;
  serviceError.service = service;
  serviceError.originalError = error;

  // Categorize error based on common API error patterns
  if (error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED' || error?.code === 'ETIMEDOUT') {
    serviceError.type = ErrorType.NETWORK_ERROR;
    serviceError.retryable = true;
    serviceError.message = `Network error in ${service}: ${error.message}`;
  } else if (error?.status === 429 || error?.code === 'rate_limit_exceeded') {
    serviceError.type = ErrorType.RATE_LIMIT_ERROR;
    serviceError.retryable = true;
    serviceError.statusCode = 429;
    serviceError.message = `Rate limit exceeded in ${service}`;
  } else if (error?.status === 401 || error?.status === 403 || error?.code === 'invalid_api_key') {
    serviceError.type = ErrorType.AUTHENTICATION_ERROR;
    serviceError.retryable = false;
    serviceError.statusCode = error.status;
    serviceError.message = `Authentication failed in ${service}: ${error.message}`;
  } else if (error?.status === 400 || error?.code === 'invalid_request') {
    serviceError.type = ErrorType.VALIDATION_ERROR;
    serviceError.retryable = false;
    serviceError.statusCode = 400;
    serviceError.message = `Validation error in ${service}: ${error.message}`;
  } else if (error?.status === 503 || error?.status === 502 || error?.status === 504) {
    serviceError.type = ErrorType.SERVICE_UNAVAILABLE;
    serviceError.retryable = true;
    serviceError.statusCode = error.status;
    serviceError.message = `Service unavailable in ${service}`;
  } else if (error?.code === 'TIMEOUT' || error?.name === 'TimeoutError') {
    serviceError.type = ErrorType.TIMEOUT_ERROR;
    serviceError.retryable = true;
    serviceError.message = `Timeout error in ${service}`;
  } else {
    serviceError.type = ErrorType.UNKNOWN_ERROR;
    serviceError.retryable = true; // Default to retryable for unknown errors
    serviceError.message = `Unknown error in ${service}: ${error?.message || 'Unknown error'}`;
  }

  if (context) {
    serviceError.message = `${serviceError.message} (Context: ${context})`;
  }

  return serviceError;
}

/**
 * Retry function with exponential backoff and jitter
 * Why this matters: Exponential backoff prevents thundering herd problems when services recover,
 * while jitter spreads out retry attempts to reduce load spikes.
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig,
  serviceName: string,
  context?: string
): Promise<T> {
  let lastError: ServiceError | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await operation();
      
      if (attempt > 0) {
        console.log(`✅ ${serviceName} succeeded on attempt ${attempt + 1}`);
      }
      
      return result;
    } catch (error) {
      const serviceError = createServiceError(error, serviceName, context);
      lastError = serviceError;

      // Don't retry if error is not retryable
      if (!serviceError.retryable) {
        console.error(`❌ ${serviceName} failed with non-retryable error:`, serviceError.message);
        throw serviceError;
      }

      // Don't retry if this was the last attempt
      if (attempt === config.maxRetries) {
        console.error(`❌ ${serviceName} failed after ${config.maxRetries + 1} attempts:`, serviceError.message);
        throw serviceError;
      }

      let delay: number;
      
      // Special handling for rate limit errors with retry-after header
      if (serviceError.type === ErrorType.RATE_LIMIT_ERROR && 
          error && typeof error === 'object' && 'headers' in error && 
          error.headers && typeof error.headers === 'object' && 'retry-after' in error.headers) {
        const retryAfterSeconds = parseInt(String(error.headers['retry-after']));
        delay = retryAfterSeconds * 1000; // Convert to milliseconds
        console.warn(`⚠️ ${serviceName} rate limit hit, respecting retry-after: ${retryAfterSeconds}s`);
      } else {
        // Calculate delay with exponential backoff and jitter
        const baseDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
        const jitter = Math.random() * config.jitterMs;
        delay = Math.min(baseDelay + jitter, config.maxDelayMs);
        console.warn(`⚠️ ${serviceName} failed on attempt ${attempt + 1}: ${serviceError.message}`);
      }

      console.log(`🔄 Retrying ${serviceName} in ${Math.round(delay)}ms (attempt ${attempt + 2}/${config.maxRetries + 1})`);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Circuit breaker to prevent cascading failures
 * Why this matters: When a service is consistently failing, the circuit breaker
 * prevents wasting time on doomed requests and allows the service time to recover.
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private config: CircuitBreakerConfig,
    private serviceName: string
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.config.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        console.log(`🔄 Circuit breaker for ${this.serviceName} transitioning to HALF_OPEN`);
      } else {
        throw new Error(`Circuit breaker for ${this.serviceName} is OPEN - service likely unavailable`);
      }
    }

    try {
      const result = await operation();
      
      if (this.state === 'HALF_OPEN') {
        this.reset();
        console.log(`✅ Circuit breaker for ${this.serviceName} reset to CLOSED`);
      }
      
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN';
      console.error(`⚠️ Circuit breaker for ${this.serviceName} OPENED after ${this.failures} failures`);
    }
  }

  private reset(): void {
    this.failures = 0;
    this.state = 'CLOSED';
    this.lastFailureTime = 0;
  }

  getState(): { state: string; failures: number; lastFailureTime: number } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }
}

/**
 * Rate limit handler with respect for API quotas
 * Why this matters: Different APIs have different rate limits. Respecting these
 * limits prevents getting blocked and maintains good API citizenship.
 */
export class RateLimiter {
  private lastRequestTime = 0;

  constructor(
    private minIntervalMs: number,
    private serviceName: string
  ) {}

  async waitForNext(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minIntervalMs) {
      const waitTime = this.minIntervalMs - timeSinceLastRequest;
      console.log(`⏱️ Rate limiting ${this.serviceName}: waiting ${waitTime}ms`);
      await sleep(waitTime);
    }
    
    this.lastRequestTime = Date.now();
  }
}

/**
 * Sleep utility with promise support
 * Why this matters: Clean async sleep for retry delays and rate limiting.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Default retry configurations for different service types
 * Why this matters: Different APIs have different characteristics and optimal retry strategies.
 */
export const DEFAULT_RETRY_CONFIGS: Record<string, RetryConfig> = {
  firecrawl: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    jitterMs: 500
  },
  openai: {
    maxRetries: 5,
    baseDelayMs: 10000,  // Start with 10 seconds
    maxDelayMs: 120000,  // Allow up to 2 minutes for rate limit recovery
    backoffMultiplier: 2.5,  // More aggressive backoff
    jitterMs: 2000
  },
  claude: {
    maxRetries: 2, // Reduced retries since we increased timeout to 5 minutes
    baseDelayMs: 2000,
    maxDelayMs: 20000,
    backoffMultiplier: 2,
    jitterMs: 1000
  },
  mcp: {
    maxRetries: 3, // MCP queries should be fast, allow more retries
    baseDelayMs: 1000,
    maxDelayMs: 15000,
    backoffMultiplier: 2,
    jitterMs: 500
  }
};

/**
 * Default circuit breaker configurations
 * Why this matters: Protects against cascading failures while allowing recovery.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIGS: Record<string, CircuitBreakerConfig> = {
  firecrawl: {
    failureThreshold: 5,
    resetTimeoutMs: 60000, // 1 minute
    monitorWindowMs: 300000 // 5 minutes
  },
  openai: {
    failureThreshold: 3,
    resetTimeoutMs: 120000, // 2 minutes
    monitorWindowMs: 600000 // 10 minutes
  },
  claude: {
    failureThreshold: 4,
    resetTimeoutMs: 90000, // 1.5 minutes
    monitorWindowMs: 450000 // 7.5 minutes
  },
  mcp: {
    failureThreshold: 3, // Open circuit after 3 failures
    resetTimeoutMs: 60000, // 1 minute - MCP should recover quickly
    monitorWindowMs: 300000 // 5 minutes
  }
};

/**
 * Rate limiter configurations to respect API limits
 * Why this matters: Prevents hitting rate limits that would cause failures.
 * GPT-4.1-nano has strict limits: 3 RPM and 100k TPM
 */
export const DEFAULT_RATE_LIMITS: Record<string, number> = {
  firecrawl: 1000, // 1 second between requests
  openai_deep_research: 15000, // 15 seconds (4 RPM - testing threshold)
  openai_gap_analysis: 15000, // 15 seconds (4 RPM - testing threshold)
  openai_general: 15000, // 15 seconds for other OpenAI requests
  claude: 1500, // 1.5 seconds for Claude requests
  mcp: 1000 // 1 second between MCP requests - conservative rate limiting
}; 

/**
 * Global OpenAI Request Queue Manager
 * Why this matters: Coordinates all OpenAI requests across different services to prevent
 * rate limit conflicts when multiple workflows run concurrently.
 */
class GlobalOpenAIQueue {
  private static instance: GlobalOpenAIQueue;
  private queue: Array<{ requestFn: () => Promise<any>; resolve: Function; reject: Function }> = [];
  private isProcessing = false;
  private lastRequestTime = 0;
  private readonly minDelayMs = 15000; // 15 seconds between requests (4 RPM - test if this works)

  static getInstance(): GlobalOpenAIQueue {
    if (!GlobalOpenAIQueue.instance) {
      GlobalOpenAIQueue.instance = new GlobalOpenAIQueue();
    }
    return GlobalOpenAIQueue.instance;
  }

  /**
   * Queue an OpenAI request to ensure proper rate limiting
   * Why this matters: Serializes all OpenAI requests globally to respect 3 RPM limit
   */
  async queueRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, resolve, reject });
      console.log(`📥 OpenAI request queued. Queue length: ${this.queue.length}`);
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const { requestFn, resolve, reject } = this.queue.shift()!;
      
      try {
        // Ensure minimum delay between requests
        const timeSinceLastRequest = Date.now() - this.lastRequestTime;
        if (timeSinceLastRequest < this.minDelayMs) {
          const waitTime = this.minDelayMs - timeSinceLastRequest;
          console.log(`⏳ Global OpenAI queue: waiting ${waitTime}ms before next request`);
          await sleep(waitTime);
        }

        console.log(`🚀 Processing OpenAI request. Queue remaining: ${this.queue.length}`);
        this.lastRequestTime = Date.now();
        const result = await requestFn();
        console.log(`✅ OpenAI request completed successfully`);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }

    this.isProcessing = false;
  }
}

export const globalOpenAIQueue = GlobalOpenAIQueue.getInstance(); 

/**
 * Workflow Cost Tracker
 * Why this matters: Tracks total API costs across all services in a content generation workflow
 * to help calculate actual cost per piece of content generated.
 */
class WorkflowCostTracker {
  private static instance: WorkflowCostTracker;
  private workflowCosts = new Map<string, {
    totalCost: number;
    apiCalls: Array<{
      service: string;
      inputTokens: number;
      outputTokens: number;
      cost: number;
      timestamp: number;
    }>;
    startTime: number;
  }>();

  static getInstance(): WorkflowCostTracker {
    if (!WorkflowCostTracker.instance) {
      WorkflowCostTracker.instance = new WorkflowCostTracker();
    }
    return WorkflowCostTracker.instance;
  }

  /**
   * Start tracking costs for a new workflow
   */
  startWorkflow(workflowId: string): void {
    this.workflowCosts.set(workflowId, {
      totalCost: 0,
      apiCalls: [],
      startTime: Date.now()
    });
    console.log(`💼 Started cost tracking for workflow: ${workflowId}`);
  }

  /**
   * Add an API call cost to a workflow with model-specific pricing
   */
  addApiCall(workflowId: string, service: string, inputTokens: number, outputTokens: number, model?: string): void {
    const workflow = this.workflowCosts.get(workflowId);
    if (!workflow) {
      console.warn(`⚠️ Workflow ${workflowId} not found for cost tracking`);
      return;
    }

    // Model-specific pricing per 1M tokens
    let inputPricePerMillion: number;
    let outputPricePerMillion: number;

    switch (model) {
      case 'o4-mini-deep-research':
        inputPricePerMillion = 2.00;   // $2.00 per 1M input tokens
        outputPricePerMillion = 8.00;  // $8.00 per 1M output tokens
        break;
      case 'gpt-5-nano':
      default:
        inputPricePerMillion = 0.10;   // $0.10 per 1M input tokens  
        outputPricePerMillion = 0.40;  // $0.40 per 1M output tokens
        break;
    }

    const inputCost = (inputTokens / 1000000) * inputPricePerMillion;
    const outputCost = (outputTokens / 1000000) * outputPricePerMillion;
    const totalCost = inputCost + outputCost;

    workflow.apiCalls.push({
      service,
      inputTokens,
      outputTokens,
      cost: totalCost,
      timestamp: Date.now()
    });

    workflow.totalCost += totalCost;

    console.log(`💰 ${service} - Input: ${inputTokens}, Output: ${outputTokens}, Cost: $${totalCost.toFixed(4)}`);
    console.log(`📊 Workflow ${workflowId} total cost: $${workflow.totalCost.toFixed(4)}`);
  }

  /**
   * Finish workflow and log final cost summary
   */
  finishWorkflow(workflowId: string, keyword?: string): void {
    const workflow = this.workflowCosts.get(workflowId);
    if (!workflow) return;

    const duration = (Date.now() - workflow.startTime) / 1000;
    const totalTokens = workflow.apiCalls.reduce((sum, call) => sum + call.inputTokens + call.outputTokens, 0);

    console.log(`\n🏁 Workflow Complete: ${workflowId}`);
    if (keyword) console.log(`📝 Keyword: "${keyword}"`);
    console.log(`⏱️  Duration: ${duration.toFixed(1)}s`);
    console.log(`🔢 Total Tokens: ${totalTokens.toLocaleString()}`);
    console.log(`💵 Total Cost: $${workflow.totalCost.toFixed(4)}`);
    console.log(`📈 Cost per minute: $${(workflow.totalCost / (duration / 60)).toFixed(4)}`);
    console.log(`🔍 API Calls breakdown:`);
    
    workflow.apiCalls.forEach((call, index) => {
      console.log(`  ${index + 1}. ${call.service}: ${call.inputTokens + call.outputTokens} tokens, $${call.cost.toFixed(4)}`);
    });
    console.log('');

    // Clean up
    this.workflowCosts.delete(workflowId);
  }
}

export const workflowCostTracker = WorkflowCostTracker.getInstance(); 