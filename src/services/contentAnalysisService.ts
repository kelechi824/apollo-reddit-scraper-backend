import OpenAI from 'openai';
import { ArticleContent } from './firecrawlService';

/**
 * Article Content Analysis Result Interface
 * Why this matters: Standardizes the output format for article analysis results.
 */
export interface ArticleContentAnalysisResult {
  persona: string;
  persona_details: {
    job_title: string;
    seniority_level: string;
    department: string;
    company_size: string;
  };
  content_themes: string[];
  key_topics: string[];
  industry_context: string;
  content_intent: 'awareness' | 'consideration' | 'decision' | 'retention';
  pain_point_indicators: string[];
  confidence_score: number;
  analysis_timestamp: string;
}

/**
 * Content Analysis Service
 * Why this matters: Analyzes article content to detect target personas and themes for pain point matching.
 * This bridges the gap between article extraction and CTA generation by understanding audience intent.
 */
class ContentAnalysisService {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.client = new OpenAI({ apiKey });
    console.log('✅ Content Analysis Service initialized with OpenAI gpt-5-nano');
  }

  /**
   * Analyze article content to detect personas and themes
   * Why this matters: This is the core function that transforms article content into structured
   * persona and theme data that can be matched to customer pain points.
   */
  async analyzeArticleContent(articleContent: ArticleContent): Promise<ArticleContentAnalysisResult> {
    try {
      console.log(`🧠 Analyzing article content: "${articleContent.title}" (${articleContent.wordCount} words)`);

      const analysisPrompt = this.buildContentAnalysisPrompt(articleContent);
      
      const completion = await this.client.responses.create({
        model: "gpt-5-nano",
        input: `You are an expert content analyst specializing in B2B audience identification and persona detection. You analyze articles to determine target personas, themes, and business context with high accuracy.

PERSONA CATEGORIES TO RECOGNIZE:
- CEO (Chief Executive Officer)
- CRO (Chief Revenue Officer) 
- CMO (Chief Marketing Officer)
- CFO (Chief Financial Officer)
- CTO (Chief Technology Officer)
- VP Sales (Vice President of Sales)
- VP Marketing (Vice President of Marketing)
- Sales Manager
- Marketing Manager
- Sales Development Rep (SDR)
- Account Executive (AE)
- Customer Success Manager
- RevOps (Revenue Operations)
- Sales Operations
- Marketing Operations
- Business Development
- Founder/Entrepreneur

CRITICAL: You must respond with ONLY valid JSON. No explanations, no markdown, no extra text. Just the JSON object.

${analysisPrompt}`
      });

      const responseContent = completion.output_text;
      if (!responseContent) {
        throw new Error('Empty response from OpenAI');
      }

      console.log('🔍 Raw AI response (first 500 chars):', responseContent.substring(0, 500));

      // Clean and parse JSON response with error handling
      const analysis = this.parseAIResponse(responseContent) as ArticleContentAnalysisResult;
      
      // Add timestamp
      analysis.analysis_timestamp = new Date().toISOString();
      
      // Validate and sanitize analysis
      this.validateAnalysisResult(analysis);

      console.log(`✅ Content analysis complete - Detected persona: ${analysis.persona} (${analysis.confidence_score}% confidence)`);
      console.log(`📊 Key themes: ${analysis.content_themes.join(', ')}`);

      return analysis;

    } catch (error: any) {
      console.error('❌ Content analysis failed:', error);
      throw new Error(`Content analysis failed: ${error.message}`);
    }
  }

  /**
   * Build analysis prompt for article content
   * Why this matters: The prompt engineering determines the accuracy of persona detection
   * and theme identification, which directly impacts CTA relevance.
   */
  private buildContentAnalysisPrompt(articleContent: ArticleContent): string {
    return `
Analyze this article to identify the target persona and key themes for B2B content marketing purposes.

ARTICLE DETAILS:
Title: "${articleContent.title}"
URL: ${articleContent.url}
Word Count: ${articleContent.wordCount}
Meta Description: "${articleContent.metadata.description || 'None'}"
Author: "${articleContent.metadata.author || 'Unknown'}"
Tags: ${articleContent.metadata.tags?.join(', ') || 'None'}

ARTICLE CONTENT:
${articleContent.content.substring(0, 4000)} ${articleContent.content.length > 4000 ? '...[truncated]' : ''}

ANALYSIS REQUIRED:
Provide a JSON response with exactly these fields:

{
  "persona": "Primary target persona (e.g., 'CEO', 'CRO', 'VP Sales', 'Sales Manager', etc.)",
  "persona_details": {
    "job_title": "Specific job title being targeted",
    "seniority_level": "C-Suite|VP-Level|Director-Level|Manager-Level|Individual Contributor",
    "department": "Sales|Marketing|Customer Success|Operations|Executive|IT|Finance",
    "company_size": "Enterprise|Mid-Market|SMB|Startup"
  },
  "content_themes": ["theme1", "theme2", "theme3"],
  "key_topics": ["topic1", "topic2", "topic3"],
  "industry_context": "Specific industry or vertical focus if mentioned",
  "content_intent": "awareness|consideration|decision|retention",
  "pain_point_indicators": ["pain point clue 1", "pain point clue 2"],
  "confidence_score": 85
}

ANALYSIS FOCUS:
1. WHO is this content written for? (persona identification)
2. WHAT problems/challenges does it address? (pain point indicators)
3. WHAT stage of buyer journey? (content intent)
4. WHAT industry/context? (business context)
5. WHAT themes/topics are covered? (content categorization)

CONFIDENCE SCORING:
- 90-100: Very clear persona targeting with explicit mentions
- 70-89: Strong persona indicators with clear context clues
- 50-69: Moderate persona indicators, some ambiguity
- 30-49: Weak persona indicators, multiple possible targets
- 10-29: Very unclear targeting, general business content

Look for explicit mentions of job titles, departments, company stages, specific business challenges, and buying scenarios.`;
  }

  /**
   * Parse AI response with robust error handling
   * Why this matters: AI responses can sometimes contain malformed JSON or extra text,
   * so we need to extract and clean the JSON before parsing.
   */
  private parseAIResponse(responseContent: string): ArticleContentAnalysisResult {
    try {
      // First, try direct JSON parsing
      return JSON.parse(responseContent);
    } catch (error) {
      console.log('🔧 Direct JSON parsing failed, attempting to clean response...');
      
      try {
        // Try to extract JSON from response that might have extra text
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonString = jsonMatch[0];
          return JSON.parse(jsonString);
        }
        
        // If no JSON found, try to fix common JSON issues
        let cleanedResponse = responseContent
          .replace(/```json\s*/, '') // Remove markdown code blocks
          .replace(/```\s*$/, '')
          .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
          .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // Add quotes to unquoted keys
          .trim();
        
        return JSON.parse(cleanedResponse);
        
      } catch (secondError) {
        console.error('❌ Failed to parse AI response as JSON:', responseContent.substring(0, 500));
        
        // Return a fallback analysis result
        return {
          persona: 'General Business Professional',
          persona_details: {
            job_title: 'Business Professional',
            seniority_level: 'Manager-Level',
            department: 'Sales',
            company_size: 'Mid-Market'
          },
          content_themes: ['general business'],
          key_topics: ['business strategy'],
          industry_context: 'General Business',
          content_intent: 'consideration',
          pain_point_indicators: ['business challenges'],
          confidence_score: 30,
          analysis_timestamp: new Date().toISOString()
        };
      }
    }
  }

  /**
   * Validate analysis result structure and content
   * Why this matters: Ensures the AI response contains all required fields with valid values
   * before passing to the pain point matching system.
   */
  private validateAnalysisResult(analysis: ArticleContentAnalysisResult): void {
    // Required fields validation
    if (!analysis.persona || !analysis.persona_details || !analysis.content_themes) {
      throw new Error('Invalid analysis result: missing required fields');
    }

    // Persona details validation
    const requiredPersonaFields = ['job_title', 'seniority_level', 'department', 'company_size'];
    for (const field of requiredPersonaFields) {
      if (!analysis.persona_details[field as keyof typeof analysis.persona_details]) {
        throw new Error(`Invalid analysis result: missing persona_details.${field}`);
      }
    }

    // Validate arrays
    if (!Array.isArray(analysis.content_themes) || analysis.content_themes.length === 0) {
      analysis.content_themes = ['general'];
    }
    if (!Array.isArray(analysis.key_topics)) {
      analysis.key_topics = [];
    }
    if (!Array.isArray(analysis.pain_point_indicators)) {
      analysis.pain_point_indicators = [];
    }

    // Validate content intent
    const validIntents = ['awareness', 'consideration', 'decision', 'retention'];
    if (!validIntents.includes(analysis.content_intent)) {
      analysis.content_intent = 'consideration'; // Default fallback
    }

    // Validate confidence score
    if (typeof analysis.confidence_score !== 'number' || analysis.confidence_score < 0 || analysis.confidence_score > 100) {
      analysis.confidence_score = 50; // Default fallback
    }

    // Ensure industry_context is string
    if (!analysis.industry_context) {
      analysis.industry_context = 'General Business';
    }
  }

  /**
   * Batch analyze multiple articles
   * Why this matters: Efficiently processes multiple articles for bulk content analysis workflows.
   */
  async analyzeMultipleArticles(articles: ArticleContent[]): Promise<{
    success: boolean;
    results?: ArticleContentAnalysisResult[];
    failed?: { url: string; error: string }[];
    error?: string;
  }> {
    try {
      console.log(`🧠 Batch analyzing ${articles.length} articles`);

      const results: ArticleContentAnalysisResult[] = [];
      const failed: { url: string; error: string }[] = [];

      for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        try {
          console.log(`📊 Analyzing article ${i + 1}/${articles.length}: "${article.title.substring(0, 50)}..."`);
          
          const analysis = await this.analyzeArticleContent(article);
          results.push(analysis);
          
          // Rate limiting: small delay between requests
          if (i < articles.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
        } catch (error: any) {
          console.error(`❌ Failed to analyze article: ${article.url}`, error);
          failed.push({
            url: article.url,
            error: error.message || 'Analysis failed'
          });
        }
      }

      console.log(`✅ Batch analysis complete: ${results.length} successful, ${failed.length} failed`);

      return {
        success: true,
        results,
        failed: failed.length > 0 ? failed : undefined
      };

    } catch (error: any) {
      console.error('❌ Batch analysis error:', error);
      return {
        success: false,
        error: `Batch analysis failed: ${error.message}`
      };
    }
  }

  /**
   * Test service functionality
   * Why this matters: Validates that content analysis service is working correctly.
   */
  async testAnalysis(): Promise<{ success: boolean; message: string }> {
    try {
      const testArticle: ArticleContent = {
        url: 'https://test-article.com',
        title: 'How Sales Leaders Can Improve Pipeline Visibility',
        content: 'Sales leaders struggle with pipeline visibility and forecasting accuracy. This article explains how CROs and VP Sales can implement better tracking systems...',
        wordCount: 150,
        extractedAt: new Date().toISOString(),
        metadata: {
          description: 'Guide for sales leadership',
          tags: ['sales', 'leadership', 'pipeline']
        }
      };

      const analysis = await this.analyzeArticleContent(testArticle);
      
      if (analysis.persona && analysis.confidence_score > 0) {
        return {
          success: true,
          message: `Test successful - Detected persona: ${analysis.persona} (${analysis.confidence_score}% confidence)`
        };
      } else {
        return {
          success: false,
          message: 'Test failed - Invalid analysis result'
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
      model: 'gpt-5-nano',
      hasApiKey: !!process.env.OPENAI_API_KEY
    };
  }
}

export default ContentAnalysisService;
