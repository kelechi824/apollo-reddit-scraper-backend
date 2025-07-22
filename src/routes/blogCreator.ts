import { Router, Request, Response } from 'express';
import { workflowOrchestrator } from '../services/workflowOrchestrator';
import { brandkitService } from '../services/brandkitService';

const router = Router();

interface KeywordGenerationRequest {
  keyword: string;
  target_audience?: string;
  content_length?: 'short' | 'medium' | 'long';
  focus_areas?: string[];
  brand_kit?: any;
}

interface BulkGenerationRequest {
  keywords: string[];
  target_audience?: string;
  content_length?: 'short' | 'medium' | 'long';
  focus_areas?: string[];
  brand_kit?: any;
}

// Store for managing job progress (in production, use Redis or database)
const jobProgress = new Map<string, {
  status: 'running' | 'completed' | 'error';
  progress: number;
  stage: string;
  message: string;
  result?: any;
  error?: string;
  startTime: number;
}>();

// Serverless-compatible job storage using process.env as fallback
const JOBS_ENV_PREFIX = 'APOLLO_JOB_';

function storeJobData(jobId: string, data: any) {
  try {
    // Store in memory for immediate access
    jobProgress.set(jobId, data);
    
    // Also store in process.env for serverless persistence (with TTL)
    const envKey = `${JOBS_ENV_PREFIX}${jobId}`;
    const jobData = {
      ...data,
      stored_at: Date.now()
    };
    process.env[envKey] = JSON.stringify(jobData);
    console.log(`💾 Stored job ${jobId} in both memory and env`);
  } catch (error) {
    console.warn(`⚠️ Failed to store job data for ${jobId}:`, error);
    // Still store in memory as fallback
    jobProgress.set(jobId, data);
  }
}

function getJobData(jobId: string) {
  // First try memory
  let job = jobProgress.get(jobId);
  if (job) {
    console.log(`📋 Found job ${jobId} in memory`);
    return job;
  }

  // Fallback to process.env for serverless environments
  try {
    const envKey = `${JOBS_ENV_PREFIX}${jobId}`;
    const envData = process.env[envKey];
    
    if (envData) {
      const jobData = JSON.parse(envData);
      
      // Check if data is not too old (30 minutes max)
      const maxAge = 30 * 60 * 1000; // 30 minutes
      if (Date.now() - jobData.stored_at < maxAge) {
        console.log(`📋 Found job ${jobId} in env storage`);
        // Remove stored_at before returning
        delete jobData.stored_at;
        
        // Restore to memory for future access
        jobProgress.set(jobId, jobData);
        return jobData;
      } else {
        console.log(`⏰ Job ${jobId} expired in env storage`);
        // Clean up expired job
        delete process.env[envKey];
      }
    }
  } catch (error) {
    console.warn(`⚠️ Failed to retrieve job data from env for ${jobId}:`, error);
  }

  return null;
}

function updateJobData(jobId: string, updates: any) {
  let job = getJobData(jobId);
  if (job) {
    job = { ...job, ...updates };
    storeJobData(jobId, job);
  }
  return job;
}

function deleteJobData(jobId: string): boolean {
  // Delete from memory
  const deletedFromMemory = jobProgress.delete(jobId);
  
  // Delete from env storage
  try {
    const envKey = `${JOBS_ENV_PREFIX}${jobId}`;
    const existedInEnv = !!process.env[envKey];
    delete process.env[envKey];
    console.log(`🗑️ Deleted job ${jobId} from storage`);
    return deletedFromMemory || existedInEnv;
  } catch (error) {
    console.warn(`⚠️ Failed to delete job from env storage for ${jobId}:`, error);
    return deletedFromMemory;
  }
}

/**
 * POST /api/blog-creator/generate-content
 * Generate content for a single keyword using the 4-model pipeline
 */
router.post('/generate-content', async (req: Request, res: Response): Promise<any> => {
  try {
    const { keyword, target_audience, content_length = 'medium', focus_areas = [], brand_kit } = req.body;

    if (!keyword || keyword.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Keyword is required'
      });
    }

    console.log(`🚀 Starting content generation for keyword: "${keyword}"`);

    // Execute the 4-model pipeline
    const result = await workflowOrchestrator.executeContentPipeline({
      keyword: keyword.trim(),
      target_audience,
      content_length,
      focus_areas,
      brand_kit
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Content generation failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Content generation failed'
    });
  }
});

/**
 * POST /api/blog-creator/generate-content-async
 * Generate content for a single keyword asynchronously with progress tracking
 */
router.post('/generate-content-async', async (req: Request, res: Response): Promise<any> => {
  try {
    const { keyword, target_audience, content_length = 'medium', focus_areas = [], brand_kit } = req.body;

    if (!keyword || keyword.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Keyword is required'
      });
    }

    // Generate unique job ID
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Initialize job progress with serverless-compatible storage
    storeJobData(jobId, {
      status: 'running',
      progress: 0,
      stage: 'starting',
      message: 'Initializing content generation...',
      startTime: Date.now()
    });

    // Start async processing
    workflowOrchestrator.executeContentPipeline({
      keyword: keyword.trim(),
      target_audience,
      content_length,
      focus_areas,
      brand_kit
    }, {
      onProgress: (stage: string, message: string, progress: number) => {
        updateJobData(jobId, {
          stage,
          message,
          progress
        });
      }
    }).then((result: any) => {
      updateJobData(jobId, {
        status: 'completed',
        progress: 100,
        message: 'Content generation complete!',
        result
      });
    }).catch((error: any) => {
      updateJobData(jobId, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Content generation failed'
      });
    });

    res.json({
      success: true,
      jobId,
      message: 'Content generation started'
    });

  } catch (error) {
    console.error('❌ Async content generation failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start content generation'
    });
  }
});

/**
 * GET /api/blog-creator/job-status/:jobId
 * Get the status and progress of a content generation job with workflow state
 */
router.get('/job-status/:jobId', (req: Request, res: Response): any => {
  const { jobId } = req.params;
  
  // Try to get job data using serverless-compatible storage
  let job = getJobData(jobId);

  // If not found in memory, try to get from workflowOrchestrator
  // This handles serverless environments where memory is not persistent
  if (!job) {
    const workflowState = workflowOrchestrator.getWorkflowState(jobId);
    
    if (!workflowState) {
      return res.status(404).json({
        success: false,
        error: 'Job not found or has expired'
      });
    }

    // Reconstruct job status from workflow state
    let status: 'running' | 'completed' | 'error' = 'running';
    let progress = 0;
    let message = 'Processing...';
    let result = undefined;
    let error = undefined;

    // Determine status from workflow state
    if (workflowState.currentStage === 'completed') {
      status = 'completed';
      progress = 100;
      message = 'Content generation complete!';
      
      // Try to get result from completed stages
      const completedStages = workflowState.completedStages || {};
      if (completedStages.content_generation) {
        result = completedStages.content_generation;
      }
    } else if (workflowState.currentStage === 'error') {
      status = 'error';
      error = workflowState.lastError?.message || 'Unknown error occurred';
      message = `Generation failed: ${error}`;
    } else {
      // Still running - calculate progress based on completed stages
      const totalStages = 4; // firecrawl, deep_research, gap_analysis, content_generation
      const completedCount = Object.keys(workflowState.completedStages || {}).length;
      progress = Math.round((completedCount / totalStages) * 100);
      
      // Set message based on current stage with keyword
      const keyword = workflowState.keyword || 'your topic';
      switch (workflowState.currentStage) {
        case 'firecrawl':
          message = `Scraping the top 3 search results for ${keyword} on Google...`;
          break;
        case 'deep_research':
          message = `Performing deep research on ${keyword}...`;
          break;
        case 'gap_analysis':
          message = 'Conducting content gap analysis for opportunities...';
          break;
        case 'content_generation':
          message = 'Gathering insights from Step 1, 2, and 3 to generate content...';
          break;
        default:
          message = `Processing stage: ${workflowState.currentStage}`;
      }
    }

    // Create job object from workflow state
    job = {
      status,
      progress,
      stage: workflowState.currentStage,
      message,
      result,
      error,
      startTime: workflowState.startTime
    };

    console.log(`📊 Reconstructed job status for ${jobId} from workflow state:`, { status, progress, message });
  }

  // Get enhanced workflow state if available
  const workflowState = workflowOrchestrator.getWorkflowState(jobId);

  res.json({
    success: true,
    data: {
      jobId,
      status: job.status,
      progress: job.progress,
      stage: job.stage,
      message: job.message,
      result: job.result,
      error: job.error,
      duration: job.startTime ? (Date.now() - job.startTime) / 1000 : 0,
      workflowState: workflowState ? {
        currentStage: workflowState.currentStage,
        retryCount: workflowState.retryCount,
        maxRetries: workflowState.maxRetries,
        completedStages: workflowState.completedStages, // Return the actual data objects, not just keys
        canResume: workflowState.currentStage === 'error' && workflowState.retryCount < workflowState.maxRetries
      } : null
    }
  });
});

/**
 * POST /api/blog-creator/bulk-generate
 * Generate content for multiple keywords with concurrent processing (max 3)
 */
router.post('/bulk-generate', async (req: Request, res: Response): Promise<any> => {
  try {
    const { keywords, target_audience, content_length = 'medium', focus_areas = [], brand_kit } = req.body;

    if (!keywords || keywords.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Keywords array is required'
      });
    }

    // Limit to 3 concurrent requests to respect API rate limits
    const maxConcurrent = 3;
    const results: any[] = [];
    const errors: any[] = [];

    console.log(`🚀 Starting bulk generation for ${keywords.length} keywords (max ${maxConcurrent} concurrent)`);

    // Process keywords in chunks of maxConcurrent
    for (let i = 0; i < keywords.length; i += maxConcurrent) {
      const chunk = keywords.slice(i, i + maxConcurrent);
      
      const chunkPromises = chunk.map(async (keyword: string) => {
        try {
                     const result = await workflowOrchestrator.executeContentPipeline({
            keyword: keyword.trim(),
            target_audience,
            content_length,
            focus_areas,
            brand_kit
          });
          return { keyword, success: true, data: result };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`❌ Failed to generate content for keyword "${keyword}":`, errorMessage);
          return { keyword, success: false, error: errorMessage };
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      
      // Separate successes and failures
      chunkResults.forEach(result => {
        if (result.success) {
          results.push(result);
        } else {
          errors.push(result);
        }
      });
    }

    res.json({
      success: true,
      data: {
        successful: results,
        failed: errors,
        total_processed: keywords.length,
        success_count: results.length,
        error_count: errors.length
      }
    });

  } catch (error) {
    console.error('❌ Bulk generation failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Bulk generation failed'
    });
  }
});

/**
 * POST /api/blog-creator/resume/:jobId
 * Resume a failed workflow from its last successful stage
 */
router.post('/resume/:jobId', async (req: Request, res: Response): Promise<any> => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'Job ID is required'
      });
    }

    console.log(`🔄 API request to resume workflow: ${jobId}`);

    // Check if job exists and can be resumed
    const workflowState = workflowOrchestrator.getWorkflowState(jobId);
    if (!workflowState) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found or has expired'
      });
    }

    if (workflowState.currentStage !== 'error') {
      return res.status(400).json({
        success: false,
        error: `Workflow is not in error state (current: ${workflowState.currentStage})`
      });
    }

    if (workflowState.retryCount >= workflowState.maxRetries) {
      return res.status(400).json({
        success: false,
        error: `Workflow has exceeded maximum retry attempts (${workflowState.maxRetries})`
      });
    }

    // Update job progress to indicate resumption
    updateJobData(jobId, {
      status: 'running',
      progress: 0,
      stage: 'resuming',
      message: 'Resuming workflow from last successful stage...',
      error: undefined
    });

    // Start async workflow resumption
    workflowOrchestrator.resumeWorkflow(jobId, {
      onProgress: (stage: string, message: string, progress: number) => {
        updateJobData(jobId, {
          stage,
          message,
          progress
        });
      }
    }).then((result: any) => {
      updateJobData(jobId, {
        status: 'completed',
        progress: 100,
        message: 'Workflow resumed and completed successfully!',
        result
      });
    }).catch((error: any) => {
      updateJobData(jobId, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error during resume',
        message: 'Workflow resume failed'
      });
    });

    res.json({
      success: true,
      message: 'Workflow resumption started',
      jobId
    });

  } catch (error) {
    console.error('❌ Resume workflow failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resume workflow'
    });
  }
});

/**
 * GET /api/blog-creator/workflow-status
 * Get comprehensive workflow statistics and service status
 */
router.get('/workflow-status', async (req: Request, res: Response) => {
  try {
    const workflowStatus = workflowOrchestrator.getWorkflowStatus();
    
    res.json({
      success: true,
      data: workflowStatus
    });

  } catch (error) {
    console.error('❌ Get workflow status failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get workflow status'
    });
  }
});

/**
 * DELETE /api/blog-creator/cancel/:jobId
 * Cancel a running workflow
 */
router.delete('/cancel/:jobId', (req: Request, res: Response): any => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'Job ID is required'
      });
    }

    // Cancel workflow state
    const workflowCancelled = workflowOrchestrator.cancelWorkflow(jobId);
    
    // Cancel job progress using serverless-compatible deletion
    const jobCancelled = deleteJobData(jobId);

    if (!workflowCancelled && !jobCancelled) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    res.json({
      success: true,
      message: 'Workflow cancelled successfully'
    });

  } catch (error) {
    console.error('❌ Cancel workflow failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel workflow'
    });
  }
});

/**
 * GET /api/blog-creator/health
 * Health check for blog creator services with comprehensive status
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Get comprehensive service status including circuit breakers
    const workflowStatus = workflowOrchestrator.getWorkflowStatus();

    res.json({
      success: true,
      services: workflowStatus,
      message: 'Blog creator service status retrieved',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Service health check failed'
    });
  }
});

export default router; 