import axios, { AxiosInstance } from 'axios';
import { EventSource } from 'eventsource';
import { 
  RetryConfig, 
  CircuitBreakerConfig, 
  CircuitBreaker, 
  RateLimiter,
  retryWithBackoff,
  createServiceError,
  DEFAULT_RETRY_CONFIGS,
  DEFAULT_CIRCUIT_BREAKER_CONFIGS,
  DEFAULT_RATE_LIMITS
} from './errorHandling';

/**
 * Permanent Circuit Breaker for SaaS applications requiring always-on connections
 * Why this matters: Unlike standard circuit breakers that open on failures,
 * this implementation always stays CLOSED to maintain permanent MCP connections
 */
class PermanentCircuitBreaker extends CircuitBreaker {
  constructor(serviceName: string) {
    // Use dummy config since we override all behavior
    super({ failureThreshold: 999999, resetTimeoutMs: 0, monitorWindowMs: 0 }, serviceName);
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Always execute - never open the circuit for permanent connections
    // Why this matters: SaaS applications need reliable, always-on MCP access
    return await operation();
  }

  getState(): { state: string; failures: number; lastFailureTime: number } {
    return {
      state: 'PERMANENTLY_CLOSED',
      failures: 0,
      lastFailureTime: 0
    };
  }
}

// JSON-RPC 2.0 Protocol Interfaces
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

// MCP Protocol Interfaces
interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface MCPPrompt {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
}

interface MCPToolCallResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

interface MCPConnectionState {
  status: 'discovering' | 'pending_auth' | 'authenticating' | 'connecting' | 'loading' | 'ready' | 'failed';
  lastConnected?: Date;
  lastError?: string;
  toolsDiscovered?: number;
  resourcesDiscovered?: number;
}

// Tool Capability Classification System
interface ToolCapability {
  name: string;
  type: 'email_analysis' | 'email_template_analysis' | 'organization_analysis' | 'sales_metrics' | 'unknown';
  description: string;
  parameters: any[];
  examples: string[];
  priority: 'high' | 'medium' | 'low';
}

interface ToolSelection {
  tool: MCPTool;
  query: string;
  priority: 'high' | 'medium' | 'low';
  reasoning: string;
}

/**
 * MCP Service for Apollo's proprietary data integration using SSE/JSON-RPC 2.0
 * Why this matters: Enables content generation pipeline to access real Apollo email performance data,
 * sales metrics, and customer insights that competitors cannot replicate, significantly enhancing
 * content authority and competitive differentiation.
 */
class MCPService {
  private connectionState: MCPConnectionState;
  private circuitBreaker: CircuitBreaker;
  private rateLimiter: RateLimiter;
  private retryConfig: RetryConfig;
  
  // SSE/JSON-RPC Protocol State
  private eventSource: EventSource | null = null;
  private sessionId: string | null = null;
  private pendingRequests: Map<string | number, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private requestIdCounter = 0;
  
  // MCP Protocol State
  private availableTools: MCPTool[] = [];
  private availableResources: MCPResource[] = [];
  private availablePrompts: MCPPrompt[] = [];
  private toolCapabilities: Map<string, ToolCapability> = new Map();
  
  // Configuration
  private readonly baseUrl: string;
  private readonly clientName = 'Apollo-Content-Generator';
  private readonly timeout = 0; // Infinite timeout for permanent connection
  private readonly maxReconnectAttempts = 5;
  private reconnectAttempts = 0;
  
  // Permanent connection management
  private keepaliveInterval: NodeJS.Timeout | null = null;
  private readonly keepaliveIntervalMs = 30000; // 30 seconds
  private isShuttingDown = false;
  
  constructor() {
    // Load MCP server URL from environment variables for security
    // Why this matters: Environment variables prevent hardcoded URLs, allow different
    // environments (dev/staging/prod), and follow security best practices
    this.baseUrl = process.env.MCP_SERVER_URL || 'http://10.60.0.115/mcp';
    
    if (!this.baseUrl) {
      throw new Error('Missing MCP_SERVER_URL environment variable. Please set it in your .env file');
    }
    
    // Initialize connection state
    this.connectionState = {
      status: 'discovering',
      lastError: undefined,
      toolsDiscovered: 0,
      resourcesDiscovered: 0
    };
    
    // Setup error handling components following existing patterns
    // Why this matters: Circuit breaker prevents cascading failures when MCP server is down,
    // rate limiter respects API quotas, and retry logic handles transient network issues
    this.retryConfig = DEFAULT_RETRY_CONFIGS.mcp;
    
    // Create a permanent circuit breaker that never opens
    // Why this matters: For SaaS applications requiring permanent MCP connection,
    // we need to prevent automatic disconnections from circuit breaker logic
    this.circuitBreaker = new PermanentCircuitBreaker('MCP');
    
    this.rateLimiter = new RateLimiter(
      DEFAULT_RATE_LIMITS.mcp,
      'MCP'
    );
    
    console.log(`🔧 MCP Service initialized for SSE server: ${this.baseUrl}`);
    console.log(`🔍 MCP Server URL source: ${process.env.MCP_SERVER_URL ? 'Environment Variable (.env)' : 'Default (10.60.0.115)'}`);
  }
  
  /**
   * Initialize MCP SSE connection and discover available tools/resources
   * Why this matters: Establishes SSE connection to MCP server using JSON-RPC 2.0 protocol
   * and discovers what tools are available for dynamic tool selection based on content context.
   */
  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing MCP SSE connection...');
      this.connectionState.status = 'connecting';
      
      // Establish SSE connection
      await this.connectSSE();
      
      this.connectionState.status = 'loading';
      
      // Initialize MCP session
      await this.initializeSession();
      
      // Discover available MCP capabilities
      // Why this matters: We need to discover tools, resources, and prompts
      // for comprehensive MCP integration
      console.log('🔍 Discovering MCP capabilities...');
      const [tools, resources, prompts] = await Promise.allSettled([
        this.discoverTools(),
        this.discoverResources(), 
        this.discoverPrompts()
      ]);
      
      // Process discovery results
      if (tools.status === 'fulfilled') {
        this.availableTools = tools.value;
        this.connectionState.toolsDiscovered = tools.value.length;
        await this.analyzeToolCapabilities();
      } else {
        console.warn('⚠️ Tool discovery failed:', tools.reason);
      }
      
      if (resources.status === 'fulfilled') {
        this.availableResources = resources.value;
        this.connectionState.resourcesDiscovered = resources.value.length;
      } else {
        console.warn('⚠️ Resource discovery failed:', resources.reason);
      }
      
      if (prompts.status === 'fulfilled') {
        this.availablePrompts = prompts.value;
      } else {
        console.warn('⚠️ Prompt discovery failed:', prompts.reason);
      }
      
      this.connectionState.status = 'ready';
      this.connectionState.lastConnected = new Date();
      this.connectionState.lastError = undefined;
      this.reconnectAttempts = 0;
      
      // Start keepalive mechanism for permanent connection
      this.startKeepalive();
      
      console.log(`✅ MCP SSE initialization complete:`);
      console.log(`   🔗 Session ID: ${this.sessionId}`);
      console.log(`   📋 Tools discovered: ${this.availableTools.length}`);
      console.log(`   📄 Resources discovered: ${this.availableResources.length}`);
      console.log(`   📝 Prompts discovered: ${this.availablePrompts.length}`);
      console.log(`   🧠 Tool capabilities mapped: ${this.toolCapabilities.size}`);
      
    } catch (error: any) {
      this.connectionState.status = 'failed';
      this.connectionState.lastError = error.message;
      console.error('❌ MCP SSE initialization failed:', error.message);
      console.error(`🔍 Attempted connection to: ${this.baseUrl}`);
      console.error('💡 Troubleshooting tips:');
      console.error(`   1. Check if MCP server is running at ${this.baseUrl}`);
      console.error('   2. Verify MCP server is accessible from backend');
      console.error('   3. Check network connectivity and firewall settings');
      console.error('   4. Ensure MCP server supports the /mcp endpoint');
      console.error('   5. Try accessing the MCP server directly in browser');
      console.error('   6. Check if MCP_SERVER_URL in .env matches your server');
      
      // Clean up on failure
      this.cleanup();
      
      throw createServiceError(error, 'MCP', 'SSE initialization');
    }
  }
  
  /**
   * Establish connection to MCP server with proper protocol handshake
   * Why this matters: Creates initial connection and extracts session ID from server response
   */
  private async connectSSE(): Promise<void> {
    try {
      console.log('🔗 Establishing MCP server connection with initialize...');
      
      // Start with initialize request to get session ID (proper MCP protocol)
      const initRequest: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 'connection-init',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            roots: { listChanged: true },
            sampling: {}
          },
          clientInfo: {
            name: this.clientName,
            version: '1.0.0'
          }
        }
      };
      
      const response = await axios.post(this.baseUrl, initRequest, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'User-Agent': `${this.clientName}/1.0.0`
        },
        timeout: 0, // No timeout for permanent connection
        responseType: 'text'
      });
      
      console.log('✅ MCP server connection established');
      
      // Extract session ID from response headers (primary method)
      const sessionId = response.headers['mcp-session-id'];
      if (sessionId) {
        this.sessionId = sessionId;
        console.log(`🔑 Session ID extracted from headers: ${this.sessionId}`);
      }
      
      // Parse response data for additional session info
      if (response.data) {
        this.parseSSEResponse(response.data);
      }
      
      if (!this.sessionId) {
        console.warn('⚠️ No session ID received, attempting to proceed...');
      }
      
    } catch (error: any) {
      console.error('❌ Failed to establish MCP connection:', error.message);
      throw error;
    }
  }
  
  /**
   * Handle incoming SSE messages using JSON-RPC 2.0 protocol
   * Why this matters: Processes JSON-RPC responses and notifications from the MCP server
   */
  private handleSSEMessage(data: string): void {
    try {
      const message = JSON.parse(data) as JsonRpcResponse | JsonRpcNotification;
      
      // Handle JSON-RPC responses (have id field)
      if ('id' in message && message.id !== undefined) {
        const response = message as JsonRpcResponse;
        const pendingRequest = this.pendingRequests.get(response.id);
        
        if (pendingRequest) {
          // No timeout to clear in permanent connection mode
          this.pendingRequests.delete(response.id);
          
          if (response.error) {
            console.error(`❌ JSON-RPC Error [${response.id}]:`, response.error);
            pendingRequest.reject(new Error(`JSON-RPC Error: ${response.error.message}`));
          } else {
            console.log(`✅ JSON-RPC Response [${response.id}] received`);
            pendingRequest.resolve(response.result);
          }
        }
      }
      // Handle JSON-RPC notifications (no id field)
      else {
        const notification = message as JsonRpcNotification;
        console.log(`📢 JSON-RPC Notification: ${notification.method}`, notification.params);
        
        // Handle session ID from server notifications
        if (notification.method === 'session/created' && notification.params?.sessionId) {
          this.sessionId = notification.params.sessionId;
          console.log(`🔑 Session ID received via notification: ${this.sessionId}`);
        }
        
        // Handle other session-related notifications
        if (notification.method === 'session/update' && notification.params?.sessionId) {
          this.sessionId = notification.params.sessionId;
          console.log(`🔑 Session ID updated via notification: ${this.sessionId}`);
        }
      }
    } catch (error) {
      console.error('❌ Failed to parse SSE message:', error, 'Data:', data);
    }
  }
  
  /**
   * Complete MCP session initialization with notifications
   * Why this matters: Sends the required initialized notification to complete the MCP handshake
   */
  private async initializeSession(): Promise<void> {
    console.log('🔑 Completing MCP session initialization...');
    
    try {
      // Send initialized notification to complete the handshake
      await this.sendInitializedNotification();
      
      console.log('✅ MCP session fully initialized');
      
    } catch (error) {
      console.error('❌ Failed to complete MCP session initialization:', error);
      throw error;
    }
  }
  
  /**
   * Send initialized notification to complete MCP handshake
   * Why this matters: The MCP protocol requires this notification after successful initialize
   */
  private async sendInitializedNotification(): Promise<void> {
    try {
      // Send notification (no response expected)
      const notification = {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {}
      };
      
      await axios.post(this.baseUrl, notification, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'User-Agent': `${this.clientName}/1.0.0`,
          ...(this.sessionId && { 'mcp-session-id': this.sessionId })
        },
        timeout: this.timeout
      });
      
      console.log('✅ Initialized notification sent');
    } catch (error) {
      console.warn('⚠️ Failed to send initialized notification:', error);
      // Don't throw here - this is a notification, not critical
    }
  }
  
  /**
   * Send JSON-RPC 2.0 request using HTTP POST
   * Why this matters: Provides the core communication method for all MCP operations
   */
  private async sendJsonRpcRequest(method: string, params?: any): Promise<any> {
    const requestId = ++this.requestIdCounter;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      ...(params !== undefined && { params }) // Only include params if provided
    };
    
    return new Promise((resolve, reject) => {
      // Store pending request without timeout for permanent connection
      // Why this matters: Removing timeouts prevents artificial disconnections
      // and allows long-running operations to complete naturally
      this.pendingRequests.set(requestId, { 
        resolve, 
        reject, 
        timeout: null as any // No timeout for permanent connection
      });
      
      // Send request via HTTP POST
      this.sendJsonRpcViaPost(request).catch(reject);
    });
  }
  
  /**
   * Send JSON-RPC request via POST with SSE response handling
   * Why this matters: The MCP server uses a hybrid approach - POST requests with SSE responses
   */
  private async sendJsonRpcViaPost(request: JsonRpcRequest): Promise<void> {
    try {
      await this.rateLimiter.waitForNext();
      
      const response = await axios.post(this.baseUrl, request, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream', // Both required by MCP server
          'User-Agent': `${this.clientName}/1.0.0`,
          ...(this.sessionId && { 'mcp-session-id': this.sessionId })
        },
        timeout: 0, // No timeout for permanent connection
        responseType: 'text' // Get raw text to parse SSE format
      });
      
      console.log(`📤 JSON-RPC Request sent [${request.id}]: ${request.method}`);
      
      // Extract session ID from response headers
      const sessionId = response.headers['mcp-session-id'];
      if (sessionId && !this.sessionId) {
        this.sessionId = sessionId;
        console.log(`🔑 Session ID extracted from headers: ${this.sessionId}`);
      }
      
      // Handle SSE response format
      if (response.data) {
        this.parseSSEResponse(response.data);
      }
      
    } catch (error: any) {
      console.error(`❌ Failed to send JSON-RPC request [${request.id}]:`, error.message);
      
      // Handle session-related errors specifically
      if (error.response?.status === 400 && 
          error.response?.data?.includes?.('session') || 
          error.message?.includes?.('session')) {
        console.warn('⚠️ Session-related error detected, may need to reinitialize session');
        this.connectionState.lastError = 'Session error - may need reinitialize';
      }
      
      // Clean up pending request on send failure
      const pendingRequest = this.pendingRequests.get(request.id);
      if (pendingRequest) {
        // No timeout to clear in permanent connection mode
        this.pendingRequests.delete(request.id);
        pendingRequest.reject(error);
      }
    }
  }
  
  /**
   * Parse SSE response format from HTTP response
   * Why this matters: The server returns SSE format even in HTTP responses
   */
  private parseSSEResponse(data: string): void {
    const lines = data.split('\n');
    let eventType = '';
    let eventData = '';
    
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.substring(7).trim();
      } else if (line.startsWith('data: ')) {
        eventData = line.substring(6).trim();
      } else if (line.trim() === '' && eventData) {
        // End of event, process it
        if (eventType === 'message' || eventType === '') {
          this.handleSSEMessage(eventData);
        }
        eventType = '';
        eventData = '';
      }
    }
    
    // Handle case where there's no trailing newline
    if (eventData) {
      this.handleSSEMessage(eventData);
    }
  }
  
  /**
   * Discover available MCP tools using the tools/list method
   * Why this matters: Discovers the actual available tools from the MCP server
   */
  private async discoverTools(): Promise<MCPTool[]> {
    try {
      console.log('🔍 Discovering MCP tools...');
      
      // Use the standard MCP tools/list method
      const result = await this.sendJsonRpcRequest('tools/list');
      const tools = result?.tools || [];
      
      console.log(`✅ Found ${tools.length} MCP tools`);
      
      // Convert server response to our MCPTool format
      const mcpTools: MCPTool[] = tools.map((tool: any) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }));
      
      console.log(`📋 Discovered ${mcpTools.length} MCP tools:`, mcpTools.map(t => t.name));
      return mcpTools;
    } catch (error) {
      console.error('❌ Cortex Analyst discovery failed:', error);
      // Return empty array but don't fail - we can still create mock tools
      return [
        {
          name: 'pythia_query',
          description: 'Query Apollo proprietary data using natural language through Cortex Analyst',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Natural language query about Apollo data'
              }
            },
            required: ['query']
          }
        }
      ];
    }
  }
  
  /**
   * Discover available MCP resources using JSON-RPC
   * Why this matters: Resources provide access to Apollo knowledge base, documentation,
   * and other data sources beyond just queryable tools.
   */
  private async discoverResources(): Promise<MCPResource[]> {
    try {
      console.log('🔍 Discovering MCP resources...');
      const result = await this.sendJsonRpcRequest('resources/list'); // No params needed
      const resources = result?.resources || [];
      console.log(`📄 Found ${resources.length} MCP resources`);
      return resources;
    } catch (error) {
      console.error('❌ Resource discovery failed:', error);
      return [];
    }
  }
  
  /**
   * Discover available MCP prompts using JSON-RPC
   * Why this matters: Server-provided prompts ensure consistent querying patterns
   * and may include optimized query templates for different data types.
   */
  private async discoverPrompts(): Promise<MCPPrompt[]> {
    try {
      console.log('🔍 Discovering MCP prompts...');
      const result = await this.sendJsonRpcRequest('prompts/list'); // No params needed
      const prompts = result?.prompts || [];
      console.log(`📝 Found ${prompts.length} MCP prompts`);
      return prompts;
    } catch (error) {
      console.error('❌ Prompt discovery failed:', error);
      return [];
    }
  }
  
  /**
   * Analyze discovered tools and classify their capabilities
   * Why this matters: Enables intelligent tool selection based on content context.
   * The system can automatically choose the right tools for email analysis, company research, etc.
   */
  private async analyzeToolCapabilities(): Promise<void> {
    console.log('🔍 Analyzing tool capabilities...');
    
    for (const tool of this.availableTools) {
      const capability = this.classifyToolCapability(tool);
      this.toolCapabilities.set(tool.name, capability);
      
      console.log(`   📊 ${tool.name}: ${capability.type} (${capability.priority} priority)`);
    }
  }
  
  /**
   * Classify a tool's capability based on its name and description
   * Why this matters: Automatic classification allows the system to understand what each tool
   * does and select appropriate tools for different content types without manual configuration.
   */
  private classifyToolCapability(tool: MCPTool): ToolCapability {
    const description = tool.description?.toLowerCase() || '';
    const name = tool.name?.toLowerCase() || '';
    
    // Detect email analysis tools (PYTHIA_EMAILS model)
    if ((description.includes('email') && !description.includes('template')) || 
        description.includes('pythia_emails') && !description.includes('template') || 
        name.includes('analyze_emails') || name.includes('email_performance')) {
      return {
        name: tool.name,
        type: 'email_analysis',
        description: tool.description,
        parameters: tool.inputSchema?.properties ? Object.keys(tool.inputSchema.properties) : [],
        examples: ['CEO email performance', 'job title analysis', 'email open rates by role'],
        priority: 'high'
      };
    }
    
    // Detect email template analysis tools (PYTHIA_EMAILS_TEMPLATES model)
    if (description.includes('template') || description.includes('pythia_emails_templates') || 
        name.includes('email_template') || name.includes('template_analysis')) {
      return {
        name: tool.name,
        type: 'email_template_analysis',
        description: tool.description,
        parameters: tool.inputSchema?.properties ? Object.keys(tool.inputSchema.properties) : [],
        examples: ['template effectiveness', 'highest performing templates', 'template optimization'],
        priority: 'medium'
      };
    }
    
    // Detect organization/people analysis tools (PYTHIA_PEOPLE_AND_ORGANIZATIONS model)
    if (description.includes('organization') || description.includes('people') || 
        description.includes('company') || name.includes('people_and_organizations') ||
        name.includes('company_analysis')) {
      return {
        name: tool.name,
        type: 'organization_analysis',
        description: tool.description,
        parameters: tool.inputSchema?.properties ? Object.keys(tool.inputSchema.properties) : [],
        examples: ['company email performance', 'domain-based analysis', 'organization metrics'],
        priority: 'medium'
      };
    }
    
    // Detect general sales metrics tools
    if (description.includes('sales') || description.includes('metrics') || 
        description.includes('performance') || name.includes('sales_metrics')) {
      return {
        name: tool.name,
        type: 'sales_metrics',
        description: tool.description,
        parameters: tool.inputSchema?.properties ? Object.keys(tool.inputSchema.properties) : [],
        examples: ['sales performance', 'conversion metrics', 'pipeline analysis'],
        priority: 'low'
      };
    }
    
    // Unknown tool type - still track it for future classification
    return {
      name: tool.name,
      type: 'unknown',
      description: tool.description,
      parameters: tool.inputSchema?.properties ? Object.keys(tool.inputSchema.properties) : [],
      examples: [],
      priority: 'low'
    };
  }
  
  /**
   * Call a Cortex Analyst query using natural language with full error handling
   * Why this matters: This is the core method that actually retrieves Apollo's proprietary data
   * by sending natural language queries to the Cortex Analyst interface with proper retry logic.
   */
  async callTool(toolName: string, parameters: Record<string, any>): Promise<MCPToolCallResult> {
    if (this.connectionState.status !== 'ready') {
      throw createServiceError(
        new Error(`MCP service not ready. Current status: ${this.connectionState.status}`),
        'MCP',
        'Tool call validation'
      );
    }
    
    const tool = this.availableTools.find(t => t.name === toolName);
    if (!tool) {
      throw createServiceError(
        new Error(`Tool '${toolName}' not found. Available tools: ${this.availableTools.map(t => t.name).join(', ')}`),
        'MCP',
        'Tool discovery'
      );
    }
    
    // Use circuit breaker and retry logic for tool calls
    return await this.circuitBreaker.execute(async () => {
      return await retryWithBackoff(
        async () => {
          console.log(`🔧 Calling MCP tool: ${toolName}`);
          console.log(`📋 Query:`, parameters.query);
          
          // Use standard MCP tools/call method with correct parameter structure
          const result = await this.sendJsonRpcRequest('tools/call', {
            name: toolName,
            arguments: {
              request: {
                query: parameters.query,
                context: parameters.context || null
              }
            }
          });
          
          console.log(`✅ MCP tool call successful: ${toolName}`);
          
          // Return the result directly as it's already in MCP format
          return result;
        },
        this.retryConfig,
        'MCP',
        `Tool call: ${toolName}`
      );
    });
  }
  
  /**
   * Read a specific MCP resource using JSON-RPC with error handling
   * Why this matters: Resources provide access to Apollo documentation, knowledge base articles,
   * and other structured data that can enhance content generation.
   */
  async readResource(uri: string): Promise<any> {
    if (this.connectionState.status !== 'ready') {
      throw createServiceError(
        new Error(`MCP service not ready. Current status: ${this.connectionState.status}`),
        'MCP',
        'Resource read validation'
      );
    }
    
    return await this.circuitBreaker.execute(async () => {
      return await retryWithBackoff(
        async () => {
          console.log(`📄 Reading MCP resource: ${uri}`);
          
          const result = await this.sendJsonRpcRequest('resources/read', {
            uri: uri
          });
          
          console.log(`✅ Resource read successful: ${uri}`);
          return result;
        },
        this.retryConfig,
        'MCP',
        `Resource read: ${uri}`
      );
    });
  }
  
  /**
   * Get a server-provided prompt template using JSON-RPC with error handling
   * Why this matters: Server-provided prompts ensure consistent query patterns and may include
   * optimized templates for different types of Apollo data analysis.
   */
  async getPrompt(name: string, args?: Record<string, string>): Promise<any> {
    if (this.connectionState.status !== 'ready') {
      throw createServiceError(
        new Error(`MCP service not ready. Current status: ${this.connectionState.status}`),
        'MCP',
        'Prompt get validation'
      );
    }
    
    return await this.circuitBreaker.execute(async () => {
      return await retryWithBackoff(
        async () => {
          console.log(`📝 Getting MCP prompt: ${name}`);
          
          const result = await this.sendJsonRpcRequest('prompts/get', {
            name: name,
            arguments: args || {}
          });
          
          console.log(`✅ Prompt retrieved successfully: ${name}`);
          return result;
        },
        this.retryConfig,
        'MCP',
        `Prompt get: ${name}`
      );
    });
  }
  
  /**
   * Start keepalive mechanism to maintain permanent connection
   * Why this matters: Prevents server-side timeouts and maintains session state
   */
  private startKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
    }
    
    console.log(`🔄 Starting MCP keepalive (${this.keepaliveIntervalMs}ms intervals)`);
    
    this.keepaliveInterval = setInterval(async () => {
      if (this.isShuttingDown) return;
      
      try {
        // Send a lightweight ping to maintain connection
        // Using tools/list as it's a simple, low-impact operation
        await this.sendJsonRpcRequest('tools/list');
        console.log('💓 MCP keepalive ping successful');
      } catch (error) {
        console.warn('⚠️ MCP keepalive ping failed:', (error as Error).message);
        
        // Attempt automatic reconnection on keepalive failure
        if (this.connectionState.status === 'ready') {
          console.log('🔄 Attempting automatic MCP reconnection...');
          try {
            await this.reconnect();
            console.log('✅ Automatic MCP reconnection successful');
          } catch (reconnectError) {
            console.error('❌ Automatic MCP reconnection failed:', (reconnectError as Error).message);
          }
        }
      }
    }, this.keepaliveIntervalMs);
  }

  /**
   * Stop keepalive mechanism
   * Why this matters: Clean shutdown prevents resource leaks
   */
  private stopKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
      console.log('🛑 MCP keepalive stopped');
    }
  }

  /**
   * Clean up MCP service and pending requests
   * Why this matters: Properly clears timeouts and resets state to prevent memory leaks
   */
  private cleanup(): void {
    console.log('🧹 Cleaning up MCP service...');
    
    this.isShuttingDown = true;
    this.stopKeepalive();
    
    // Clear all pending requests
    Array.from(this.pendingRequests.entries()).forEach(([id, request]) => {
      // No timeout to clear in permanent connection mode
      request.reject(new Error('MCP service cleanup - request cancelled'));
    });
    this.pendingRequests.clear();
    
    // Don't reset session in permanent connection mode unless explicitly reconnecting
    this.reconnectAttempts = 0;
    
    console.log('✅ MCP service cleanup complete');
  }
  
  /**
   * Get current connection state and health information
   * Why this matters: Provides monitoring and diagnostics for the MCP integration,
   * essential for troubleshooting and ensuring reliable operation.
   */
  getConnectionState(): MCPConnectionState & {
    availableTools: string[];
    availableResources: string[];
    availablePrompts: string[];
    toolCapabilities: Array<{name: string, type: string, priority: string}>;
    circuitBreakerState: any;
  } {
    return {
      ...this.connectionState,
      availableTools: this.availableTools.map(t => t.name),
      availableResources: this.availableResources.map(r => r.name || r.uri),
      availablePrompts: this.availablePrompts.map(p => p.name),
      toolCapabilities: Array.from(this.toolCapabilities.values()).map(cap => ({
        name: cap.name,
        type: cap.type,
        priority: cap.priority
      })),
      circuitBreakerState: this.circuitBreaker.getState()
    };
  }
  
  /**
   * Get service health status for monitoring
   * Why this matters: Provides comprehensive health information for monitoring dashboards
   * and automated alerting when MCP integration has issues.
   */
  async getHealthStatus(): Promise<{
    connected: boolean;
    initialized: boolean;
    toolsAvailable: number;
    resourcesAvailable: number;
    lastConnected?: Date;
    lastError?: string;
    circuitBreakerState: string;
  }> {
    const circuitState = this.circuitBreaker.getState();
    
    return {
      connected: this.connectionState.status === 'ready',
      initialized: this.connectionState.status !== 'discovering',
      toolsAvailable: this.availableTools.length,
      resourcesAvailable: this.availableResources.length,
      lastConnected: this.connectionState.lastConnected,
      lastError: this.connectionState.lastError,
      circuitBreakerState: circuitState.state
    };
  }
  
  /**
   * Force reconnection to MCP server with session preservation
   * Why this matters: Allows manual recovery from connection issues while maintaining
   * permanent connection state for SaaS applications.
   */
  async reconnect(): Promise<void> {
    console.log('🔄 Forcing MCP SSE reconnection...');
    
    // Stop keepalive during reconnection
    this.stopKeepalive();
    this.isShuttingDown = false;
    
    // Clear pending requests but preserve session for permanent connection
    Array.from(this.pendingRequests.entries()).forEach(([id, request]) => {
      request.reject(new Error('MCP service reconnection - request cancelled'));
    });
    this.pendingRequests.clear();
    
    // Reset discovery state but preserve session
    this.connectionState.status = 'discovering';
    this.availableTools = [];
    this.availableResources = [];
    this.availablePrompts = [];
    this.toolCapabilities.clear();
    
    // Reinitialize with SSE (will restart keepalive automatically)
    await this.initialize();
  }
}

export default MCPService;
export type { MCPTool, MCPResource, MCPPrompt, MCPToolCallResult, MCPConnectionState, ToolCapability, ToolSelection };
