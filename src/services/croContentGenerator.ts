import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { CROAnalysisResult } from './painPointAnalyzer';
import { GongAnalyzedCall } from '../types';

// Content generation interfaces
export interface CROContentRequest {
  callInsights: GongAnalyzedCall[];
  croAnalysisResults: CROAnalysisResult[];
  targetAudience?: string;
  businessContext?: string;
  landingPageUrl?: string;
}

export interface GoogleAdsContent {
  headlines: Array<{
    id: string;
    text: string;
    characterCount: number;
    painPointsAddressed: string[];
    emotionalTrigger: string;
    customerLanguageUsed: string[];
    performancePrediction: 'high' | 'medium' | 'low';
  }>;
  descriptions: Array<{
    id: string;
    text: string;
    characterCount: number;
    painPointsAddressed: string[];
    callToAction: string;
    trustSignals: string[];
    flowsWithHeadlines: string[];
  }>;
}

export interface LandingPageCopyRecommendations {
  heroSection: {
    headline: string;
    subheadline: string;
    ctaButton: string;
    painPointsAddressed: string[];
  };
  trustSignals: Array<{
    type: 'testimonial' | 'guarantee' | 'certification' | 'social_proof';
    content: string;
    placement: string;
  }>;
  formOptimizations: Array<{
    issue: string;
    recommendation: string;
    expectedImpact: string;
  }>;
  copyImprovements: Array<{
    section: string;
    currentIssue: string;
    improvedCopy: string;
    reasonForChange: string;
  }>;
}

export interface ABTestingSuggestions {
  headlines: Array<{
    testName: string;
    variant: string;
    hypothesis: string;
    expectedOutcome: string;
    painPointAddressed: string;
  }>;
  ctas: Array<{
    testName: string;
    variant: string;
    hypothesis: string;
    expectedOutcome: string;
  }>;
  formElements: Array<{
    testName: string;
    element: string;
    variant: string;
    hypothesis: string;
    expectedOutcome: string;
  }>;
  trustElements: Array<{
    testName: string;
    element: string;
    variant: string;
    hypothesis: string;
    expectedOutcome: string;
  }>;
}

export interface CROContentGenerationResult {
  googleAdsContent: GoogleAdsContent;
  landingPageRecommendations: LandingPageCopyRecommendations;
  abTestingSuggestions: ABTestingSuggestions;
  generationMetadata: {
    callsAnalyzed: number;
    painPointsConsidered: number;
    customerPhrasesUsed: number;
    generationTimestamp: string;
    processingTimeMs: number;
  };
}

/**
 * Service for generating CRO content including Google Ads and landing page copy
 * Why this matters: Transforms customer insights into high-converting ad copy and landing page improvements using authentic customer language.
 */
class CROContentGenerator {
  private client: OpenAI | null = null;
  private model = 'gpt-4.1-nano-2025-04-14'; // Use exact model specified in memory

  constructor() {
    setTimeout(() => {
      this.initializeClient();
    }, 100);
  }

  /**
   * Initialize OpenAI client with API key
   * Why this matters: OpenAI GPT-4.1-nano provides superior content generation using customer language patterns.
   */
  private async initializeClient(): Promise<void> {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      console.error('❌ OpenAI API key not found for CRO Content Generator');
      return;
    }

    try {
      this.client = new OpenAI({
        apiKey: apiKey,
      });

      console.log('✅ CRO Content Generator OpenAI client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize CRO Content Generator OpenAI client:', error);
    }
  }

  /**
   * Generate comprehensive CRO content from call insights
   * Why this matters: Main entry point that creates Google Ads content, landing page copy, and A/B testing suggestions using customer insights.
   */
  async generateCROContent(request: CROContentRequest): Promise<CROContentGenerationResult> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const startTime = Date.now();
    console.log(`🎯 Generating comprehensive CRO content from ${request.callInsights.length} calls...`);

    try {
      // Extract all relevant data for content generation
      const allPainPoints = request.callInsights.flatMap(call => call.analysis.painPoints);
      const allCustomerLanguage = request.croAnalysisResults.flatMap(result => 
        result.adCopyInsights.customerLanguage
      );
      const allEmotionalTriggers = request.croAnalysisResults.flatMap(result => 
        result.adCopyInsights.emotionalTriggers
      );

      console.log(`📊 Content generation data:`);
      console.log(`   💬 ${allPainPoints.length} pain points across calls`);
      console.log(`   🗣️ ${allCustomerLanguage.length} customer phrases extracted`);
      console.log(`   😊 ${allEmotionalTriggers.length} emotional triggers identified`);

      // Generate Google Ads content (headlines and descriptions)
      const googleAdsContent = await this.generateGoogleAdsContent(
        request.callInsights,
        request.croAnalysisResults,
        request.businessContext
      );

      // Generate landing page copy recommendations
      const landingPageRecommendations = await this.generateLandingPageRecommendations(
        request.callInsights,
        request.croAnalysisResults,
        request.landingPageUrl
      );

      // Generate A/B testing suggestions
      const abTestingSuggestions = await this.generateABTestingSuggestions(
        request.callInsights,
        request.croAnalysisResults
      );

      const processingTimeMs = Date.now() - startTime;

      const result: CROContentGenerationResult = {
        googleAdsContent,
        landingPageRecommendations,
        abTestingSuggestions,
        generationMetadata: {
          callsAnalyzed: request.callInsights.length,
          painPointsConsidered: allPainPoints.length,
          customerPhrasesUsed: allCustomerLanguage.length,
          generationTimestamp: new Date().toISOString(),
          processingTimeMs
        }
      };

      console.log(`✅ CRO content generation complete (${processingTimeMs}ms):`);
      console.log(`   📝 ${googleAdsContent.headlines.length} headlines generated`);
      console.log(`   📄 ${googleAdsContent.descriptions.length} descriptions generated`);
      console.log(`   🏠 ${landingPageRecommendations.copyImprovements.length} landing page improvements`);
      console.log(`   🧪 ${abTestingSuggestions.headlines.length} A/B test suggestions`);

      return result;

    } catch (error: any) {
      console.error(`❌ Failed to generate CRO content:`, error);
      throw new Error(`CRO content generation failed: ${error.message}`);
    }
  }

  /**
   * Generate Google Ads headlines and descriptions
   * Why this matters: Creates 15 unique headlines and 4 flowing descriptions using authentic customer language to improve ad performance.
   */
  private async generateGoogleAdsContent(
    callInsights: GongAnalyzedCall[],
    croAnalysisResults: CROAnalysisResult[],
    businessContext?: string
  ): Promise<GoogleAdsContent> {
    console.log(`📝 Generating Google Ads content with customer language...`);

    const prompt = this.createGoogleAdsPrompt(callInsights, croAnalysisResults, businessContext);
    
    const completion = await this.client!.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: prompt
        },
        {
          role: 'user',
          content: `Generate Google Ads content using the customer insights provided. Focus on authentic customer language and address the specific pain points and conversion barriers identified in the calls.

REQUIREMENTS:
- 15 unique headlines (30 characters each, optimized for performance. Remember spaces and periods count as characters)
- 4 unique descriptions (90 characters each, designed to flow with any headline. Remember spaces and periods count as characters)
- Use actual customer phrases and emotional triggers
- Address specific conversion barriers
- Include performance predictions

Return valid JSON only.`
        }
      ],
      temperature: 0.4, // Slightly higher for creative content generation
      max_completion_tokens: 4000,
      response_format: { type: "json_object" }
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('No Google Ads content response from OpenAI');
    }

    const parsedContent = JSON.parse(responseContent);
    
    // Add IDs and ensure proper structure
    const headlines = parsedContent.headlines.map((headline: any) => ({
      id: uuidv4(),
      ...headline
    }));

    const descriptions = parsedContent.descriptions.map((description: any) => ({
      id: uuidv4(),
      ...description
    }));

    return { headlines, descriptions };
  }

  /**
   * Generate landing page copy recommendations
   * Why this matters: Provides specific copy improvements based on customer pain points and conversion barriers.
   */
  private async generateLandingPageRecommendations(
    callInsights: GongAnalyzedCall[],
    croAnalysisResults: CROAnalysisResult[],
    landingPageUrl?: string
  ): Promise<LandingPageCopyRecommendations> {
    console.log(`🏠 Generating landing page copy recommendations...`);

    const prompt = this.createLandingPagePrompt(callInsights, croAnalysisResults, landingPageUrl);
    
    const completion = await this.client!.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: prompt
        },
        {
          role: 'user',
          content: `Generate landing page copy recommendations based on the customer insights and conversion barriers identified. Focus on addressing specific pain points with improved copy.

REQUIREMENTS:
- Hero section improvements (headline, subheadline, CTA)
- Trust signals to address customer concerns
- Form optimizations to reduce friction
- Copy improvements for each page section
- Use customer language and address specific barriers

Return valid JSON only.`
        }
      ],
      temperature: 0.3,
      max_completion_tokens: 3500,
      response_format: { type: "json_object" }
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('No landing page recommendations response from OpenAI');
    }

    return JSON.parse(responseContent);
  }

  /**
   * Generate A/B testing suggestions
   * Why this matters: Provides specific test ideas based on customer pain points to systematically improve conversion rates.
   */
  private async generateABTestingSuggestions(
    callInsights: GongAnalyzedCall[],
    croAnalysisResults: CROAnalysisResult[]
  ): Promise<ABTestingSuggestions> {
    console.log(`🧪 Generating A/B testing suggestions...`);

    const prompt = this.createABTestingPrompt(callInsights, croAnalysisResults);
    
    const completion = await this.client!.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: prompt
        },
        {
          role: 'user',
          content: `Generate A/B testing suggestions based on the customer insights and conversion barriers. Focus on testable hypotheses that address specific pain points.

REQUIREMENTS:
- Headline test variations addressing pain points
- CTA button test variations
- Form element test variations
- Trust element test variations
- Clear hypotheses and expected outcomes for each test

Return valid JSON only.`
        }
      ],
      temperature: 0.3,
      max_completion_tokens: 3000,
      response_format: { type: "json_object" }
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('No A/B testing suggestions response from OpenAI');
    }

    return JSON.parse(responseContent);
  }

  /**
   * Create Google Ads generation prompt
   * Why this matters: Structures the prompt to generate high-performing ad content using customer language patterns.
   */
  private createGoogleAdsPrompt(
    callInsights: GongAnalyzedCall[],
    croAnalysisResults: CROAnalysisResult[],
    businessContext?: string
  ): string {
    const allCustomerLanguage = croAnalysisResults.flatMap(result => 
      result.adCopyInsights.customerLanguage
    );
    const allEmotionalTriggers = croAnalysisResults.flatMap(result => 
      result.adCopyInsights.emotionalTriggers
    );
    const allConversionBarriers = croAnalysisResults.flatMap(result => 
      result.conversionBarriers
    );

    return `You are a Google Ads copywriter specializing in conversion optimization. Your task is to create high-performing ad headlines and descriptions using authentic customer language extracted from sales calls.

CUSTOMER LANGUAGE PATTERNS:
${allCustomerLanguage.slice(0, 20).map(phrase => `- "${phrase}"`).join('\n')}

EMOTIONAL TRIGGERS IDENTIFIED:
${allEmotionalTriggers.slice(0, 15).map(trigger => `- ${trigger}`).join('\n')}

TOP CONVERSION BARRIERS TO ADDRESS:
${allConversionBarriers.slice(0, 10).map(barrier => `- ${barrier.barrier} (${barrier.category}, ${barrier.severity} severity)`).join('\n')}

${businessContext ? `BUSINESS CONTEXT: ${businessContext}` : ''}

GOOGLE ADS REQUIREMENTS:
- Headlines: Exactly 30 characters each, use customer phrases (Remember spaces and periods count as characters)
- Descriptions: Exactly 90 characters each, must flow with any headline (Remember spaces and periods count as characters)
- Address specific conversion barriers in copy
- Use emotional triggers naturally
- Include performance predictions based on customer resonance

JSON STRUCTURE:
{
  "headlines": [
    {
      "text": "headline text (30 chars max)",
      "characterCount": 30,
      "painPointsAddressed": ["barrier1", "barrier2"],
      "emotionalTrigger": "trigger used",
      "customerLanguageUsed": ["phrase1", "phrase2"],
      "performancePrediction": "high/medium/low"
    }
  ],
  "descriptions": [
    {
      "text": "description text (90 chars max)",
      "characterCount": 90,
      "painPointsAddressed": ["barrier1", "barrier2"],
      "callToAction": "CTA used",
      "trustSignals": ["signal1", "signal2"],
      "flowsWithHeadlines": ["headline1", "headline2"]
    }
  ]
}`;
  }

  /**
   * Create landing page optimization prompt
   * Why this matters: Structures the prompt to generate specific copy improvements addressing customer concerns.
   */
  private createLandingPagePrompt(
    callInsights: GongAnalyzedCall[],
    croAnalysisResults: CROAnalysisResult[],
    landingPageUrl?: string
  ): string {
    const allConversionBarriers = croAnalysisResults.flatMap(result => 
      result.conversionBarriers
    );
    const allCustomerObjections = croAnalysisResults.flatMap(result => 
      result.customerObjections
    );

    return `You are a conversion rate optimization specialist. Create landing page copy recommendations based on customer insights from sales calls.

CONVERSION BARRIERS IDENTIFIED:
${allConversionBarriers.slice(0, 10).map(barrier => 
  `- ${barrier.barrier} (${barrier.category}): "${barrier.customerQuote}"`
).join('\n')}

CUSTOMER OBJECTIONS:
${allCustomerObjections.slice(0, 8).map(objection => 
  `- "${objection.objection}" (emotional state: ${objection.emotionalState})`
).join('\n')}

${landingPageUrl ? `CURRENT LANDING PAGE: ${landingPageUrl}` : ''}

Generate specific copy improvements that address these barriers and objections. Use customer language and focus on conversion optimization.

JSON STRUCTURE:
{
  "heroSection": {
    "headline": "improved headline",
    "subheadline": "supporting subheadline",
    "ctaButton": "CTA button text",
    "painPointsAddressed": ["barrier1", "barrier2"]
  },
  "trustSignals": [
    {
      "type": "testimonial/guarantee/certification/social_proof",
      "content": "trust signal content",
      "placement": "where to place on page"
    }
  ],
  "formOptimizations": [
    {
      "issue": "current form issue",
      "recommendation": "how to fix",
      "expectedImpact": "conversion impact"
    }
  ],
  "copyImprovements": [
    {
      "section": "page section",
      "currentIssue": "what's wrong with current copy",
      "improvedCopy": "better copy version",
      "reasonForChange": "why this addresses customer concerns"
    }
  ]
}`;
  }

  /**
   * Create A/B testing prompt
   * Why this matters: Structures the prompt to generate testable hypotheses based on customer insights.
   */
  private createABTestingPrompt(
    callInsights: GongAnalyzedCall[],
    croAnalysisResults: CROAnalysisResult[]
  ): string {
    const allConversionBarriers = croAnalysisResults.flatMap(result => 
      result.conversionBarriers
    );

    return `You are a conversion optimization strategist. Create A/B testing suggestions based on customer insights and conversion barriers identified in sales calls.

CONVERSION BARRIERS TO TEST:
${allConversionBarriers.slice(0, 8).map(barrier => 
  `- ${barrier.barrier} (${barrier.category}, ${barrier.severity} severity): ${barrier.landingPageFix}`
).join('\n')}

Create testable hypotheses that address these barriers. Focus on elements that can be A/B tested with clear success metrics.

JSON STRUCTURE:
{
  "headlines": [
    {
      "testName": "descriptive test name",
      "variant": "new headline text",
      "hypothesis": "we believe this will improve conversions because...",
      "expectedOutcome": "predicted result",
      "painPointAddressed": "which barrier this addresses"
    }
  ],
  "ctas": [
    {
      "testName": "descriptive test name",
      "variant": "new CTA text",
      "hypothesis": "we believe this will improve conversions because...",
      "expectedOutcome": "predicted result"
    }
  ],
  "formElements": [
    {
      "testName": "descriptive test name",
      "element": "form element to test",
      "variant": "new version",
      "hypothesis": "we believe this will improve conversions because...",
      "expectedOutcome": "predicted result"
    }
  ],
  "trustElements": [
    {
      "testName": "descriptive test name",
      "element": "trust element to test",
      "variant": "new version",
      "hypothesis": "we believe this will improve conversions because...",
      "expectedOutcome": "predicted result"
    }
  ]
}`;
  }

  /**
   * Get service health status
   * Why this matters: Monitoring and diagnostics for the OpenAI integration.
   */
  async getHealthStatus(): Promise<{
    model: string;
    available: boolean;
    lastError?: string;
  }> {
    try {
      if (!this.client) {
        return {
          model: this.model,
          available: false,
          lastError: 'OpenAI client not initialized'
        };
      }

      // Test with a simple request
      await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'test' }],
        max_completion_tokens: 1
      });

      return {
        model: this.model,
        available: true
      };
    } catch (error: any) {
      return {
        model: this.model,
        available: false,
        lastError: error.message
      };
    }
  }
}

export default CROContentGenerator; 