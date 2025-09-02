import { Router, Request, Response } from 'express';
import { workflowOrchestrator } from '../services/workflowOrchestrator';
import FirecrawlService, { ArticleContent } from '../services/firecrawlService';
import SimpleContextualCtaService from '../services/simpleContextualCtaService';
import UTMUrlGenerator from '../services/utmUrlGenerator';
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
  use_simple_cta_service?: boolean;
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
    const competitorSystemPrompt = system_prompt || buildCompetitorSystemPrompt(request.competitor, brand_kit, keyword);
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
 * returning a result schema compatible with Blog Agents so the frontend can reuse UI and status renderers.
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
      user_prompt,
      use_simple_cta_service = true
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

    console.log(`🚀 Outrank Competitors start → keyword="${keyword}", url=${url}`);
    
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

            // CTAs are now generated naturally during content creation, no post-processing needed
      let finalContent = result.content;
      let ctaEnhancementResult = null;
      
      console.log('✅ [CompetitorConquesting] Using natural CTA integration during content generation (no post-processing)');

      // Return the result in Blog Agents compatible format
      return res.json({
        success: true,
        data: {
          ...result,
          content: finalContent,
          ctaEnhancementResult
        }
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
    console.error('❌ Outrank Competitors pipeline error:', error);
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
      user_prompt,
      use_simple_cta_service = true
    }: CompetitorConquestingRequest = req.body;

    // Debug logging to trace UTM parameter flow
    console.log('🔍 [DEBUG] Outrank Competitors Request:');
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
    }).then(async (result: any) => {
            // CTAs are now generated naturally during content creation, no post-processing needed
      let finalContent = result.content;
      let ctaEnhancementResult = null;
      
      console.log('✅ [CompetitorConquesting-Async] Using natural CTA integration during content generation (no post-processing)');

      updateJob(jobId, {
        status: 'completed',
        progress: 100,
        message: 'Competitor content generation complete!',
        result: {
          ...result,
          content: finalContent,
          ctaEnhancementResult
        }
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
    "Start Free with Apollo",
    "Try Apollo Free", 
    "Start a Trial",
    "Schedule a Demo",
    "Start Your Free Trial",
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
 * Why this matters: Creates UTM-tracked URLs to measure competitor conquesting campaign effectiveness with keyword tracking
 */
function generateApolloSignupURL(competitor?: string, keyword?: string): string {
  const baseURL = 'https://www.apollo.io/sign-up';
  
  console.log(`🔗 [DEBUG] generateApolloSignupURL called with competitor: "${competitor}", keyword: "${keyword}"`);
  
  if (!competitor && !keyword) {
    // Fallback without UTM if no parameters specified
    console.log(`⚠️ [DEBUG] No competitor or keyword provided, returning base URL: ${baseURL}`);
    return baseURL;
  }
  
  // Build UTM parameters
  const utmParams = new URLSearchParams();
  
  if (competitor) {
    const utmCampaign = `competitor_conquesting_${competitor.toLowerCase()}`;
    utmParams.set('utm_campaign', utmCampaign);
  }
  
  if (keyword) {
    // Sanitize keyword for URL parameter
    const sanitizedKeyword = keyword.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_+/g, '_') // Replace multiple underscores with single underscore
      .replace(/^_|_$/g, '') // Remove leading/trailing underscores
      .trim();
    
    if (sanitizedKeyword) {
      utmParams.set('utm_term', sanitizedKeyword);
    }
  }
  
  const url = utmParams.toString() ? `${baseURL}?${utmParams.toString()}` : baseURL;
  
  console.log(`🔗 [DEBUG] Generated Apollo signup URL with UTM: ${url}`);
  return url;
}

/**
 * buildCompetitorSystemPrompt
 * Why this matters: Ensures Claude explicitly aims to outperform the specific competitor page with
 * comprehensive AEO-optimized content that gets cited by AI answer engines.
 */
function buildCompetitorSystemPrompt(competitor?: string, brandKit?: any, keyword?: string): string {
  const currentYear = new Date().getFullYear();
  const selectedCTA = getRandomCTAAnchorText();
  const apolloSignupURL = generateApolloSignupURL(competitor, keyword);
  
  // Initialize UTM URL generator for contextual CTAs
  const utmGenerator = new UTMUrlGenerator();
  
  // Generate UTM-tracked URLs for all Apollo product pages
  const generateUTMUrl = (apolloUrl: string): string => {
    if (!keyword) return apolloUrl;
    
    try {
      const utmResult = utmGenerator.generateCompetitorUTMUrl(apolloUrl, keyword, competitor || 'generic');
      return utmResult.utmUrl;
    } catch (error) {
      console.warn(`Failed to generate UTM URL for ${apolloUrl}:`, error);
      return apolloUrl; // Fallback to original URL
    }
  };
  
  // Build brand kit section with actual values (same approach as Blog Agents)
  const brandKitSection = brandKit ? `
BRAND INTEGRATION (MANDATORY - USE THROUGHOUT CONTENT):
- Brand URL: ${brandKit.url || 'https://www.apollo.io'}
- About Brand: ${brandKit.aboutBrand || brandKit.about_brand || 'Apollo is the leading sales intelligence and engagement platform'}
- Ideal Customer: ${brandKit.idealCustomerProfile || brandKit.ideal_customer_profile || 'sales professionals and revenue teams'}
- Competitors context: ${brandKit.competitors || 'Salesforce, HubSpot, Outreach, ZoomInfo'}
- Brand POV: ${brandKit.brandPointOfView || brandKit.brand_point_of_view || 'data-driven sales excellence'}
- Author Persona: ${brandKit.authorPersona || brandKit.author_persona || 'sales technology expert'}
- Tone: ${brandKit.toneOfVoice || brandKit.tone_of_voice || 'professional yet approachable'}
- Writing Rules: ${brandKit.writingRules || brandKit.writing_rules || 'Use clear, actionable language with specific examples'}
- Apply these brand elements naturally throughout content, especially in examples, testimonials, and strategic sections

CUSTOMER TESTIMONIALS (MANDATORY):
- MUST include 2-3 authentic customer quotes naturally integrated throughout the content
- Create realistic quotes that match the Ideal Customer profile: ${brandKit.idealCustomerProfile || brandKit.ideal_customer_profile || 'sales professionals and revenue teams'}
- Quotes should reflect real challenges, outcomes, and experiences relevant to the topic
- Format quotes with proper attribution (job title, company size, industry when relevant)
- Place quotes strategically: one in introduction/early section, others in key benefit sections
- Example format: "Quote text here" - [Job Title], [Company Type/Industry]
- Make quotes specific, credible, and directly related to the article's main topic
- Use quotes to demonstrate competitive advantages over the target competitor URL
` : '';
  
  return `You are a world-class SEO/AEO content expert for Apollo, creating comprehensive articles that rank highly and get cited by AI answer engines.

CONTENT PHILOSOPHY: Create the definitive, authoritative resource that becomes the go-to source for the topic.

CONTENT REQUIREMENTS:
- Address ALL aspects comprehensively with practical, actionable guidance
- Include specific examples, metrics, and concrete details
- Cover current best practices AND emerging trends

COMPETITOR CONTEXT (MANDATORY):
- Target Keyword: must align with the user's target keyword
- Target Competitor URL: must be analyzed and explicitly outperformed in depth, clarity, and usefulness
${brandKitSection}

AEO OPTIMIZATION:
- Structure for AI extractability with clear, self-contained insights
- Use proper HTML hierarchy: <h1> → <h2> → <h3>, <p>, <ul>/<ol>, <strong>
- CRITICAL: H1 headlines MUST use proper Title Case (capitalize all major words) and NEVER include "| Apollo" (that's only for SEO titles)
- Format ALL comparisons/features/data in <table> with <thead>, <tbody>, <th>, <td>
- CRITICAL: H2 and H3 headers MUST be natural, grammatically correct questions in Title Case:
  * Singular: "Who Is A Sales Consultant?", "How Does Lead Generation Work?"
  * Plural: "Who Are Sales Consultants?", "Why Are Account Executives Important?"
  * Process: "What Is Sales Prospecting?", "How Does CRM Integration Work?"
- Write in clear, chunked sections - each section fully answers ONE question like a featured snippet
- Use bullets, <strong> tags, and proper spacing for human and machine comprehension
- Place complete answer in first paragraph under each heading (snippet-worthy)
- Include definitions immediately after question headers when introducing concepts

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

3. **Brand Integration Requirements:**
   - Apply brand context naturally throughout content (values provided above in BRAND INTEGRATION section)
   - Use brand POV and tone consistently in all sections
   - Include ideal customer examples and testimonials that match the target audience
   - Reference competitors appropriately when discussing market landscape
   - Follow writing rules and maintain author persona throughout
   - Include contextual Apollo mentions throughout content as specified in CONTEXTUAL APOLLO INTEGRATION section
   - End with strong CTA using this exact anchor text: "${selectedCTA}" linking to ${apolloSignupURL}

INTERNAL LINKING & CONTEXTUAL CTAS (MANDATORY):
- Insert 3-5 internal links from provided URLs naturally throughout content
- Place at least ONE link early (intro or first 2-3 paragraphs)
- Use natural anchor text matching linked content
- Format: <a href="URL" target="_blank">anchor text</a>

CONTEXTUAL APOLLO INTEGRATION (CRITICAL):
- Weave Apollo naturally into content with contextually relevant anchor phrases linking to specific product pages
- Match Apollo URLs to content context and pain points:

**PROSPECTING & LEAD GENERATION:**
- Use ${generateUTMUrl('https://www.apollo.io/product/search')} for: "advanced prospecting tools", "lead generation platforms", "contact discovery solutions"
- Use ${generateUTMUrl('https://www.apollo.io/sales-pipeline')} for: "pipeline building tools", "sales pipeline platforms", "lead qualification systems"

**SALES ENGAGEMENT & OUTREACH:**
- Use ${generateUTMUrl('https://www.apollo.io/product/sales-engagement')} for: "sales engagement platforms", "outreach automation tools", "multi-channel communication systems"
- Use ${generateUTMUrl('https://www.apollo.io/product/ai-sales-automation')} for: "AI-powered sales automation", "automated outreach systems", "intelligent sales workflows"

**DATA & ENRICHMENT:**
- Use ${generateUTMUrl('https://www.apollo.io/data-enrichment')} for: "B2B contact databases", "data enrichment services", "verified contact information"
- Use ${generateUTMUrl('https://www.apollo.io/product/enrich')} for: "contact enrichment tools", "data verification platforms", "lead intelligence systems"
- Use ${generateUTMUrl('https://www.apollo.io/product/waterfall')} for: "waterfall enrichment", "multi-source data verification", "comprehensive contact discovery"

**MEETINGS & CONVERSATIONS:**
- Use ${generateUTMUrl('https://www.apollo.io/product/meetings')} for: "meeting scheduling platforms", "calendar coordination tools", "appointment booking systems"
- Use ${generateUTMUrl('https://www.apollo.io/ai-call-assistant')} for: "AI call assistants", "conversation intelligence platforms", "call recording and analysis tools"
- Use ${generateUTMUrl('https://www.apollo.io/product/conversations')} for: "conversation tracking systems", "call management platforms", "communication analytics"

**PIPELINE & DEAL MANAGEMENT:**
- Use ${generateUTMUrl('https://www.apollo.io/product/deal-management')} for: "deal management platforms", "sales pipeline tracking", "opportunity management systems"
- Use ${generateUTMUrl('https://www.apollo.io/go-to-market')} for: "go-to-market platforms", "revenue operations tools", "sales strategy systems"

**AI & AUTOMATION:**
- Use ${generateUTMUrl('https://www.apollo.io/ai')} for: "AI sales platforms", "artificial intelligence tools", "machine learning systems"
- Use ${generateUTMUrl('https://www.apollo.io/product/workflow-engine')} for: "workflow automation", "sales process automation", "task management systems"

**INTEGRATIONS & TOOLS:**
- Use ${generateUTMUrl('https://www.apollo.io/product/integrations')} for: "CRM integrations", "sales tool connections", "platform integrations"
- Use ${generateUTMUrl('https://www.apollo.io/product/chrome-extension')} for: "browser extensions", "prospecting browser tools", "LinkedIn integration tools"

- Examples of inline pain-point CTAs:
  * After discussing data quality issues: "Tired of dirty data? <a href='${generateUTMUrl('https://www.apollo.io/data-enrichment')}' target='_blank'>Start free with Apollo's 210M+ verified contacts</a>."
  * After mentioning prospecting challenges: "Struggling to find qualified leads? <a href='${generateUTMUrl('https://www.apollo.io/product/search')}' target='_blank'>Search Apollo's 275M+ contacts with 65+ filters</a>."
  * After discussing manual outreach problems: "Spending hours on manual outreach? <a href='${generateUTMUrl('https://www.apollo.io/product/sales-engagement')}' target='_blank'>Automate your sequences with Apollo's multi-channel platform</a>."
  * After mentioning call management issues: "Tired of taking notes during calls? <a href='${generateUTMUrl('https://www.apollo.io/ai-call-assistant')}' target='_blank'>Let Apollo's AI handle call summaries and next steps</a>."
  * After discussing pipeline visibility problems: "Can't track your deals effectively? <a href='${generateUTMUrl('https://www.apollo.io/product/deal-management')}' target='_blank'>Get complete pipeline visibility with Apollo's deal management</a>."

**CTA FORMULA:** [Pain Point Question] + [Solution Benefit] + [Specific Apollo URL]
- Start with a direct question addressing the pain point just mentioned
- Follow with a clear benefit statement
- Link to the most relevant Apollo product page
- Keep it conversational and helpful, not salesy

- Distribute 2-3 inline pain-point CTAs throughout: early context, middle examples, solution discussion
- Always match the URL to the specific pain point or solution being discussed
- Use conversational, problem-solving language that feels helpful, not promotional
- Address the reader directly with questions like "Tired of...", "Struggling with...", "Spending too much time on..."

Current year: ${currentYear}. 
REMEMBER: Include 2-3 contextual Apollo mentions with descriptive anchor text throughout content + end with CTA: "${selectedCTA}" linking to ${apolloSignupURL}

CRITICAL OUTPUT: Return ONLY valid JSON:
{
  "content": "Complete HTML article",
  "metaSeoTitle": "Question-based title with keyword (<60 chars) | Apollo",
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

CRITICAL REQUIREMENTS:
- Title MUST be a natural, grammatically correct question that includes the main keyword
- Description MUST directly answer the title question using the keyword naturally
- Both title and description must work together as an intelligent question-answer pair
- Choose appropriate question format based on keyword type (job titles, processes, tools, etc.)

ABSOLUTELY FORBIDDEN IN META FIELDS:
- Grammatically incorrect questions ("What Is A Sales Consultants?", "What Are A Sales Consultant?", "What Is A Account Executives?")
- Including "| Apollo" in H1 headlines (that's only for SEO titles, not content headlines)
- Robotic/boilerplate phrasing that doesn't sound human-written
- Rigid "What Is [keyword]?" format for all keyword types without considering singular/plural grammar
- Non-question titles ("Sales Tips", "Lead Generation Methods", "Prospecting Techniques")
- Titles with colons or lists ("Sales Prospecting: 7 Methods", "Tools: Features & Comparison")
- The word "Guide" or "Guides" (use intelligent question format instead)
- "Complete Guide" or "Comprehensive Guide" (use appropriate question type)
- "Ultimate Guide" (use natural question format)
- Descriptions that don't answer the title question directly
- Descriptions that don't include the main keyword naturally
- Marketing language like "game-changing", "revolutionary", "ultimate"
- Vague promises like "strategies", "frameworks", "playbooks" without specifics
- Generic terms like "everything you need to know"
- Cliché openings ("Discover", "Learn how", "Unlock", "Transform")

NO text before/after JSON. NO markdown blocks. NO invented statistics in meta fields.

CRITICAL REMINDER:
- SEO titles (metaSeoTitle) include "| Apollo" 
- H1 headlines in content NEVER include "| Apollo"
- H2/H3 headers must be grammatically correct (singular vs plural)
- All headers use Title Case

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

  return `${internalLinksSection}Create comprehensive AEO-optimized content for keyword: "${keyword}" that significantly outperforms this specific competitor page:

TARGET COMPETITOR ANALYSIS: ${competitorUrl}
- Title: ${competitorTitle}
- Word Count: ${competitorWordCount}
- Structure: ${competitorHeadings.join(', ') || 'Standard article format'}

CONTENT DEPTH REQUIREMENTS:
- Provide the definitive resource on this topic that beats the competitor
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

COMPETITIVE ADVANTAGE REQUIREMENTS:
1) **Superior Coverage**: Cover all topics the competitor covers, but with greater depth and clarity
2) **Unique Value Addition**: Include substantial additional insights and perspectives
3) **Better Organization**: Improve on the competitor's structure and flow
4) **Practical Focus**: Add more actionable advice and real-world examples
5) **Authority Building**: Establish stronger expertise and credibility
6) **AEO Optimization**: Structure for AI answer engine extractability

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
- Include strong call-to-action with one of these anchor texts: "Start Free with Apollo", "Try Apollo Free", "Start a Trial", "Schedule a Demo", "Start Your Free Trial", "Request a Demo", "Start Prospecting", or "Get Leads Now"
- ALWAYS link CTAs to: https://www.apollo.io/sign-up

REQUIRED OUTPUT FORMAT:
You MUST return your response in this exact JSON format:
{
  "content": "[Your full HTML-formatted article content here with proper tags]",
  "metaSeoTitle": "[Question-based title with main keyword (max 60 chars + ' | Apollo')]",
  "metaDescription": "[Direct answer to title question using keyword (150-160 chars). Must be complete sentence ending with period.]"
}

INTELLIGENT QUESTION-ANSWER EXAMPLES FOR AI SEARCH OPTIMIZATION:

PERFECT Title + Description Pairs by Keyword Type:

• Job Title (Singular): "Who Is An SDR Manager? Roles, Responsibilities, Salary | Apollo"
  Description: "An SDR Manager is a sales leader who oversees development teams and prospecting strategies. They coach reps and optimize processes. Apollo helps SDR Managers track team performance."

• Job Title (Plural): "Who Are Sales Consultants? Skills, Career Path, Salary | Apollo"
  Description: "Sales Consultants are professionals who advise prospects on solutions for their business needs. They build relationships and close deals. Apollo provides consultants with prospect intelligence."

• Process/Concept: "What Is Sales Prospecting? Strategies, Tools, Best Practices | Apollo"
  Description: "Sales prospecting is the process of identifying and reaching out to potential customers. It involves research, qualification, and outreach. Apollo automates prospecting workflows."

• Tool/Software: "How Does CRM Software Work? Features, Benefits, Implementation | Apollo"
  Description: "CRM software manages customer relationships and sales data in one platform. It tracks interactions and pipeline progress. Apollo integrates with leading CRM systems."

• Strategy/Method: "Why Use Account-Based Marketing? Benefits, Process, ROI | Apollo"
  Description: "Account-based marketing targets specific high-value accounts with personalized campaigns. It aligns sales and marketing efforts. Apollo provides ABM contact data and tools."

AVOID These Non-Question Formats:
- "Sales Prospecting: 7 Methods That Generate Leads | Apollo" (not a question)
- "Cold Email Templates: 5 High-Response Formats | Apollo" (not a question)
- "Lead Generation Tools: Features & Comparison | Apollo" (not a question)
- "Complete Guide to Sales Prospecting | Apollo" (guide format)
- "Master Account-Based Marketing: Ultimate Guide | Apollo" (guide format)

AVOID These Non-Answer Descriptions:
- "Learn 7 proven sales prospecting methods..." (doesn't define what sales prospecting is)
- "Get 5 cold email templates..." (doesn't explain what cold email automation is)
- "Discover the ultimate ABM strategies..." (doesn't answer what ABM is or how it works)

Generate content that makes the competitor article look incomplete and shallow by comparison.

Remember: You're creating content for 2025. Make it comprehensive enough that other content feels incomplete by comparison.`;
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


