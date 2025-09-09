import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { UncoverWorkflowRequest, UncoverWorkflowResponse, ApiError } from '../types';
import uncoverService from '../services/uncoverService';

const router = Router();

// Workflow status tracking - similar to main workflow but for uncover
const uncoverWorkflowStatus = new Map<string, {
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  result?: UncoverWorkflowResponse;
  error?: string;
  startTime: number;
}>();

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
    uncoverWorkflowStatus.set(workflowId, {
      status: 'running',
      progress: 10,
      startTime: Date.now()
    });

    // Step 1: Discover posts (60% of progress)
    console.log(`🔍 Step 1: Discovering posts for category ${request.category}`);
    uncoverWorkflowStatus.set(workflowId, {
      status: 'running',
      progress: 30,
      startTime: Date.now()
    });

    const uncoverResults = await uncoverService.discoverPosts(request);
    
    uncoverWorkflowStatus.set(workflowId, {
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
    uncoverWorkflowStatus.set(workflowId, {
      status: 'completed',
      progress: 100,
      result: workflowResponse,
      startTime: Date.now()
    });

    console.log(`✅ Uncover workflow ${workflowId} completed successfully`);

  } catch (error) {
    console.error(`❌ Uncover workflow ${workflowId} failed:`, error);
    
    uncoverWorkflowStatus.set(workflowId, {
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
  uncoverWorkflowStatus.set(workflowId, {
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

  const workflow = uncoverWorkflowStatus.get(workflowId);
  
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
    uncoverWorkflowStatus.delete(workflowId);
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
