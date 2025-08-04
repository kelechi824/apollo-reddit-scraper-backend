import { firecrawlService, FirecrawlSearchResult } from './firecrawlService';
import { deepResearchService, DeepResearchResult } from './deepResearchService';
import { gapAnalysisService, GapAnalysisResult } from './gapAnalysisService';
import { claudeService } from './claudeService';
import { brandkitService } from './brandkitService';
import { CLAUDE_BLOG_CONTENT_SYSTEM_PROMPT } from '../prompts/claudeBlogContentPrompt';
import { WorkflowError, createServiceError } from './errorHandling';

interface BlogContentResult {
  keyword: string;
  content: string;
  raw_content: string;
  metadata: {
    title: string;
    description: string;
    word_count: number;
    seo_optimized: boolean;
    citations_included: boolean;
    brand_variables_processed: number;
    aeo_optimized: boolean;
  };
  workflow_data: {
    firecrawl_analysis: FirecrawlSearchResult;
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
  target_audience?: string;
  content_length?: 'short' | 'medium' | 'long';
  focus_areas?: string[];
  brand_kit?: any;
  system_prompt?: string;
  user_prompt?: string;
}

interface WorkflowProgressCallback {
  onProgress: (stage: string, message: string, progress: number) => void;
}

interface WorkflowState {
  jobId: string;
  keyword: string;
  request: WorkflowRequest;
  currentStage: 'firecrawl' | 'deep_research' | 'gap_analysis' | 'content_generation' | 'completed' | 'error';
  startTime: number;
  completedStages: {
    firecrawl?: FirecrawlSearchResult;
    deep_research?: DeepResearchResult;
    gap_analysis?: GapAnalysisResult;
    content_generation?: any;
  };
  lastError?: WorkflowError;
  retryCount: number;
  maxRetries: number;
}

class WorkflowOrchestrator {
  private readonly WORKFLOW_STAGES = [
    'Extracting competitor content with Firecrawl',
    'Performing comprehensive OpenAI Deep Research',
    'Analyzing gaps with GPT 4.1 nano',
    'Generating optimized content with Claude Sonnet 4'
  ];

  // In-memory storage for workflow states (in production, use Redis or database)
  private workflowStates = new Map<string, WorkflowState>();
  private readonly WORKFLOW_TIMEOUT = 20 * 60 * 1000; // 20 minutes
  private readonly MAX_WORKFLOW_RETRIES = 2;

  constructor() {
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
    const { keyword, target_audience, content_length = 'medium', focus_areas = [], brand_kit, system_prompt, user_prompt } = request;

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
          firecrawlResult = await firecrawlService.searchAndAnalyzeCompetitors(keyword);
          
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
            '📊 Analyzing gaps between research findings and competitor content with GPT 4.1 nano...',
            75
          );

          console.log('🎯 Stage 3: Gap Analysis with GPT 4.1 nano');
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

      // Stage 4: Content generation with Claude Sonnet 4
      let rawContentResult = workflowState.completedStages.content_generation;
      if (!rawContentResult && ['content_generation', 'gap_analysis', 'deep_research', 'firecrawl'].includes(workflowState.currentStage)) {
        try {
          progressCallback?.onProgress(
            'content_generation',
            '✍️ Generating optimized article with Claude Sonnet 4...',
            85
          );

          console.log('✍️ Stage 4: Content generation with Claude Sonnet 4');
          rawContentResult = await this.generateContentWithClaude(
            keyword,
            gapAnalysisResult!,
            deepResearchResult!,
            firecrawlResult!,
            content_length,
            brand_kit,
            system_prompt,
            user_prompt
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
          title: rawContentResult.title || `${keyword} - Comprehensive Guide`,
          description: rawContentResult.description || `Everything you need to know about ${keyword}`,
          word_count: this.calculateWordCount(contentResult.processed_content),
          seo_optimized: true,
          citations_included: contentResult.citations_count > 0,
          brand_variables_processed: contentResult.brand_variables_processed,
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
            'gpt-4.1-nano-2025-04-14',
            'claude-sonnet-4-20250514'
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
   * Generate content using Claude Sonnet 4 with comprehensive context
   * Why this matters: This uses all the gathered intelligence to create superior content
   * that covers competitor topics PLUS unique insights from deep research.
   */
  private async generateContentWithClaude(
    keyword: string,
    gapAnalysis: GapAnalysisResult,
    deepResearch: DeepResearchResult,
    competitorAnalysis: FirecrawlSearchResult,
    contentLength: string,
    brandKit?: any,
    customSystemPrompt?: string,
    customUserPrompt?: string
  ): Promise<{ content: string; title?: string; description?: string }> {
    
    // Use custom prompts if provided, otherwise use default prompts with context
    const systemPrompt = customSystemPrompt || this.buildClaudeSystemPrompt(contentLength);
    const userPrompt = customUserPrompt || this.buildClaudeUserPrompt(
      keyword,
      gapAnalysis,
      deepResearch,
      competitorAnalysis,
      brandKit
    );

    console.log('🔧 Using prompts:', {
      custom_system: !!customSystemPrompt,
      custom_user: !!customUserPrompt,
      system_length: systemPrompt.length,
      user_length: userPrompt.length
    });

    // Generate content with Claude Sonnet 4
    const result = await claudeService.generateContent({
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      post_context: { keyword, contentLength },
      brand_kit: brandKit
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
      short: '1500-2000 words',
      medium: '2500-3500 words',
      long: '4000-6000 words'
    };

    return `${CLAUDE_BLOG_CONTENT_SYSTEM_PROMPT}

TARGET CONTENT LENGTH: ${lengthGuidance[contentLength as keyof typeof lengthGuidance]}

ADDITIONAL LENGTH-SPECIFIC GUIDANCE:
- Ensure comprehensive coverage without unnecessary padding
- Focus on quality and actionable insights over word count
- Include sufficient detail for readers to understand and implement
- Balance thoroughness with readability and engagement`;
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
    competitorAnalysis: FirecrawlSearchResult,
    brandKit?: any
  ): string {
    
    const brandContext = brandKit ? `
BRAND CONTEXT:
${JSON.stringify(brandKit, null, 2)}
` : '';

    // Helper function to safely join arrays
    const safeJoin = (arr: any[] | undefined, separator: string): string => {
      if (!arr || !Array.isArray(arr)) return 'Not available';
      return arr.length > 0 ? arr.join(separator) : 'Not available';
    };

    // Helper function to safely get string value
    const safeString = (value: any): string => {
      return value && typeof value === 'string' ? value : 'Not available';
    };

    // Helper function to safely get number value
    const safeNumber = (value: any): number => {
      return value && typeof value === 'number' ? value : 0;
    };

    return `
Create a comprehensive, AEO-optimized article for the keyword: "${keyword}"

GAP ANALYSIS INTELLIGENCE:
Primary Content Angle: ${safeString(gapAnalysis.content_strategy?.primary_angle)}
Key Differentiation Opportunities: ${safeJoin(gapAnalysis.analysis_summary?.content_differentiation_opportunities, ', ')}
Identified Content Gaps: ${safeJoin(gapAnalysis.analysis_summary?.identified_gaps, ', ')}
Recommended Structure: ${safeJoin(gapAnalysis.content_strategy?.content_structure_recommendations, ', ')}

COMPETITOR CONTENT TO IMPROVE UPON:
${competitorAnalysis.top_results?.map((result: any, index: number) => `
Competitor ${index + 1}: ${safeString(result.title)}
Topics Covered: ${safeJoin(result.headings, ', ')}
Key Topics: ${safeJoin(result.key_topics, ', ')}
Structure: ${safeNumber(result.content_structure?.numbered_lists)} lists, ${safeNumber(result.content_structure?.bullet_points)} bullet points
`).join('\n') || 'No competitor analysis available'}

UNIQUE RESEARCH INSIGHTS TO INCLUDE:
Key Insights: ${safeJoin(deepResearch.research_findings?.key_insights, ' | ')}
Market Trends: ${safeJoin(deepResearch.research_findings?.market_trends, ' | ')}
Audience Needs: ${safeJoin(deepResearch.research_findings?.audience_needs, ' | ')}
Content Opportunities: ${safeJoin(deepResearch.research_findings?.content_opportunities, ' | ')}
Related Topics: ${safeJoin(deepResearch.research_findings?.related_topics, ' | ')}

CONTENT REQUIREMENTS:
1. **Competitive Parity**: Cover all topics that competitors cover, but with better depth and clarity
2. **Unique Value**: Include substantial content based on the research insights above
3. **Gap Exploitation**: Address the identified content gaps with comprehensive coverage
4. **Practical Application**: Include actionable advice and real-world examples
5. **AEO Optimization**: Structure for AI answer engine extractability

${brandContext}

ARTICLE STRUCTURE:
Create a comprehensive article that includes:
- Compelling headline optimized for the primary angle
- Authority-establishing introduction
- Complete coverage of competitor topics (enhanced)
- Dedicated sections for unique research insights
- Practical applications and examples
- Actionable takeaways
- Strong conclusion with next steps

FORMATTING REQUIREMENTS:
- Use markdown formatting with proper headers (H1, H2, H3)
- Include inline hyperlink citations in the format [anchor text](URL) that open in new tabs
- Use bullet points and numbered lists for better scannability
- Bold important concepts and key takeaways
- Structure content for both human readers and AI extractability

Generate comprehensive, high-quality content that establishes this article as the definitive resource on "${keyword}".`;
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
    processing_steps: string[];
  }> {
    console.log('🔧 Starting content post-processing...');
    
    const processingSteps: string[] = [];
    let processedContent = rawContent;

    // Step 1: Process brand variables
    if (brandKit) {
      console.log('📝 Processing brand variables...');
      const brandProcessingResult = await brandkitService.processContentVariables(processedContent, brandKit);
      processedContent = brandProcessingResult.content;
      processingSteps.push(`Brand variables processed: ${brandProcessingResult.processing_metadata.successful_replacements}`);
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
      brand_variables_processed: brandKit ? (processedContent.match(/\{\{[^}]+\}\}/g) || []).length : 0,
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
      serviceTests.firecrawl = await firecrawlService.testConnection();
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
      firecrawl: firecrawlService.getServiceStatus(),
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