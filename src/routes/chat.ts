import { Router, Request, Response } from 'express';
import claudeService from '../services/claudeService';
import { StartConversationRequest, SendMessageRequest } from '../types';

const router = Router();

/**
 * POST /api/chat/start-conversation
 * Start a new socratic learning conversation with Reddit post context
 * Why this matters: Initializes the "Dig Deeper" discovery process with specific
 * Reddit post context, setting up Apollo-focused sales coaching.
 */
router.post('/start-conversation', async (req: Request, res: Response): Promise<any> => {
  try {
    // Validate request body
    const { 
      post_id, 
      title, 
      content, 
      pain_point, 
      audience_insight,
      // Enhanced context fields
      subreddit,
      score,
      comments,
      post_url,
      permalink,
      content_opportunity,
      urgency_level,
      comment_insights
    }: StartConversationRequest = req.body;

    if (!post_id || !title || !pain_point) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'post_id, title, and pain_point are required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`🎯 Starting conversation for post: "${title.substring(0, 50)}..."`);

    // Start conversation with Claude
    const response = await claudeService.startConversation({
      post_id,
      title,
      content: content || '',
      pain_point,
      audience_insight: audience_insight || '',
      // Enhanced context fields
      subreddit,
      score,
      comments,
      post_url,
      permalink,
      content_opportunity,
      urgency_level,
      comment_insights
    });

    res.json({
      success: true,
      ...response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Start conversation error:', error);
    
    res.status(500).json({
      error: 'Conversation Start Failed',
      message: error instanceof Error ? error.message : 'Unknown conversation error',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/chat/start-conversation/stream
 * Start a new conversation with streaming initial message
 * Why this matters: Provides consistent streaming UX from the very first AI response.
 */
router.post('/start-conversation/stream', async (req: Request, res: Response): Promise<any> => {
  try {
    // Validate request body
    const { 
      post_id, 
      title, 
      content, 
      pain_point, 
      audience_insight,
      // Enhanced context fields
      subreddit,
      score,
      comments,
      post_url,
      permalink,
      content_opportunity,
      urgency_level,
      comment_insights
    }: StartConversationRequest = req.body;

    if (!post_id || !title || !pain_point) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'post_id, title, and pain_point are required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`🎯 Starting streaming conversation for post: "${title.substring(0, 50)}..."`);

    // Set up Server-Sent Events headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Start conversation with streaming
    await claudeService.startConversationStream({
      post_id,
      title,
      content: content || '',
      pain_point,
      audience_insight: audience_insight || '',
      // Enhanced context fields
      subreddit,
      score,
      comments,
      post_url,
      permalink,
      content_opportunity,
      urgency_level,
      comment_insights
    }, (chunk: string, isComplete: boolean, metadata?: any) => {
      if (metadata?.conversation_id && !isComplete) {
        // Send conversation ID first
        res.write(`data: ${JSON.stringify({ 
          type: 'conversation_id', 
          conversation_id: metadata.conversation_id,
          timestamp: new Date().toISOString()
        })}\n\n`);
      }
      
      if (isComplete) {
        // Send final metadata
        res.write(`data: ${JSON.stringify({ 
          type: 'complete', 
          metadata: metadata || {},
          timestamp: new Date().toISOString()
        })}\n\n`);
        res.end();
      } else {
        // Send content chunk
        res.write(`data: ${JSON.stringify({ 
          type: 'content', 
          content: chunk,
          timestamp: new Date().toISOString()
        })}\n\n`);
      }
    });

  } catch (error) {
    console.error('Start streaming conversation error:', error);
    
    // Send error through stream
    res.write(`data: ${JSON.stringify({ 
      type: 'error', 
      error: error instanceof Error ? error.message : 'Unknown streaming error',
      timestamp: new Date().toISOString()
    })}\n\n`);
    res.end();
  }
});

/**
 * POST /api/chat/message/stream
 * Send a message in an existing conversation and get streaming AI response
 * Why this matters: Provides real-time streaming responses for better UX during socratic discovery.
 */
router.post('/message/stream', async (req: Request, res: Response): Promise<any> => {
  try {
    // Validate request body
    const { conversation_id, message }: SendMessageRequest = req.body;

    if (!conversation_id || !message) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'conversation_id and message are required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'message must be a non-empty string',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`💬 Processing streaming message in conversation ${conversation_id}`);

    // Set up Server-Sent Events headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send streaming response
    await claudeService.sendMessageStream({
      conversation_id,
      message: message.trim()
    }, (chunk: string, isComplete: boolean, metadata?: any) => {
      if (isComplete) {
        // Send final metadata
        res.write(`data: ${JSON.stringify({ 
          type: 'complete', 
          metadata: metadata || {},
          timestamp: new Date().toISOString()
        })}\n\n`);
        res.end();
      } else {
        // Send content chunk
        res.write(`data: ${JSON.stringify({ 
          type: 'content', 
          content: chunk,
          timestamp: new Date().toISOString()
        })}\n\n`);
      }
    });

  } catch (error) {
    console.error('Send streaming message error:', error);
    
    // Send error through stream
    res.write(`data: ${JSON.stringify({ 
      type: 'error', 
      error: error instanceof Error ? error.message : 'Unknown streaming error',
      timestamp: new Date().toISOString()
    })}\n\n`);
    res.end();
  }
});

/**
 * POST /api/chat/message
 * Send a message in an existing conversation and get AI response
 * Why this matters: Continues the socratic discovery process, guiding users through
 * pain point exploration toward Apollo solution positioning.
 */
router.post('/message', async (req: Request, res: Response): Promise<any> => {
  try {
    // Validate request body
    const { conversation_id, message }: SendMessageRequest = req.body;

    if (!conversation_id || !message) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'conversation_id and message are required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'message must be a non-empty string',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`💬 Processing message in conversation ${conversation_id}`);

    // Send message and get response
    const response = await claudeService.sendMessage({
      conversation_id,
      message: message.trim()
    });

    res.json({
      success: true,
      ...response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Send message error:', error);
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('expired')) {
        return res.status(404).json({
          error: 'Conversation Not Found',
          message: error.message,
          status: 404,
          timestamp: new Date().toISOString()
        });
      }
      
      if (error.message.includes('not active')) {
        return res.status(410).json({
          error: 'Conversation Ended',
          message: error.message,
          status: 410,
          timestamp: new Date().toISOString()
        });
      }

      if (error.message.includes('maximum message limit')) {
        return res.status(429).json({
          error: 'Conversation Limit Reached',
          message: error.message,
          status: 429,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    res.status(500).json({
      error: 'Message Failed',
      message: error instanceof Error ? error.message : 'Unknown message error',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/chat/conversation/:id
 * Retrieve conversation history by ID
 * Why this matters: Allows frontend to fetch complete conversation context
 * for display and continuation of socratic learning sessions.
 */
router.get('/conversation/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const conversationId = req.params.id;

    if (!conversationId) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'conversation ID is required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    const conversation = claudeService.getConversation(conversationId);

    if (!conversation) {
      return res.status(404).json({
        error: 'Conversation Not Found',
        message: 'Conversation not found or has expired',
        status: 404,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      conversation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get conversation error:', error);
    
    res.status(500).json({
      error: 'Conversation Retrieval Failed',
      message: error instanceof Error ? error.message : 'Unknown retrieval error',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/chat/status
 * Check Claude service status and connection
 * Why this matters: Provides health monitoring for the chat service
 * to ensure Claude integration is working properly.
 */
router.get('/status', async (req: Request, res: Response): Promise<any> => {
  try {
    const status = claudeService.getServiceStatus();
    const isConnected = await claudeService.testConnection();

    res.json({
      service: 'Claude Chat',
      status: isConnected ? 'connected' : 'disconnected',
      details: {
        ...status,
        connection_test: isConnected
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chat status check error:', error);
    
    res.status(500).json({
      service: 'Claude Chat',
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/chat/test
 * Test Claude connection and basic functionality
 * Why this matters: Allows testing the Claude integration without starting real conversations.
 */
router.get('/test', async (req: Request, res: Response): Promise<any> => {
  try {
    const isConnected = await claudeService.testConnection();

    if (isConnected) {
      res.json({
        message: 'Claude connection test successful',
        status: 'connected',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        error: 'Service Unavailable',
        message: 'Claude connection test failed',
        status: 503,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Claude test error:', error);
    
    res.status(500).json({
      error: 'Test Failed',
      message: error instanceof Error ? error.message : 'Unknown test error',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

export default router; 