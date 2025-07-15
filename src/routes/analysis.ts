import { Router, Request, Response } from 'express';
import openaiService from '../services/openaiService';
import { ContentAnalysisRequest, ApiError } from '../types';

const router = Router();

/**
 * POST /api/analysis/analyze-posts
 * Analyze Reddit posts for business insights
 * Why this matters: This is the core value-add endpoint that transforms raw Reddit data
 * into actionable business intelligence about pain points and opportunities.
 */
router.post('/analyze-posts', async (req: Request, res: Response): Promise<any> => {
  try {
    // Validate request body
    const { posts, keywords_used, subreddits_used }: ContentAnalysisRequest = req.body;

    if (!posts || !Array.isArray(posts) || posts.length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'posts array is required and must not be empty',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    if (!keywords_used || !subreddits_used) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'keywords_used and subreddits_used are required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`📊 Analysis request: ${posts.length} posts from keywords: ${keywords_used}`);

    // Analyze posts with OpenAI
    const analyzedPosts = await openaiService.analyzePosts({
      posts,
      keywords_used,
      subreddits_used
    });

    res.json({
      success: true,
      analyzed_posts: analyzedPosts,
      total_analyzed: analyzedPosts.length,
      keywords_used,
      subreddits_used,
      analysis_timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Analysis endpoint error:', error);
    
    res.status(500).json({
      error: 'Analysis Failed',
      message: error instanceof Error ? error.message : 'Unknown analysis error',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/analysis/status
 * Check OpenAI service status
 * Why this matters: Provides health monitoring for the analysis service
 * to ensure OpenAI integration is working properly.
 */
router.get('/status', async (req: Request, res: Response): Promise<any> => {
  try {
    const status = openaiService.getServiceStatus();
    const isConnected = await openaiService.testConnection();

    res.json({
      service: 'OpenAI Analysis',
      status: isConnected ? 'connected' : 'disconnected',
      details: {
        ...status,
        connection_test: isConnected
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Analysis status check error:', error);
    
    res.status(500).json({
      service: 'OpenAI Analysis',
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/analysis/test
 * Test OpenAI connection and basic functionality
 * Why this matters: Allows testing the OpenAI integration without processing real data.
 */
router.get('/test', async (req: Request, res: Response): Promise<any> => {
  try {
    const isConnected = await openaiService.testConnection();

    if (isConnected) {
      res.json({
        message: 'OpenAI connection test successful',
        status: 'connected',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        error: 'Service Unavailable',
        message: 'OpenAI connection test failed',
        status: 503,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('OpenAI test error:', error);
    
    res.status(500).json({
      error: 'Test Failed',
      message: error instanceof Error ? error.message : 'Unknown test error',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

export default router; 