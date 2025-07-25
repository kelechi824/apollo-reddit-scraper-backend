import express, { Request, Response } from 'express';
import GongService from '../services/gongService';

const router = express.Router();

/**
 * Test Gong API connection
 * Why this matters: Validates that Gong credentials are working before processing calls.
 */
router.get('/test-connection', async (req: Request, res: Response) => {
  try {
    console.log('🧪 Testing Gong API connection...');
    
    const gongService = new GongService();
    const isConnected = await gongService.testConnection();
    
    if (isConnected) {
      res.json({ 
        success: true, 
        message: 'Gong API connection successful',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to connect to Gong API',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error: any) {
    console.error('❌ Gong connection test failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Gong API connection test failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get Gong service health status
 * Why this matters: Provides monitoring and diagnostics for the Gong integration.
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const gongService = new GongService();
    const healthStatus = await gongService.getHealthStatus();
    res.json(healthStatus);
  } catch (error: any) {
    console.error('❌ Failed to get Gong health status:', error);
    res.status(500).json({ 
      error: 'Failed to get health status',
      message: error.message 
    });
  }
});

/**
 * Fetch recent calls from Gong
 * Why this matters: Provides call data for pain point analysis pipeline.
 */
router.get('/calls', async (req: Request, res: Response) => {
  try {
    const daysBack = parseInt(req.query.daysBack as string) || 30;
    const limit = parseInt(req.query.limit as string) || 50;
    
    console.log(`📞 Fetching recent calls (${daysBack} days, limit: ${limit})`);
    
    const gongService = new GongService();
    const calls = await gongService.getRecentCalls(daysBack, limit);
    
    res.json({
      success: true,
      count: calls.length,
      calls: calls,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('❌ Failed to fetch Gong calls:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch calls',
      message: error.message 
    });
  }
});

/**
 * Get call transcript
 * Why this matters: Retrieves transcript data needed for pain point extraction.
 */
router.get('/calls/:callId/transcript', async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;
    
    console.log(`📝 Fetching transcript for call ${callId}`);
    
    const gongService = new GongService();
    const transcript = await gongService.getCallTranscript(callId);
    
    if (transcript) {
      res.json({
        success: true,
        transcript: transcript,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Transcript not available for this call',
        callId: callId
      });
    }
  } catch (error: any) {
    console.error(`❌ Failed to fetch transcript for call ${req.params.callId}:`, error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch transcript',
      message: error.message 
    });
  }
});

/**
 * Get comprehensive conversation details for a call
 * Why this matters: Provides rich conversation insights including analytics, moments, and scorecards.
 */
router.get('/calls/:callId/conversation-details', async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;
    
    console.log(`🔍 Fetching comprehensive conversation details for call ${callId}`);
    
    const gongService = new GongService();
    const conversationDetails = await gongService.getCallConversationDetails(callId);
    
    res.json({
      success: true,
      data: conversationDetails,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error(`❌ Failed to fetch conversation details for call ${req.params.callId}:`, error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch conversation details',
      message: error.message 
    });
  }
});

/**
 * Get call highlights and key insights
 * Why this matters: Provides the most important conversation moments and insights without full transcript.
 */
router.get('/calls/:callId/highlights', async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;
    
    console.log(`⭐ Fetching highlights for call ${callId}`);
    
    const gongService = new GongService();
    const highlights = await gongService.getCallHighlights(callId);
    
    if (highlights) {
      res.json({
        success: true,
        highlights: highlights,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Highlights not available for this call',
        callId: callId
      });
    }
  } catch (error: any) {
    console.error(`❌ Failed to fetch highlights for call ${req.params.callId}:`, error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch highlights',
      message: error.message 
    });
  }
});

/**
 * Get extensive call data with rich metadata
 * Why this matters: Provides detailed call information including topics, trackers, and analytics.
 */
router.get('/calls/:callId/extensive', async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;
    
    console.log(`📊 Fetching extensive data for call ${callId}`);
    
    const gongService = new GongService();
    const extensiveData = await gongService.getCallExtensiveData(callId);
    
    if (extensiveData) {
      res.json({
        success: true,
        data: extensiveData,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Extensive data not available for this call',
        callId: callId
      });
    }
  } catch (error: any) {
    console.error(`❌ Failed to fetch extensive data for call ${req.params.callId}:`, error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch extensive data',
      message: error.message 
    });
  }
});

/**
 * Sync recent calls with transcripts for analysis
 * Why this matters: Comprehensive data collection for pain point extraction pipeline.
 */
router.post('/sync', async (req: Request, res: Response) => {
  try {
    const { daysBack = 30, maxCalls = 25 } = req.body;
    
    console.log(`🔄 Starting Gong data sync (${daysBack} days, max ${maxCalls} calls)`);
    
    const gongService = new GongService();
    const callsWithTranscripts = await gongService.getCallsWithTranscripts(daysBack, maxCalls);
    
    const successfulTranscripts = callsWithTranscripts.filter((c: any) => c.transcript !== null);
    
    res.json({
      success: true,
      message: 'Gong data sync completed',
      summary: {
        totalCalls: callsWithTranscripts.length,
        callsWithTranscripts: successfulTranscripts.length,
        transcriptSuccessRate: `${Math.round((successfulTranscripts.length / callsWithTranscripts.length) * 100)}%`
      },
      data: callsWithTranscripts,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('❌ Failed to sync Gong data:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to sync Gong data',
      message: error.message 
    });
  }
});

export default router; 