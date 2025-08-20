import { Router, Request, Response } from 'express';
import { workflowOrchestrator } from '../services/workflowOrchestrator';
import FirecrawlService, { ArticleContent } from '../services/firecrawlService';
import path from 'path';
import { promises as fs } from 'fs';
import { createJob, updateJob, getJob, deleteJob, getStoreDiagnostics } from '../services/jobStore';

const router = Router();

interface CompetitorConquestingRequest {
  keyword: string;
  url: string;
  competitor?: string; // Competitor key for UTM tracking
  target_audience?: string;
  content_length?: 'short' | 'medium' | 'long';
  focus_areas?: string[];
  brand_kit?: any;
  sitemap_data?: Array<{
    title: string;
    description: string;
    url: string;
  }>;
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
  sitemap_data?: Array<{
    title: string;
    description: string;
    url: string;
  }>;
  system_prompt?: string;
  user_prompt?: string;
}

// Note: Job storage moved to serverless-safe shared store (Redis if available)

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
  const { keyword, url, target_audience, content_length, focus_areas, brand_kit, sitemap_data, system_prompt, user_prompt } = request;

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
    const competitorSystemPrompt = system_prompt || buildCompetitorSystemPrompt(request.competitor);
    const competitorUserPrompt = user_prompt || buildCompetitorUserPrompt(keyword, url, competitorAnalysis, sitemap_data);

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
      competitor: request.competitor,
      target_audience: request.target_audience,
      content_length: request.content_length,
      focus_areas: request.focus_areas,
      brand_kit: request.brand_kit,
      sitemap_data: request.sitemap_data,
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
      competitor,
      target_audience, 
      content_length = 'medium', 
      focus_areas = [], 
      brand_kit, 
      sitemap_data,
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
    
    // Set a 55-second timeout for Vercel's 60-second limit
    // Why this matters: We need to complete within Vercel's function timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Operation timed out after 55 seconds')), 55000);
    });

    // Execute the pipeline with timeout protection
    try {
      const result = await Promise.race([
        executeCompetitorPipeline({
          keyword,
          url,
          competitor,
          target_audience,
          content_length,
          focus_areas,
          brand_kit,
          sitemap_data,
          system_prompt,
          user_prompt
        }),
        timeoutPromise
      ]);

      // Return the result in Blog Creator compatible format
      return res.json({
        success: true,
        data: result
      });
    } catch (timeoutError: any) {
      if (timeoutError.message === 'Operation timed out after 55 seconds') {
        console.log('⏱️ Operation timed out, returning partial result or error');
        return res.status(504).json({ 
          success: false, 
          error: 'Content generation timed out. Please use the async endpoint for long operations or try with shorter content settings.' 
        });
      }
      throw timeoutError;
    }

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
      competitor,
      target_audience, 
      content_length = 'medium', 
      focus_areas = [], 
      brand_kit, 
      sitemap_data,
      system_prompt, 
      user_prompt 
    }: CompetitorConquestingRequest = req.body;

    // Debug logging to trace UTM parameter flow
    console.log('🔍 [DEBUG] Competitor Conquesting Request:');
    console.log(`  • keyword: "${keyword}"`);
    console.log(`  • url: "${url}"`);
    console.log(`  • competitor: "${competitor}" (type: ${typeof competitor})`);
    console.log(`  • content_length: "${content_length}"`);

    if (!keyword || !url) {
      return res.status(400).json({
        success: false,
        error: 'keyword and url are required'
      });
    }

    // Generate unique job ID
    const jobId = `cc_job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Initialize job progress using serverless-safe store
    await createJob(jobId, {
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
      competitor,
      target_audience,
      content_length,
      focus_areas,
      brand_kit,
      sitemap_data,
      system_prompt,
      user_prompt
    }, {
      onProgress: (stage: string, message: string, progress: number) => {
        updateJob(jobId, {
          stage,
          message,
          progress
        }).catch((e) => console.error('Failed to update job progress:', e));
      }
    }).then((result: any) => {
      updateJob(jobId, {
        status: 'completed',
        progress: 100,
        message: 'Competitor content generation complete!',
        result
      }).catch((e) => console.error('Failed to finalize job:', e));
    }).catch((error: any) => {
      updateJob(jobId, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Competitor content generation failed'
      }).catch((e) => console.error('Failed to mark job error:', e));
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

    getJob(jobId).then((jobData) => {
      if (!jobData) {
        return res.status(404).json({ success: false, error: 'Job not found' });
      }

      // If timestamp exists and clearly expired, return 410 and cleanup
      const timestamp = jobData.timestamp || 0;
      const jobAge = Date.now() - timestamp;
      const maxAge = 2 * 60 * 60 * 1000; // 2 hours
      if (timestamp && jobAge > maxAge) {
        deleteJob(jobId).catch(() => {});
        return res.status(410).json({ success: false, error: 'Job has expired' });
      }

      return res.json({
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
    }).catch((e) => {
      console.error('❌ Failed to get job status:', e);
      return res.status(500).json({ success: false, error: 'Failed to retrieve job status' });
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
 * getRandomCTAAnchorText
 * Why this matters: Ensures even distribution across all CTA options instead of defaulting to "Start Your Free Trial"
 */
function getRandomCTAAnchorText(): string {
  const ctaOptions = [
    "Start Your Free Trial",
    "Try Apollo Free", 
    "Start a Trial",
    "Schedule a Demo",
    "Request a Demo", 
    "Start Prospecting",
    "Get Leads Now"
  ];
  
  // Use random selection to ensure even distribution
  const randomIndex = Math.floor(Math.random() * ctaOptions.length);
  const selectedCTA = ctaOptions[randomIndex];
  console.log(`🎯 Selected CTA anchor text: "${selectedCTA}" (${randomIndex + 1}/${ctaOptions.length})`);
  return selectedCTA;
}

/**
 * generateApolloSignupURL
 * Why this matters: Creates UTM-tracked URLs to measure competitor conquesting campaign effectiveness
 */
function generateApolloSignupURL(competitor?: string): string {
  const baseURL = 'https://www.apollo.io/sign-up';
  
  console.log(`🔗 [DEBUG] generateApolloSignupURL called with competitor: "${competitor}" (type: ${typeof competitor})`);
  
  if (!competitor) {
    // Fallback without UTM if no competitor specified
    console.log(`⚠️ [DEBUG] No competitor provided, returning base URL: ${baseURL}`);
    return baseURL;
  }
  
  // Generate UTM campaign parameter from competitor
  const utmCampaign = `competitor_conquesting_${competitor.toLowerCase()}`;
  const url = `${baseURL}?utm_campaign=${utmCampaign}`;
  
  console.log(`🔗 [DEBUG] Generated Apollo signup URL with UTM: ${url}`);
  return url;
}

/**
 * buildCompetitorSystemPrompt
 * Why this matters: Ensures Claude explicitly aims to outperform the specific competitor page with
 * comprehensive AEO-optimized content that gets cited by AI answer engines.
 */
function buildCompetitorSystemPrompt(competitor?: string): string {
  const currentYear = new Date().getFullYear();
  const selectedCTA = getRandomCTAAnchorText();
  const apolloSignupURL = generateApolloSignupURL(competitor);
  
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
1. **Proper HTML Structure:**
   - Use <h1> for main title, <h2> for major sections, <h3> for subsections
   - Format all lists with proper <ul>/<ol> and <li> tags
   - Use HTML <table> elements for any comparative data, features, or structured information
   - Use <strong> for emphasis and key concepts
   - Include inline citations as <a href="URL" target="_blank">anchor text</a>
   - MANDATORY: Include 3-5 internal links from provided sitemap data for SEO and navigation

2. **Tables and Structured Data:**
   - When presenting comparisons, features, pricing, or any structured data, ALWAYS use HTML tables
   - Use tables for: feature comparisons, pricing tiers, pros/cons, statistics, timelines, etc.
   - Include proper <thead>, <tbody>, <th>, and <td> elements

3. **Brand Kit Variable Integration (COMPREHENSIVE):**
   - MUST process and include ALL brand kit variables naturally throughout content
   - Use {{ brand_kit.url }} for brand website references and authority building
   - Incorporate {{ brand_kit.about_brand }} for company context and credibility  
   - Use {{ brand_kit.ideal_customer_profile }} for testimonials, examples, and target audience references
   - Include {{ brand_kit.competitors }} when discussing competitive landscape and market positioning
   - Reference {{ brand_kit.brand_point_of_view }} in strategic sections and thought leadership
   - Embody {{ brand_kit.author_persona }} throughout the writing voice and perspective
   - Apply {{ brand_kit.tone_of_voice }} consistently throughout all content
   - Use {{ brand_kit.header_case_type }} for all heading formatting (title case, sentence case, etc.)
   - Follow {{ brand_kit.writing_rules }} for style consistency and guidelines
   - Reference {{ brand_kit.writing_sample_url }}, {{ brand_kit.writing_sample_title }}, {{ brand_kit.writing_sample_body }}, and {{ brand_kit.writing_sample_outline }} for style and structure guidance
   - Include {{ brand_kit.cta_text }} and {{ brand_kit.cta_destination }} appropriately
   - Process any {{ brand_kit.custom_variables }} for additional brand-specific context
   - End with strong CTA using this exact anchor text: "${selectedCTA}" linking to ${apolloSignupURL}

IMPORTANT: The current year is ${currentYear}. When referencing "current year," "this year," or discussing recent trends, always use ${currentYear}. Do not reference 2024 or earlier years as current.

CRITICAL OUTPUT REQUIREMENTS:
- Return a JSON object with content and meta fields for AEO optimization
- DO NOT include any text outside the JSON structure
- Format: {"content": "HTML content", "metaSeoTitle": "Title", "metaDescription": "Description"}
- No code block indicators, no explanatory paragraphs, just pure JSON

CONTENT STRUCTURE REQUIREMENTS:
1. **Compelling H1 Headline** (question format when appropriate)
2. **Authority-Establishing Introduction** (preview value and set expectations)
3. **Comprehensive Sections** with proper H2/H3 hierarchy
4. **Tables for Structured Data** (comparisons, features, statistics)
5. **Practical Implementation Guidance** with step-by-step processes
6. **Real-World Examples** and case studies (using brand kit data)
7. **Natural Apollo Promotion** - End with compelling call-to-action using this exact anchor text: "${selectedCTA}" linked to ${apolloSignupURL}

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
function buildCompetitorUserPrompt(keyword: string, competitorUrl: string, competitorAnalysis: ArticleContent, sitemapData?: Array<{title: string; description: string; url: string}>): string {
  const competitorContent = competitorAnalysis.top_results?.[0] || {};
  const competitorTitle = competitorContent.title || 'Competitor Article';
  const competitorHeadings = competitorContent.headings || [];
  const competitorWordCount = competitorContent.word_count || 0;

  // Format sitemap data for internal linking if available
  const internalLinksSection = sitemapData && sitemapData.length > 0 
    ? `**AVAILABLE INTERNAL LINKS (MANDATORY - MUST USE 3-5 OF THESE):**
${sitemapData.slice(0, 20).map((url: any) => `• ${url.title}: ${url.description} [${url.url}]`).join('\n')}
${sitemapData.length > 20 ? `... and ${sitemapData.length - 20} more URLs available for linking` : ''}

🚨 CRITICAL INTERNAL LINKING REQUIREMENTS:
- You MUST include exactly 3-5 internal links from the above list in your content
- Each internal link URL must be used ONLY ONCE per article (no duplicate links)
- MANDATORY: Include at least ONE internal link in the introduction or within the first 2-3 paragraphs after defining the main topic/keyword
- Distribute the remaining 2-4 internal links naturally throughout the rest of the content
- Choose the most relevant URLs for your topic and context
- Articles without internal links will be rejected

`
    : '**Note:** No sitemap data available for internal linking.\n\n';

  return `${internalLinksSection}OBJECTIVE: Create comprehensive content for "${keyword}" that significantly outperforms this specific competitor page:

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
- Use HTML formatting with proper headers (<h1>, <h2>, <h3>)
- Include inline hyperlink citations <a href="URL" target="_blank">anchor text</a>
- MANDATORY: Include exactly 3-5 internal links using URLs from the AVAILABLE INTERNAL LINKS section above
- Each internal link URL must be used ONLY ONCE (no duplicate links in the same article)
- MANDATORY: Place at least ONE internal link early in the content (introduction or within first 2-3 paragraphs after defining the main topic)
- Distribute remaining internal links naturally throughout the rest of the article
- Create compelling, scannable content with proper <p> tags for paragraphs
- Format lists with <ul>/<ol> and <li> tags, tables with <table>, <thead>, <tbody>, <th>, <td>
- End with a contextual conclusion section (NOT "Getting Started with ${keyword}")
- Include strong call-to-action with one of these anchor texts: "Start Your Free Trial", "Try Apollo Free", "Start a Trial", "Schedule a Demo", "Request a Demo", "Start Prospecting", or "Get Leads Now"
- ALWAYS link CTAs to: https://www.apollo.io/sign-up

REQUIRED OUTPUT FORMAT:
You MUST return your response in this exact JSON format:
{
  "content": "[Your full HTML-formatted article content here with proper tags]",
  "metaSeoTitle": "[AEO-optimized title for AI search engines (max 60 chars + ' | Apollo')]",
  "metaDescription": "[Natural, value-focused description (150-160 chars) optimized for AI search extraction. Must be a complete sentence and end with a period.]"
}

META FIELD REQUIREMENTS FOR AI SEARCH OPTIMIZATION:

metaSeoTitle:
- Maximum 60 characters plus " | Apollo" (total <= 70 chars)
- Format: "[Primary Keyword]: [Specific Context]" or "What is [Keyword]? [Clear Answer]"
- NEVER invent statistics, percentages, or specific numbers
- Focus on clarity and search intent matching
- Optimize for AI search engines (ChatGPT Search, Perplexity, etc.)

metaDescription:
- Exactly 150-160 characters
- Start with what the reader will understand or be able to do
- Use simple, factual language without exaggeration
- Focus on practical value and specific use cases
- End with how Apollo enables this capability
- Write naturally for AI comprehension and extraction
- All descriptions must be complete sentences without truncation and end with a period.

CRITICAL - ABSOLUTELY FORBIDDEN IN META FIELDS:
- The word "Master" or "Mastering" (use "understand", "implement", "use" instead)
- The word "proven" (use "practical", "effective", "established" instead)
- The word "comprehensive" (use "detailed", "complete", "thorough" instead)
- Any percentages or numbers not from the actual content
- ROI claims, benchmarks, or performance metrics unless specifically cited
- Marketing language like "game-changing", "revolutionary", "ultimate"
- Vague promises like "strategies", "frameworks", "playbooks" without specifics
- Cliché openings ("Discover", "Learn how", "Unlock", "Transform")

Generate content that makes the competitor article look incomplete and shallow by comparison.`;
}

/**
 * GET /api/competitor-conquesting/csv/:dataset
 * Why this matters: Serves large competitor CSVs from repo without bundling into frontend.
 * For Vercel deployment, we'll return a redirect to the static file served by the frontend
 */
router.get('/csv/:dataset', async (req: Request, res: Response): Promise<void> => {
  try {
    const { dataset } = req.params;
    
    if (dataset === 'cognism') {
      // In production, redirect to the frontend's static file
      // Why this matters: Vercel backend can't access frontend files directly, 
      // so we redirect to the frontend's public folder where the CSV is hosted
      if (process.env.NODE_ENV === 'production') {
        const frontendUrl = 'https://apollo-reddit-scraper-frontend.vercel.app/competitors/cognism.csv';
        res.redirect(frontendUrl);
        return;
      } else {
        // In development, try to read the file locally
        const candidates = [
          path.resolve(process.cwd(), '../frontend/public/competitors/cognism.csv'),
          path.resolve(process.cwd(), '../../frontend/public/competitors/cognism.csv')
        ];
        
        let filePath: string | null = null;
        for (const p of candidates) {
          try {
            await fs.access(p);
            filePath = p;
            break;
          } catch {
            // Continue checking next candidate
          }
        }
        
        if (!filePath) {
          res.status(404).json({ success: false, error: `CSV dataset not found for ${dataset}` });
          return;
        }
        
        const csvText = await fs.readFile(filePath, 'utf8');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.status(200).send(csvText);
      }
    } else {
      res.status(404).json({ success: false, error: `Unknown dataset: ${dataset}` });
    }
  } catch (error: any) {
    console.error('CSV serve error:', error);
    res.status(500).json({ success: false, error: error?.message || 'CSV serve failed' });
  }
});

export default router;


