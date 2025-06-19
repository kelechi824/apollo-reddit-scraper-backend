import { Router, Request, Response } from 'express';
import { redditService } from '../services/redditService';
import OpenAIService from '../services/openaiService';
import GoogleSheetsService from '../services/googleSheetsService';
import { WorkflowRequest, WorkflowResponse, ApiError } from '../types';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const openaiService = new OpenAIService();
const sheetsService = new GoogleSheetsService();

/**
 * POST /api/workflow/run-analysis
 * Complete Reddit content analysis workflow
 * Why this matters: This is the main end-to-end API that combines Reddit scraping,
 * OpenAI analysis, and Google Sheets export into a single powerful business intelligence pipeline.
 */
router.post('/run-analysis', async (req: Request, res: Response): Promise<any> => {
  const workflowId = uuidv4();
  const startTime = Date.now();
  
  try {
    console.log(`🚀 Starting workflow ${workflowId}`);
    
    // Validate request body
    const { keywords, subreddits, limit, export_to_sheets }: WorkflowRequest = req.body;

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

    console.log(`📊 Workflow parameters: ${keywords.join(', ')} in r/${subreddits.join(', r/')}`);

    // Step 1: Search Reddit
    console.log(`🔍 Step 1: Searching Reddit...`);
    const redditResults = await redditService.searchPosts({
      keywords: keywords.map(k => String(k).trim()).filter(k => k.length > 0),
      subreddits: subreddits.map(s => String(s).trim()).filter(s => s.length > 0),
             limit: limit ? Math.min(Math.max(parseInt(String(limit)), 1), 50) : 25,
      timeframe: 'week',
      sort: 'top'
    });

    if (redditResults.posts.length === 0) {
      return res.json({
        success: false,
        message: 'No Reddit posts found matching the criteria',
        reddit_results: redditResults,
        analyzed_posts: [],
        workflow_id: workflowId,
        completed_at: new Date().toISOString()
      });
    }

    // Quality check: Ensure we have enough high-quality posts (matching n8n criteria)
    if (redditResults.posts.length < 3) {
      return res.json({
        success: false,
        message: `Only found ${redditResults.posts.length} quality posts (score >= 50). Need at least 3 for meaningful analysis.`,
        reddit_results: redditResults,
        analyzed_posts: [],
        workflow_id: workflowId,
        completed_at: new Date().toISOString()
      });
    }

    console.log(`✅ Step 1 complete: Found ${redditResults.posts.length} quality Reddit posts`);

    // Step 2: Analyze with OpenAI
    console.log(`🧠 Step 2: Analyzing posts with OpenAI...`);
    const analyzedPosts = await openaiService.analyzePosts({
      posts: redditResults.posts,
      keywords_used: redditResults.keywords_used,
      subreddits_used: redditResults.subreddits_used
    });

    console.log(`✅ Step 2 complete: Analyzed ${analyzedPosts.length} posts`);

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

    const duration = Date.now() - startTime;
    console.log(`🎉 Workflow ${workflowId} completed in ${duration}ms`);

    // Build response
    const response: WorkflowResponse = {
      success: true,
      reddit_results: redditResults,
      analyzed_posts: analyzedPosts,
      sheets_export: sheetsExport,
      workflow_id: workflowId,
      completed_at: new Date().toISOString()
    };

    res.json(response);

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Workflow ${workflowId} failed after ${duration}ms:`, error);
    
    const apiError: ApiError = {
      error: 'Workflow Failed',
      message: error instanceof Error ? error.message : 'Unknown workflow error',
      status: 500,
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json({
      ...apiError,
      workflow_id: workflowId,
      duration_ms: duration
    });
  }
});

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
    const openaiStatus = openaiService.getServiceStatus();
    const sheetsStatus = sheetsService.getServiceStatus();

    // Test connections if services are initialized
    const redditConnected = redditStatus.initialized ? await redditService.testConnection() : false;
    const openaiConnected = openaiStatus.initialized ? await openaiService.testConnection() : false;
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