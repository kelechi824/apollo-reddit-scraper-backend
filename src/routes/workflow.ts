import { Router, Request, Response } from 'express';
import { redditService } from '../services/redditService';
import openaiServiceOptimized from '../services/openaiServiceOptimized';
import GoogleSheetsService from '../services/googleSheetsService';
import { WorkflowRequest, WorkflowResponse, ApiError } from '../types';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const sheetsService = new GoogleSheetsService();

// In-memory storage for workflow status (in production, use Redis or database)
const workflowStatus = new Map<string, {
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  result?: WorkflowResponse;
  error?: string;
  startTime: number;
}>();

/**
 * POST /api/workflow/run-analysis
 * Start async Reddit content analysis workflow
 * Why this matters: Returns immediately with workflow ID, then processes in background
 * to avoid serverless timeout limits while providing real-time progress updates.
 */
router.post('/run-analysis', async (req: Request, res: Response): Promise<any> => {
  const workflowId = uuidv4();
  const startTime = Date.now();
  
  // Validate request first
  const { keywords, subreddits, limit, timeframe, export_to_sheets }: WorkflowRequest = req.body;
  
  console.log(`📥 POST /run-analysis received timeframe: "${timeframe}"`);
  console.log(`📥 Full request body:`, JSON.stringify(req.body, null, 2));

  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'keywords array is required and must not be empty',
      status: 400,
      timestamp: new Date().toISOString()
    });
  }

  if (!subreddits || !Array.isArray(subreddits) || subreddits.length === 0) {
    return res.status(400).json({
      error: 'Validation Error', 
      message: 'subreddits array is required and must not be empty',
      status: 400,
      timestamp: new Date().toISOString()
    });
  }

  // Initialize workflow status
  workflowStatus.set(workflowId, {
    status: 'pending',
    progress: 0,
    startTime
  });

  // Return immediately with workflow ID
  res.json({
    success: true,
    workflow_id: workflowId,
    status: 'pending',
    message: 'Analysis started. Use /api/workflow/status/{workflow_id} to check progress.'
  });

  // Start async processing (don't await - let it run in background)
  processWorkflowAsync(workflowId, { keywords, subreddits, limit, timeframe, export_to_sheets });
});

/**
 * GET /api/workflow/status/:workflowId
 * Check status of specific workflow
 * Why this matters: Allows frontend to poll for completion and get results when ready
 */
router.get('/status/:workflowId', async (req: Request, res: Response): Promise<any> => {
  const { workflowId } = req.params;
  
  const status = workflowStatus.get(workflowId);
  if (!status) {
    return res.status(404).json({
      error: 'Workflow Not Found',
      message: 'Workflow ID not found or expired',
      status: 404,
      timestamp: new Date().toISOString()
    });
  }

  // Clean up completed workflows after 1 hour
  if (status.status === 'completed' || status.status === 'failed') {
    const age = Date.now() - status.startTime;
    if (age > 60 * 60 * 1000) { // 1 hour
      workflowStatus.delete(workflowId);
      return res.status(404).json({
        error: 'Workflow Expired',
        message: 'Workflow results have expired',
        status: 404,
        timestamp: new Date().toISOString()
      });
    }
  }

  res.json({
    workflow_id: workflowId,
    status: status.status,
    progress: status.progress,
    result: status.result,
    error: status.error,
    duration_ms: Date.now() - status.startTime
  });
});

/**
 * Async workflow processor that runs in background
 * Why this matters: Handles the actual long-running analysis without blocking the API response
 */
async function processWorkflowAsync(workflowId: string, request: WorkflowRequest) {
  const statusEntry = workflowStatus.get(workflowId)!;
  
  try {
    console.log(`🚀 Starting async workflow ${workflowId}`);
    
    // Update status to running
    statusEntry.status = 'running';
    statusEntry.progress = 10;
    
    const { keywords, subreddits, limit, timeframe, export_to_sheets } = request;

    console.log(`📊 Workflow parameters: ${keywords.join(', ')} in r/${subreddits.join(', r/')}`);
    console.log(`📊 Raw timeframe received: "${timeframe}" (type: ${typeof timeframe})`);

    // Step 1: Search Reddit
    console.log(`🔍 Step 1: Searching Reddit...`);
    statusEntry.progress = 25;
    
    // Map legacy timeframe values to new ones
    const mappedTimeframe = (() => {
      console.log(`🔄 Workflow received timeframe: "${timeframe}"`);
      switch (timeframe) {
        case 'hour':
        case 'day':
        case 'week':
          return 'recent';
        case 'month':
        case 'year':
        case 'all':
          return 'older';
        default:
          const result = timeframe || 'recent';
          console.log(`🔄 Mapped timeframe: "${timeframe}" -> "${result}"`);
          return result;
      }
    })();

    const redditResults = await redditService.searchPosts({
      keywords: keywords.map(k => String(k).trim()).filter(k => k.length > 0),
      subreddits: subreddits.map(s => String(s).trim()).filter(s => s.length > 0),
      limit: limit ? Math.min(Math.max(parseInt(String(limit)), 1), 50) : 25,
      timeframe: mappedTimeframe,
      sort: 'top'
    });

    if (redditResults.posts.length === 0) {
      statusEntry.status = 'failed';
      statusEntry.progress = 100;
      statusEntry.error = 'No Reddit posts found matching the criteria';
      return;
    }

    console.log(`✅ Step 1 complete: Found ${redditResults.posts.length} quality Reddit posts`);

    // Step 2: Analyze with OpenAI
    console.log(`🧠 Step 2: Analyzing posts with OpenAI...`);
    statusEntry.progress = 50;
    
    const analyzedPosts = await openaiServiceOptimized.analyzePosts({
      posts: redditResults.posts,
      keywords_used: redditResults.keywords_used,
      subreddits_used: redditResults.subreddits_used
    });

    console.log(`✅ Step 2 complete: Analyzed ${analyzedPosts.length} posts`);
    statusEntry.progress = 75;

    // Step 3: Export to Google Sheets (optional)
    let sheetsExport = undefined;
    if (export_to_sheets && export_to_sheets.spreadsheet_id) {
      console.log(`📊 Step 3: Exporting to Google Sheets...`);
      
      try {
        sheetsExport = await sheetsService.exportToSheets({
          analyzed_posts: analyzedPosts,
          spreadsheet_id: export_to_sheets.spreadsheet_id,
          sheet_name: export_to_sheets.sheet_name || 'Reddit Analysis'
        });
        console.log(`✅ Step 3 complete: Exported to Google Sheets`);
      } catch (sheetsError) {
        console.error(`⚠️  Step 3 failed: Google Sheets export error:`, sheetsError);
        // Continue workflow even if sheets export fails
      }
    }

    const duration = Date.now() - statusEntry.startTime;
    console.log(`🎉 Workflow ${workflowId} completed in ${duration}ms`);

    // Mark as completed with results
    statusEntry.status = 'completed';
    statusEntry.progress = 100;
    statusEntry.result = {
      success: true,
      reddit_results: redditResults,
      analyzed_posts: analyzedPosts,
      sheets_export: sheetsExport,
      workflow_id: workflowId,
      completed_at: new Date().toISOString()
    };

  } catch (error) {
    const duration = Date.now() - statusEntry.startTime;
    console.error(`❌ Workflow ${workflowId} failed after ${duration}ms:`, error);
    
    statusEntry.status = 'failed';
    statusEntry.progress = 0;
    statusEntry.error = error instanceof Error ? error.message : 'Unknown workflow error';
  }
}

/**
 * GET /api/workflow/status
 * Get status of all services used in the workflow
 * Why this matters: Provides a comprehensive health check for the entire pipeline
 * so users know which services are available before running analysis.
 */
router.get('/status', async (req: Request, res: Response): Promise<any> => {
  try {
    // Check all services
    const redditStatus = redditService.getClientStatus();
    const openaiStatus = openaiServiceOptimized.getServiceStatus();
    const sheetsStatus = sheetsService.getServiceStatus();

    // Test connections if services are initialized
    const redditConnected = redditStatus.initialized ? await redditService.testConnection() : false;
    const openaiConnected = openaiStatus.initialized ? await openaiServiceOptimized.testConnection() : false;
    const sheetsConnected = sheetsStatus.initialized ? await sheetsService.testConnection() : false;

    const allServicesReady = redditConnected && openaiConnected;
    const sheetsOptional = sheetsStatus.hasCredentials ? sheetsConnected : true; // Sheets is optional

    res.json({
      workflow_status: allServicesReady && sheetsOptional ? 'ready' : 'partial',
      services: {
        reddit: {
          status: redditConnected ? 'connected' : 'disconnected',
          ...redditStatus
        },
        openai: {
          status: openaiConnected ? 'connected' : 'disconnected',
          ...openaiStatus
        },
        google_sheets: {
          status: sheetsConnected ? 'connected' : 
                 sheetsStatus.hasCredentials ? 'disconnected' : 'not_configured',
          ...sheetsStatus
        }
      },
      capabilities: {
        reddit_search: redditConnected,
        ai_analysis: openaiConnected,
        sheets_export: sheetsConnected,
        full_workflow: allServicesReady
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Workflow status check error:', error);
    
    res.status(500).json({
      workflow_status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;