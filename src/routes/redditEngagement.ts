import { Router, Request, Response } from 'express';
import redditEngagementService, { RedditEngagementRequest, CommentGenerationRequest } from '../services/redditEngagementService';

const router = Router();

/**
 * POST /api/reddit-engagement/generate-responses
 * Generate 5 different Reddit response types for community engagement
 * Why this matters: Provides social media teams with ready-to-use, brand-aligned responses
 * that follow Reddit community guidelines and drive authentic engagement.
 */
router.post('/generate-responses', async (req: Request, res: Response): Promise<any> => {
  try {
    const { post_context, brand_kit }: RedditEngagementRequest = req.body;

    // Validate required fields
    if (!post_context) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'post_context is required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    const requiredFields = ['title', 'content', 'subreddit', 'pain_point', 'content_opportunity', 'audience_summary'];
    const missingFields = requiredFields.filter(field => !post_context[field as keyof typeof post_context]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: `Missing required post_context fields: ${missingFields.join(', ')}`,
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`🎯 Reddit engagement request for r/${post_context.subreddit}: "${post_context.title.substring(0, 50)}..."`);

    // Generate Reddit responses
    const result = await redditEngagementService.generateRedditResponses(
      post_context,
      brand_kit
    );

    console.log(`✅ Successfully generated ${result.responses.length} Reddit responses`);

    return res.status(200).json(result);

  } catch (error) {
    console.error('❌ Reddit engagement generation error:', error);
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to generate Reddit responses',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/reddit-engagement/generate-comment
 * Generate a single Reddit response for a specific comment
 * Why this matters: Allows users to create targeted responses to individual comments
 * with specific context, enabling more precise and relevant engagement.
 */
router.post('/generate-comment', async (req: Request, res: Response): Promise<any> => {
  try {
    const { comment_context, post_context, brand_kit }: CommentGenerationRequest = req.body;

    // Validate required fields
    if (!comment_context) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'comment_context is required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    if (!post_context) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'post_context is required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    const requiredCommentFields = ['content', 'author', 'brand_sentiment', 'helpfulness_sentiment', 'keyword_matches'];
    const missingCommentFields = requiredCommentFields.filter(field => 
      !comment_context[field as keyof typeof comment_context]
    );
    
    if (missingCommentFields.length > 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: `Missing required comment_context fields: ${missingCommentFields.join(', ')}`,
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    const requiredPostFields = ['title', 'subreddit', 'pain_point', 'audience_summary'];
    const missingPostFields = requiredPostFields.filter(field => 
      !post_context[field as keyof typeof post_context]
    );
    
    if (missingPostFields.length > 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: `Missing required post_context fields: ${missingPostFields.join(', ')}`,
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`💬 Comment response request for r/${post_context.subreddit}: responding to u/${comment_context.author}`);

    // Generate single comment response
    const result = await redditEngagementService.generateCommentResponse(
      comment_context,
      post_context,
      brand_kit
    );

    console.log(`✅ Successfully generated comment response`);

    return res.status(200).json(result);

  } catch (error) {
    console.error('❌ Comment response generation error:', error);
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to generate comment response',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/reddit-engagement/health
 * Health check endpoint for Reddit engagement service
 */
router.get('/health', async (req: Request, res: Response): Promise<any> => {
  try {
    return res.status(200).json({
      status: 'OK',
      service: 'Reddit Engagement Service',
      message: 'Service is operational',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      status: 'ERROR',
      service: 'Reddit Engagement Service',
      message: 'Service health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
