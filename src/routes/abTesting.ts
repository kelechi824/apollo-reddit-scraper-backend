/**
 * A/B Testing API Routes
 * Why this matters: Provides web interface for managing caching A/B tests,
 * monitoring performance metrics, and controlling feature flags in real-time
 * without server restarts.
 */

import express, { Request, Response } from 'express';
import ConfigService, { FeatureFlags } from '../services/configService';

const router = express.Router();
const configService = ConfigService.getInstance();

/**
 * Get current A/B testing configuration and metrics
 * Why this matters: Provides dashboard view of current testing status and results
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const featureFlags = configService.getFeatureFlags();
    const abTestSummary = configService.getABTestSummary();
    
    res.json({
      success: true,
      data: {
        featureFlags,
        abTestSummary,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error getting A/B testing status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get A/B testing status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Update feature flags
 * Why this matters: Allows dynamic configuration changes for testing different scenarios
 */
router.post('/feature-flags', async (req: Request, res: Response) => {
  try {
    const updates = req.body as Partial<FeatureFlags>;
    
    // Validate and update each provided flag
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'boolean' || typeof value === 'number') {
        configService.updateFeatureFlag(key as keyof FeatureFlags, value);
      }
    }
    
    const updatedFlags = configService.getFeatureFlags();
    
    res.json({
      success: true,
      message: 'Feature flags updated successfully',
      data: updatedFlags
    });
  } catch (error) {
    console.error('❌ Error updating feature flags:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update feature flags',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Start A/B testing with specific configuration
 * Why this matters: Provides easy way to begin controlled testing with specific parameters
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { 
      percentage = 50, 
      userBased = true,
      resetMetrics = true 
    } = req.body;
    
    // Configure A/B testing
    configService.updateFeatureFlag('abTestingEnabled', true);
    configService.updateFeatureFlag('abTestingPercentage', percentage);
    configService.updateFeatureFlag('abTestingUserBased', userBased);
    
    // Reset metrics if requested
    if (resetMetrics) {
      configService.resetABTestMetrics();
    }
    
    res.json({
      success: true,
      message: 'A/B testing started successfully',
      data: {
        percentage,
        userBased,
        resetMetrics,
        startTime: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error starting A/B testing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start A/B testing',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Stop A/B testing and get final results
 * Why this matters: Provides clean way to end testing and get comprehensive results
 */
router.post('/stop', async (req: Request, res: Response) => {
  try {
    // Get final metrics before stopping
    const finalResults = configService.getABTestSummary();
    
    // Stop A/B testing
    configService.updateFeatureFlag('abTestingEnabled', false);
    
    res.json({
      success: true,
      message: 'A/B testing stopped successfully',
      data: {
        finalResults,
        stopTime: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error stopping A/B testing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop A/B testing',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Reset A/B testing metrics
 * Why this matters: Allows starting fresh testing cycles with clean metrics
 */
router.post('/reset-metrics', async (req: Request, res: Response) => {
  try {
    configService.resetABTestMetrics();
    
    res.json({
      success: true,
      message: 'A/B testing metrics reset successfully',
      data: {
        resetTime: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error resetting A/B testing metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset A/B testing metrics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get detailed A/B testing metrics for analysis
 * Why this matters: Provides comprehensive data for statistical analysis and decision making
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const summary = configService.getABTestSummary();
    
    // Add statistical significance calculation if we have enough data
    const addStatisticalAnalysis = (summary: any) => {
      if (summary.cachedRequests >= 30 && summary.nonCachedRequests >= 30) {
        // Simple statistical significance indicator (would need proper t-test for production)
        const costDifference = Math.abs(summary.costs.costSavings);
        const latencyDifference = Math.abs(summary.performance.latencyImprovement);
        const qualityDifference = Math.abs(summary.quality.qualityDifference);
        
        return {
          ...summary,
          statisticalAnalysis: {
            sufficientSampleSize: true,
            costSavingsSignificant: costDifference > 5, // >5% difference
            latencyImprovementSignificant: latencyDifference > 10, // >10% difference
            qualityImpactSignificant: qualityDifference > 0.1, // >0.1 point difference
            recommendation: costDifference > 5 && latencyDifference > 10 && qualityDifference < 0.1 
              ? 'RECOMMEND_CACHING' 
              : qualityDifference > 0.1 
                ? 'QUALITY_CONCERNS' 
                : 'CONTINUE_TESTING'
          }
        };
      }
      
      return {
        ...summary,
        statisticalAnalysis: {
          sufficientSampleSize: false,
          message: 'Need at least 30 requests in each group for statistical analysis'
        }
      };
    };
    
    const enhancedSummary = addStatisticalAnalysis(summary);
    
    res.json({
      success: true,
      data: enhancedSummary
    });
  } catch (error) {
    console.error('❌ Error getting A/B testing metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get A/B testing metrics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Test endpoint to simulate A/B testing decision
 * Why this matters: Allows testing the A/B logic without making actual API calls
 */
router.post('/test-assignment', async (req: Request, res: Response) => {
  try {
    const { userId, requestType } = req.body;
    
    const shouldUseCaching = configService.shouldUseCaching(userId, requestType);
    const featureFlags = configService.getFeatureFlags();
    
    res.json({
      success: true,
      data: {
        userId,
        requestType,
        shouldUseCaching,
        abTestingEnabled: featureFlags.abTestingEnabled,
        abTestingPercentage: featureFlags.abTestingPercentage,
        abTestingUserBased: featureFlags.abTestingUserBased
      }
    });
  } catch (error) {
    console.error('❌ Error testing A/B assignment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test A/B assignment',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
