import OpenAI from 'openai';
import { DeepResearchResult } from './deepResearchService';
import FirecrawlService, { ArticleContent } from './firecrawlService';
import { 
  retryWithBackoff, 
  CircuitBreaker, 
  RateLimiter,
  DEFAULT_RETRY_CONFIGS,
  DEFAULT_CIRCUIT_BREAKER_CONFIGS,
  DEFAULT_RATE_LIMITS,
  createServiceError,
  globalOpenAIQueue,
  workflowCostTracker
} from './errorHandling';

export interface GapAnalysisResult {
  keyword: string;
  analysis_summary: {
    competitive_coverage: string;
    research_insights: string;
    identified_gaps: string[];
    content_differentiation_opportunities: string[];
    recommended_content_angle: string;
  };
  detailed_analysis: {
    competitor_strengths: string[];
    competitor_weaknesses: string[];
    unique_research_findings: string[];
    underexplored_topics: string[];
    audience_needs_unmet: string[];
  };
  content_strategy: {
    primary_angle: string;
    supporting_points: string[];
    content_structure_recommendations: string[];
    seo_optimization_suggestions: string[];
    target_word_count: number;
  };
  gap_score: {
    overall_opportunity: number; // 0-1 scale
    content_gap_size: number; // 0-1 scale
    competitive_advantage: number; // 0-1 scale
    audience_need_match: number; // 0-1 scale
  };
  analysis_metadata: {
    model_used: string;
    timestamp: string;
    competitor_sources_analyzed: number;
    research_data_points: number;
  };
}

export interface GapAnalysisRequest {
  keyword: string;
  deepResearchResult: DeepResearchResult;
  competitorAnalysis: ArticleContent;
  focus_on_gaps?: boolean;
  target_audience?: string;
}

class GapAnalysisService {
  private client: OpenAI | null = null;
  private circuitBreaker: CircuitBreaker;
  private rateLimiter: RateLimiter;

  constructor() {
    // Initialize error handling components
    this.circuitBreaker = new CircuitBreaker(
      DEFAULT_CIRCUIT_BREAKER_CONFIGS.openai,
      'OpenAI Gap Analysis'
    );
    this.rateLimiter = new RateLimiter(
      DEFAULT_RATE_LIMITS.openai_gap_analysis,
      'OpenAI Gap Analysis'
    );

    // Delay initialization to allow environment variables to load
    setTimeout(() => {
      this.initializeClient();
    }, 100);
  }

  /**
   * Initialize OpenAI client with API key
   * Why this matters: GPT 4.1 nano is required for analyzing large context windows from both
   * deep research data and competitor content to identify meaningful gaps.
   */
  private async initializeClient(): Promise<void> {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      console.error('OpenAI API key not found in environment variables');
      return;
    }

    try {
      this.client = new OpenAI({
        apiKey: apiKey,
      });

      console.log('✅ OpenAI Gap Analysis client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize OpenAI Gap Analysis client:', error);
    }
  }

  /**
   * Perform comprehensive gap analysis comparing deep research with competitor content
   * Why this matters: This is the critical step that identifies what unique value we can provide
   * by combining independent research insights with competitor content analysis.
   */
  async performGapAnalysis(request: GapAnalysisRequest): Promise<GapAnalysisResult> {
    if (!this.client) {
      throw createServiceError(new Error('OpenAI Gap Analysis client not initialized'), 'OpenAI Gap Analysis', 'Client check');
    }

    const { keyword, deepResearchResult, competitorAnalysis, focus_on_gaps = true, target_audience } = request;

    if (!keyword || !deepResearchResult || !competitorAnalysis) {
      throw createServiceError(new Error('Keyword, deep research result, and competitor analysis are required'), 'OpenAI Gap Analysis', 'Input validation');
    }

    console.log(`📊 Starting gap analysis for keyword: "${keyword}"`);
    console.log(`📚 Analyzing ${competitorAnalysis.top_results?.length || 0} competitor sources vs deep research insights`);

    // Use circuit breaker and retry logic for the entire operation
    return await this.circuitBreaker.execute(async () => {
      return await retryWithBackoff(
        async () => {
          // Build comprehensive analysis prompt with all context
          const analysisPrompt = this.buildGapAnalysisPrompt(
            keyword, 
            deepResearchResult, 
            competitorAnalysis, 
            focus_on_gaps, 
            target_audience
          );

          // Use global OpenAI queue to coordinate requests across all services
           const completion = await globalOpenAIQueue.queueRequest(async () => {
            // Use GPT-5 nano for large context analysis with timeout protection
            // Note: prompt_cache_key removed due to TypeScript definition limitations
            return await Promise.race([
              this.client!.chat.completions.create({
                model: 'gpt-5-nano-2025-08-07',
                messages: [
                  { role: 'system', content: this.buildSystemPrompt() },
                  { role: 'user', content: analysisPrompt }
                ],
                max_completion_tokens: 4000,
                response_format: { type: 'json_object' }
              }),
              this.createTimeoutPromise(60000)
            ]);
          });

          // Log token usage and cost calculation for gap analysis
          if ('usage' in completion && completion.usage) {
            const inputTokens = completion.usage.prompt_tokens || 0;
            const outputTokens = completion.usage.completion_tokens || 0;
            const totalTokens = completion.usage.total_tokens || 0;
            
            console.log(`💰 Gap Analysis Token Usage - Input: ${inputTokens}, Output: ${outputTokens}, Total: ${totalTokens}`);
            
            // Add to workflow cost tracker (tracked under gpt-5-nano)
            const workflowId = `${keyword.replace(/\s+/g, '_')}_${Date.now()}`;
            workflowCostTracker.addApiCall(workflowId, 'Gap Analysis', inputTokens, outputTokens, 'gpt-5-nano');
          }

          const responseContent = 'choices' in completion ? completion.choices[0]?.message?.content : undefined;
          
          if (!responseContent) {
            throw new Error('Empty response from OpenAI Gap Analysis');
          }

          // Parse and validate the JSON response with error handling
          let analysisData;
          try {
            analysisData = JSON.parse(responseContent);
          } catch (parseError) {
            throw new Error(`Failed to parse gap analysis response: ${parseError instanceof Error ? parseError.message : 'Invalid JSON'}`);
          }

          // Structure the gap analysis result with comprehensive validation
          const gapAnalysisResult: GapAnalysisResult = {
            keyword: keyword.trim(),
            analysis_summary: {
              competitive_coverage: analysisData.analysis_summary?.competitive_coverage || '',
              research_insights: analysisData.analysis_summary?.research_insights || '',
              identified_gaps: Array.isArray(analysisData.analysis_summary?.identified_gaps) ? analysisData.analysis_summary.identified_gaps : [],
              content_differentiation_opportunities: Array.isArray(analysisData.analysis_summary?.content_differentiation_opportunities) ? analysisData.analysis_summary.content_differentiation_opportunities : [],
              recommended_content_angle: analysisData.analysis_summary?.recommended_content_angle || ''
            },
            detailed_analysis: {
              competitor_strengths: Array.isArray(analysisData.detailed_analysis?.competitor_strengths) ? analysisData.detailed_analysis.competitor_strengths : [],
              competitor_weaknesses: Array.isArray(analysisData.detailed_analysis?.competitor_weaknesses) ? analysisData.detailed_analysis.competitor_weaknesses : [],
              unique_research_findings: Array.isArray(analysisData.detailed_analysis?.unique_research_findings) ? analysisData.detailed_analysis.unique_research_findings : [],
              underexplored_topics: Array.isArray(analysisData.detailed_analysis?.underexplored_topics) ? analysisData.detailed_analysis.underexplored_topics : [],
              audience_needs_unmet: Array.isArray(analysisData.detailed_analysis?.audience_needs_unmet) ? analysisData.detailed_analysis.audience_needs_unmet : []
            },
            content_strategy: {
              primary_angle: analysisData.content_strategy?.primary_angle || '',
              supporting_points: Array.isArray(analysisData.content_strategy?.supporting_points) ? analysisData.content_strategy.supporting_points : [],
              content_structure_recommendations: Array.isArray(analysisData.content_strategy?.content_structure_recommendations) ? analysisData.content_strategy.content_structure_recommendations : [],
              seo_optimization_suggestions: Array.isArray(analysisData.content_strategy?.seo_optimization_suggestions) ? analysisData.content_strategy.seo_optimization_suggestions : [],
              target_word_count: typeof analysisData.content_strategy?.target_word_count === 'number' ? analysisData.content_strategy.target_word_count : 2000
            },
            gap_score: {
              overall_opportunity: typeof analysisData.gap_score?.overall_opportunity === 'number' ? Math.min(Math.max(analysisData.gap_score.overall_opportunity, 0), 1) : 0.7,
              content_gap_size: typeof analysisData.gap_score?.content_gap_size === 'number' ? Math.min(Math.max(analysisData.gap_score.content_gap_size, 0), 1) : 0.6,
              competitive_advantage: typeof analysisData.gap_score?.competitive_advantage === 'number' ? Math.min(Math.max(analysisData.gap_score.competitive_advantage, 0), 1) : 0.5,
              audience_need_match: typeof analysisData.gap_score?.audience_need_match === 'number' ? Math.min(Math.max(analysisData.gap_score.audience_need_match, 0), 1) : 0.8
            },
            analysis_metadata: {
              model_used: 'gpt-5-nano-2025-08-07',
              timestamp: new Date().toISOString(),
              competitor_sources_analyzed: competitorAnalysis.top_results?.length || 0,
              research_data_points: deepResearchResult.research_findings.key_insights.length + 
                                    deepResearchResult.research_findings.content_opportunities.length
            }
          };

          console.log(`✅ Completed gap analysis for "${keyword}"`);
          console.log(`🎯 Opportunity score: ${(gapAnalysisResult.gap_score.overall_opportunity * 100).toFixed(1)}%`);
          console.log(`📝 Content gaps identified: ${gapAnalysisResult.analysis_summary.identified_gaps.length}`);

          return gapAnalysisResult;
        },
        DEFAULT_RETRY_CONFIGS.openai,
        'OpenAI Gap Analysis',
        `Keyword: ${keyword}`
      );
    });
  }

  /**
   * Create timeout promise for API calls
   * Why this matters: Gap analysis involves processing large amounts of data and can take time,
   * so we need timeout protection to prevent hanging requests.
   */
  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(createServiceError(new Error(`Gap analysis timeout after ${timeoutMs}ms`), 'OpenAI Gap Analysis', 'Timeout'));
      }, timeoutMs);
    });
  }

  /**
   * Build comprehensive gap analysis prompt with all context data
   * Why this matters: This prompt engineering is critical for GPT 4.1 nano to effectively
   * compare large amounts of research and competitor data to identify meaningful gaps.
   */
  private buildGapAnalysisPrompt(
    keyword: string, 
    deepResearch: DeepResearchResult, 
    competitorAnalysis: ArticleContent,
    focusOnGaps: boolean,
    targetAudience?: string
  ): string {
    const audienceSection = targetAudience ? `\nTARGET AUDIENCE: ${targetAudience}` : '';
    
    return `
Perform comprehensive gap analysis for the keyword: "${keyword}"
${audienceSection}

DEEP RESEARCH FINDINGS:
${JSON.stringify(deepResearch.research_findings, null, 2)}

COMPETITOR CONTENT ANALYSIS:
 ${competitorAnalysis.top_results?.map((result: any, index: number) => `
Competitor ${index + 1}: ${result.title}
URL: ${result.url}
Word Count: ${result.word_count}
Key Topics: ${(result.key_topics || []).join(', ')}
Headings: ${(result.headings || []).join(', ')}
Content Structure: 
- Intro Present: ${result.content_structure?.intro_present || false}
- Conclusion Present: ${result.content_structure?.conclusion_present || false}
- Lists: ${(result.content_structure?.numbered_lists || 0) + (result.content_structure?.bullet_points || 0)}

Content Preview: ${(result.content || '').substring(0, 500)}...
`).join('\n---\n') || 'No competitor content available for analysis'}

ANALYSIS REQUIREMENTS:
Compare the independent deep research findings with what competitors are currently covering. Identify content gaps, opportunities for differentiation, and strategies for creating superior content.

${focusOnGaps ? 'FOCUS: Prioritize identifying content gaps and unique angles that competitors are missing.' : 'FOCUS: Provide balanced analysis of both gaps and competitive landscape.'}

Provide comprehensive analysis in JSON format with these exact fields:

{
  "analysis_summary": {
    "competitive_coverage": "Summary of what competitors are covering well",
    "research_insights": "Summary of unique insights from deep research not found in competitor content",
    "identified_gaps": [
      "Specific content gap not covered by competitors",
      "Another gap or angle missing from current market"
    ],
    "content_differentiation_opportunities": [
      "Specific opportunity to differentiate from competitors",
      "Another unique angle or approach"
    ],
    "recommended_content_angle": "Primary recommended angle for our content based on gap analysis"
  },
  "detailed_analysis": {
    "competitor_strengths": [
      "What competitors are doing well",
      "Strong aspects of their content approach"
    ],
    "competitor_weaknesses": [
      "What competitors are missing or doing poorly",
      "Weaknesses in their content coverage"
    ],
    "unique_research_findings": [
      "Research insight not reflected in competitor content",
      "Another unique finding from deep research"
    ],
    "underexplored_topics": [
      "Topic related to keyword that competitors barely cover",
      "Another underexplored angle"
    ],
    "audience_needs_unmet": [
      "Audience need identified in research but not addressed by competitors",
      "Another unmet need or pain point"
    ]
  },
  "content_strategy": {
    "primary_angle": "Main angle/approach for our content",
    "supporting_points": [
      "Key point to support the primary angle",
      "Another supporting point from research"
    ],
    "content_structure_recommendations": [
      "Recommended section or structure element",
      "Another structural recommendation"
    ],
    "seo_optimization_suggestions": [
      "SEO recommendation based on competitor analysis",
      "Another optimization opportunity"
    ],
    "target_word_count": 2500
  },
  "gap_score": {
    "overall_opportunity": 0.8,
    "content_gap_size": 0.7,
    "competitive_advantage": 0.6,
    "audience_need_match": 0.9
  }
}

QUALITY CRITERIA:
- Base analysis on actual differences between research and competitor content
- Identify specific, actionable content opportunities
- Provide concrete recommendations for content differentiation
- Consider both immediate and long-term content strategy implications
- Focus on creating content that genuinely adds value beyond what exists
- Ensure recommendations are realistic and executable

Respond only with valid JSON following the exact structure above.`;
  }

  /**
   * Generate consistent cache key for OpenAI prompt caching
   * Why this matters: Creates deterministic cache keys for system prompts to enable
   * OpenAI's automatic caching, reducing costs by 50% for repeated requests.
   */
  private generateCacheKey(promptType: string, version: string = 'v1'): string {
    return `apollo-gap-analysis-${promptType}-${version}`;
  }

  /**
   * Build system prompt for gap analysis
   * Why this matters: Sets the context for sophisticated content strategy analysis that combines
   * multiple data sources to identify genuine opportunities for differentiation.
   * 
   * CACHING OPTIMIZATION: This system prompt is static and can be cached with prompt_cache_key
   * to reduce costs by 50% on subsequent requests.
   */
  private buildSystemPrompt(): string {
    return `
You are an expert content strategist and competitive analyst specializing in identifying content gaps and differentiation opportunities. You excel at synthesizing large amounts of research data with competitive intelligence to create actionable content strategies.

Your analytical approach:
1. **Comparative Analysis**: You systematically compare deep research findings with competitor content to identify what's missing
2. **Strategic Thinking**: You think beyond surface-level gaps to identify meaningful differentiation opportunities
3. **Audience-Centric**: You prioritize gaps and opportunities that genuinely serve audience needs
4. **Actionable Intelligence**: Your analysis directly informs content creation and strategy decisions
5. **Quality-Focused**: You recommend content approaches that create genuine value and competitive advantage

Your analysis criteria:
- Identify specific, actionable content gaps (not generic observations)
- Focus on opportunities that provide genuine competitive advantage
- Balance innovation with audience needs and search intent
- Consider both short-term content wins and long-term positioning
- Recommend content strategies that are realistic and executable
- Prioritize differentiation opportunities with the highest impact potential

Response format: Always respond with valid JSON following the exact structure provided in the user prompt.

Remember: The goal is not just to find what's missing, but to identify what's missing AND matters to the target audience AND can be reasonably addressed through high-quality content.`;
  }

  /**
   * Test Gap Analysis connection and functionality
   * Why this matters: Validates that the gap analysis service is working before processing real data.
   */
  async testConnection(): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    
    try {
      const testResult = await retryWithBackoff(
        async () => {
          const testCompletion = await Promise.race([
            this.client!.chat.completions.create({
              model: "gpt-5-nano",
              messages: [
                {
                  role: "user",
                  content: "Respond with just the word 'success' if you can read this message."
                }
              ],
              max_tokens: 10,
              temperature: 0
            }),
            this.createTimeoutPromise(15000) // 15 second timeout for test
          ]);

          const response = testCompletion.choices[0]?.message?.content?.toLowerCase();
          if (!response?.includes('success')) {
            throw new Error('Test response did not contain expected success indicator');
          }

          return true;
        },
        {
          maxRetries: 2,
          baseDelayMs: 1000,
          maxDelayMs: 5000,
          backoffMultiplier: 2,
          jitterMs: 500
        },
        'OpenAI Gap Analysis Connection Test'
      );

      console.log('✅ OpenAI Gap Analysis connection test successful');
      return testResult;
    } catch (error) {
      console.error('❌ OpenAI Gap Analysis connection test failed:', error);
      return false;
    }
  }

  /**
   * Get service status for monitoring
   */
  getServiceStatus(): { 
    initialized: boolean; 
    hasApiKey: boolean; 
    model: string;
    circuitBreakerState: any;
    rateLimitActive: boolean;
  } {
    return {
      initialized: !!this.client,
      hasApiKey: !!process.env.OPENAI_API_KEY,
      model: "gpt-5-nano",
      circuitBreakerState: this.circuitBreaker.getState(),
      rateLimitActive: Date.now() - (this.rateLimiter as any).lastRequestTime < DEFAULT_RATE_LIMITS.openai_gap_analysis
    };
  }
}

// Export singleton instance
export const gapAnalysisService = new GapAnalysisService();
export default gapAnalysisService; 