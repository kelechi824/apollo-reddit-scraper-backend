import OpenAI from 'openai';
import { ArticleContent } from './firecrawlService';
import { ArticleContentAnalysisResult } from './contentAnalysisService';

/**
 * Enhanced Persona Detection Result Interface
 * Why this matters: Provides deeper persona insights beyond basic role identification
 * for more sophisticated pain point matching and CTA personalization.
 */
export interface EnhancedPersonaResult {
  primary_persona: {
    title: string;
    confidence: number;
    seniority_level: string;
    department: string;
    decision_authority: 'high' | 'medium' | 'low';
  };
  secondary_personas: Array<{
    title: string;
    likelihood: number;
    influence_level: string;
  }>;
  company_context: {
    size_indicators: string[];
    growth_stage: 'startup' | 'scale-up' | 'mature' | 'enterprise' | 'unknown';
    industry_signals: string[];
    technology_maturity: 'early-adopter' | 'mainstream' | 'conservative' | 'unknown';
  };
  buying_signals: {
    urgency_indicators: string[];
    budget_signals: string[];
    timing_clues: string[];
    competitive_pressure: string[];
  };
  content_insights: {
    problem_severity: 'high' | 'medium' | 'low';
    solution_readiness: 'ready-to-buy' | 'evaluating' | 'problem-aware' | 'unaware';
    information_depth: 'superficial' | 'detailed' | 'expert-level';
    audience_sophistication: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  };
  persona_validation: {
    consistency_score: number;
    contradiction_flags: string[];
    confidence_factors: string[];
  };
  enhanced_timestamp: string;
}

/**
 * Enhanced Persona Detector Service
 * Why this matters: Provides sophisticated persona analysis that goes beyond basic role identification
 * to extract buying context, urgency, and audience sophistication for hyper-targeted CTA generation.
 */
class EnhancedPersonaDetector {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.client = new OpenAI({ apiKey });
    console.log('✅ Enhanced Persona Detector initialized with OpenAI gpt-4.1-nano');
  }

  /**
   * Perform enhanced persona detection and context extraction
   * Why this matters: This deep analysis enables much more sophisticated CTA personalization
   * by understanding not just WHO the audience is, but their buying context and readiness.
   */
  async enhancePersonaDetection(
    articleContent: ArticleContent,
    basicAnalysis?: ArticleContentAnalysisResult
  ): Promise<EnhancedPersonaResult> {
    try {
      console.log(`🔍 Enhanced persona analysis for: "${articleContent.title}"`);

      const enhancedPrompt = this.buildEnhancedAnalysisPrompt(articleContent, basicAnalysis);
      
      const completion = await this.client.chat.completions.create({
        model: "gpt-4.1-nano-2025-04-14",
        messages: [
          {
            role: "system",
            content: `You are an expert B2B persona analyst specializing in deep audience insights and buying behavior analysis. You analyze content to extract sophisticated persona intelligence that goes far beyond basic role identification.

EXPERTISE AREAS:
- Persona psychology and decision-making patterns
- B2B buying journey stages and signals
- Company growth stage identification
- Technology adoption patterns
- Budget and urgency signal detection
- Audience sophistication assessment

Your analysis helps sales and marketing teams create hyper-targeted messaging that resonates with specific persona mindsets and buying contexts.

Always respond with valid JSON only.`
          },
          {
            role: "user",
            content: enhancedPrompt
          }
        ],
        temperature: 0.1, // Very low temperature for consistent analysis
        max_completion_tokens: 1200,
        response_format: { type: "json_object" }
      });

      // Log token usage for monitoring
      if (completion.usage) {
        const totalTokens = completion.usage.total_tokens;
        const cost = (totalTokens / 1000) * 0.002; // Approximate cost
        console.log(`💰 Enhanced Persona Analysis - Tokens: ${totalTokens}, Cost: ~$${cost.toFixed(4)}`);
      }

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('Empty response from OpenAI');
      }

      const enhancedResult = JSON.parse(responseContent) as EnhancedPersonaResult;
      
      // Add timestamp
      enhancedResult.enhanced_timestamp = new Date().toISOString();
      
      // Validate and sanitize result
      this.validateEnhancedResult(enhancedResult);

      console.log(`✅ Enhanced analysis complete - Primary: ${enhancedResult.primary_persona.title} (${enhancedResult.primary_persona.confidence}% confidence)`);
      console.log(`📊 Growth stage: ${enhancedResult.company_context.growth_stage}, Solution readiness: ${enhancedResult.content_insights.solution_readiness}`);

      return enhancedResult;

    } catch (error: any) {
      console.error('❌ Enhanced persona detection failed:', error);
      throw new Error(`Enhanced persona detection failed: ${error.message}`);
    }
  }

  /**
   * Build enhanced analysis prompt for sophisticated persona detection
   * Why this matters: The prompt engineering determines the depth and accuracy of persona insights,
   * directly impacting CTA personalization quality.
   */
  private buildEnhancedAnalysisPrompt(
    articleContent: ArticleContent,
    basicAnalysis?: ArticleContentAnalysisResult
  ): string {
    const basicInfo = basicAnalysis ? `
BASIC ANALYSIS CONTEXT:
- Initial persona detection: ${basicAnalysis.persona}
- Content themes: ${basicAnalysis.content_themes.join(', ')}
- Key topics: ${basicAnalysis.key_topics.join(', ')}
- Industry context: ${basicAnalysis.industry_context}
- Content intent: ${basicAnalysis.content_intent}
- Confidence: ${basicAnalysis.confidence_score}%` : '';

    return `
Perform a sophisticated persona analysis that goes beyond basic role identification to extract deep buying context and audience insights.

ARTICLE DETAILS:
Title: "${articleContent.title}"
URL: ${articleContent.url}
Word Count: ${articleContent.wordCount}
Meta Description: "${articleContent.metadata.description || 'None'}"
Author: "${articleContent.metadata.author || 'Unknown'}"
Tags: ${articleContent.metadata.tags?.join(', ') || 'None'}${basicInfo}

ARTICLE CONTENT:
${articleContent.content.substring(0, 6000)} ${articleContent.content.length > 6000 ? '...[content continues]' : ''}

ENHANCED ANALYSIS REQUIRED:
Provide a comprehensive JSON response with exactly these fields:

{
  "primary_persona": {
    "title": "Most likely target persona (e.g., 'VP Sales', 'Series A CEO', 'Enterprise CTO')",
    "confidence": 85,
    "seniority_level": "C-Suite|VP-Level|Director-Level|Manager-Level|Individual Contributor",
    "department": "Sales|Marketing|Product|Engineering|Operations|Finance|Executive",
    "decision_authority": "high|medium|low"
  },
  "secondary_personas": [
    {
      "title": "Secondary audience persona",
      "likelihood": 60,
      "influence_level": "decision-maker|influencer|end-user|gatekeeper"
    }
  ],
  "company_context": {
    "size_indicators": ["clues about company size from content"],
    "growth_stage": "startup|scale-up|mature|enterprise|unknown",
    "industry_signals": ["specific industry or vertical indicators"],
    "technology_maturity": "early-adopter|mainstream|conservative|unknown"
  },
  "buying_signals": {
    "urgency_indicators": ["signs of immediate need or pressure"],
    "budget_signals": ["indicators of budget availability or constraints"],
    "timing_clues": ["when they might be ready to buy"],
    "competitive_pressure": ["competitive dynamics mentioned"]
  },
  "content_insights": {
    "problem_severity": "high|medium|low",
    "solution_readiness": "ready-to-buy|evaluating|problem-aware|unaware",
    "information_depth": "superficial|detailed|expert-level",
    "audience_sophistication": "beginner|intermediate|advanced|expert"
  },
  "persona_validation": {
    "consistency_score": 85,
    "contradiction_flags": ["any conflicting signals about the audience"],
    "confidence_factors": ["what increases confidence in this persona identification"]
  }
}

ANALYSIS FOCUS:

1. **Primary Persona Deep Dive:**
   - Specific role and title (be precise: "Growth Stage CEO" vs "Enterprise CEO")
   - Decision-making authority and influence
   - Department and functional responsibilities

2. **Company Context Detection:**
   - Growth stage indicators (funding mentions, scaling language, maturity signals)
   - Size clues (team mentions, enterprise vs SMB language)
   - Industry and vertical specificity
   - Technology adoption patterns

3. **Buying Signal Analysis:**
   - Urgency language ("need now", "immediately", "ASAP")
   - Budget indicators ("investment", "ROI", "cost-effective")
   - Timing signals ("Q4", "this year", "next quarter")
   - Competitive pressure ("competitors doing X", "falling behind")

4. **Solution Readiness Assessment:**
   - Problem awareness level
   - Evaluation stage indicators
   - Implementation readiness
   - Change management capacity

5. **Audience Sophistication:**
   - Technical depth of content
   - Industry jargon usage
   - Complexity of concepts discussed
   - Prior knowledge assumptions

6. **Validation & Quality:**
   - Consistency across different signals
   - Contradictory indicators
   - Confidence-building factors
   - Areas of uncertainty

Look for subtle language patterns, industry-specific terminology, company stage indicators, urgency signals, and sophistication levels that reveal deeper persona insights.`;
  }

  /**
   * Validate enhanced analysis result structure and content
   * Why this matters: Ensures the AI response contains all required fields with valid values
   * before passing to CTA generation systems.
   */
  private validateEnhancedResult(result: EnhancedPersonaResult): void {
    // Primary persona validation
    if (!result.primary_persona || !result.primary_persona.title) {
      throw new Error('Invalid enhanced result: missing primary persona');
    }

    // Ensure confidence is within valid range
    if (typeof result.primary_persona.confidence !== 'number' || 
        result.primary_persona.confidence < 0 || 
        result.primary_persona.confidence > 100) {
      result.primary_persona.confidence = 50;
    }

    // Validate arrays
    if (!Array.isArray(result.secondary_personas)) {
      result.secondary_personas = [];
    }

    // Validate company context
    if (!result.company_context) {
      result.company_context = {
        size_indicators: [],
        growth_stage: 'unknown',
        industry_signals: [],
        technology_maturity: 'unknown'
      };
    }

    // Validate buying signals
    if (!result.buying_signals) {
      result.buying_signals = {
        urgency_indicators: [],
        budget_signals: [],
        timing_clues: [],
        competitive_pressure: []
      };
    }

    // Validate content insights
    if (!result.content_insights) {
      result.content_insights = {
        problem_severity: 'medium',
        solution_readiness: 'problem-aware',
        information_depth: 'detailed',
        audience_sophistication: 'intermediate'
      };
    }

    // Validate persona validation
    if (!result.persona_validation) {
      result.persona_validation = {
        consistency_score: 50,
        contradiction_flags: [],
        confidence_factors: []
      };
    }

    // Ensure consistency score is valid
    if (typeof result.persona_validation.consistency_score !== 'number' ||
        result.persona_validation.consistency_score < 0 ||
        result.persona_validation.consistency_score > 100) {
      result.persona_validation.consistency_score = 50;
    }

    // Ensure arrays are arrays
    const arrayFields = ['size_indicators', 'industry_signals', 'urgency_indicators', 
                        'budget_signals', 'timing_clues', 'competitive_pressure', 
                        'contradiction_flags', 'confidence_factors'];
    
    arrayFields.forEach(field => {
      const obj = field.includes('_indicators') || field.includes('_signals') || field.includes('_clues') || field.includes('_pressure') 
        ? result.buying_signals || result.company_context
        : result.persona_validation;
      
      if (obj && !Array.isArray(obj[field.split('.').pop() as keyof typeof obj])) {
        (obj[field.split('.').pop() as keyof typeof obj] as any) = [];
      }
    });
  }

  /**
   * Merge enhanced detection with basic analysis
   * Why this matters: Combines the speed of basic analysis with the depth of enhanced detection
   * for a complete persona profile.
   */
  async enhanceExistingAnalysis(basicAnalysis: ArticleContentAnalysisResult): Promise<{
    basic: ArticleContentAnalysisResult;
    enhanced: EnhancedPersonaResult;
    merged: {
      persona_profile: any;
      confidence_score: number;
      analysis_quality: 'high' | 'medium' | 'low';
    };
  }> {
    try {
      // Create mock article content from basic analysis for enhanced processing
      const mockArticle: ArticleContent = {
        url: 'enhanced-analysis',
        title: `Content targeting ${basicAnalysis.persona}`,
        content: `Article about ${basicAnalysis.content_themes.join(', ')} for ${basicAnalysis.persona}. Key topics include ${basicAnalysis.key_topics.join(', ')}. Industry context: ${basicAnalysis.industry_context}`,
        wordCount: 500,
        extractedAt: new Date().toISOString(),
        metadata: {}
      };

      const enhanced = await this.enhancePersonaDetection(mockArticle, basicAnalysis);

      // Calculate overall analysis quality
      const qualityScore = (basicAnalysis.confidence_score + enhanced.primary_persona.confidence + enhanced.persona_validation.consistency_score) / 3;
      const analysisQuality = qualityScore >= 75 ? 'high' : qualityScore >= 50 ? 'medium' : 'low';

      // Merge insights
      const mergedProfile = {
        primary_persona: enhanced.primary_persona,
        content_context: {
          themes: basicAnalysis.content_themes,
          topics: basicAnalysis.key_topics,
          industry: basicAnalysis.industry_context,
          intent: basicAnalysis.content_intent
        },
        company_insights: enhanced.company_context,
        buying_context: enhanced.buying_signals,
        readiness_assessment: enhanced.content_insights,
        validation: enhanced.persona_validation
      };

      return {
        basic: basicAnalysis,
        enhanced: enhanced,
        merged: {
          persona_profile: mergedProfile,
          confidence_score: Math.round(qualityScore),
          analysis_quality: analysisQuality
        }
      };

    } catch (error: any) {
      console.error('❌ Enhanced analysis merge failed:', error);
      throw new Error(`Enhanced analysis merge failed: ${error.message}`);
    }
  }

  /**
   * Batch enhance multiple persona analyses
   * Why this matters: Efficiently processes multiple articles for comprehensive persona insights.
   */
  async batchEnhancePersonas(
    articles: { content: ArticleContent; basicAnalysis: ArticleContentAnalysisResult }[]
  ): Promise<{
    success: boolean;
    results?: Array<{
      article_url: string;
      enhanced_persona: EnhancedPersonaResult;
      quality_score: number;
    }>;
    failed?: { url: string; error: string }[];
  }> {
    try {
      console.log(`🔍 Batch enhancing ${articles.length} persona analyses`);

      const results = [];
      const failed = [];

      for (let i = 0; i < articles.length; i++) {
        const { content, basicAnalysis } = articles[i];
        
        try {
          console.log(`📊 Enhancing persona ${i + 1}/${articles.length}: ${basicAnalysis.persona}`);
          
          const enhanced = await this.enhancePersonaDetection(content, basicAnalysis);
          
          // Calculate quality score
          const qualityScore = Math.round(
            (basicAnalysis.confidence_score + enhanced.primary_persona.confidence + enhanced.persona_validation.consistency_score) / 3
          );

          results.push({
            article_url: content.url,
            enhanced_persona: enhanced,
            quality_score: qualityScore
          });

          // Rate limiting
          if (i < articles.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }

        } catch (error: any) {
          console.error(`❌ Failed to enhance persona for: ${content.url}`, error);
          failed.push({
            url: content.url,
            error: error.message || 'Enhancement failed'
          });
        }
      }

      console.log(`✅ Batch enhancement complete: ${results.length} successful, ${failed.length} failed`);

      return {
        success: true,
        results,
        failed: failed.length > 0 ? failed : undefined
      };

    } catch (error: any) {
      console.error('❌ Batch persona enhancement error:', error);
      return {
        success: false,
        failed: [{ url: 'batch-error', error: `Batch enhancement failed: ${error.message}` }]
      };
    }
  }

  /**
   * Test enhanced persona detection functionality
   * Why this matters: Validates that the enhanced detection service is working correctly.
   */
  async testEnhancedDetection(): Promise<{ success: boolean; message: string }> {
    try {
      const testArticle: ArticleContent = {
        url: 'https://test-enhanced-analysis.com',
        title: 'How Series A Startups Can Scale Sales Teams Without Breaking the Bank',
        content: 'Early-stage founders often struggle with scaling sales efficiently. With limited runway and pressure from investors to show growth, they need cost-effective solutions that can help them hit their next milestone. This urgent need for scalable, budget-conscious sales tools is driving many Series A companies to evaluate new platforms...',
        wordCount: 250,
        extractedAt: new Date().toISOString(),
        metadata: {
          description: 'Guide for startup founders on sales scaling',
          tags: ['startups', 'sales', 'fundraising']
        }
      };

      const enhanced = await this.enhancePersonaDetection(testArticle);
      
      if (enhanced.primary_persona && enhanced.primary_persona.confidence > 0) {
        return {
          success: true,
          message: `Test successful - Enhanced detection: ${enhanced.primary_persona.title} (${enhanced.primary_persona.confidence}% confidence, ${enhanced.company_context.growth_stage} stage)`
        };
      } else {
        return {
          success: false,
          message: 'Test failed - Invalid enhanced detection result'
        };
      }

    } catch (error: any) {
      return {
        success: false,
        message: `Test failed: ${error.message}`
      };
    }
  }

  /**
   * Get service status
   * Why this matters: Provides health check information for monitoring and debugging.
   */
  getServiceStatus(): { available: boolean; model: string; hasApiKey: boolean } {
    return {
      available: !!this.client,
      model: 'gpt-4.1-nano-2025-04-14',
      hasApiKey: !!process.env.OPENAI_API_KEY
    };
  }
}

export default EnhancedPersonaDetector;
