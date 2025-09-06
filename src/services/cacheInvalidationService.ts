/**
 * Cache Invalidation Service
 * Why this matters: Ensures cached content stays fresh by intelligently invalidating
 * caches when brand kits, templates, or system prompts change, maintaining accuracy
 * while preserving performance benefits.
 */

import ConfigService from './configService';

interface CacheInvalidationRule {
  id: string;
  name: string;
  trigger: 'brand_kit_change' | 'template_update' | 'system_prompt_change' | 'time_based' | 'manual';
  affectedCacheTypes: CacheType[];
  conditions?: {
    maxAge?: number; // milliseconds
    brandKitFields?: string[]; // specific fields that trigger invalidation
    templateTypes?: string[]; // specific template types
  };
  enabled: boolean;
}

type CacheType = 
  | 'claude_system_prompt'
  | 'claude_conversation'
  | 'claude_content_generation'
  | 'openai_deep_research'
  | 'openai_gap_analysis'
  | 'openai_pattern_analysis'
  | 'openai_pain_point'
  | 'brand_context'
  | 'workflow_state';

interface CacheEntry {
  key: string;
  type: CacheType;
  createdAt: Date;
  lastAccessed: Date;
  brandKitHash?: string;
  templateVersion?: string;
  systemPromptVersion?: string;
  metadata?: any;
}

interface InvalidationEvent {
  id: string;
  timestamp: Date;
  trigger: string;
  affectedCacheTypes: CacheType[];
  affectedKeys: string[];
  reason: string;
  success: boolean;
}

class CacheInvalidationService {
  private static instance: CacheInvalidationService;
  private configService: ConfigService;
  private cacheRegistry: Map<string, CacheEntry> = new Map();
  private invalidationRules: CacheInvalidationRule[] = [];
  private invalidationHistory: InvalidationEvent[] = [];
  private brandKitHashes: Map<string, string> = new Map(); // userId -> hash
  private templateVersions: Map<string, string> = new Map(); // templateType -> version
  private systemPromptVersion: string = '1.0.0';

  constructor() {
    this.configService = ConfigService.getInstance();
    this.initializeDefaultRules();
    
    // Start periodic cleanup
    setInterval(() => {
      this.performTimeBasedInvalidation();
    }, 5 * 60 * 1000); // Every 5 minutes

    console.log('🗑️ CacheInvalidationService initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): CacheInvalidationService {
    if (!CacheInvalidationService.instance) {
      CacheInvalidationService.instance = new CacheInvalidationService();
    }
    return CacheInvalidationService.instance;
  }

  /**
   * Initialize default invalidation rules
   * Why this matters: Sets up intelligent cache invalidation based on content change patterns
   */
  private initializeDefaultRules(): void {
    this.invalidationRules = [
      {
        id: 'brand_kit_change',
        name: 'Brand Kit Change Detection',
        trigger: 'brand_kit_change',
        affectedCacheTypes: ['claude_system_prompt', 'claude_content_generation', 'brand_context'],
        conditions: {
          brandKitFields: ['company_name', 'brand_voice', 'target_audience', 'cta_preferences']
        },
        enabled: true
      },
      {
        id: 'template_update',
        name: 'Template Version Update',
        trigger: 'template_update',
        affectedCacheTypes: ['claude_content_generation', 'openai_deep_research'],
        conditions: {
          templateTypes: ['blog', 'playbook', 'reddit_engagement']
        },
        enabled: true
      },
      {
        id: 'system_prompt_change',
        name: 'System Prompt Version Change',
        trigger: 'system_prompt_change',
        affectedCacheTypes: ['claude_system_prompt', 'claude_conversation'],
        enabled: true
      },
      {
        id: 'time_based_brand_context',
        name: 'Time-based Brand Context Invalidation',
        trigger: 'time_based',
        affectedCacheTypes: ['brand_context'],
        conditions: {
          maxAge: 24 * 60 * 60 * 1000 // 24 hours
        },
        enabled: true
      },
      {
        id: 'time_based_workflow',
        name: 'Time-based Workflow State Invalidation',
        trigger: 'time_based',
        affectedCacheTypes: ['workflow_state'],
        conditions: {
          maxAge: 60 * 60 * 1000 // 1 hour
        },
        enabled: true
      },
      {
        id: 'time_based_conversations',
        name: 'Time-based Conversation Invalidation',
        trigger: 'time_based',
        affectedCacheTypes: ['claude_conversation'],
        conditions: {
          maxAge: 30 * 60 * 1000 // 30 minutes
        },
        enabled: true
      }
    ];
  }

  /**
   * Register a cache entry for tracking
   * Why this matters: Tracks cache entries so they can be invalidated when conditions change
   */
  registerCacheEntry(entry: Omit<CacheEntry, 'createdAt' | 'lastAccessed'>): void {
    const fullEntry: CacheEntry = {
      ...entry,
      createdAt: new Date(),
      lastAccessed: new Date()
    };
    
    this.cacheRegistry.set(entry.key, fullEntry);
    
    // Limit registry size to prevent memory issues
    if (this.cacheRegistry.size > 10000) {
      this.cleanupOldEntries();
    }
  }

  /**
   * Update cache entry access time
   * Why this matters: Tracks cache usage for LRU-based cleanup
   */
  updateCacheAccess(key: string): void {
    const entry = this.cacheRegistry.get(key);
    if (entry) {
      entry.lastAccessed = new Date();
    }
  }

  /**
   * Check if brand kit has changed and trigger invalidation
   * Why this matters: Detects brand kit changes and invalidates affected caches
   */
  checkBrandKitChange(userId: string, brandKit: any): boolean {
    const currentHash = this.hashBrandKit(brandKit);
    const previousHash = this.brandKitHashes.get(userId);
    
    if (previousHash && previousHash !== currentHash) {
      console.log(`🔄 Brand kit change detected for user ${userId}`);
      this.invalidateBrandKitCaches(userId, 'Brand kit content changed');
      this.brandKitHashes.set(userId, currentHash);
      return true;
    }
    
    if (!previousHash) {
      this.brandKitHashes.set(userId, currentHash);
    }
    
    return false;
  }

  /**
   * Invalidate caches for a specific brand kit change
   * Why this matters: Removes stale brand-specific cached content
   */
  private invalidateBrandKitCaches(userId: string, reason: string): void {
    const rule = this.invalidationRules.find(r => r.id === 'brand_kit_change');
    if (!rule || !rule.enabled) return;

    const affectedKeys: string[] = [];
    
    // Find all cache entries affected by this brand kit change
    for (const [key, entry] of this.cacheRegistry.entries()) {
      if (rule.affectedCacheTypes.includes(entry.type) && 
          (entry.metadata?.userId === userId || key.includes(userId))) {
        affectedKeys.push(key);
        this.cacheRegistry.delete(key);
      }
    }

    // Record invalidation event
    this.recordInvalidationEvent({
      trigger: 'brand_kit_change',
      affectedCacheTypes: rule.affectedCacheTypes,
      affectedKeys,
      reason,
      success: true
    });

    console.log(`🗑️ Invalidated ${affectedKeys.length} cache entries for brand kit change (user: ${userId})`);
  }

  /**
   * Invalidate caches when template version changes
   * Why this matters: Ensures new template versions are used immediately
   */
  invalidateTemplateVersionCaches(templateType: string, newVersion: string, reason: string): void {
    const rule = this.invalidationRules.find(r => r.id === 'template_update');
    if (!rule || !rule.enabled) return;

    const previousVersion = this.templateVersions.get(templateType);
    if (previousVersion === newVersion) return;

    const affectedKeys: string[] = [];
    
    // Find all cache entries affected by this template change
    for (const [key, entry] of this.cacheRegistry.entries()) {
      if (rule.affectedCacheTypes.includes(entry.type) && 
          entry.templateVersion === previousVersion &&
          (entry.metadata?.templateType === templateType || key.includes(templateType))) {
        affectedKeys.push(key);
        this.cacheRegistry.delete(key);
      }
    }

    this.templateVersions.set(templateType, newVersion);

    // Record invalidation event
    this.recordInvalidationEvent({
      trigger: 'template_update',
      affectedCacheTypes: rule.affectedCacheTypes,
      affectedKeys,
      reason: `${reason} (${templateType}: ${previousVersion} → ${newVersion})`,
      success: true
    });

    console.log(`🗑️ Invalidated ${affectedKeys.length} cache entries for template update (${templateType})`);
  }

  /**
   * Invalidate caches when system prompt version changes
   * Why this matters: Ensures system prompt updates take effect immediately
   */
  invalidateSystemPromptCaches(newVersion: string, reason: string): void {
    const rule = this.invalidationRules.find(r => r.id === 'system_prompt_change');
    if (!rule || !rule.enabled) return;

    if (this.systemPromptVersion === newVersion) return;

    const affectedKeys: string[] = [];
    
    // Find all cache entries affected by system prompt change
    for (const [key, entry] of this.cacheRegistry.entries()) {
      if (rule.affectedCacheTypes.includes(entry.type) && 
          entry.systemPromptVersion === this.systemPromptVersion) {
        affectedKeys.push(key);
        this.cacheRegistry.delete(key);
      }
    }

    const previousVersion = this.systemPromptVersion;
    this.systemPromptVersion = newVersion;

    // Record invalidation event
    this.recordInvalidationEvent({
      trigger: 'system_prompt_change',
      affectedCacheTypes: rule.affectedCacheTypes,
      affectedKeys,
      reason: `${reason} (${previousVersion} → ${newVersion})`,
      success: true
    });

    console.log(`🗑️ Invalidated ${affectedKeys.length} cache entries for system prompt update`);
  }

  /**
   * Perform time-based cache invalidation
   * Why this matters: Automatically removes stale caches based on age
   */
  private performTimeBasedInvalidation(): void {
    const now = new Date();
    const timeBasedRules = this.invalidationRules.filter(r => r.trigger === 'time_based' && r.enabled);
    
    for (const rule of timeBasedRules) {
      if (!rule.conditions?.maxAge) continue;

      const affectedKeys: string[] = [];
      
      for (const [key, entry] of this.cacheRegistry.entries()) {
        if (rule.affectedCacheTypes.includes(entry.type)) {
          const age = now.getTime() - entry.createdAt.getTime();
          if (age > rule.conditions.maxAge) {
            affectedKeys.push(key);
            this.cacheRegistry.delete(key);
          }
        }
      }

      if (affectedKeys.length > 0) {
        this.recordInvalidationEvent({
          trigger: 'time_based',
          affectedCacheTypes: rule.affectedCacheTypes,
          affectedKeys,
          reason: `Time-based invalidation (max age: ${rule.conditions.maxAge}ms)`,
          success: true
        });

        console.log(`🕒 Time-based invalidation: removed ${affectedKeys.length} entries for ${rule.name}`);
      }
    }
  }

  /**
   * Manual cache invalidation for specific cache types
   * Why this matters: Provides manual control for testing and troubleshooting
   */
  manualInvalidation(cacheTypes: CacheType[], reason: string): number {
    const affectedKeys: string[] = [];
    
    for (const [key, entry] of this.cacheRegistry.entries()) {
      if (cacheTypes.includes(entry.type)) {
        affectedKeys.push(key);
        this.cacheRegistry.delete(key);
      }
    }

    this.recordInvalidationEvent({
      trigger: 'manual',
      affectedCacheTypes: cacheTypes,
      affectedKeys,
      reason,
      success: true
    });

    console.log(`🔧 Manual invalidation: removed ${affectedKeys.length} entries`);
    return affectedKeys.length;
  }

  /**
   * Get cache invalidation statistics
   * Why this matters: Provides visibility into cache invalidation effectiveness
   */
  getInvalidationStats() {
    const now = new Date();
    const last24Hours = now.getTime() - (24 * 60 * 60 * 1000);
    const recentEvents = this.invalidationHistory.filter(e => e.timestamp.getTime() > last24Hours);
    
    const statsByTrigger = recentEvents.reduce((acc, event) => {
      acc[event.trigger] = (acc[event.trigger] || 0) + event.affectedKeys.length;
      return acc;
    }, {} as Record<string, number>);

    const statsByType = recentEvents.reduce((acc, event) => {
      event.affectedCacheTypes.forEach(type => {
        acc[type] = (acc[type] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);

    return {
      totalCacheEntries: this.cacheRegistry.size,
      invalidationRules: this.invalidationRules.length,
      enabledRules: this.invalidationRules.filter(r => r.enabled).length,
      recentInvalidations: {
        last24Hours: recentEvents.length,
        byTrigger: statsByTrigger,
        byCacheType: statsByType
      },
      oldestEntry: this.getOldestCacheEntry(),
      newestEntry: this.getNewestCacheEntry()
    };
  }

  /**
   * Hash brand kit for change detection
   * Why this matters: Creates consistent hash for detecting brand kit changes
   */
  private hashBrandKit(brandKit: any): string {
    if (!brandKit) return '';
    
    // Create hash from key brand kit fields
    const keyFields = {
      company_name: brandKit.company_name || '',
      brand_voice: brandKit.brand_voice || '',
      target_audience: brandKit.target_audience || '',
      cta_preferences: brandKit.cta_preferences || '',
      // Add other critical fields that should trigger cache invalidation
    };
    
    return Buffer.from(JSON.stringify(keyFields)).toString('base64');
  }

  /**
   * Record invalidation event for tracking
   */
  private recordInvalidationEvent(event: Omit<InvalidationEvent, 'id' | 'timestamp'>): void {
    const fullEvent: InvalidationEvent = {
      id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      ...event
    };
    
    this.invalidationHistory.push(fullEvent);
    
    // Keep only recent history (last 1000 events)
    if (this.invalidationHistory.length > 1000) {
      this.invalidationHistory = this.invalidationHistory.slice(-1000);
    }
  }

  /**
   * Clean up old cache entries to prevent memory issues
   */
  private cleanupOldEntries(): void {
    const entries = Array.from(this.cacheRegistry.entries());
    entries.sort((a, b) => a[1].lastAccessed.getTime() - b[1].lastAccessed.getTime());
    
    // Remove oldest 20% of entries
    const toRemove = Math.floor(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      this.cacheRegistry.delete(entries[i][0]);
    }
    
    console.log(`🧹 Cleaned up ${toRemove} old cache entries`);
  }

  /**
   * Get oldest cache entry for statistics
   */
  private getOldestCacheEntry(): Date | null {
    let oldest: Date | null = null;
    for (const entry of this.cacheRegistry.values()) {
      if (!oldest || entry.createdAt < oldest) {
        oldest = entry.createdAt;
      }
    }
    return oldest;
  }

  /**
   * Get newest cache entry for statistics
   */
  private getNewestCacheEntry(): Date | null {
    let newest: Date | null = null;
    for (const entry of this.cacheRegistry.values()) {
      if (!newest || entry.createdAt > newest) {
        newest = entry.createdAt;
      }
    }
    return newest;
  }

  /**
   * Update invalidation rule configuration
   */
  updateInvalidationRule(ruleId: string, updates: Partial<CacheInvalidationRule>): boolean {
    const ruleIndex = this.invalidationRules.findIndex(r => r.id === ruleId);
    if (ruleIndex === -1) return false;
    
    this.invalidationRules[ruleIndex] = { ...this.invalidationRules[ruleIndex], ...updates };
    console.log(`🔧 Updated invalidation rule: ${ruleId}`);
    return true;
  }

  /**
   * Get all invalidation rules
   */
  getInvalidationRules(): CacheInvalidationRule[] {
    return [...this.invalidationRules];
  }

  /**
   * Get invalidation history
   */
  getInvalidationHistory(limit: number = 100): InvalidationEvent[] {
    return this.invalidationHistory.slice(-limit);
  }
}

export default CacheInvalidationService;
export { CacheType, CacheInvalidationRule, InvalidationEvent };
