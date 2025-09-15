import dotenv from 'dotenv';
// Load environment variables before importing any services
dotenv.config();

import FirecrawlService, { ArticleContent, FirecrawlExtractionResult } from './firecrawlService';
import { deepResearchService, DeepResearchResult } from './deepResearchService';
import { gapAnalysisService, GapAnalysisResult } from './gapAnalysisService';
import { claudeService } from './claudeService';
import { brandkitService } from './brandkitService';
import { CLAUDE_BLOG_CONTENT_SYSTEM_PROMPT } from '../prompts/claudeBlogContentPrompt';
import { WorkflowError, createServiceError } from './errorHandling';
import MCPService, { ToolSelection } from './mcpService';
import ContentContextAnalyzer from './contentContextAnalyzer';

interface BlogContentResult {
  keyword: string;
  content: string;
  raw_content: string;
  metadata: {
    title: string;
    description: string;
    metaSeoTitle?: string;
    metaDescription?: string;
    word_count: number;
    seo_optimized: boolean;
    citations_included: boolean;
    brand_variables_processed: number;
    brand_variables_used?: string[];
    aeo_optimized: boolean;
  };
  workflow_data: {
    firecrawl_analysis: ArticleContent;
    deep_research: DeepResearchResult;
    gap_analysis: GapAnalysisResult;
  };
  generation_metadata: {
    total_duration_seconds: number;
    model_pipeline: string[];
    content_quality_score: number;
    processing_steps: string[];
    timestamp: string;
  };
}

interface WorkflowRequest {
  keyword: string;
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

interface WorkflowProgressCallback {
  onProgress: (stage: string, message: string, progress: number) => void;
}

// MCP interfaces for legacy methods (backward compatibility)
interface MCPQueryResult {
  tool: string;
  query: string;
  result: any;
  success: boolean;
  error?: string;
}

interface MCPDataResult {
  success: boolean;
  data: any[];
  queries: string[];
  toolsUsed: string[];
  attribution: string[];
  error?: string;
}

interface WorkflowState {
  jobId: string;
  keyword: string;
  request: WorkflowRequest;
  currentStage: 'firecrawl' | 'deep_research' | 'gap_analysis' | 'content_generation' | 'completed' | 'error';
  startTime: number;
  completedStages: {
    firecrawl?: ArticleContent;
    deep_research?: DeepResearchResult;
    gap_analysis?: GapAnalysisResult;
    content_generation?: any;
  };
  lastError?: WorkflowError;
  retryCount: number;
  maxRetries: number;
}

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
  
  console.log(`🔗 [DEBUG-WO] generateApolloSignupURL called with competitor: "${competitor}" (type: ${typeof competitor})`);
  
  if (!competitor) {
    // Fallback without UTM if no competitor specified
    console.log(`⚠️ [DEBUG-WO] No competitor provided, returning base URL: ${baseURL}`);
    return baseURL;
  }
  
  // Generate UTM campaign parameter from competitor
  const utmCampaign = `competitor_conquesting_${competitor.toLowerCase()}`;
  const url = `${baseURL}?utm_campaign=${utmCampaign}`;
  
  console.log(`🔗 [DEBUG-WO] Generated Apollo signup URL with UTM: ${url}`);
  return url;
}

/**
 * generateBlogCreatorSignupURL
 * Why this matters: Creates UTM-tracked URLs to measure blog creator campaign effectiveness for specific keywords
 */
function generateBlogCreatorSignupURL(keyword?: string): string {
  const baseURL = 'https://www.apollo.io/sign-up';
  
  console.log(`🔗 [DEBUG-WO] generateBlogCreatorSignupURL called with keyword: "${keyword}" (type: ${typeof keyword})`);
  
  if (!keyword) {
    // Fallback without UTM if no keyword specified
    console.log(`⚠️ [DEBUG-WO] No keyword provided, returning base URL: ${baseURL}`);
    return baseURL;
  }
  
  // Generate UTM campaign parameter from keyword (sanitize for URL)
  const sanitizedKeyword = keyword.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_+/g, '_') // Replace multiple underscores with single underscore
    .replace(/^_|_$/g, '') // Remove leading/trailing underscores
    .trim();
    
  const utmCampaign = `blog_creator_${sanitizedKeyword}`;
  const url = `${baseURL}?utm_campaign=${utmCampaign}`;
  
  console.log(`🔗 [DEBUG-WO] Generated Apollo signup URL with UTM: ${url}`);
  return url;
}

class WorkflowOrchestrator {
  private readonly WORKFLOW_STAGES = [
    'Extracting competitor content with Firecrawl',
    'Performing comprehensive OpenAI Deep Research',
    'Analyzing gaps with GPT 4.1 nano',
    'Generating optimized content with Claude Sonnet 4 (with Apollo data)'
  ];

  // In-memory storage for workflow states (in production, use Redis or database)
  private workflowStates = new Map<string, WorkflowState>();
  private readonly WORKFLOW_TIMEOUT = 20 * 60 * 1000; // 20 minutes
  private readonly MAX_WORKFLOW_RETRIES = 2;
  private firecrawlService: FirecrawlService;
  private mcpService: MCPService;
  private contentContextAnalyzer: ContentContextAnalyzer;

  constructor() {
    this.firecrawlService = new FirecrawlService();
    this.mcpService = new MCPService();
    this.contentContextAnalyzer = new ContentContextAnalyzer(this.mcpService);
    
    // Set up automatic cleanup of expired workflows every 5 minutes
    setInterval(() => {
      this.cleanupExpiredWorkflows();
    }, 5 * 60 * 1000);
  }

  /**
   * Execute the complete 4-model content generation pipeline with resume capability
   * Why this matters: This orchestrates the entire workflow from competitor analysis
   * through independent research, gap analysis, and final content generation with
   * the ability to resume from interruptions.
   */
  async executeContentPipeline(
    request: WorkflowRequest,
    progressCallback?: WorkflowProgressCallback,
    jobId?: string
  ): Promise<BlogContentResult> {
    const { keyword, competitor, target_audience, content_length = 'medium', focus_areas = [], brand_kit, system_prompt, user_prompt, sitemap_data } = request;

    if (!keyword || keyword.trim().length === 0) {
      throw createServiceError(new Error('Keyword is required for content generation pipeline'), 'Workflow Orchestrator', 'Input validation');
    }

    // Create or retrieve workflow state
    const workflowId = jobId || `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let workflowState = this.workflowStates.get(workflowId);

    if (!workflowState) {
      // Create new workflow state
      workflowState = {
        jobId: workflowId,
        keyword: keyword.trim(),
        request,
        currentStage: 'firecrawl',
        startTime: Date.now(),
        completedStages: {},
        retryCount: 0,
        maxRetries: this.MAX_WORKFLOW_RETRIES
      };
      this.workflowStates.set(workflowId, workflowState);
      console.log(`🚀 Starting new 4-model content pipeline for keyword: "${keyword}" (Job ID: ${workflowId})`);
    } else {
      console.log(`🔄 Resuming workflow for keyword: "${keyword}" from stage: ${workflowState.currentStage} (Job ID: ${workflowId})`);
    }

    const startTime = workflowState.startTime;

    try {
      // Stage 1: Firecrawl competitor analysis
      let firecrawlResult = workflowState.completedStages.firecrawl;
      if (!firecrawlResult && workflowState.currentStage === 'firecrawl') {
        try {
          progressCallback?.onProgress(
            'firecrawl',
            '🔍 Extracting content from top search results with Firecrawl...',
            25
          );

          console.log('📊 Stage 1: Firecrawl competitor analysis');
          firecrawlResult = await this.firecrawlService.searchAndAnalyzeCompetitors(keyword);
          
          // Save progress
          workflowState.completedStages.firecrawl = firecrawlResult;
          workflowState.currentStage = 'deep_research';
          this.workflowStates.set(workflowId, workflowState);
        } catch (error) {
          const workflowError = new WorkflowError('firecrawl', 'Firecrawl', error as any, workflowState);
          workflowState.lastError = workflowError;
          workflowState.currentStage = 'error';
          this.workflowStates.set(workflowId, workflowState);
          throw workflowError;
        }
      }
      
      // Stage 2: OpenAI Deep Research
      let deepResearchResult = workflowState.completedStages.deep_research;
      if (!deepResearchResult && (workflowState.currentStage === 'deep_research' || workflowState.currentStage === 'firecrawl')) {
        try {
          progressCallback?.onProgress(
            'deep_research',
            '🧠 Performing comprehensive OpenAI Deep Research on target keyword (this may take 3-5 minutes)...',
            50
          );

          console.log('🔬 Stage 2: OpenAI Deep Research');
          deepResearchResult = await deepResearchService.performDeepResearch({
            keyword,
            research_depth: 'deep',
            focus_areas
          });

          // Save progress
          workflowState.completedStages.deep_research = deepResearchResult;
          workflowState.currentStage = 'gap_analysis';
          this.workflowStates.set(workflowId, workflowState);
        } catch (error) {
          const workflowError = new WorkflowError('deep_research', 'OpenAI Deep Research', error as any, workflowState);
          workflowState.lastError = workflowError;
          workflowState.currentStage = 'error';
          this.workflowStates.set(workflowId, workflowState);
          throw workflowError;
        }
      }

      // Stage 3: Gap Analysis with GPT 4.1 nano
      let gapAnalysisResult = workflowState.completedStages.gap_analysis;
      if (!gapAnalysisResult && ['gap_analysis', 'deep_research', 'firecrawl'].includes(workflowState.currentStage)) {
        try {
          progressCallback?.onProgress(
            'gap_analysis',
            '📊 Analyzing gaps between research findings and competitor content with GPT-5 nano...',
            75
          );

          console.log('🎯 Stage 3: Gap Analysis with GPT-5 nano');
          gapAnalysisResult = await gapAnalysisService.performGapAnalysis({
            keyword,
            deepResearchResult: deepResearchResult!,
            competitorAnalysis: firecrawlResult!,
            target_audience
          });

          // Save progress
          workflowState.completedStages.gap_analysis = gapAnalysisResult;
          workflowState.currentStage = 'content_generation';
          this.workflowStates.set(workflowId, workflowState);
        } catch (error) {
          const workflowError = new WorkflowError('gap_analysis', 'OpenAI Gap Analysis', error as any, workflowState);
          workflowState.lastError = workflowError;
          workflowState.currentStage = 'error';
          this.workflowStates.set(workflowId, workflowState);
          throw workflowError;
        }
      }

      // Stage 4: Content generation with Claude Sonnet 4 (with Apollo data)
      let rawContentResult = workflowState.completedStages.content_generation;
      if (!rawContentResult && ['content_generation', 'gap_analysis', 'deep_research', 'firecrawl'].includes(workflowState.currentStage)) {
        try {
          progressCallback?.onProgress(
            'content_generation',
            '✍️ Generating optimized article with Claude Sonnet 4 and Apollo data...',
            85
          );

          console.log('✍️ Stage 4: Content generation with Claude Sonnet 4 and Apollo data');
          rawContentResult = await this.generateContentWithClaudeAndMCP(
            keyword,
            gapAnalysisResult!,
            deepResearchResult!,
            firecrawlResult!,
            content_length,
            brand_kit,
            system_prompt,
            user_prompt,
            competitor,
            sitemap_data
          );

          // Save progress
          workflowState.completedStages.content_generation = rawContentResult;
          workflowState.currentStage = 'completed';
          this.workflowStates.set(workflowId, workflowState);
        } catch (error) {
          const workflowError = new WorkflowError('content_generation', 'Claude Sonnet 4', error as any, workflowState);
          workflowState.lastError = workflowError;
          workflowState.currentStage = 'error';
          this.workflowStates.set(workflowId, workflowState);
          throw workflowError;
        }
      }

      // Ensure all required results are available
      if (!firecrawlResult || !deepResearchResult || !gapAnalysisResult || !rawContentResult) {
        throw new Error('Missing required workflow results - workflow may be corrupted');
      }

      // Stage 5: Post-processing and formatting
      progressCallback?.onProgress(
        'post_processing',
        '🔧 Post-processing content and applying brand variables...',
        90
      );

      console.log('🔧 Stage 5: Post-processing and formatting');
      const contentResult = await this.postProcessContent(
        rawContentResult.content,
        brand_kit,
        keyword
      );

      // Stage 6: Enhance meta fields based on actual content
      progressCallback?.onProgress(
        'meta_enhancement',
        '✨ Enhancing SEO title and description based on actual content...',
        95
      );

      console.log('✨ Stage 6: Meta field enhancement based on content');
      let enhancedMetaFields;
      try {
        enhancedMetaFields = await claudeService.enhanceMetaFieldsFromContent({
          keyword: keyword.trim(),
          content: contentResult.processed_content,
          competitor: competitor
        });
        console.log('✅ Meta fields enhanced successfully');
      } catch (metaError) {
        console.warn('⚠️ Meta enhancement failed, using original meta fields:', metaError);
        // Fallback to original meta fields if enhancement fails
        enhancedMetaFields = {
          metaSeoTitle: rawContentResult.metaSeoTitle,
          metaDescription: rawContentResult.metaDescription
        };
      }

      // Calculate total duration
      const totalDuration = (Date.now() - startTime) / 1000;

      // Progress completion
      progressCallback?.onProgress(
        'completed',
        '✅ Content generation complete!',
        100
      );

      // Structure final result
      const blogContentResult: BlogContentResult = {
        keyword: keyword.trim(),
        content: contentResult.processed_content,
        raw_content: rawContentResult.content,
        metadata: {
          title: rawContentResult.title || `What is ${keyword}?`,
          description: rawContentResult.description || `${keyword} is a key business process that helps organizations achieve their goals. Learn how Apollo can support your ${keyword} efforts.`,
          metaSeoTitle: enhancedMetaFields.metaSeoTitle,
          metaDescription: enhancedMetaFields.metaDescription,
          word_count: this.calculateWordCount(contentResult.processed_content),
          seo_optimized: true,
          citations_included: contentResult.citations_count > 0,
          brand_variables_processed: contentResult.brand_variables_processed,
          brand_variables_used: contentResult.brand_variables_used,
          aeo_optimized: true
        },
        workflow_data: {
          firecrawl_analysis: firecrawlResult,
          deep_research: deepResearchResult,
          gap_analysis: gapAnalysisResult
        },
        generation_metadata: {
          total_duration_seconds: totalDuration,
          model_pipeline: [
            'Firecrawl Search API',
            'o3-deep-research-2025-06-26',
            'gpt-5-nano',
            'claude-sonnet-4-20250514',
            'claude-sonnet-4-20250514 (Meta Enhancement)'
          ],
          content_quality_score: this.calculateQualityScore(gapAnalysisResult, { content: contentResult.processed_content }),
          processing_steps: contentResult.processing_steps,
          timestamp: new Date().toISOString()
        }
      };

      console.log(`✅ Completed 4-model pipeline for "${keyword}" in ${totalDuration.toFixed(1)}s`);
      console.log(`📝 Generated ${blogContentResult.metadata.word_count} words with quality score: ${blogContentResult.generation_metadata.content_quality_score.toFixed(2)}`);

      // Clean up workflow state on successful completion
      this.workflowStates.delete(workflowId);

      return blogContentResult;

    } catch (error) {
      console.error('❌ Content pipeline failed:', error);
      
      // Update workflow state with error information
      if (workflowState && !(error instanceof WorkflowError)) {
        const workflowError = new WorkflowError('unknown', 'Workflow Orchestrator', error as any, workflowState);
        workflowState.lastError = workflowError;
        workflowState.currentStage = 'error';
        this.workflowStates.set(workflowId, workflowState);
      }

      // Re-throw WorkflowError as-is, wrap other errors
      if (error instanceof WorkflowError) {
        throw error;
      } else {
        throw createServiceError(error as any, 'Workflow Orchestrator', `Pipeline execution for keyword: ${keyword}`);
      }
    }
  }

  /**
   * Generate content using Claude Sonnet 4 with comprehensive context and completion planning
   * Why this matters: This uses all the gathered intelligence to create superior content
   * that covers competitor topics PLUS unique insights from deep research, with intelligent
   * token management to ensure proper completion.
   */
  private async generateContentWithClaude(
    keyword: string,
    gapAnalysis: GapAnalysisResult,
    deepResearch: DeepResearchResult,
    competitorAnalysis: ArticleContent,
    contentLength: string,
    brandKit?: any,
    customSystemPrompt?: string,
    customUserPrompt?: string,
    competitor?: string,
    sitemapData?: Array<{
      title: string;
      description: string;
      url: string;
    }>
  ): Promise<{ content: string; title?: string; description?: string; metaSeoTitle?: string; metaDescription?: string }> {
    
    // Use custom prompts if provided, otherwise use default prompts with context
    const systemPrompt = customSystemPrompt || this.buildClaudeSystemPrompt(contentLength);
    // Always inject orchestration context so custom prompts are grounded in research/gap data
    const orchestrationContext = this.buildOrchestrationContext(keyword, gapAnalysis, deepResearch, competitorAnalysis, brandKit);
    
    // For custom prompts, inject research context MORE prominently at the beginning
    const baseUserPrompt = customUserPrompt 
      ? `${orchestrationContext}\n\n${'═'.repeat(50)}\n📝 USER INSTRUCTIONS\n${'═'.repeat(50)}\n${customUserPrompt}`
      : this.buildClaudeUserPrompt(
      keyword,
      gapAnalysis,
      deepResearch,
      competitorAnalysis,
      brandKit
        );

    // Apply frontend-aligned completion requirements ONLY if no custom user prompt
    let userPrompt: string;
    if (customUserPrompt) {
      // Custom user prompt already contains UTM URLs and CTA instructions - use as-is
      userPrompt = baseUserPrompt;
      console.log('🔗 [DEBUG-WO] Using custom user prompt (UTM URLs should be preserved)');
    } else {
      // Generate our own prompt with UTM URLs
      const currentYear = new Date().getFullYear();
      const selectedCTA = getRandomCTAAnchorText();
      // Use competitor URL for competitor conquesting, otherwise use blog creator URL
      const apolloSignupURL = competitor 
        ? generateApolloSignupURL(competitor)
        : generateBlogCreatorSignupURL(keyword);
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
- Articles without internal links will be rejected`
        : '**Note:** No sitemap data available for internal linking.';

      userPrompt = `${baseUserPrompt}

${internalLinksSection}

⚠️ CRITICAL COMPLETION REQUIREMENT:
- MUST end with complete conclusion and call-to-action  
- Reserve final 5-10% for proper conclusion
- NEVER end mid-sentence or mid-paragraph

CRITICAL CONTENT REQUIREMENTS:

1. HTML Structure & Formatting:
   - Create an H1 title that directly addresses the keyword
   - Use proper heading hierarchy with H2 for major sections, H3 for subsections
   - Format ALL lists with proper <ul>/<ol> and <li> tags
   - Create HTML tables for ANY structured data (features, comparisons, statistics, timelines)
   - Use <p> tags for all paragraphs, <strong> for emphasis
   - Include inline links to relevant external resources: <a href="URL" target="_blank">anchor text</a>
   - MUST include exactly 3-5 internal links using URLs from the AVAILABLE INTERNAL LINKS section above
   - Each internal link URL must be used ONLY ONCE (no duplicate links in the same article)
   - MANDATORY: Place at least ONE internal link early in the content (introduction or within first 2-3 paragraphs after defining the main topic)
   - Distribute remaining internal links naturally throughout the rest of the article

2. Required Tables/Structured Data:
   - Include at least 2-3 HTML tables presenting relevant information
   - Format tables with proper <thead>, <tbody>, <th>, and <td> elements

3. Brand Kit Variable Integration (MANDATORY - USE ALL VARIABLES):
   - Use {{ brand_kit.url }} for brand website references and authority building
   - Incorporate {{ brand_kit.about_brand }} for company context and credibility
   - Use {{ brand_kit.ideal_customer_profile }} for testimonials, examples, and target audience references
   - Reference {{ brand_kit.competitors }} when discussing market landscape and comparisons
   - Apply {{ brand_kit.brand_point_of_view }} in strategic sections and thought leadership
   - Embody {{ brand_kit.author_persona }} throughout the writing voice and perspective
   - Follow {{ brand_kit.tone_of_voice }} consistently throughout all content
   - Apply {{ brand_kit.header_case_type }} to all headings (title case, sentence case, etc.)
   - Implement {{ brand_kit.writing_rules }} for style consistency and guidelines
   - Use {{ brand_kit.writing_sample_url }}, {{ brand_kit.writing_sample_title }}, {{ brand_kit.writing_sample_body }}, and {{ brand_kit.writing_sample_outline }} as style and structure references
   - Include {{ brand_kit.cta_text }} and {{ brand_kit.cta_destination }} for call-to-action elements
   - Process any {{ brand_kit.custom_variables }} for additional brand-specific context
   - End with mandatory conclusion structure including CTA using this exact anchor text: "${selectedCTA}" linked to ${apolloSignupURL}

4. Content Depth & Value:
   - Provide comprehensive coverage that serves as the definitive resource
   - Include practical, actionable guidance with specific examples
   - Address both current best practices and emerging trends for ${currentYear}
   - Cover implementation strategies with step-by-step processes

5. AEO Optimization:
   - Structure content for AI answer engine extraction
   - Use semantic HTML elements appropriately
   - Include self-contained insights that can be cited independently

6. Technical Requirements:
   - Do NOT use emdashes (—) in the content
   - Avoid AI-detectable phrases like "It's not just about..., it's..."
   - Include inline links to relevant external resources: <a href="URL" target="_blank">anchor text</a>

CONTENT STRUCTURE REQUIREMENTS:
1. **Compelling H1 Headline** (question format when appropriate)
2. **Authority-Establishing Introduction** (preview value and set expectations)
3. **Comprehensive Sections** with proper H2/H3 hierarchy (question format when appropriate, very critical of ai search engines optimization)
4. **Tables for Structured Data** (comparisons, features, statistics)
5. **Practical Implementation Guidance** with step-by-step processes
6. **Real-World Examples** and case studies (using brand kit data)
7. **Natural Apollo Promotion** - End with compelling call-to-action using this exact anchor text: "${selectedCTA}" linked to ${apolloSignupURL}

WRITING SAMPLE STYLE REFERENCE:
If {{ brand_kit.writing_sample_title }}, {{ brand_kit.writing_sample_body }}, or {{ brand_kit.writing_sample_outline }} are provided, use them as style and structure templates:
- Mirror the tone, voice, and writing approach from {{ brand_kit.writing_sample_body }}
- Follow the structural approach demonstrated in {{ brand_kit.writing_sample_outline }}
- Emulate the headline style and approach from {{ brand_kit.writing_sample_title }}
- Reference {{ brand_kit.writing_sample_url }} as an example of the brand's content quality standards

The current year is ${currentYear}. When referencing "current year," "this year," or discussing recent trends, always use ${currentYear}.

IMPORTANT: Your final section must use this exact call-to-action anchor text: "${selectedCTA}" with link to ${apolloSignupURL}`;  
    }

    console.log('🔧 Using prompts:', {
      custom_system: !!customSystemPrompt,
      custom_user: !!customUserPrompt,
      system_length: systemPrompt.length,
      user_length: userPrompt.length
    });

    // Debug: Log the competitor value and URL usage
    console.log('🔗 [DEBUG-WO] Competitor value:', competitor);
    console.log('🔗 [DEBUG-WO] Using custom user prompt:', !!customUserPrompt);
    
    // Debug: Show a snippet of the prompt containing the URL
    const urlSnippet = userPrompt.match(/.{0,100}apollo\.io\/sign-up[^\s]*.{0,100}/i)?.[0];
    if (urlSnippet) {
      console.log('🔗 [DEBUG-WO] URL snippet from prompt:', urlSnippet);
    } else {
      console.log('🔗 [DEBUG-WO] No Apollo URL found in prompt - this might be the issue!');
    }

    // Generate content with Claude Sonnet 4 (retry logic temporarily disabled)
    console.log('🔧 Using simplified content generation without retry logic for debugging');
    
    const result = await claudeService.generateContent({
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      post_context: { keyword, contentLength },
      brand_kit: brandKit,
      content_length: contentLength as 'short' | 'medium' | 'long',
      sitemap_data: sitemapData
    });

    return result;
  }



  /**
   * Build comprehensive system prompt for Claude content generation
   * Why this matters: This system prompt ensures Claude generates AEO-optimized content
   * that leverages all the research and gap analysis intelligence effectively.
   */
  private buildClaudeSystemPrompt(contentLength: string): string {
    const lengthGuidance = {
      short: '1200-1500 words',
      medium: '1800-2200 words', 
      long: '2500-3000 words'
    };

    const currentYear = new Date().getFullYear();

    return `You are an expert content creator specializing in creating superior, AEO-optimized articles that outperform competitor content. Your content must be structured for maximum AI answer engine extractability while providing genuine value.

CONTENT GENERATION APPROACH:
1. **Comprehensive Coverage**: Create the definitive resource on the topic
2. **Structured Data**: Use HTML tables for comparisons, features, statistics
3. **AEO Optimization**: Structure for AI answer engine extraction with semantic HTML
4. **Brand Integration**: Naturally incorporate brand kit variables throughout
5. **Authority Building**: Establish expertise through depth, data, and insights

AEO (ANSWER ENGINE OPTIMIZATION) PRINCIPLES:
- Structure for extractability with clear, self-contained insights
- Use semantic HTML and proper heading hierarchy (<h1> → <h2> → <h3>)
- Format data in proper <table> and <ul>/<ol> structures for easy AI parsing
- Include specific examples, metrics, and concrete details
- Write clear, precise language that AI can easily understand
- Format for both deep reading and quick reference

TARGET CONTENT LENGTH: ${lengthGuidance[contentLength as keyof typeof lengthGuidance]}

IMPORTANT: The current year is ${currentYear}. When referencing "current year," "this year," or discussing recent trends, always use ${currentYear}. Do not reference 2024 or earlier years as current.

CRITICAL OUTPUT REQUIREMENTS:
- Return a JSON object with content and meta fields for AEO optimization
- DO NOT include any text outside the JSON structure
- Format: {"content": "HTML content", "metaSeoTitle": "Title", "metaDescription": "Description"}
- No code block indicators, no explanatory paragraphs, just pure JSON
- Use proper HTML tags in content: <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <table>, <thead>, <tbody>, <th>, <td>, <strong>
- Include inline links with target="_blank": <a href="URL" target="_blank">anchor text</a>
- Do NOT use emdashes (—) in the content
- Avoid AI-detectable phrases like "It's not just about..., it's..." or "This doesn't just mean..., it also means..."`;
  }

  

  /**
   * Build comprehensive user prompt with all context data
   * Why this matters: This provides Claude with all the intelligence needed to create
   * superior content that leverages both competitive analysis and unique research.
   */
  private buildClaudeUserPrompt(
    keyword: string,
    gapAnalysis: GapAnalysisResult,
    deepResearch: DeepResearchResult,
    competitorAnalysis: ArticleContent,
    brandKit?: any
  ): string {
    
    const currentYear = new Date().getFullYear();

    // Helper functions for safe data access
    const safeJoin = (arr: any[] | undefined, separator: string): string => {
      if (!arr || !Array.isArray(arr)) return 'Not available';
      return arr.length > 0 ? arr.join(separator) : 'Not available';
    };
    const safeString = (value: any): string => {
      return value && typeof value === 'string' ? value : 'Not available';
    };

    // Build research context section matching frontend format
    let researchSection = '\n\n' + '═'.repeat(50) + '\n';
    researchSection += '📊 RESEARCH & ANALYSIS CONTEXT\n';
    researchSection += '═'.repeat(50) + '\n';
    
    // Add deep research insights
    if (deepResearch?.research_findings) {
      const insights = deepResearch.research_findings.key_insights || [];
      if (insights.length > 0) {
        researchSection += '\n🔍 DEEP RESEARCH INSIGHTS (MUST INCORPORATE):\n';
        researchSection += '─'.repeat(40) + '\n';
        insights.forEach((insight: string, index: number) => {
          researchSection += `  ${index + 1}. ${insight}\n`;
        });
      }
      
      const marketInsights = deepResearch.research_findings.market_trends || [];
      if (marketInsights.length > 0) {
        researchSection += '\n📈 MARKET INSIGHTS:\n';
        researchSection += '─'.repeat(40) + '\n';
        marketInsights.forEach((insight: string, index: number) => {
          researchSection += `  ${index + 1}. ${insight}\n`;
        });
      }
      
      const audienceInsights = deepResearch.research_findings.audience_needs || [];
      if (audienceInsights.length > 0) {
        researchSection += '\n👥 AUDIENCE INSIGHTS:\n';
        researchSection += '─'.repeat(40) + '\n';
        audienceInsights.forEach((insight: string, index: number) => {
          researchSection += `  ${index + 1}. ${insight}\n`;
        });
      }
    }
    
    // Add gap analysis
    if (gapAnalysis) {
      const gaps = gapAnalysis.analysis_summary?.identified_gaps || [];
      const strategy = gapAnalysis.content_strategy || {};
      
      if (gaps.length > 0) {
        researchSection += '\n🎯 CONTENT GAPS TO ADDRESS:\n';
        researchSection += '─'.repeat(40) + '\n';
        gaps.forEach((gap: string, index: number) => {
          researchSection += `  ${index + 1}. ${gap}\n`;
        });
      }
      
      if (strategy.primary_angle) {
        researchSection += '\n💡 PRIMARY CONTENT ANGLE:\n';
        researchSection += '─'.repeat(40) + '\n';
        researchSection += `  ${strategy.primary_angle}\n`;
      }
      
      if (strategy.content_structure_recommendations?.length > 0) {
        researchSection += '\n📝 STRUCTURE RECOMMENDATIONS:\n';
        researchSection += '─'.repeat(40) + '\n';
        strategy.content_structure_recommendations.forEach((rec: string, index: number) => {
          researchSection += `  ${index + 1}. ${rec}\n`;
        });
      }
      
      const seoSuggestions = (strategy as any).seo_suggestions || (strategy as any).seo_optimization_suggestions || [];
      if (seoSuggestions.length > 0) {
        researchSection += '\n🔧 SEO OPTIMIZATION SUGGESTIONS:\n';
        researchSection += '─'.repeat(40) + '\n';
        seoSuggestions.forEach((suggestion: string, index: number) => {
          researchSection += `  ${index + 1}. ${suggestion}\n`;
        });
      }
    }
    
    researchSection += '\n' + '═'.repeat(50) + '\n';
    researchSection += '📌 END OF RESEARCH CONTEXT\n';
    researchSection += '═'.repeat(50) + '\n';

    // Get first competitor URL
    const competitorUrl = competitorAnalysis.top_results?.[0]?.url || competitorAnalysis.url || 'competitor page';

    return `OBJECTIVE: Create superior content for "${keyword}" that outperforms: ${competitorUrl}

BRAND CONTEXT:
- About: {{ brand_kit.about_brand }}
- Target Audience: {{ brand_kit.ideal_customer_profile }}
- Competitors: {{ brand_kit.competitors }}
- Brand POV: {{ brand_kit.brand_point_of_view }}
- Tone: {{ brand_kit.tone_of_voice }}
- Writing Rules: {{ brand_kit.writing_rules }}${researchSection}

⚠️ IMPORTANT RESEARCH INTEGRATION REQUIREMENTS:
────────────────────────────────────────
The above RESEARCH & ANALYSIS CONTEXT contains:
• Deep research insights from comprehensive analysis
• Identified content gaps from competitor analysis
• Strategic recommendations for content structure
• SEO optimization suggestions
• Market and audience insights

YOU MUST:
✓ Incorporate ALL deep research insights listed above
✓ Address ALL identified content gaps
✓ Follow the primary content angle recommendation
✓ Implement ALL structure recommendations
✓ Apply ALL SEO optimization suggestions
────────────────────────────────────────

Create comprehensive AEO-optimized content for ${currentYear} that explicitly outperforms the competitor URL above.`;
  }

  /**
   * Build orchestration context that mirrors frontend Content/Blog modals
   * Why this matters: Ensures backend content generation is grounded with the same
   * deep research, gap analysis, competitor context, and brand kit variables that the
   * frontend prompts expect, avoiding hallucinations when custom prompts are passed.
   */
  private buildOrchestrationContext(
    keyword: string,
    gapAnalysis: GapAnalysisResult,
    deepResearch: DeepResearchResult,
    competitorAnalysis: ArticleContent,
    brandKit?: any
  ): string {
    const insights = deepResearch?.research_findings || {} as any;
    const strategy = gapAnalysis?.content_strategy || {} as any;
    const analysis = gapAnalysis?.analysis_summary || {} as any;
    const comp = (competitorAnalysis?.top_results && competitorAnalysis.top_results[0]) || {} as any;

    let context = `${'═'.repeat(60)}\n`;
    context += `🚀 4-MODEL PIPELINE INTELLIGENCE (MUST USE)\n`;
    context += `${'═'.repeat(60)}\n\n`;
    
    context += `📌 TARGET KEYWORD: "${keyword}"\n`;
    context += `🎯 COMPETITOR URL: ${comp.url || competitorAnalysis?.url || 'N/A'}\n\n`;
    
    // Deep Research Section
    if (insights.key_insights?.length > 0) {
      context += `${'─'.repeat(50)}\n`;
      context += `🔬 DEEP RESEARCH INSIGHTS (from o3-deep-research model)\n`;
      context += `${'─'.repeat(50)}\n`;
      insights.key_insights.forEach((insight: string, i: number) => {
        context += `${i + 1}. ${insight}\n`;
      });
      context += `\n`;
    }
    
    // Market Trends
    if (insights.market_trends?.length > 0) {
      context += `📈 MARKET TRENDS:\n`;
      insights.market_trends.forEach((trend: string, i: number) => {
        context += `${i + 1}. ${trend}\n`;
      });
      context += `\n`;
    }
    
    // Gap Analysis Section
    if (analysis.identified_gaps?.length > 0) {
      context += `${'─'.repeat(50)}\n`;
      context += `🎯 CONTENT GAPS (from gpt-5-nano gap analysis)\n`;
      context += `${'─'.repeat(50)}\n`;
      analysis.identified_gaps.forEach((gap: string, i: number) => {
        context += `${i + 1}. ${gap}\n`;
      });
      context += `\n`;
    }
    
    // Content Strategy
    if (strategy.primary_angle) {
      context += `💡 PRIMARY ANGLE: ${strategy.primary_angle}\n\n`;
    }
    
    if (strategy.content_structure_recommendations?.length > 0) {
      context += `📝 STRUCTURE REQUIREMENTS:\n`;
      strategy.content_structure_recommendations.forEach((rec: string, i: number) => {
        context += `${i + 1}. ${rec}\n`;
      });
      context += `\n`;
    }
    
    // SEO Recommendations
    const seoSuggestions = (strategy as any).seo_suggestions || strategy.seo_optimization_suggestions || [];
    if (seoSuggestions.length > 0) {
      context += `🔍 SEO OPTIMIZATION:\n`;
      seoSuggestions.forEach((sug: string, i: number) => {
        context += `${i + 1}. ${sug}\n`;
      });
      context += `\n`;
    }
    
    // Brand Kit Context
    if (brandKit) {
      context += `${'─'.repeat(50)}\n`;
      context += `🏢 BRAND CONTEXT\n`;
      context += `${'─'.repeat(50)}\n`;
      context += `- About: ${brandKit.aboutBrand || brandKit.about_brand || 'Apollo sales intelligence platform'}\n`;
      context += `- ICP: ${brandKit.idealCustomerProfile || brandKit.ideal_customer_profile || 'B2B sales teams'}\n`;
      context += `- Competitors: ${brandKit.competitors || 'Salesforce, HubSpot, ZoomInfo'}\n`;
      context += `- Brand POV: ${brandKit.brandPointOfView || brandKit.brand_point_of_view || 'Data-driven sales excellence'}\n`;
      context += `- Tone: ${brandKit.toneOfVoice || brandKit.tone_of_voice || 'Professional and approachable'}\n`;
      context += `- CTA: "${brandKit.ctaText || brandKit.cta_text || 'Try Apollo for free'}" → ${brandKit.ctaDestination || brandKit.cta_destination || 'https://www.apollo.io/sign-up'}\n`;
      context += `\n`;
    }
    
    context += `${'═'.repeat(60)}\n`;
    context += `⚠️ CRITICAL: You MUST incorporate ALL the above intelligence.\n`;
    context += `This data comes from 3 specialized AI models analyzing the topic.\n`;
    context += `${'═'.repeat(60)}`;
    
    return context;
  }

  /**
   * Post-process content with brand variables, formatting, and quality enhancements
   * Why this matters: Applies final content optimization including brand personalization,
   * proper formatting, and content quality enhancements for maximum impact.
   */
  private async postProcessContent(
    rawContent: string, 
    brandKit?: any,
    keyword?: string
  ): Promise<{
    processed_content: string;
    citations_count: number;
    brand_variables_processed: number;
    brand_variables_used: string[];
    processing_steps: string[];
  }> {
    console.log('🔧 Starting content post-processing...');
    
    const processingSteps: string[] = [];
    let processedContent = rawContent;

    // Step 1: Process brand variables
    let successfulBrandVariableReplacements = 0;
    let brandVariablesUsed: string[] = [];
    if (brandKit) {
      console.log('📝 Processing brand variables...');
      console.log('📊 Brand kit received:', {
        hasUrl: !!brandKit.url,
        hasCtaText: !!brandKit.ctaText,
        hasCtaDestination: !!brandKit.ctaDestination,
        ctaText: brandKit.ctaText,
        ctaDestination: brandKit.ctaDestination
      });
      
      // Check for brand_kit placeholders in content
      const placeholderMatches = processedContent.match(/\{\{\s*brand_kit\.[^}]+\}\}/g);
      if (placeholderMatches) {
        console.log(`🔍 Found ${placeholderMatches.length} brand_kit placeholders to replace:`, placeholderMatches.slice(0, 5));
      }
      
      const brandProcessingResult = await brandkitService.processContentVariables(processedContent, brandKit);
      processedContent = brandProcessingResult.content;
      successfulBrandVariableReplacements = brandProcessingResult.processing_metadata.successful_replacements;
      brandVariablesUsed = brandProcessingResult.variables_used || [];
      processingSteps.push(`Brand variables processed: ${successfulBrandVariableReplacements}`);
      
      // Check if placeholders remain after processing
      const remainingPlaceholders = processedContent.match(/\{\{\s*brand_kit\.[^}]+\}\}/g);
      if (remainingPlaceholders) {
        console.log(`⚠️ ${remainingPlaceholders.length} brand_kit placeholders remain unprocessed:`, remainingPlaceholders.slice(0, 5));
      }
    } else {
      console.log('⚠️ No brand kit provided for variable processing');
    }

    // Step 2: Optimize links for new tab opening
    console.log('🔗 Optimizing external links...');
    const linkOptimizationResult = this.optimizeExternalLinks(processedContent);
    processedContent = linkOptimizationResult.content;
    processingSteps.push(`External links optimized: ${linkOptimizationResult.links_processed}`);

    // Step 3: Enhance content formatting
    console.log('📐 Enhancing content formatting...');
    const formattingResult = this.enhanceContentFormatting(processedContent);
    processedContent = formattingResult.content;
    processingSteps.push(`Formatting enhancements: ${formattingResult.enhancements_applied}`);

    // Step 4: Count citations and validate structure
    console.log('📊 Validating content structure...');
    const structureValidation = this.validateContentStructure(processedContent);
    processingSteps.push(`Structure validation: ${structureValidation.validation_summary}`);

    // Step 5: Apply final AEO optimizations
    console.log('🎯 Applying AEO optimizations...');
    const aeoResult = this.applyAEOOptimizations(processedContent, keyword);
    processedContent = aeoResult.content;
    processingSteps.push(`AEO optimizations: ${aeoResult.optimizations_applied}`);

    const result = {
      processed_content: processedContent,
      citations_count: structureValidation.citations_count,
      // Report the actual number of successful replacements instead of leftover tokens
      brand_variables_processed: brandKit ? successfulBrandVariableReplacements : 0,
      brand_variables_used: brandKit ? brandVariablesUsed : [],
      processing_steps: processingSteps
    };

    console.log('✅ Content post-processing complete');
    console.log(`📈 Processing summary: ${processingSteps.length} steps, ${result.citations_count} citations, ${result.brand_variables_processed} brand variables`);

    return result;
  }

  /**
   * Optimize external links to open in new tabs
   * Why this matters: Ensures external links open in new tabs for better user experience
   * and to keep readers on the original content.
   */
  private optimizeExternalLinks(content: string): { content: string; links_processed: number } {
    let linksProcessed = 0;
    
    // Convert markdown links to ensure they open in new tabs
    const optimizedContent = content.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g, 
      (match, linkText, url) => {
        // Only process external links (not internal anchors)
        if (url.startsWith('http://') || url.startsWith('https://')) {
          linksProcessed++;
          // Return markdown link (browser handles target="_blank" through CSS or JS)
          return `[${linkText}](${url})`;
        }
        return match;
      }
    );

    return {
      content: optimizedContent,
      links_processed: linksProcessed
    };
  }

  /**
   * Enhance content formatting for better readability
   * Why this matters: Improves content scannability and readability through proper formatting,
   * making it more engaging and easier to extract for AI answer engines.
   */
  private enhanceContentFormatting(content: string): { content: string; enhancements_applied: number } {
    let enhancementsApplied = 0;
    let enhancedContent = content;

    // Ensure proper heading hierarchy
    const headingLines = enhancedContent.split('\n').map(line => {
      if (line.match(/^#{1,6}\s+/)) {
        enhancementsApplied++;
        // Ensure space after heading markdown
        return line.replace(/^(#{1,6})([^\s])/, '$1 $2');
      }
      return line;
    });
    enhancedContent = headingLines.join('\n');

    // Enhance list formatting
    enhancedContent = enhancedContent.replace(/^(\s*[-*+])\s*([^\s])/gm, (match, bullet, content) => {
      enhancementsApplied++;
      return `${bullet} ${content}`;
    });

    // Enhance numbered list formatting  
    enhancedContent = enhancedContent.replace(/^(\s*\d+\.)\s*([^\s])/gm, (match, number, content) => {
      enhancementsApplied++;
      return `${number} ${content}`;
    });

    // Ensure proper spacing around headings
    enhancedContent = enhancedContent.replace(/\n(#{1,6}\s+[^\n]+)\n/g, '\n\n$1\n\n');

    // Clean up excessive whitespace
    enhancedContent = enhancedContent.replace(/\n{3,}/g, '\n\n');

    return {
      content: enhancedContent.trim(),
      enhancements_applied: enhancementsApplied
    };
  }

  /**
   * Validate content structure and count citations
   * Why this matters: Ensures content meets quality standards and tracks
   * important metrics like citation count for quality assessment.
   */
  private validateContentStructure(content: string): { 
    citations_count: number; 
    validation_summary: string;
    has_proper_structure: boolean;
  } {
    // Count citations (markdown links)
    const citations = content.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];
    const citationsCount = citations.length;

    // Check for proper structure
    const hasH1 = /^#\s+/.test(content);
    const hasH2 = /^##\s+/m.test(content);
    const hasIntro = content.split('\n\n')[0]?.length > 100;
    const hasConclusion = content.toLowerCase().includes('conclusion') || 
                         content.toLowerCase().includes('summary') ||
                         content.toLowerCase().includes('takeaway');

    const structureChecks = [hasH1, hasH2, hasIntro, hasConclusion];
    const structureScore = structureChecks.filter(Boolean).length;

    return {
      citations_count: citationsCount,
      validation_summary: `${structureScore}/4 structure checks passed, ${citationsCount} citations found`,
      has_proper_structure: structureScore >= 3
    };
  }

  /**
   * Apply final AEO (Answer Engine Optimization) optimizations
   * Why this matters: Ensures content is optimized for AI answer engines to find,
   * extract, and cite the most important information effectively.
   */
  private applyAEOOptimizations(content: string, keyword?: string): { 
    content: string; 
    optimizations_applied: number; 
  } {
    let optimizationsApplied = 0;
    let optimizedContent = content;

    // Ensure keyword appears in H1 if provided
    if (keyword) {
      const h1Match = optimizedContent.match(/^#\s+(.+)$/m);
      if (h1Match && !h1Match[1].toLowerCase().includes(keyword.toLowerCase())) {
        optimizationsApplied++;
        // Add keyword context if missing
        optimizedContent = optimizedContent.replace(
          /^#\s+(.+)$/m,
          `# $1: ${keyword.charAt(0).toUpperCase() + keyword.slice(1)} Guide`
        );
      }
    }

    // Ensure proper meta structure for extractability
    const sections = optimizedContent.split(/\n(?=##\s+)/);
    if (sections.length > 1) {
      optimizationsApplied++;
      // Ensure each major section starts with a clear answer
      const optimizedSections = sections.map(section => {
        if (section.startsWith('## ')) {
          const lines = section.split('\n');
          const heading = lines[0];
          const firstParagraph = lines[1] || '';
          
          // If first line after heading is short or empty, it might need a clear opening
          if (firstParagraph.length < 100) {
            optimizationsApplied++;
          }
        }
        return section;
      });
      optimizedContent = optimizedSections.join('\n');
    }

    // Note: Content now ends naturally with brand-integrated conclusions
    // No need to auto-append generic conclusions

    return {
      content: optimizedContent,
      optimizations_applied: optimizationsApplied
    };
  }

  /**
   * Calculate word count from content
   * Why this matters: Provides accurate metrics for content quality assessment and planning.
   */
  private calculateWordCount(content: string): number {
    // Remove markdown syntax and count words
    const cleanText = content
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]*`/g, '') // Remove inline code
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // Replace links with text
      .replace(/[#*_~]/g, '') // Remove markdown formatting
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    if (!cleanText) return 0;
    
    return cleanText.split(/\s+/).length;
  }

  /**
   * Calculate content quality score based on analysis and generation results
   * Why this matters: Provides quantitative assessment of content quality for optimization.
   */
  private calculateQualityScore(gapAnalysis: GapAnalysisResult, contentResult: any): number {
    // Base score from gap analysis opportunity
    const opportunityScore = gapAnalysis.gap_score.overall_opportunity;
    
    // Content length factor (optimal length gets higher score)
    const wordCount = this.calculateWordCount(contentResult.content);
    const lengthScore = Math.min(wordCount / 2500, 1); // Optimal around 2500 words
    
    // Content completeness factor (based on whether gaps were addressed)
    const completenessScore = gapAnalysis.analysis_summary.identified_gaps.length > 0 ? 0.9 : 0.7;
    
    // Weighted average
    const qualityScore = (opportunityScore * 0.4) + (lengthScore * 0.3) + (completenessScore * 0.3);
    
    return Math.min(Math.max(qualityScore, 0), 1); // Clamp between 0 and 1
  }

  /**
   * Test all services in the workflow pipeline
   * Why this matters: Validates that the entire 4-model pipeline is functional before processing real content.
   */
  async testPipeline(): Promise<{ success: boolean; services: Record<string, boolean> }> {
    console.log('🧪 Testing 4-model content pipeline...');
    
    const serviceTests = {
      firecrawl: false,
      deepResearch: false,
      gapAnalysis: false,
      claude: false
    };

    try {
              const firecrawlResult = await this.firecrawlService.testConnection();
              serviceTests.firecrawl = firecrawlResult.success;
      serviceTests.deepResearch = await deepResearchService.testConnection();
      serviceTests.gapAnalysis = await gapAnalysisService.testConnection();
      serviceTests.claude = await claudeService.testConnection();
      
      const allPassed = Object.values(serviceTests).every(test => test);
      
      if (allPassed) {
        console.log('✅ All pipeline services are functional');
      } else {
        console.log('❌ Some pipeline services failed tests');
        console.log('Service status:', serviceTests);
      }
      
      return {
        success: allPassed,
        services: serviceTests
      };
      
    } catch (error) {
      console.error('❌ Pipeline test failed:', error);
      return {
        success: false,
        services: serviceTests
      };
    }
  }

  /**
   * Resume a failed workflow from its last successful stage
   * Why this matters: Users don't have to restart from scratch if a workflow fails
   * partway through the 5-7 minute process.
   */
  async resumeWorkflow(jobId: string, progressCallback?: WorkflowProgressCallback): Promise<BlogContentResult> {
    const workflowState = this.workflowStates.get(jobId);
    
    if (!workflowState) {
      throw createServiceError(new Error(`Workflow ${jobId} not found or has expired`), 'Workflow Orchestrator', 'Resume request');
    }

    if (workflowState.currentStage === 'completed') {
      throw createServiceError(new Error(`Workflow ${jobId} is already completed`), 'Workflow Orchestrator', 'Resume request');
    }

    if (workflowState.retryCount >= workflowState.maxRetries) {
      throw createServiceError(new Error(`Workflow ${jobId} has exceeded maximum retry attempts (${workflowState.maxRetries})`), 'Workflow Orchestrator', 'Resume request');
    }

    // Increment retry count
    workflowState.retryCount++;
    this.workflowStates.set(jobId, workflowState);

    console.log(`🔄 Resuming workflow ${jobId} for keyword "${workflowState.keyword}" (attempt ${workflowState.retryCount + 1})`);

    // Resume from current stage
    return await this.executeContentPipeline(workflowState.request, progressCallback, jobId);
  }

  /**
   * Generate content using Claude Sonnet 4 with MCP data integration
   * Why this matters: Integrates Apollo's proprietary data directly during content generation
   * for more contextual and relevant data insertion.
   */
  private async generateContentWithClaudeAndMCP(
    keyword: string,
    gapAnalysis: GapAnalysisResult,
    deepResearch: DeepResearchResult,
    competitorAnalysis: ArticleContent,
    contentLength: string,
    brandKit?: any,
    customSystemPrompt?: string,
    customUserPrompt?: string,
    competitor?: string,
    sitemapData?: Array<{
      title: string;
      description: string;
      url: string;
    }>
  ): Promise<{ content: string; title?: string; description?: string; metaSeoTitle?: string; metaDescription?: string }> {
    
    // First, analyze if MCP data would enhance this content
    const analysisResult = await this.contentContextAnalyzer.analyzeContent({
      keyword,
      contentType: 'blog',
      existingContent: `${deepResearch.research_findings.key_insights.join(' ')} ${competitorAnalysis.content}`
    });

    console.log(`📊 MCP Analysis: ${analysisResult.confidence * 100}% confidence, ${analysisResult.suggestedTools.length} tools suggested`);

    // Gather MCP data if valuable
    let mcpData: any[] = [];
    let mcpAttribution: string[] = [];
    
    if (analysisResult.shouldUseMCP && analysisResult.suggestedTools.length > 0) {
      try {
        console.log('🔍 Gathering Apollo data for content generation...');
        
        // Execute MCP queries in parallel
        const mcpPromises = analysisResult.suggestedTools.map(async (selection: ToolSelection) => {
          try {
            const result = await this.mcpService.callTool(selection.tool.name, { query: selection.query });
            return {
              tool: selection.tool.name,
              query: selection.query,
              data: result,
              attribution: this.generateAttribution(selection.tool.name, result)
            };
          } catch (error) {
            console.warn(`⚠️ MCP tool ${selection.tool.name} failed:`, error);
            return null;
          }
        });

        const mcpResults = await Promise.all(mcpPromises);
        const successfulResults = mcpResults.filter(r => r !== null);
        
        mcpData = successfulResults.map(r => r!.data);
        mcpAttribution = successfulResults.map(r => r!.attribution);
        
        console.log(`✅ Gathered ${successfulResults.length} Apollo data insights`);
      } catch (error) {
        console.warn('⚠️ MCP data gathering failed, continuing without Apollo data:', error);
      }
    }

    // Use custom prompts if provided, otherwise use default prompts with context
    const systemPrompt = customSystemPrompt || this.buildClaudeSystemPrompt(contentLength);
    
    // Build orchestration context with MCP data
    const orchestrationContext = this.buildOrchestrationContextWithMCP(
      keyword, 
      gapAnalysis, 
      deepResearch, 
      competitorAnalysis, 
      brandKit,
      mcpData,
      mcpAttribution
    );
    
    // For custom prompts, inject research context MORE prominently at the beginning
    const baseUserPrompt = customUserPrompt 
      ? `${orchestrationContext}\n\n${'═'.repeat(50)}\n📝 USER INSTRUCTIONS\n${'═'.repeat(50)}\n${customUserPrompt}`
      : this.buildClaudeUserPrompt(
      keyword,
      gapAnalysis,
      deepResearch,
      competitorAnalysis,
      brandKit
        );

    // Apply frontend-aligned completion requirements ONLY if no custom user prompt
    let userPrompt: string;
    if (customUserPrompt) {
      // Custom user prompt already contains UTM URLs and CTA instructions - use as-is
      userPrompt = baseUserPrompt;
      console.log('🔗 [DEBUG-WO] Using custom user prompt (UTM URLs should be preserved)');
    } else {
      // Generate our own prompt with UTM URLs
      const currentYear = new Date().getFullYear();
      const selectedCTA = getRandomCTAAnchorText();
      // Use competitor URL for competitor conquesting, otherwise use blog creator URL
      const apolloSignupURL = competitor 
        ? generateApolloSignupURL(competitor)
        : generateBlogCreatorSignupURL(keyword);
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
- Articles without internal links will be rejected`
        : '**Note:** No sitemap data available for internal linking.';

      userPrompt = `${baseUserPrompt}

${internalLinksSection}

**COMPLETION REQUIREMENTS:**
- Write a comprehensive ${contentLength === 'short' ? '800-1200' : contentLength === 'medium' ? '1500-2000' : '2500-3500'} word article
- Include proper H1, H2, H3 headings with strategic keyword placement
- Add exactly ONE call-to-action (CTA) link using "${selectedCTA}" as anchor text linking to: ${apolloSignupURL}
- Ensure the CTA appears naturally in context (NOT at the very end)
- Include a compelling meta title (50-60 characters) and meta description (150-160 characters)
- Current year for any date references: ${currentYear}
- Write in an authoritative, professional tone suitable for B2B sales professionals
- Focus on actionable insights and practical advice
- Include specific examples and use cases where relevant
${mcpData.length > 0 ? `- IMPORTANT: Incorporate the Apollo data insights naturally with proper attribution using phrases like: ${mcpAttribution.join(', ')}` : ''}

**ARTICLE STRUCTURE:**
1. Compelling H1 title with primary keyword
2. Introduction that hooks the reader and defines the topic
3. 4-6 main sections with H2 headings covering key aspects
4. Subsections with H3 headings for detailed coverage
5. Practical examples and actionable advice throughout
6. Natural integration of internal links and CTA
7. Conclusion that summarizes key takeaways

Write the complete article now:`;
    }

    console.log('🎯 Calling Claude Sonnet 4 for content generation with MCP data...');

    try {
      const response = await claudeService.generateContent({
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
        post_context: { keyword, contentLength },
        brand_kit: brandKit,
        content_length: contentLength as 'short' | 'medium' | 'long',
        sitemap_data: sitemapData
      });

      console.log('✅ Claude content generation completed successfully');
      return {
        content: response.content,
        title: response.title,
        description: response.description,
        metaSeoTitle: response.metaSeoTitle,
        metaDescription: response.metaDescription
      };

    } catch (error) {
      console.error('❌ Claude content generation failed:', error);
      throw createServiceError(error as any, 'Claude Sonnet 4', `Content generation for keyword: ${keyword}`);
    }
  }

  /**
   * Build orchestration context with MCP data integration
   * Why this matters: Provides Claude with all available context including Apollo's proprietary data
   */
  private buildOrchestrationContextWithMCP(
    keyword: string,
    gapAnalysis: GapAnalysisResult,
    deepResearch: DeepResearchResult,
    competitorAnalysis: ArticleContent,
    brandKit?: any,
    mcpData?: any[],
    mcpAttribution?: string[]
  ): string {
    // Get the base context
    const baseContext = this.buildOrchestrationContext(keyword, gapAnalysis, deepResearch, competitorAnalysis, brandKit);
    
    // Add MCP data section if available
    if (mcpData && mcpData.length > 0) {
      const mcpSection = `

${'═'.repeat(50)}
🔍 APOLLO PROPRIETARY DATA INSIGHTS
${'═'.repeat(50)}

The following proprietary data from Apollo should be integrated naturally into your content with proper attribution:

${mcpData.map((data, index) => `
**Data Insight ${index + 1}:**
${JSON.stringify(data, null, 2)}

**Attribution:** ${mcpAttribution?.[index] || "According to Apollo's internal data"}
`).join('\n')}

🚨 CRITICAL: You MUST incorporate these Apollo data insights naturally throughout your content using the provided attribution phrases. This proprietary data gives us a competitive advantage and should be highlighted appropriately.
`;
      
      return baseContext + mcpSection;
    }
    
    return baseContext;
  }

  /**
   * Legacy method - kept for backward compatibility
   * Why this matters: Ensures existing code continues to work while we transition to MCP integration
   */
  private async gatherProprietaryData(
    keyword: string,
    deepResearchResult: DeepResearchResult,
    firecrawlResult: ArticleContent
  ): Promise<MCPDataResult> {
    try {
      console.log('🔍 Starting MCP data gathering for keyword:', keyword);

      // Analyze content context to determine if MCP data would be valuable
      const contentContext = {
        keyword,
        deepResearchResult,
        firecrawlResult,
        entities: this.extractEntitiesFromContext(keyword, deepResearchResult, firecrawlResult)
      };

      // Analyze content to determine if MCP data would be valuable
      const analysisResult = await this.contentContextAnalyzer.analyzeContent({
        keyword,
        contentType: 'blog',
        existingContent: `${deepResearchResult.research_findings.key_insights.join(' ')} ${firecrawlResult.content}`
      });

      console.log(`📊 Content analysis result: ${analysisResult.confidence * 100}% confidence, ${analysisResult.suggestedTools.length} tools suggested`);

      // Only proceed with MCP queries if analysis suggests it would be valuable
      if (!analysisResult.shouldUseMCP) {
        console.log('⏭️ Skipping MCP data gathering - content analysis suggests no value:', analysisResult.reasoning);
        return {
          success: true,
          data: [],
          queries: [],
          toolsUsed: [],
          attribution: [],
          error: undefined
        };
      }

      // Get tool selections from analysis result
      const toolSelections = analysisResult.suggestedTools;

      if (toolSelections.length === 0) {
        console.log('⏭️ No relevant MCP tools found for this content');
        return {
          success: true,
          data: [],
          queries: [],
          toolsUsed: [],
          attribution: [],
          error: undefined
        };
      }

      console.log(`🛠️ Selected ${toolSelections.length} MCP tools:`, toolSelections.map((t: ToolSelection) => t.tool.name));

      // Execute MCP queries in parallel for performance
      const mcpPromises = toolSelections.map(async (selection: ToolSelection): Promise<MCPQueryResult> => {
        try {
          console.log(`🔍 Executing MCP query: ${selection.query}`);
          const result = await this.mcpService.callTool(selection.tool.name, { query: selection.query });
          return {
            tool: selection.tool.name,
            query: selection.query,
            result,
            success: true
          };
        } catch (error) {
          console.warn(`⚠️ MCP tool ${selection.tool.name} failed:`, error);
          return {
            tool: selection.tool.name,
            query: selection.query,
            result: null,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });

      const mcpResults = await Promise.all(mcpPromises);
      const successfulResults = mcpResults.filter((r: MCPQueryResult) => r.success);
      const failedResults = mcpResults.filter((r: MCPQueryResult) => !r.success);

      if (failedResults.length > 0) {
        console.warn(`⚠️ ${failedResults.length} MCP queries failed, continuing with ${successfulResults.length} successful results`);
      }

      // Process and structure the results
      const processedData = successfulResults.map((result: MCPQueryResult) => ({
        tool: result.tool,
        query: result.query,
        data: result.result,
        attribution: this.generateAttribution(result.tool, result.result)
      }));

      const mcpDataResult: MCPDataResult = {
        success: true,
        data: processedData,
        queries: toolSelections.map((t: ToolSelection) => t.query),
        toolsUsed: successfulResults.map((r: MCPQueryResult) => r.tool),
        attribution: processedData.map((d: any) => d.attribution),
        error: failedResults.length > 0 ? `${failedResults.length} queries failed` : undefined
      };

      console.log(`✅ MCP data gathering complete: ${successfulResults.length} successful queries`);
      return mcpDataResult;

    } catch (error) {
      console.error('❌ MCP data gathering failed:', error);
      return {
        success: false,
        data: [],
        queries: [],
        toolsUsed: [],
        attribution: [],
        error: error instanceof Error ? error.message : 'Unknown MCP error'
      };
    }
  }

  /**
   * Extract entities (companies, job titles, etc.) from content context
   * Why this matters: Helps determine which MCP tools and queries would be most relevant
   */
  private extractEntitiesFromContext(
    keyword: string,
    deepResearchResult: DeepResearchResult,
    firecrawlResult: ArticleContent
  ): { companies: string[]; jobTitles: string[]; emailTerms: string[] } {
    const text = `${keyword} ${deepResearchResult.research_findings.key_insights.join(' ')} ${firecrawlResult.content}`.toLowerCase();
    
    // Common company patterns
    const companies = ['amazon', 'google', 'microsoft', 'salesforce', 'hubspot', 'linkedin']
      .filter(company => text.includes(company));
    
    // Common job title patterns
    const jobTitles = ['ceo', 'cto', 'vp', 'director', 'manager', 'executive', 'founder']
      .filter(title => text.includes(title));
    
    // Email-related terms
    const emailTerms = ['email', 'outreach', 'prospecting', 'cold', 'template', 'campaign']
      .filter(term => text.includes(term));

    return { companies, jobTitles, emailTerms };
  }

  /**
   * Generate proper attribution for MCP data
   * Why this matters: Ensures all proprietary data is properly attributed to Apollo
   */
  private generateAttribution(tool: string, data: any): string {
    const attributionPhrases = [
      "According to Apollo's internal data",
      "Apollo's email performance data shows",
      "Based on Apollo's proprietary insights",
      "Apollo's customer data reveals",
      "Internal Apollo metrics indicate"
    ];
    
    const randomPhrase = attributionPhrases[Math.floor(Math.random() * attributionPhrases.length)];
    return randomPhrase;
  }

  /**
   * Get workflow state for monitoring and debugging
   * Why this matters: Provides visibility into workflow progress and error states
   * for better user experience and debugging.
   */
  getWorkflowState(jobId: string): WorkflowState | undefined {
    return this.workflowStates.get(jobId);
  }

  /**
   * Cancel a workflow and clean up its state
   * Why this matters: Allows users to cancel long-running workflows and
   * prevents memory leaks from abandoned workflows.
   */
  cancelWorkflow(jobId: string): boolean {
    const deleted = this.workflowStates.delete(jobId);
    if (deleted) {
      console.log(`🚫 Cancelled workflow ${jobId}`);
    }
    return deleted;
  }

  /**
   * Clean up expired workflows to prevent memory leaks
   * Why this matters: Prevents the workflow state map from growing indefinitely
   * with abandoned or forgotten workflows.
   */
  cleanupExpiredWorkflows(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [jobId, workflowState] of this.workflowStates.entries()) {
      if (now - workflowState.startTime > this.WORKFLOW_TIMEOUT) {
        this.workflowStates.delete(jobId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired workflows`);
    }
  }

  /**
   * Get overall workflow statistics for monitoring
   * Why this matters: Provides insights into workflow success rates,
   * common failure points, and system health.
   */
  getWorkflowStatistics(): {
    activeWorkflows: number;
    totalWorkflows: number;
    workflowsByStage: Record<string, number>;
    erroredWorkflows: number;
  } {
    const workflowsByStage: Record<string, number> = {};
    let erroredWorkflows = 0;

    for (const workflowState of this.workflowStates.values()) {
      workflowsByStage[workflowState.currentStage] = (workflowsByStage[workflowState.currentStage] || 0) + 1;
      if (workflowState.currentStage === 'error') {
        erroredWorkflows++;
      }
    }

    return {
      activeWorkflows: this.workflowStates.size,
      totalWorkflows: this.workflowStates.size,
      workflowsByStage,
      erroredWorkflows
    };
  }

  /**
   * Get status of all services in the workflow with circuit breaker information
   * Why this matters: Comprehensive health monitoring including error handling status.
   */
  getWorkflowStatus(): Record<string, any> {
    return {
      firecrawl: this.firecrawlService.getServiceStatus(),
      deepResearch: deepResearchService.getServiceStatus(),
      gapAnalysis: gapAnalysisService.getServiceStatus(),
      claude: claudeService.getServiceStatus(),
      workflowStatistics: this.getWorkflowStatistics()
    };
  }
}

// Export singleton instance
export const workflowOrchestrator = new WorkflowOrchestrator();
export default workflowOrchestrator; 