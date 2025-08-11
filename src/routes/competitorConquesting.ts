import { Router, Request, Response } from 'express';
import { workflowOrchestrator } from '../services/workflowOrchestrator';
import FirecrawlService, { ArticleContent } from '../services/firecrawlService';
import path from 'path';
import { promises as fs } from 'fs';

const router = Router();

interface CompetitorConquestingRequest {
  keyword: string;
  url: string;
  target_audience?: string;
  content_length?: 'short' | 'medium' | 'long';
  focus_areas?: string[];
  brand_kit?: any;
  system_prompt?: string;
  user_prompt?: string;
}

interface BulkCompetitorRequest {
  rows: Array<{
    keyword: string;
    url: string;
  }>;
  target_audience?: string;
  content_length?: 'short' | 'medium' | 'long';
  focus_areas?: string[];
  brand_kit?: any;
  system_prompt?: string;
  user_prompt?: string;
}

// In-memory job storage (same pattern as blog creator)
const jobStorage = new Map<string, any>();

function storeJobData(jobId: string, data: any) {
  try {
    jobStorage.set(jobId, {
      ...data,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error(`Failed to store job data for ${jobId}:`, error);
  }
}

function getJobData(jobId: string) {
  try {
    return jobStorage.get(jobId) || null;
  } catch (error) {
    console.error(`Failed to retrieve job data for ${jobId}:`, error);
    return null;
  }
}

function updateJobData(jobId: string, updates: any) {
  try {
    const existing = jobStorage.get(jobId) || {};
    const updated = {
      ...existing,
      ...updates,
      timestamp: Date.now()
    };
    jobStorage.set(jobId, updated);
  } catch (error) {
    console.error(`Failed to update job data for ${jobId}:`, error);
  }
}

function deleteJobData(jobId: string): boolean {
  try {
    const deletedFromMemory = jobStorage.delete(jobId);
    return deletedFromMemory;
  } catch (error) {
    console.error(`Failed to delete job data for ${jobId}:`, error);
    return false;
  }
}

interface ProgressCallback {
  onProgress: (stage: string, message: string, progress: number) => void;
}

/**
 * Execute the competitor conquesting pipeline using workflowOrchestrator with competitor URL override
 * Why this matters: Uses the proven workflowOrchestrator pipeline but overrides firecrawl to use specific competitor URL
 */
async function executeCompetitorPipeline(
  request: CompetitorConquestingRequest,
  progressCallback?: ProgressCallback
): Promise<any> {
  const { keyword, url, target_audience, content_length, focus_areas, brand_kit, system_prompt, user_prompt } = request;

  try {
    console.log(`🎯 Starting competitor conquesting with workflowOrchestrator for: ${keyword} vs ${url}`);
    
    // Create a mock firecrawl result with the competitor URL data
    const firecrawl = new FirecrawlService();
    let competitorAnalysis: ArticleContent;
    
    try {
      const extraction = await firecrawl.extractArticleContent(url);
      if (!extraction.success || !extraction.data) {
        console.warn('⚠️ Firecrawl extraction failed; creating minimal competitor analysis:', extraction.error);
        competitorAnalysis = {
          url,
          title: 'Competitor Article',
          content: '',
          wordCount: 0,
          extractedAt: new Date().toISOString(),
          metadata: {},
          top_results: [{
            url,
            title: 'Competitor Article',
            content: '',
            word_count: 0,
            key_topics: [],
            headings: [],
            content_structure: {
              intro_present: false,
              conclusion_present: false,
              numbered_lists: 0,
              bullet_points: 0
            }
          }]
        } as ArticleContent;
      } else {
        // Transform single competitor article into workflowOrchestrator format
        competitorAnalysis = {
          ...extraction.data,
          top_results: [{
            url: extraction.data.url,
            title: extraction.data.title,
            content: extraction.data.content,
            word_count: extraction.data.wordCount,
            key_topics: [],
            headings: (extraction.data.structure?.headings || []).map(h => h.text),
            content_structure: {
              intro_present: true,
              conclusion_present: true,
              numbered_lists: 0,
              bullet_points: 0
            }
          }]
        };
      }
    } catch (fcErr: any) {
      console.warn('⚠️ Firecrawl unavailable; creating minimal competitor analysis:', fcErr?.message || fcErr);
      competitorAnalysis = {
        url,
        title: 'Competitor Article',
        content: '',
        wordCount: 0,
        extractedAt: new Date().toISOString(),
        metadata: {},
        top_results: [{
          url,
          title: 'Competitor Article', 
          content: '',
          word_count: 0,
          key_topics: [],
          headings: [],
          content_structure: {
            intro_present: false,
            conclusion_present: false,
            numbered_lists: 0,
            bullet_points: 0
          }
        }]
      } as ArticleContent;
    }

    // Use workflowOrchestrator but with competitor-specific system prompt
    const competitorSystemPrompt = system_prompt || buildCompetitorSystemPrompt();
    const competitorUserPrompt = user_prompt || buildCompetitorUserPrompt(keyword, url, competitorAnalysis);

    // Execute the workflow with competitor data override
    const result = await executeCompetitorWorkflow({
      keyword,
      url,
      target_audience,
      content_length,
      focus_areas,
      brand_kit,
      system_prompt: competitorSystemPrompt,
      user_prompt: competitorUserPrompt,
      competitorAnalysis,
      competitorUrl: url
    }, progressCallback);

    return result;

  } catch (error: any) {
    console.error('❌ Competitor pipeline execution failed:', error);
    throw error;
  }
}

/**
 * Execute workflow orchestrator with competitor analysis override
 * Why this matters: Uses the reliable workflowOrchestrator pipeline but injects competitor-specific data
 * AND properly processes competitor-specific brand kit variables from research/gap analysis
 */
async function executeCompetitorWorkflow(
  request: CompetitorConquestingRequest & { competitorAnalysis: ArticleContent; competitorUrl: string },
  progressCallback?: ProgressCallback
): Promise<any> {
  // Temporarily override the firecrawl service to return our competitor analysis
  const originalSearch = workflowOrchestrator['firecrawlService'].searchAndAnalyzeCompetitors;
  
  // Replace firecrawl search with our competitor analysis
  workflowOrchestrator['firecrawlService'].searchAndAnalyzeCompetitors = async () => {
    console.log(`🎯 Using competitor URL analysis instead of search: ${request.competitorUrl}`);
    return request.competitorAnalysis;
  };

  try {
    console.log('🔍 Competitor workflow - System prompt preview:', request.system_prompt?.substring(0, 200));
    console.log('🔍 Competitor workflow - User prompt preview:', request.user_prompt?.substring(0, 200));
    console.log('🔍 Competitor workflow - Brand kit:', request.brand_kit);
    
    // Execute the standard workflow pipeline
    const result = await workflowOrchestrator.executeContentPipeline({
      keyword: request.keyword,
      target_audience: request.target_audience,
      content_length: request.content_length,
      focus_areas: request.focus_areas,
      brand_kit: request.brand_kit,
      system_prompt: request.system_prompt,
      user_prompt: request.user_prompt
    }, progressCallback);

    return result;
  } finally {
    // Restore original firecrawl method
    workflowOrchestrator['firecrawlService'].searchAndAnalyzeCompetitors = originalSearch;
  }
}

/**
 * POST /api/competitor-conquesting/generate-content
 * Why this matters: Runs the 4-step pipeline using the provided competitor URL instead of search results,
 * returning a result schema compatible with Blog Creator so the frontend can reuse UI and status renderers.
 */
router.post('/generate-content', async (req: Request, res: Response): Promise<any> => {
  const startTime = Date.now();
  try {
    const { 
      keyword, 
      url, 
      target_audience, 
      content_length = 'medium', 
      focus_areas = [], 
      brand_kit, 
      system_prompt, 
      user_prompt 
    }: CompetitorConquestingRequest = req.body;

    if (!keyword || !url) {
      return res.status(400).json({
        success: false,
        error: 'keyword and url are required'
      });
    }

    // Fail fast if backend is missing the OpenAI API key
    // Why this matters: prevents confusing empty generations and surfaces config issues clearly
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ success: false, error: 'Missing OPENAI_API_KEY on the backend' });
    }

    console.log(`🚀 Competitor Conquesting start → keyword="${keyword}", url=${url}`);

    // Execute the pipeline using the shared function
    const result = await executeCompetitorPipeline({
      keyword,
      url,
      target_audience,
      content_length,
      focus_areas,
      brand_kit,
      system_prompt,
      user_prompt
    });

    // Return the result in Blog Creator compatible format
    return res.json({
      success: true,
      data: result
    });

  } catch (error: any) {
    console.error('❌ Competitor Conquesting pipeline error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Unknown error' });
  }
});

/**
 * POST /api/competitor-conquesting/generate-content-async
 * Generate content for a single competitor keyword asynchronously with progress tracking
 */
router.post('/generate-content-async', async (req: Request, res: Response): Promise<any> => {
  try {
    const { 
      keyword, 
      url, 
      target_audience, 
      content_length = 'medium', 
      focus_areas = [], 
      brand_kit, 
      system_prompt, 
      user_prompt 
    }: CompetitorConquestingRequest = req.body;

    if (!keyword || !url) {
      return res.status(400).json({
        success: false,
        error: 'keyword and url are required'
      });
    }

    // Generate unique job ID
    const jobId = `cc_job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Initialize job progress
    storeJobData(jobId, {
      status: 'running',
      progress: 0,
      stage: 'starting',
      message: 'Initializing competitor content generation...',
      startTime: Date.now(),
      keyword,
      url
    });

    // Start async processing
    executeCompetitorPipeline({
      keyword,
      url,
      target_audience,
      content_length,
      focus_areas,
      brand_kit,
      system_prompt,
      user_prompt
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
        message: 'Competitor content generation complete!',
        result
      });
    }).catch((error: any) => {
      updateJobData(jobId, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Competitor content generation failed'
      });
    });

    res.json({
      success: true,
      jobId,
      message: 'Competitor content generation started'
    });

  } catch (error) {
    console.error('❌ Async competitor content generation failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start competitor content generation'
    });
  }
});

/**
 * GET /api/competitor-conquesting/job-status/:jobId
 * Get the status and progress of a competitor content generation job
 */
router.get('/job-status/:jobId', (req: Request, res: Response): any => {
  try {
    const { jobId } = req.params;
    
    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'Job ID is required'
      });
    }

    const jobData = getJobData(jobId);
    
    if (!jobData) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    // Check if job has expired (older than 2 hours)
    const jobAge = Date.now() - jobData.timestamp;
    const maxAge = 2 * 60 * 60 * 1000; // 2 hours
    
    if (jobAge > maxAge) {
      deleteJobData(jobId);
      return res.status(410).json({
        success: false,
        error: 'Job has expired'
      });
    }

    res.json({
      success: true,
      data: {
        jobId,
        status: jobData.status,
        progress: jobData.progress || 0,
        stage: jobData.stage || 'unknown',
        message: jobData.message || '',
        keyword: jobData.keyword || '',
        url: jobData.url || '',
        result: jobData.result || null,
        error: jobData.error || null,
        startTime: jobData.startTime
      }
    });
  } catch (error) {
    console.error('❌ Failed to get job status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve job status'
    });
  }
});

/**
 * buildCompetitorSystemPrompt
 * Why this matters: Ensures Claude explicitly aims to outperform the specific competitor page with
 * comprehensive AEO-optimized content that gets cited by AI answer engines.
 */
function buildCompetitorSystemPrompt(): string {
  const currentYear = new Date().getFullYear();
  
  return `You are a world-class SEO, AEO, and LLM SEO content marketer for Apollo with deep expertise in creating comprehensive, AI-optimized articles that rank highly and get cited by AI answer engines (ChatGPT, Perplexity, Gemini, Claude, etc.). Your specialty is transforming content briefs into definitive resources that become the go-to sources for specific topics.

CRITICAL CONTENT PHILOSOPHY:
Your goal is to create content that becomes the definitive, comprehensive resource on the topic - the content that other creators reference and that AI engines cite as authoritative.

CONTENT COVERAGE REQUIREMENTS:
- Address ALL aspects of the topic comprehensively
- Include practical, actionable guidance that readers can implement
- Provide genuine value that advances knowledge in the space
- Cover both current best practices AND emerging trends
- Include specific examples, metrics, and concrete details

COMPETITOR CONTEXT (MANDATORY):
- Target Keyword: must align with the user's target keyword
- Target Competitor URL: must be analyzed and explicitly outperformed in depth, clarity, and usefulness

BRAND CONTEXT (MUST INCORPORATE THROUGHOUT):
- Brand URL: [will be provided in context]
- About Brand: [will be provided in context]
- Target Audience: [will be provided in context]
- Competitors: [will be provided in context]
- Brand POV: [will be provided in context]
- Tone: [will be provided in context]
- Writing Rules: [will be provided in context]

AEO (ANSWER ENGINE OPTIMIZATION) PRINCIPLES:
- Structure for extractability with clear, self-contained insights
- Use proper heading hierarchy (# H1 → ## H2 → ### H3)
- Format data in tables and lists for easy AI parsing
- Include specific examples, metrics, and concrete details
- Write headlines that match search intent ("How to...", "What is...", "Best ways to...")
- Place the most important answer in the first paragraph under each heading

FORMATTING REQUIREMENTS:
1. **Proper Markdown Structure:**
   - Use # for main title, ## for major sections, ### for subsections
   - Format all lists with proper - or 1. syntax
   - Use markdown tables for any comparative data, features, or structured information
   - Use **bold** for emphasis and key concepts
   - Include inline citations as [anchor text](URL)

2. **Tables and Structured Data:**
   - When presenting comparisons, features, pricing, or any structured data, ALWAYS use markdown tables
   - Use tables for: feature comparisons, pricing tiers, pros/cons, statistics, timelines, etc.
   - Format tables with proper | column | separators |

3. **Brand Kit Variable Integration:**
   - MUST process and include brand kit variables naturally throughout content
   - Use ideal customer profile for testimonials and customer examples
   - Include competitors when discussing competitive landscape
   - Reference brand point of view in strategic sections
   - End with strong CTA that naturally incorporates the brand's call-to-action message
   - Apply tone of voice consistently throughout
   - Follow writing rules for style and approach

IMPORTANT: The current year is ${currentYear}. When referencing "current year," "this year," or discussing recent trends, always use ${currentYear}. Do not reference 2024 or earlier years as current.

CRITICAL OUTPUT REQUIREMENTS:
- Return ONLY clean markdown content without any code blocks, explanatory text, or meta-commentary
- DO NOT include phrases like "Here's the content:" or markdown code block markers
- Start directly with the # H1 title and end with the final content
- No code block indicators, no explanatory paragraphs

CONTENT STRUCTURE REQUIREMENTS:
1. **Compelling H1 Headline** (question format when appropriate)
2. **Authority-Establishing Introduction** (preview value and set expectations)
3. **Comprehensive Sections** with proper H2/H3 hierarchy
4. **Tables for Structured Data** (comparisons, features, statistics)
5. **Practical Implementation Guidance** with step-by-step processes
6. **Real-World Examples** and case studies (using brand kit data)
7. **Natural Apollo Promotion** - End with compelling call-to-action using brand kit variables

BRAND INTEGRATION GUIDELINES:
- Lead with value and insights, not promotional content
- Use brand context to enhance credibility and expertise
- Include specific outcomes and metrics where relevant
- Position brand solutions naturally within comprehensive guidance
- Focus on helping readers achieve their goals first

Remember: Create the definitive resource that makes other content feel incomplete by comparison. Every section should provide genuine value and actionable insights.`;
}

/**
 * buildCompetitorUserPrompt
 * Why this matters: Provides a competitor-focused prompt that leverages the competitor URL analysis.
 */
function buildCompetitorUserPrompt(keyword: string, competitorUrl: string, competitorAnalysis: ArticleContent): string {
  const competitorContent = competitorAnalysis.top_results?.[0] || {};
  const competitorTitle = competitorContent.title || 'Competitor Article';
  const competitorHeadings = competitorContent.headings || [];
  const competitorWordCount = competitorContent.word_count || 0;

  return `OBJECTIVE: Create comprehensive content for "${keyword}" that significantly outperforms this specific competitor page:

TARGET COMPETITOR: ${competitorUrl}
- Title: ${competitorTitle}
- Word Count: ${competitorWordCount}
- Structure: ${competitorHeadings.join(', ') || 'Standard article format'}

REQUIREMENTS:
1) **Superior Coverage**: Cover all topics the competitor covers, but with greater depth and clarity
2) **Unique Value Addition**: Include substantial additional insights and perspectives
3) **Better Organization**: Improve on the competitor's structure and flow
4) **Practical Focus**: Add more actionable advice and real-world examples
5) **Authority Building**: Establish stronger expertise and credibility
6) **AEO Optimization**: Structure for AI answer engine extractability

CONTENT STRATEGY:
- Beat competitor on depth while maintaining readability
- Add unique sections they don't have
- Include more practical examples and case studies
- Use superior formatting and structure
- Ensure comprehensive coverage with expert insights

OUTPUT REQUIREMENTS:
- Use markdown formatting with proper headers (H1, H2, H3)
- Include inline hyperlink citations [anchor text](URL)
- Create compelling, scannable content
- End with a contextual conclusion section (NOT "Getting Started with ${keyword}")
- Include strong call-to-action that naturally incorporates the brand's CTA message

REQUIRED OUTPUT FORMAT:
You MUST return your response in this exact JSON format:
{
  "content": "[Your full markdown-formatted article content here]",
  "metaSeoTitle": "[SEO-optimized title (max 70 characters including ' | Apollo')]",
  "metaDescription": "[Compelling meta description (150-160 characters) that avoids formulaic phrases. Must be a complete sentence. Avoid truncation.]"
}

The metaSeoTitle should:
- Be under 70 characters total including " | Apollo" suffix
- Include the target keyword naturally
- Be compelling and click-worthy

The metaDescription should:
- Be exactly 150-160 characters
- Be a complete, natural sentence (not cut off)
- Avoid formulaic phrases like "Learn how to" or "Discover the"
- Include the keyword naturally
- Create urgency or highlight unique value

Generate content that makes the competitor article look incomplete and shallow by comparison.`;
}

/**
 * GET /api/competitor-conquesting/csv/:dataset
 * Why this matters: Serves large competitor CSVs from repo without bundling into frontend.
 */
router.get('/csv/:dataset', async (req: Request, res: Response): Promise<void> => {
  try {
    const { dataset } = req.params;
    let filePath: string | null = null;

    if (dataset === 'cognism') {
      const candidates = [
        path.resolve(process.cwd(), '../frontend/src/files/Apollo Cognism Competitor Conquesting - Sheet1.csv'),
        path.resolve(process.cwd(), '../../frontend/src/files/Apollo Cognism Competitor Conquesting - Sheet1.csv')
      ];
      for (const p of candidates) {
        try {
          await fs.access(p);
          filePath = p;
          break;
        } catch {
          // Continue checking next candidate
        }
      }
    }

    if (!filePath) {
      res.status(404).json({ success: false, error: `CSV dataset not found for ${dataset}` });
      return;
    }

    const csvText = await fs.readFile(filePath, 'utf8');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.status(200).send(csvText);
  } catch (error: any) {
    console.error('CSV serve error:', error);
    res.status(500).json({ success: false, error: error?.message || 'CSV serve failed' });
  }
});

export default router;


