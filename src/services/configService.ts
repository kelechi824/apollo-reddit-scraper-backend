/**
 * Configuration Service for A/B Testing Framework
 * Why this matters: Enables safe testing of caching optimizations by allowing
 * dynamic switching between cached and non-cached API calls without code changes.
 * This ensures we can validate cost savings and performance without risking quality.
 */

interface FeatureFlags {
  // Claude caching feature flags
  claudeSystemPromptCaching: boolean;
  claudeConversationCaching: boolean;
  claudeContentGenerationCaching: boolean;
  claudeHierarchicalCaching: boolean;
  
  // OpenAI caching feature flags
  openaiPromptCaching: boolean;
  openaiDeepResearchCaching: boolean;
  openaiGapAnalysisCaching: boolean;
  openaiPatternAnalysisCaching: boolean;
  openaiPainPointCaching: boolean;
  
  // Advanced caching features
  extendedTtlWorkflows: boolean;
  cachePerformanceMonitoring: boolean;
  
  // A/B testing controls
  abTestingEnabled: boolean;
  abTestingPercentage: number; // 0-100, percentage of requests to use caching
  abTestingUserBased: boolean; // If true, consistent per user; if false, random per request
}

interface ABTestMetrics {
  totalRequests: number;
  cachedRequests: number;
  nonCachedRequests: number;
  cachedResponseTime: number[];
  nonCachedResponseTime: number[];
  cachedCosts: number[];
  nonCachedCosts: number[];
  qualityScores: {
    cached: number[];
    nonCached: number[];
  };
  lastReset: Date;
}

class ConfigService {
  private static instance: ConfigService;
  private featureFlags: FeatureFlags;
  private abTestMetrics: ABTestMetrics;
  private userCacheAssignments: Map<string, boolean> = new Map(); // For consistent user-based testing

  constructor() {
    // Initialize feature flags from environment variables with defaults
    this.featureFlags = {
      // Claude caching - default enabled (already implemented and tested)
      claudeSystemPromptCaching: this.getBooleanEnv('CLAUDE_SYSTEM_PROMPT_CACHING', true),
      claudeConversationCaching: this.getBooleanEnv('CLAUDE_CONVERSATION_CACHING', true),
      claudeContentGenerationCaching: this.getBooleanEnv('CLAUDE_CONTENT_GENERATION_CACHING', true),
      claudeHierarchicalCaching: this.getBooleanEnv('CLAUDE_HIERARCHICAL_CACHING', true),
      
      // OpenAI caching - default disabled for A/B testing (pending TypeScript definitions)
      openaiPromptCaching: this.getBooleanEnv('OPENAI_PROMPT_CACHING', false),
      openaiDeepResearchCaching: this.getBooleanEnv('OPENAI_DEEP_RESEARCH_CACHING', false),
      openaiGapAnalysisCaching: this.getBooleanEnv('OPENAI_GAP_ANALYSIS_CACHING', false),
      openaiPatternAnalysisCaching: this.getBooleanEnv('OPENAI_PATTERN_ANALYSIS_CACHING', false),
      openaiPainPointCaching: this.getBooleanEnv('OPENAI_PAIN_POINT_CACHING', false),
      
      // Advanced features - default enabled
      extendedTtlWorkflows: this.getBooleanEnv('EXTENDED_TTL_WORKFLOWS', true),
      cachePerformanceMonitoring: this.getBooleanEnv('CACHE_PERFORMANCE_MONITORING', true),
      
      // A/B testing controls
      abTestingEnabled: this.getBooleanEnv('AB_TESTING_ENABLED', false),
      abTestingPercentage: this.getNumberEnv('AB_TESTING_PERCENTAGE', 50), // 50% default
      abTestingUserBased: this.getBooleanEnv('AB_TESTING_USER_BASED', true), // Consistent per user
    };

    // Initialize A/B testing metrics
    this.abTestMetrics = {
      totalRequests: 0,
      cachedRequests: 0,
      nonCachedRequests: 0,
      cachedResponseTime: [],
      nonCachedResponseTime: [],
      cachedCosts: [],
      nonCachedCosts: [],
      qualityScores: {
        cached: [],
        nonCached: []
      },
      lastReset: new Date()
    };

    console.log('🔧 ConfigService initialized with feature flags:', this.featureFlags);
  }

  /**
   * Get singleton instance
   * Why this matters: Ensures consistent configuration across all services
   */
  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  /**
   * Check if a specific feature flag is enabled
   * Why this matters: Provides clean API for services to check caching availability
   */
  isFeatureEnabled(feature: keyof FeatureFlags): boolean {
    const value = this.featureFlags[feature];
    return typeof value === 'boolean' ? value : false;
  }

  /**
   * Determine if caching should be used for this request (A/B testing logic)
   * Why this matters: Core A/B testing logic that decides cached vs non-cached
   * based on user consistency or random assignment
   */
  shouldUseCaching(userId?: string, requestType?: string): boolean {
    // If A/B testing is disabled, use feature flags directly
    if (!this.featureFlags.abTestingEnabled) {
      return true; // Default to caching when not A/B testing
    }

    // For user-based testing, maintain consistency per user
    if (this.featureFlags.abTestingUserBased && userId) {
      if (!this.userCacheAssignments.has(userId)) {
        // Assign user to cached or non-cached group based on percentage
        const shouldCache = Math.random() * 100 < this.featureFlags.abTestingPercentage;
        this.userCacheAssignments.set(userId, shouldCache);
      }
      return this.userCacheAssignments.get(userId) || false;
    }

    // For request-based testing, random assignment each time
    return Math.random() * 100 < this.featureFlags.abTestingPercentage;
  }

  /**
   * Record A/B test metrics for analysis
   * Why this matters: Tracks performance differences between cached and non-cached
   * requests to validate optimization effectiveness
   */
  recordABTestMetrics(data: {
    usedCaching: boolean;
    responseTime: number;
    cost: number;
    qualityScore?: number;
  }): void {
    if (!this.featureFlags.abTestingEnabled) return;

    this.abTestMetrics.totalRequests++;
    
    if (data.usedCaching) {
      this.abTestMetrics.cachedRequests++;
      this.abTestMetrics.cachedResponseTime.push(data.responseTime);
      this.abTestMetrics.cachedCosts.push(data.cost);
      if (data.qualityScore !== undefined) {
        this.abTestMetrics.qualityScores.cached.push(data.qualityScore);
      }
    } else {
      this.abTestMetrics.nonCachedRequests++;
      this.abTestMetrics.nonCachedResponseTime.push(data.responseTime);
      this.abTestMetrics.nonCachedCosts.push(data.cost);
      if (data.qualityScore !== undefined) {
        this.abTestMetrics.qualityScores.nonCached.push(data.qualityScore);
      }
    }

    // Keep only recent metrics (last 1000 requests)
    const maxMetrics = 1000;
    if (this.abTestMetrics.cachedResponseTime.length > maxMetrics) {
      this.abTestMetrics.cachedResponseTime = this.abTestMetrics.cachedResponseTime.slice(-maxMetrics);
      this.abTestMetrics.cachedCosts = this.abTestMetrics.cachedCosts.slice(-maxMetrics);
      this.abTestMetrics.qualityScores.cached = this.abTestMetrics.qualityScores.cached.slice(-maxMetrics);
    }
    if (this.abTestMetrics.nonCachedResponseTime.length > maxMetrics) {
      this.abTestMetrics.nonCachedResponseTime = this.abTestMetrics.nonCachedResponseTime.slice(-maxMetrics);
      this.abTestMetrics.nonCachedCosts = this.abTestMetrics.nonCachedCosts.slice(-maxMetrics);
      this.abTestMetrics.qualityScores.nonCached = this.abTestMetrics.qualityScores.nonCached.slice(-maxMetrics);
    }
  }

  /**
   * Get A/B testing performance summary
   * Why this matters: Provides clear metrics to validate caching effectiveness
   */
  getABTestSummary() {
    if (!this.featureFlags.abTestingEnabled) {
      return { message: 'A/B testing is not enabled' };
    }

    const avgCachedTime = this.abTestMetrics.cachedResponseTime.length > 0 
      ? this.abTestMetrics.cachedResponseTime.reduce((a, b) => a + b, 0) / this.abTestMetrics.cachedResponseTime.length 
      : 0;
    
    const avgNonCachedTime = this.abTestMetrics.nonCachedResponseTime.length > 0 
      ? this.abTestMetrics.nonCachedResponseTime.reduce((a, b) => a + b, 0) / this.abTestMetrics.nonCachedResponseTime.length 
      : 0;

    const avgCachedCost = this.abTestMetrics.cachedCosts.length > 0 
      ? this.abTestMetrics.cachedCosts.reduce((a, b) => a + b, 0) / this.abTestMetrics.cachedCosts.length 
      : 0;
    
    const avgNonCachedCost = this.abTestMetrics.nonCachedCosts.length > 0 
      ? this.abTestMetrics.nonCachedCosts.reduce((a, b) => a + b, 0) / this.abTestMetrics.nonCachedCosts.length 
      : 0;

    const avgCachedQuality = this.abTestMetrics.qualityScores.cached.length > 0 
      ? this.abTestMetrics.qualityScores.cached.reduce((a, b) => a + b, 0) / this.abTestMetrics.qualityScores.cached.length 
      : 0;
    
    const avgNonCachedQuality = this.abTestMetrics.qualityScores.nonCached.length > 0 
      ? this.abTestMetrics.qualityScores.nonCached.reduce((a, b) => a + b, 0) / this.abTestMetrics.qualityScores.nonCached.length 
      : 0;

    return {
      totalRequests: this.abTestMetrics.totalRequests,
      cachedRequests: this.abTestMetrics.cachedRequests,
      nonCachedRequests: this.abTestMetrics.nonCachedRequests,
      performance: {
        avgCachedResponseTime: avgCachedTime,
        avgNonCachedResponseTime: avgNonCachedTime,
        latencyImprovement: avgNonCachedTime > 0 ? ((avgNonCachedTime - avgCachedTime) / avgNonCachedTime * 100) : 0,
      },
      costs: {
        avgCachedCost: avgCachedCost,
        avgNonCachedCost: avgNonCachedCost,
        costSavings: avgNonCachedCost > 0 ? ((avgNonCachedCost - avgCachedCost) / avgNonCachedCost * 100) : 0,
      },
      quality: {
        avgCachedQuality: avgCachedQuality,
        avgNonCachedQuality: avgNonCachedQuality,
        qualityDifference: avgCachedQuality - avgNonCachedQuality,
      },
      lastReset: this.abTestMetrics.lastReset
    };
  }

  /**
   * Reset A/B testing metrics
   * Why this matters: Allows fresh testing cycles and metric collection
   */
  resetABTestMetrics(): void {
    this.abTestMetrics = {
      totalRequests: 0,
      cachedRequests: 0,
      nonCachedRequests: 0,
      cachedResponseTime: [],
      nonCachedResponseTime: [],
      cachedCosts: [],
      nonCachedCosts: [],
      qualityScores: {
        cached: [],
        nonCached: []
      },
      lastReset: new Date()
    };
    this.userCacheAssignments.clear();
    console.log('🔄 A/B testing metrics reset');
  }

  /**
   * Update feature flags dynamically
   * Why this matters: Allows runtime configuration changes without restart
   */
  updateFeatureFlag(feature: keyof FeatureFlags, value: boolean | number): void {
    (this.featureFlags as any)[feature] = value;
    console.log(`🔧 Feature flag updated: ${feature} = ${value}`);
  }

  /**
   * Get all current feature flags
   * Why this matters: Provides visibility into current configuration
   */
  getFeatureFlags(): FeatureFlags {
    return { ...this.featureFlags };
  }

  /**
   * Helper to parse boolean environment variables
   */
  private getBooleanEnv(key: string, defaultValue: boolean): boolean {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true';
  }

  /**
   * Helper to parse number environment variables
   */
  private getNumberEnv(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
}

export default ConfigService;
export { FeatureFlags, ABTestMetrics };
