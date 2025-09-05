import { Router, Request, Response } from 'express';
import openaiService from '../services/openaiService';
import PatternAnalysisService, { PatternAnalysisRequest } from '../services/patternAnalysisService';
import { ContentAnalysisRequest, ApiError } from '../types';

const router = Router();
const patternAnalysisService = new PatternAnalysisService();

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

/**
 * POST /api/analysis/analyze-patterns
 * Analyze patterns across multiple analyzed Reddit posts
 * 
 * Why this matters: Provides high-level categorization and theme analysis
 * of Reddit discussions using GPT-5 Nano for pattern recognition.
 */
router.post('/analyze-patterns', async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('📊 Pattern analysis request received');
    
    const request: PatternAnalysisRequest = req.body;
    
    // Validate request
    if (!request.analyzed_posts || !Array.isArray(request.analyzed_posts)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'analyzed_posts must be an array',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    if (request.analyzed_posts.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'At least one analyzed post is required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    if (request.analyzed_posts.length > 50) {
      return res.status(400).json({
        error: 'Too many posts',
        message: 'Maximum 50 posts allowed for pattern analysis',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`🔍 Analyzing patterns for ${request.analyzed_posts.length} posts`);
    console.log(`🔑 Keywords: "${request.keywords}"`);
    
    const startTime = Date.now();
    
    // Perform pattern analysis
    const result = await patternAnalysisService.analyzePatterns(request);
    
    const processingTime = Date.now() - startTime;
    
    console.log(`✅ Pattern analysis completed in ${processingTime}ms`);
    console.log(`📈 Found ${result.categories.length} pattern categories`);
    
    // Add processing metadata
    const response = {
      ...result,
      processing_metadata: {
        processing_time_ms: processingTime,
        posts_analyzed: request.analyzed_posts.length,
        categories_found: result.categories.length,
        service_version: '1.0.0'
      }
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ Pattern analysis error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Pattern analysis failed';
    
    res.status(500).json({
      error: 'Pattern analysis failed',
      message: errorMessage,
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/analysis/pattern-status
 * Get pattern analysis service status
 * 
 * Why this matters: Allows frontend to check if pattern analysis is available
 */
router.get('/pattern-status', (req: Request, res: Response) => {
  try {
    const status = patternAnalysisService.getStatus();
    
    res.json({
      service: 'Pattern Analysis',
      status: status.available ? 'available' : 'unavailable',
      model: status.model,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Pattern status check error:', error);
    
    res.status(500).json({
      service: 'Pattern Analysis',
      status: 'error',
      error: error instanceof Error ? error.message : 'Status check failed',
      timestamp: new Date().toISOString()
    });
  }
});

export default router; 