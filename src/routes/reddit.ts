import { Router, Request, Response } from 'express';
import { redditService } from '../services/redditService';
import { RedditSearchRequest, ApiError } from '../types';

const router = Router();

/**
 * POST /api/reddit/search
 * Search Reddit posts by keywords and subreddits
 * Why this matters: This is the main API endpoint that frontend will call to get Reddit data.
 */
router.post('/search', async (req: Request, res: Response): Promise<any> => {
  try {
    const { keywords, subreddits, limit, timeframe, sort } = req.body;

    // Validate required fields
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      const error: ApiError = {
        error: 'INVALID_KEYWORDS',
        message: 'Keywords must be a non-empty array',
        status: 400,
        timestamp: new Date().toISOString()
      };
      return res.status(400).json(error);
    }

    if (!subreddits || !Array.isArray(subreddits) || subreddits.length === 0) {
      const error: ApiError = {
        error: 'INVALID_SUBREDDITS', 
        message: 'Subreddits must be a non-empty array',
        status: 400,
        timestamp: new Date().toISOString()
      };
      return res.status(400).json(error);
    }

    // Create search request
    const searchRequest: RedditSearchRequest = {
      keywords: keywords.map((k: any) => String(k).trim()).filter((k: string) => k.length > 0),
      subreddits: subreddits.map((s: any) => String(s).trim()).filter((s: string) => s.length > 0),
      limit: limit ? Math.min(Math.max(parseInt(limit), 1), 100) : 25,
      timeframe: timeframe || 'week',
      sort: sort || 'top'
    };

    console.log(`🔍 Reddit search request:`, searchRequest);

    // Execute search
    const results = await redditService.searchPosts(searchRequest);

    console.log(`✅ Reddit search completed: ${results.posts.length} posts found`);

    res.json(results);

  } catch (error) {
    console.error('❌ Reddit search error:', error);
    
    const apiError: ApiError = {
      error: 'REDDIT_SEARCH_FAILED',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      status: 500,
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(apiError);
  }
});

/**
 * GET /api/reddit/test
 * Test Reddit connection and service health
 * Why this matters: Allows us to verify Reddit credentials are working.
 */
router.get('/test', async (req: Request, res: Response) => {
  try {
    const status = redditService.getClientStatus();
    const connectionWorking = await redditService.testConnection();

    res.json({
      service: 'Reddit API',
      status: connectionWorking ? 'connected' : 'disconnected',
      client_initialized: status.initialized,
      has_credentials: status.hasCredentials,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Reddit test error:', error);
    
    const apiError: ApiError = {
      error: 'REDDIT_TEST_FAILED',
      message: error instanceof Error ? error.message : 'Connection test failed',
      status: 500,
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(apiError);
  }
});

/**
 * GET /api/reddit/status
 * Get Reddit service status without testing connection
 * Why this matters: Quick health check for monitoring.
 */
router.get('/status', (req: Request, res: Response) => {
  const status = redditService.getClientStatus();
  
  res.json({
    service: 'Reddit API',
    client_initialized: status.initialized,
    has_credentials: status.hasCredentials,
    timestamp: new Date().toISOString()
  });
});

export default router; 