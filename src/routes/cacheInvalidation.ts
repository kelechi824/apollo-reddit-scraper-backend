/**
 * Cache Invalidation API Routes
 * Why this matters: Provides web interface for managing cache invalidation rules,
 * monitoring invalidation events, and manually triggering cache cleanup when needed.
 */

import express, { Request, Response } from 'express';
import CacheInvalidationService, { CacheType, CacheInvalidationRule } from '../services/cacheInvalidationService';

const router = express.Router();
const cacheInvalidationService = CacheInvalidationService.getInstance();

/**
 * Get cache invalidation statistics and status
 * Why this matters: Provides dashboard view of cache health and invalidation activity
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = cacheInvalidationService.getInvalidationStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ Error getting cache invalidation stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache invalidation stats',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get all invalidation rules
 * Why this matters: Shows current invalidation configuration for management
 */
router.get('/rules', async (req: Request, res: Response) => {
  try {
    const rules = cacheInvalidationService.getInvalidationRules();
    
    res.json({
      success: true,
      data: rules
    });
  } catch (error) {
    console.error('❌ Error getting invalidation rules:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get invalidation rules',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Update an invalidation rule
 * Why this matters: Allows dynamic configuration of cache invalidation behavior
 */
router.put('/rules/:ruleId', async (req: Request, res: Response) => {
  try {
    const { ruleId } = req.params;
    const updates = req.body as Partial<CacheInvalidationRule>;
    
    const success = cacheInvalidationService.updateInvalidationRule(ruleId, updates);
    
    if (success) {
      res.json({
        success: true,
        message: `Invalidation rule ${ruleId} updated successfully`
      });
    } else {
      res.status(404).json({
        success: false,
        error: `Invalidation rule ${ruleId} not found`
      });
    }
  } catch (error) {
    console.error('❌ Error updating invalidation rule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update invalidation rule',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Manual cache invalidation
 * Why this matters: Provides manual control for testing and troubleshooting
 */
router.post('/invalidate', async (req: Request, res: Response): Promise<any> => {
  try {
    const { cacheTypes, reason = 'Manual invalidation via API' } = req.body;
    
    if (!cacheTypes || !Array.isArray(cacheTypes)) {
      return res.status(400).json({
        success: false,
        error: 'cacheTypes array is required'
      });
    }
    
    // Validate cache types
    const validCacheTypes: CacheType[] = [
      'claude_system_prompt',
      'claude_conversation',
      'claude_content_generation',
      'openai_deep_research',
      'openai_gap_analysis',
      'openai_pattern_analysis',
      'openai_pain_point',
      'brand_context',
      'workflow_state'
    ];
    
    const invalidTypes = cacheTypes.filter((type: string) => !validCacheTypes.includes(type as CacheType));
    if (invalidTypes.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid cache types: ${invalidTypes.join(', ')}`,
        validTypes: validCacheTypes
      });
    }
    
    const invalidatedCount = cacheInvalidationService.manualInvalidation(cacheTypes, reason);
    
    res.json({
      success: true,
      message: `Successfully invalidated ${invalidatedCount} cache entries`,
      data: {
        invalidatedCount,
        cacheTypes,
        reason
      }
    });
  } catch (error) {
    console.error('❌ Error performing manual cache invalidation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform manual cache invalidation',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Invalidate caches for template version change
 * Why this matters: Allows triggering template-specific cache invalidation
 */
router.post('/invalidate/template', async (req: Request, res: Response): Promise<any> => {
  try {
    const { templateType, newVersion, reason = 'Template version update via API' } = req.body;
    
    if (!templateType || !newVersion) {
      return res.status(400).json({
        success: false,
        error: 'templateType and newVersion are required'
      });
    }
    
    cacheInvalidationService.invalidateTemplateVersionCaches(templateType, newVersion, reason);
    
    res.json({
      success: true,
      message: `Successfully invalidated template caches for ${templateType}`,
      data: {
        templateType,
        newVersion,
        reason
      }
    });
  } catch (error) {
    console.error('❌ Error invalidating template caches:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to invalidate template caches',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Invalidate caches for system prompt version change
 * Why this matters: Allows triggering system prompt cache invalidation
 */
router.post('/invalidate/system-prompt', async (req: Request, res: Response): Promise<any> => {
  try {
    const { newVersion, reason = 'System prompt version update via API' } = req.body;
    
    if (!newVersion) {
      return res.status(400).json({
        success: false,
        error: 'newVersion is required'
      });
    }
    
    cacheInvalidationService.invalidateSystemPromptCaches(newVersion, reason);
    
    res.json({
      success: true,
      message: `Successfully invalidated system prompt caches`,
      data: {
        newVersion,
        reason
      }
    });
  } catch (error) {
    console.error('❌ Error invalidating system prompt caches:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to invalidate system prompt caches',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get invalidation history
 * Why this matters: Provides audit trail of cache invalidation events
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const history = cacheInvalidationService.getInvalidationHistory(limit);
    
    res.json({
      success: true,
      data: {
        history,
        totalEvents: history.length,
        limit
      }
    });
  } catch (error) {
    console.error('❌ Error getting invalidation history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get invalidation history',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Test brand kit change detection
 * Why this matters: Allows testing brand kit change detection without actual changes
 */
router.post('/test/brand-kit-change', async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId, brandKit } = req.body;
    
    if (!userId || !brandKit) {
      return res.status(400).json({
        success: false,
        error: 'userId and brandKit are required'
      });
    }
    
    const changeDetected = cacheInvalidationService.checkBrandKitChange(userId, brandKit);
    
    res.json({
      success: true,
      data: {
        userId,
        changeDetected,
        message: changeDetected 
          ? 'Brand kit change detected - caches invalidated' 
          : 'No brand kit change detected'
      }
    });
  } catch (error) {
    console.error('❌ Error testing brand kit change detection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test brand kit change detection',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Health check for cache invalidation service
 * Why this matters: Provides service health status for monitoring
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const stats = cacheInvalidationService.getInvalidationStats();
    const rules = cacheInvalidationService.getInvalidationRules();
    
    const health = {
      status: 'healthy',
      cacheEntries: stats.totalCacheEntries,
      activeRules: stats.enabledRules,
      totalRules: stats.invalidationRules,
      recentInvalidations: stats.recentInvalidations.last24Hours,
      oldestCacheEntry: stats.oldestEntry,
      newestCacheEntry: stats.newestEntry
    };
    
    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    console.error('❌ Error getting cache invalidation health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache invalidation health',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
