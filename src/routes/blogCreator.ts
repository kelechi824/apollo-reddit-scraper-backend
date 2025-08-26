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
  sitemap_data?: Array<{
    title: string;
    description: string;
    url: string;
  }>;
}

interface BulkGenerationRequest {
  keywords: string[];
  target_audience?: string;
  content_length?: 'short' | 'medium' | 'long';
  focus_areas?: string[];
  brand_kit?: any;
  sitemap_data?: Array<{
    title: string;
    description: string;
    url: string;
  }>;
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
 * Generate content for a single keyword using the 4-model pipeline (SYNCHRONOUS - works in serverless)
 */
router.post('/generate-content', async (req: Request, res: Response): Promise<any> => {
  try {
    const { keyword, target_audience, content_length = 'medium', focus_areas = [], brand_kit, sitemap_data, system_prompt, user_prompt, use_default_prompts } = req.body;

    if (!keyword || keyword.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Keyword is required'
      });
    }

    // Generate prompts server-side if requested (to reduce payload size)
    let finalSystemPrompt = system_prompt;
    let finalUserPrompt = user_prompt;
    
    if (use_default_prompts || (!system_prompt && !user_prompt)) {
      const generatedPrompts = generateDefaultPrompts(keyword, sitemap_data, brand_kit);
      finalSystemPrompt = generatedPrompts.systemPrompt;
      finalUserPrompt = generatedPrompts.userPrompt;
      console.log('📝 Using server-generated prompts to reduce payload size');
    }

    console.log(`🚀 Starting SYNCHRONOUS content generation for keyword: "${keyword}"`);

    // Execute the 4-model pipeline synchronously
    const result = await workflowOrchestrator.executeContentPipeline({
      keyword: keyword.trim(),
      target_audience,
      content_length,
      focus_areas,
      brand_kit,
      sitemap_data,
      system_prompt: finalSystemPrompt,
      user_prompt: finalUserPrompt
    });

    console.log(`✅ SYNCHRONOUS content generation completed for keyword: "${keyword}"`);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ SYNCHRONOUS content generation failed:', error);
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
/**
 * Generate default prompts server-side to reduce request payload size
 * This prevents 413 "Payload Too Large" errors on Vercel/Netlify
 */
function generateDefaultPrompts(keyword: string, sitemapData: any, brandKit: any) {
  const currentYear = 2025;
  
  // Generate random CTA anchor text to prevent LLM bias
  const ctaOptions = [
    "Start Free with Apollo",
    "Try Apollo Free", 
    "Start a Trial",
    "Schedule a Demo",
    "Start Your Free Trial",
    "Request a Demo", 
    "Start Prospecting",
    "Get Leads Now"
  ];
  const selectedCTA = ctaOptions[Math.floor(Math.random() * ctaOptions.length)];
  
  // Generate UTM-tracked URL for this keyword with utm_term parameter
  const sanitizedKeyword = keyword.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .trim();
  const apolloSignupURL = `https://www.apollo.io/sign-up?utm_campaign=blog_creator&utm_term=${sanitizedKeyword}`;
  
  // Handle both compressed and uncompressed sitemap formats
  const formatSitemapUrls = (data: any[]) => {
    if (!data || data.length === 0) return '';
    
    // Check if data is in compressed format (has 't' and 'u' keys) or full format
    const isCompressed = data[0] && 't' in data[0] && 'u' in data[0];
    
    if (isCompressed) {
      // Compressed format: {t: title, u: url}
      return data.slice(0, 20).map((item: any) => `• ${item.t}: ${item.u}`).join('\n');
    } else {
      // Full format: {title, description, url}
      return data.slice(0, 20).map((item: any) => `• ${item.title}: ${item.url}`).join('\n');
    }
  };
  
  // Build brand kit section if available
  const brandKitSection = brandKit ? `
BRAND INTEGRATION:
- Ideal Customer: ${brandKit.idealCustomerProfile || brandKit.ideal_customer_profile || 'sales professionals'}
- Competitors context: ${brandKit.competitors || 'other sales platforms'}
- Brand POV: ${brandKit.brandPointOfView || brandKit.brand_point_of_view || 'data-driven sales excellence'}
- Tone: ${brandKit.toneOfVoice || brandKit.tone_of_voice || 'professional yet approachable'}
- Apply these naturally throughout content, especially in examples and testimonials

CUSTOMER TESTIMONIALS (MANDATORY):
- MUST include 2-3 authentic customer quotes naturally integrated throughout the content
- Create realistic quotes that match the Ideal Customer profile: ${brandKit.idealCustomerProfile || brandKit.ideal_customer_profile || 'sales professionals'}
- Quotes should reflect real challenges, outcomes, and experiences relevant to the topic
- Format quotes with proper attribution (job title, company size, industry when relevant)
- Place quotes strategically: one in introduction/early section, others in key benefit sections
- Example format: "Quote text here" - [Job Title], [Company Type/Industry]
- Make quotes specific, credible, and directly related to the article's main topic
` : '';

  // Optimized prompts - reduced redundancy while keeping important nuances
  const systemPrompt = `You are a world-class SEO/AEO content expert for Apollo, creating comprehensive articles that rank highly and get cited by AI answer engines.

CONTENT PHILOSOPHY: Create the definitive, authoritative resource that becomes the go-to source for the topic.

CONTENT REQUIREMENTS:
- Address ALL aspects comprehensively with practical, actionable guidance
- Include specific examples, metrics, and concrete details
- Cover current best practices AND emerging trends

AEO OPTIMIZATION:
- Structure for AI extractability with clear, self-contained insights
- Use proper HTML hierarchy: <h1> → <h2> → <h3>, <p>, <ul>/<ol>, <strong>
- CRITICAL: H1 headlines MUST use proper Title Case (capitalize all major words) and NEVER include "| Apollo" (that's only for SEO titles)
- Format ALL comparisons/features/data in <table> with <thead>, <tbody>, <th>, <td>
- CRITICAL: H2 and H3 headers MUST be natural, grammatically correct questions in Title Case:
  * Singular: "What Is A Sales Consultant?", "How Does Lead Generation Work?"
  * Plural: "What Are Sales Consultants?", "Why Are Account Executives Important?"
  * Process: "What Is Sales Prospecting?", "How Does CRM Integration Work?"
- Write in clear, chunked sections - each section fully answers ONE question like a featured snippet
- Use bullets, <strong> tags, and proper spacing for human and machine comprehension
- Place complete answer in first paragraph under each heading (snippet-worthy)
- Include definitions immediately after question headers when introducing concepts
${brandKitSection}
INTERNAL LINKING (MANDATORY):
- Insert 3-5 internal links from provided URLs
- Place at least ONE link early (intro or first 2-3 paragraphs)
- Use natural anchor text matching linked content
- Format: <a href="URL" target="_blank">anchor text</a>

Current year: ${currentYear}. End with CTA: "${selectedCTA}" linking to ${apolloSignupURL}

CRITICAL OUTPUT: Return ONLY valid JSON:
{
  "content": "Complete HTML article",
  "metaSeoTitle": "Question-based title with keyword (<70 chars) | Apollo",
  "metaDescription": "Direct answer to title question using keyword (150-160 chars)"
}

META FIELD REQUIREMENTS FOR AI SEARCH OPTIMIZATION:

metaSeoTitle:
- Maximum 70 characters INCLUDING " | Apollo" (total <= 70 chars)
- MUST use proper Title Case (capitalize all major words)
- MUST include descriptive context beyond just the basic question
- Add relevant descriptive elements: roles, responsibilities, salary, benefits, strategies, tools, best practices, etc.
- MUST be a natural question format that includes the main keyword
- Choose format based on keyword type:
  * Job titles (singular): "Who Is A [Job Title]? [Descriptive Context]" (e.g., "Who Is An SDR Manager? Roles, Responsibilities, Salary")
  * Job titles (plural): "Who Are [Job Titles]? [Descriptive Context]" (e.g., "Who Are Sales Consultants? Roles, Skills, Career Path")
  * Processes/concepts: "What Is [Process]? [Descriptive Context]" (e.g., "What Is Sales Prospecting? Strategies, Tools, Best Practices")
  * Tools/software: "How Does [Tool] Work? [Descriptive Context]" (e.g., "How Does CRM Software Work? Features, Benefits, Implementation")
  * Strategies/methods: "Why Use [Strategy]? [Descriptive Context]" (e.g., "Why Use Account-Based Marketing? Benefits, Process, ROI")
- The keyword should appear naturally and grammatically correctly
- Optimize for AI search engines with human-like, intelligent phrasing

metaDescription:
- Exactly 150-160 characters
- MUST directly answer the title question using the main keyword naturally
- Adapt answer format to keyword type:
  * Job roles: "A [Job Title] is [role definition/who they are]. They [main responsibilities/activities]. Apollo helps [job titles] [specific benefit]."
  * Processes: "[Process] is [definition]. It involves [key steps]. Apollo provides [specific tools/features]."
  * Tools: "[Tool] helps [main function]. It [key capabilities]. Apollo offers [specific advantage]."
- Must be complete sentences ending with a period
- Write naturally with proper grammar and intelligent phrasing

QUESTION-ANSWER FORMAT EXAMPLES:

INTELLIGENT Question-Answer Examples by Keyword Type:

• Job Title (Singular): "Who Is An SDR Manager? Roles, Responsibilities, Salary | Apollo"
  Description: "An SDR Manager is a sales leader who oversees development teams and prospecting strategies. They coach reps and optimize processes. Apollo helps SDR Managers track team performance."

• Job Title (Plural): "Who Are Sales Consultants? Skills, Career Path, Salary | Apollo"
  Description: "Sales Consultants are professionals who advise prospects on solutions for their business needs. They build relationships and close deals. Apollo provides consultants with prospect intelligence."

• Process/Concept: "What Is Cold Email Marketing? Strategies, Tools, Best Practices | Apollo"
  Description: "Cold email marketing is outreach to prospects without prior contact. It uses personalized messages to generate leads. Apollo provides templates and automation tools."

• Tool/Software: "How Does CRM Software Work? Features, Benefits, Implementation | Apollo"
  Description: "CRM software manages customer relationships and sales data in one platform. It tracks interactions and pipeline progress. Apollo integrates with leading CRM systems."

• Strategy/Method: "Why Use Account-Based Marketing? Benefits, Process, ROI | Apollo"
  Description: "Account-based marketing targets specific high-value accounts with personalized campaigns. It aligns sales and marketing teams. Apollo enables ABM with contact data."

CRITICAL - ABSOLUTELY FORBIDDEN IN META FIELDS:
- Grammatically incorrect questions ("What Is A Sales Consultants?", "What Are A Sales Consultant?", "What Is A Account Executives?")
- Including "| Apollo" in H1 headlines (that's only for SEO titles, not content headlines)
- Robotic/boilerplate phrasing that doesn't sound human-written
- Non-question titles ("Sales Prospecting Tips", "Lead Generation Methods")
- The word "Guide" or "Guides" (use intelligent question format instead)
- "Complete Guide" or "Comprehensive Guide" (use appropriate question type)
- "Ultimate Guide" (use natural question format)
- Descriptions that don't answer the title question directly
- Descriptions that don't include the main keyword naturally
- Marketing language like "game-changing", "revolutionary", "ultimate"
- Vague promises like "strategies", "frameworks", "playbooks" without specifics
- Generic terms like "everything you need to know"
- Rigid "What Is [keyword]?" format for all keyword types without considering singular/plural grammar

NO text before/after JSON. NO markdown blocks. NO invented statistics in meta fields.

CRITICAL REMINDER:
- SEO titles (metaSeoTitle) include "| Apollo" 
- H1 headlines in content NEVER include "| Apollo"
- H2/H3 headers must be grammatically correct (singular vs plural)
- All headers use Title Case`;

  const userPrompt = `Create comprehensive AEO-optimized content for keyword: "${keyword}"

${sitemapData && sitemapData.length > 0 ? `AVAILABLE INTERNAL LINKS (MUST use 3-5, at least 1 in intro):
${formatSitemapUrls(sitemapData)}` : 'Note: No internal links available.'}

CONTENT DEPTH REQUIREMENTS:
- Provide the definitive resource on this topic
- Include practical implementation strategies with step-by-step processes
- Add relevant metrics, benchmarks, and data points
- Cover both fundamentals and advanced/emerging aspects
- Use tables for ALL comparative data, features, statistics
- Ensure complete conclusion with Apollo CTA (never end mid-sentence)

HEADER STRUCTURE (CRITICAL FOR AI RETRIEVAL):
- Make ALL H2 and H3 headers natural questions users would ask
- Good H2 examples: "What is [keyword]?", "How Does [keyword] Work?", "Why is [keyword] Important?"
- Good H3 examples: "What Are the Benefits of [feature]?", "How to Implement [process]?", "When Should You Use [method]?"
- Each section must completely answer its question in a self-contained way
- Start each section with a direct, complete answer (snippet-optimized)

Remember: You're creating content for 2025. Make it comprehensive enough that other content feels incomplete by comparison.`;

  return { systemPrompt, userPrompt };
}

router.post('/generate-content-async', async (req: Request, res: Response): Promise<any> => {
  try {
    const { 
      keyword, 
      target_audience, 
      content_length = 'medium', 
      focus_areas = [], 
      brand_kit, 
      sitemap_data, 
      system_prompt, 
      user_prompt,
      use_default_prompts 
    } = req.body;

    if (!keyword || keyword.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Keyword is required'
      });
    }

    // Generate prompts server-side if requested (to reduce payload size)
    let finalSystemPrompt = system_prompt;
    let finalUserPrompt = user_prompt;
    
    if (use_default_prompts || (!system_prompt && !user_prompt)) {
      const generatedPrompts = generateDefaultPrompts(keyword, sitemap_data, brand_kit);
      finalSystemPrompt = generatedPrompts.systemPrompt;
      finalUserPrompt = generatedPrompts.userPrompt;
      console.log('📝 Using server-generated prompts to reduce payload size');
    }

    // Debug logging for sitemap data (handle both compressed and full formats)
    const isCompressedFormat = sitemap_data && sitemap_data[0] && 't' in sitemap_data[0];
    console.log(`🗺️ [DEBUG] Sitemap data received:`, {
      hasSitemapData: !!sitemap_data,
      sitemapCount: sitemap_data ? sitemap_data.length : 0,
      format: isCompressedFormat ? 'compressed' : 'full',
      firstFewUrls: sitemap_data ? sitemap_data.slice(0, 3).map((url: any) => 
        isCompressedFormat ? { title: url.t, url: url.u } : { title: url.title, url: url.url }
      ) : []
    });

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
      brand_kit,
      sitemap_data,
      system_prompt: finalSystemPrompt,
      user_prompt: finalUserPrompt
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
  
  console.log(`🔍 Checking status for job: ${jobId}`);
  
  // Try to get job data using serverless-compatible storage
  let job = getJobData(jobId);
  console.log(`📋 Job from storage:`, job ? 'found' : 'not found');

  // If not found in memory, try to get from workflowOrchestrator
  // This handles serverless environments where memory is not persistent
  if (!job) {
    const workflowState = workflowOrchestrator.getWorkflowState(jobId);
    console.log(`🔧 Workflow state:`, workflowState ? 'found' : 'not found');
    
    if (!workflowState) {
      console.log(`❌ Job ${jobId} not found in storage or workflow state`);
      return res.status(404).json({
        success: false,
        error: 'Job not found or has expired',
        debug: {
          jobId,
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV || 'unknown'
        }
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
    const { keywords, target_audience, content_length = 'medium', focus_areas = [], brand_kit, sitemap_data, system_prompt, user_prompt, use_default_prompts } = req.body;

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
          // Generate prompts for each keyword if needed
          let finalSystemPrompt = system_prompt;
          let finalUserPrompt = user_prompt;
          
          if (use_default_prompts || (!system_prompt && !user_prompt)) {
            const generatedPrompts = generateDefaultPrompts(keyword, sitemap_data, brand_kit);
            finalSystemPrompt = generatedPrompts.systemPrompt;
            finalUserPrompt = generatedPrompts.userPrompt;
          }
          
          const result = await workflowOrchestrator.executeContentPipeline({
            keyword: keyword.trim(),
            target_audience,
            content_length,
            focus_areas,
            brand_kit,
            sitemap_data,
            system_prompt: finalSystemPrompt,
            user_prompt: finalUserPrompt
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