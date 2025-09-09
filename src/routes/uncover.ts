import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { UncoverWorkflowRequest, UncoverWorkflowResponse, ApiError } from '../types';
import uncoverService from '../services/uncoverService';

const router = Router();

// Workflow status tracking - serverless-safe storage
const uncoverWorkflowStatus = new Map<string, {
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  result?: UncoverWorkflowResponse;
  error?: string;
  startTime: number;
}>();

// Serverless-compatible workflow storage using process.env as fallback
const UNCOVER_WORKFLOW_ENV_PREFIX = 'APOLLO_UNCOVER_';

/**
 * Store workflow data in both memory and process.env for serverless persistence
 * Why this matters: Vercel serverless functions are ephemeral - in-memory Maps 
 * lose data between invocations, causing 404 errors during status polling
 */
function storeUncoverWorkflowData(workflowId: string, data: any) {
  try {
    // Store in memory for immediate access
    uncoverWorkflowStatus.set(workflowId, data);
    
    // Also store in process.env for serverless persistence (with TTL)
    const envKey = `${UNCOVER_WORKFLOW_ENV_PREFIX}${workflowId}`;
    const workflowData = {
      ...data,
      stored_at: Date.now()
    };
    process.env[envKey] = JSON.stringify(workflowData);
    console.log(`💾 Stored uncover workflow ${workflowId} in both memory and env`);
  } catch (error) {
    console.warn(`⚠️ Failed to store uncover workflow data for ${workflowId}:`, error);
    // Still store in memory as fallback
    uncoverWorkflowStatus.set(workflowId, data);
  }
}

/**
 * Get workflow data from memory or process.env fallback
 * Why this matters: Allows workflow status to persist across serverless function restarts
 */
function getUncoverWorkflowData(workflowId: string) {
  // First try memory
  let workflow = uncoverWorkflowStatus.get(workflowId);
  if (workflow) {
    console.log(`📋 Found uncover workflow ${workflowId} in memory`);
    return workflow;
  }

  // Fallback to process.env for serverless environments
  try {
    const envKey = `${UNCOVER_WORKFLOW_ENV_PREFIX}${workflowId}`;
    const envData = process.env[envKey];
    
    if (envData) {
      const workflowData = JSON.parse(envData);
      
      // Check if data is not too old (30 minutes max)
      const maxAge = 30 * 60 * 1000; // 30 minutes
      if (Date.now() - workflowData.stored_at < maxAge) {
        console.log(`📋 Found uncover workflow ${workflowId} in env storage`);
        // Remove stored_at before returning
        delete workflowData.stored_at;
        
        // Restore to memory for future access
        uncoverWorkflowStatus.set(workflowId, workflowData);
        return workflowData;
      } else {
        console.log(`⏰ Uncover workflow ${workflowId} expired in env storage`);
        // Clean up expired workflow
        delete process.env[envKey];
      }
    }
  } catch (error) {
    console.warn(`⚠️ Failed to retrieve uncover workflow data from env for ${workflowId}:`, error);
  }

  return null;
}

/**
 * Process uncover workflow asynchronously
 * Why this matters: Handles the actual discovery process in the background
 * to avoid timeout issues while providing progress updates
 */
async function processUncoverWorkflowAsync(
  workflowId: string, 
  request: UncoverWorkflowRequest
): Promise<void> {
  try {
    console.log(`🎯 Processing uncover workflow ${workflowId}:`, request);
    
    // Update status to running
    storeUncoverWorkflowData(workflowId, {
      status: 'running',
      progress: 10,
      startTime: Date.now()
    });

    // Step 1: Discover posts (60% of progress)
    console.log(`🔍 Step 1: Discovering posts for category ${request.category}`);
    storeUncoverWorkflowData(workflowId, {
      status: 'running',
      progress: 30,
      startTime: Date.now()
    });

    const uncoverResults = await uncoverService.discoverPosts(request);
    
    storeUncoverWorkflowData(workflowId, {
      status: 'running',
      progress: 80,
      startTime: Date.now()
    });

    // Step 2: Prepare final response
    console.log(`📊 Step 2: Preparing final response with ${uncoverResults.posts.length} posts`);
    
    const workflowResponse: UncoverWorkflowResponse = {
      ...uncoverResults,
      workflow_id: workflowId,
      completed_at: new Date().toISOString()
    };

    // Mark as completed
    storeUncoverWorkflowData(workflowId, {
      status: 'completed',
      progress: 100,
      result: workflowResponse,
      startTime: Date.now()
    });

    console.log(`✅ Uncover workflow ${workflowId} completed successfully`);

  } catch (error) {
    console.error(`❌ Uncover workflow ${workflowId} failed:`, error);
    
    storeUncoverWorkflowData(workflowId, {
      status: 'failed',
      progress: 0,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      startTime: Date.now()
    });
  }
}

/**
 * POST /api/uncover/run-analysis
 * Start async uncover workflow
 * Why this matters: Returns immediately with workflow ID, then processes in background
 * to avoid serverless timeout limits while providing real-time progress updates.
 */
router.post('/run-analysis', async (req: Request, res: Response): Promise<any> => {
  const workflowId = uuidv4();
  const startTime = Date.now();
  
  // Validate request first
  const { community, category, limit, timeframe }: UncoverWorkflowRequest = req.body;
  
  console.log(`📥 POST /uncover/run-analysis received:`, JSON.stringify(req.body, null, 2));

  if (!community || typeof community !== 'string') {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'community is required and must be a string',
      status: 400,
      timestamp: new Date().toISOString()
    });
  }

  if (!category || typeof category !== 'string') {
    return res.status(400).json({
      error: 'Validation Error', 
      message: 'category is required and must be a valid category type',
      status: 400,
      timestamp: new Date().toISOString()
    });
  }

  // Validate category is one of the allowed values
  const validCategories = ['solution_request', 'advice_request', 'pain_anger', 'ideas'];
  if (!validCategories.includes(category)) {
    return res.status(400).json({
      error: 'Validation Error',
      message: `category must be one of: ${validCategories.join(', ')}`,
      status: 400,
      timestamp: new Date().toISOString()
    });
  }

  // Initialize workflow status
  storeUncoverWorkflowData(workflowId, {
    status: 'pending',
    progress: 0,
    startTime
  });

  // Return immediately with workflow ID
  res.json({
    success: true,
    workflow_id: workflowId,
    status: 'pending',
    message: 'Uncover analysis started. Use /api/uncover/status/{workflow_id} to check progress.'
  });

  // Start async processing (don't await - let it run in background)
  processUncoverWorkflowAsync(workflowId, { community, category, limit, timeframe });
});

/**
 * GET /api/uncover/status/:workflowId
 * Check status of specific uncover workflow
 * Why this matters: Allows frontend to poll for completion and get results when ready
 */
router.get('/status/:workflowId', async (req: Request, res: Response): Promise<any> => {
  const { workflowId } = req.params;
  
  if (!workflowId) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'workflowId parameter is required',
      status: 400,
      timestamp: new Date().toISOString()
    });
  }

  const workflow = getUncoverWorkflowData(workflowId);
  
  if (!workflow) {
    return res.status(404).json({
      error: 'Workflow Not Found',
      message: `No uncover workflow found with ID: ${workflowId}`,
      status: 404,
      timestamp: new Date().toISOString()
    });
  }

  // Calculate elapsed time
  const elapsedTime = Date.now() - workflow.startTime;
  
  // Clean up completed/failed workflows after 5 minutes
  if ((workflow.status === 'completed' || workflow.status === 'failed') && elapsedTime > 5 * 60 * 1000) {
    // Clean up from both memory and env storage
    uncoverWorkflowStatus.delete(workflowId);
    const envKey = `${UNCOVER_WORKFLOW_ENV_PREFIX}${workflowId}`;
    delete process.env[envKey];
    
    return res.status(410).json({
      error: 'Workflow Expired',
      message: 'Workflow results have expired. Please start a new analysis.',
      status: 410,
      timestamp: new Date().toISOString()
    });
  }

  res.json({
    workflow_id: workflowId,
    status: workflow.status,
    progress: workflow.progress,
    result: workflow.result,
    error: workflow.error,
    elapsed_time_ms: elapsedTime
  });
});

/**
 * GET /api/uncover/communities
 * Get available communities for uncover analysis
 * Why this matters: Provides frontend with list of available communities
 */
router.get('/communities', async (req: Request, res: Response): Promise<any> => {
  try {
    const communities = uncoverService.getAvailableCommunities();
    
    res.json({
      success: true,
      communities,
      total_communities: communities.length
    });
  } catch (error) {
    console.error('❌ Error fetching communities:', error);
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to fetch communities',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/uncover/categories
 * Get available categories for uncover analysis
 * Why this matters: Provides frontend with list of available categories and their patterns
 */
router.get('/categories', async (req: Request, res: Response): Promise<any> => {
  try {
    const categories = uncoverService.getAvailableCategories();
    
    res.json({
      success: true,
      categories,
      total_categories: categories.length
    });
  } catch (error) {
    console.error('❌ Error fetching categories:', error);
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to fetch categories',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/uncover/discover
 * Direct uncover discovery (synchronous, for testing)
 * Why this matters: Provides a direct endpoint for testing without workflow overhead
 */
router.post('/discover', async (req: Request, res: Response): Promise<any> => {
  try {
    const { community, category, limit, timeframe } = req.body;

    if (!community || !category) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'community and category are required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`🎯 Direct uncover request:`, { community, category, limit, timeframe });

    const result = await uncoverService.discoverPosts({
      community,
      category,
      limit,
      timeframe
    });

    res.json(result);

  } catch (error) {
    console.error('❌ Direct uncover discovery failed:', error);
    
    res.status(500).json({
      error: 'Discovery Failed',
      message: error instanceof Error ? error.message : 'Uncover discovery failed',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
