import OpenAI from 'openai';
import { PersonaPainPointMatch } from './personaPainPointMatcher';
import { EnhancedPersonaResult } from './enhancedPersonaDetector';

/**
 * CTA Structure Interface
 * Why this matters: Defines the 4-part CTA structure that follows Apollo's CTA module format
 * for consistent, professional, and conversion-optimized call-to-action components.
 */
export interface CTAStructure {
  category_header: string;  // ALL CAPS category (e.g., "DATA-DRIVEN SALES")
  headline: string;         // Compelling headline (e.g., "Close More Deals with Apollo")
  description: string;      // Pain point-driven description text
  action_button: string;    // Action-oriented CTA button (e.g., "Try Apollo Free →")
}

/**
 * Position-Specific CTA Interface
 * Why this matters: Different article positions require different messaging approaches
 * to match the reader's mindset and engagement level at each stage.
 */
export interface PositionSpecificCTA {
  position: 'beginning' | 'middle' | 'end';
  cta: CTAStructure;
  strategy: string;        // The psychological strategy used (awareness/consideration/conversion)
  shortcode: string;       // Ready-to-use shortcode for article injection
}

/**
 * CTA Generation Result Interface
 * Why this matters: Comprehensive result structure that includes all generated CTAs
 * plus metadata for quality assessment and optimization.
 */
export interface CTAGenerationResult {
  article_url?: string;
  persona: string;
  matched_pain_points: number;
  cta_variants: {
    beginning: PositionSpecificCTA;
    middle: PositionSpecificCTA;
    end: PositionSpecificCTA;
  };
  pain_point_context: {
    primary_pain_points: string[];
    customer_quotes_used: string[];
    liquid_variables_referenced: string[];
  };
  generation_metadata: {
    total_variants: number;
    generation_timestamp: string;
    model_used: string;
    confidence_score: number;
    cro_principles_applied: string[];
  };
}

/**
 * CTA Generation Engine Service
 * Why this matters: Creates hyper-relevant CTA copy using matched pain points and persona context
 * following Apollo's CTA module structure and CRO best practices for maximum conversion impact.
 */
class CTAGenerationService {
  private openai: OpenAI | null = null;

  constructor() {
    this.initializeOpenAI();
    console.log('✅ CTA Generation Service initialized');
  }

  /**
   * Initialize OpenAI client
   * Why this matters: OpenAI powers the intelligent CTA generation using gpt-4.1-nano model.
   */
  private async initializeOpenAI(): Promise<void> {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      console.error('❌ OpenAI API key not found for CTA generation');
      return;
    }

    try {
      this.openai = new OpenAI({ apiKey });
      console.log('✅ OpenAI client initialized for CTA generation');
    } catch (error) {
      console.error('❌ Failed to initialize OpenAI for CTA generation:', error);
    }
  }

  /**
   * Generate hyper-relevant CTAs using persona-pain point matching
   * Why this matters: This is the core function that transforms customer insights into conversion-optimized
   * CTAs that speak directly to specific personas using their actual pain points and language.
   */
  async generateCTAs(
    personaPainPointMatch: PersonaPainPointMatch,
    enhancedPersona?: EnhancedPersonaResult,
    articleUrl?: string
  ): Promise<CTAGenerationResult> {
    try {
      if (!this.openai) {
        throw new Error('OpenAI client not initialized');
      }

      console.log(`🎯 Generating hyper-relevant CTAs for persona: ${personaPainPointMatch.persona}`);
      console.log(`📊 Using ${personaPainPointMatch.matched_pain_points.length} matched pain points`);

      // Generate position-specific CTAs
      const beginningCTA = await this.generatePositionCTA(
        'beginning',
        personaPainPointMatch,
        enhancedPersona,
        'awareness'
      );

      const middleCTA = await this.generatePositionCTA(
        'middle',
        personaPainPointMatch,
        enhancedPersona,
        'consideration'
      );

      const endCTA = await this.generatePositionCTA(
        'end',
        personaPainPointMatch,
        enhancedPersona,
        'conversion'
      );

      // Extract pain point context for metadata
      const painPointContext = this.extractPainPointContext(personaPainPointMatch);

      // Calculate overall confidence score
      const confidenceScore = this.calculateConfidenceScore(personaPainPointMatch, enhancedPersona);

      const result: CTAGenerationResult = {
        article_url: articleUrl,
        persona: personaPainPointMatch.persona,
        matched_pain_points: personaPainPointMatch.matched_pain_points.length,
        cta_variants: {
          beginning: beginningCTA,
          middle: middleCTA,
          end: endCTA
        },
        pain_point_context: painPointContext,
        generation_metadata: {
          total_variants: 3,
          generation_timestamp: new Date().toISOString(),
          model_used: 'gpt-4.1-nano-2025-04-14',
          confidence_score: confidenceScore,
          cro_principles_applied: [
            'Pain point-driven messaging',
            'Persona-specific language',
            'Progressive funnel strategy',
            'Social proof integration',
            'Clear value proposition',
            'Action-oriented CTAs'
          ]
        }
      };

      console.log(`✅ Generated 3 position-specific CTAs with ${confidenceScore}% confidence`);
      return result;

    } catch (error: any) {
      console.error('❌ CTA generation failed:', error);
      throw new Error(`CTA generation failed: ${error.message}`);
    }
  }

  /**
   * Generate CTA for specific article position
   * Why this matters: Different positions require different psychological approaches -
   * beginning (awareness), middle (consideration), end (conversion) to match reader mindset.
   */
  private async generatePositionCTA(
    position: 'beginning' | 'middle' | 'end',
    personaPainPointMatch: PersonaPainPointMatch,
    enhancedPersona: EnhancedPersonaResult | undefined,
    strategy: 'awareness' | 'consideration' | 'conversion'
  ): Promise<PositionSpecificCTA> {
    
    const prompt = this.buildCTAPrompt(position, strategy, personaPainPointMatch, enhancedPersona);

    try {
      const completion = await this.openai!.chat.completions.create({
        model: "gpt-4.1-nano-2025-04-14",
        messages: [
          {
            role: "system",
            content: this.getCTASystemPrompt()
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7, // Higher creativity for compelling copy
        max_tokens: 800,
        response_format: { type: "json_object" }
      });

      // Log token usage for CTA generation
      if (completion.usage) {
        const { prompt_tokens, completion_tokens, total_tokens } = completion.usage;
        const inputCost = (prompt_tokens / 1000) * 0.0015;
        const outputCost = (completion_tokens / 1000) * 0.006;
        const totalCost = inputCost + outputCost;
        
        console.log(`💰 CTA Generation (${position}) - Tokens: ${total_tokens}, Cost: $${totalCost.toFixed(4)}`);
      }

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('Empty response from OpenAI for CTA generation');
      }

      const ctaData = JSON.parse(responseContent) as CTAStructure;
      
      // Validate CTA structure
      this.validateCTAStructure(ctaData, position);

      // Generate shortcode for article injection
      const shortcode = this.generateShortcode(ctaData, position);

      return {
        position,
        cta: ctaData,
        strategy,
        shortcode
      };

    } catch (error: any) {
      console.error(`❌ Failed to generate ${position} CTA:`, error);
      throw new Error(`${position} CTA generation failed: ${error.message}`);
    }
  }

  /**
   * Build CTA generation prompt with pain point context
   * Why this matters: The prompt engineering determines the quality and relevance of generated CTAs.
   * Uses actual customer language and pain points for authentic, compelling copy.
   */
  private buildCTAPrompt(
    position: 'beginning' | 'middle' | 'end',
    strategy: 'awareness' | 'consideration' | 'conversion',
    personaPainPointMatch: PersonaPainPointMatch,
    enhancedPersona?: EnhancedPersonaResult
  ): string {
    
    // Extract top pain points and customer quotes
    const topPainPoints = personaPainPointMatch.matched_pain_points.slice(0, 3);
    const customerQuotes = topPainPoints.flatMap(pp => pp.customer_quotes).slice(0, 5);
    const liquidVariables = topPainPoints.map(pp => pp.liquid_variable);

    // Get persona context
    const personaTitle = enhancedPersona?.primary_persona.title || personaPainPointMatch.persona;
    const seniorityLevel = enhancedPersona?.primary_persona.seniority_level || 'Unknown';
    const department = enhancedPersona?.primary_persona.department || 'Unknown';
    const solutionReadiness = enhancedPersona?.content_insights.solution_readiness || 'evaluating';

    // Get position-specific strategy guidance
    const strategyGuidance = this.getStrategyGuidance(position, strategy);

    return `
Generate a hyper-relevant CTA for Apollo using actual customer pain points and persona insights.

PERSONA CONTEXT:
- Target Persona: ${personaTitle}
- Seniority Level: ${seniorityLevel}
- Department: ${department}
- Solution Readiness: ${solutionReadiness}
- Article Position: ${position}
- Strategy: ${strategy}

MATCHED PAIN POINTS:
${topPainPoints.map((pp, idx) => `
${idx + 1}. ${pp.pain_point.theme}
   Description: ${pp.pain_point.description}
   Relevance: ${Math.round(pp.relevance_score * 100)}%
   Customer Language: ${pp.liquid_variable}
   Severity: ${pp.pain_point.severity}
`).join('')}

ACTUAL CUSTOMER QUOTES:
${customerQuotes.map((quote, idx) => `${idx + 1}. "${quote}"`).join('\n')}

CONTENT CONTEXT:
- Industry: ${personaPainPointMatch.content_context.industry_context}
- Article Themes: ${personaPainPointMatch.content_context.article_themes.join(', ')}
- Content Intent: ${personaPainPointMatch.content_context.content_intent}

STRATEGY GUIDANCE:
${strategyGuidance}

CTA REQUIREMENTS:
Generate a 4-part CTA structure following Apollo's format:

1. CATEGORY HEADER: Short, ALL CAPS category that captures the value theme (e.g., "DATA-DRIVEN SALES", "REVENUE ACCELERATION", "PIPELINE INTELLIGENCE")

2. HEADLINE: Compelling headline that promises a specific outcome using pain point language (25-40 characters ideal)

3. DESCRIPTION: 2-3 sentences that speak directly to the persona's pain points using customer language from the quotes above. Address their specific concerns and position Apollo as the solution.

4. ACTION BUTTON: Clear, action-oriented CTA button text with arrow (e.g., "Try Apollo Free →", "Get ROI Calculator →", "Book Demo →")

CRO BEST PRACTICES TO APPLY:
- Use customer's actual language and terminology from the quotes
- Address specific pain points, don't be generic
- Create urgency without being pushy
- Match the messaging to the ${strategy} stage
- Include social proof elements when relevant
- Make the value proposition crystal clear
- Ensure the action is obvious and low-risk

RESPONSE FORMAT:
Respond with valid JSON containing these exact fields:
{
  "category_header": "ALL CAPS CATEGORY",
  "headline": "Compelling headline using pain point language",
  "description": "2-3 sentences addressing persona pain points with customer language and positioning Apollo as solution",
  "action_button": "Action text with arrow →"
}

Focus on being hyper-relevant to ${personaTitle} using the actual customer pain points and quotes provided.`;
  }

  /**
   * Get strategy-specific guidance for CTA positioning
   * Why this matters: Different article positions require different psychological approaches
   * to effectively guide readers through the awareness-consideration-conversion funnel.
   */
  private getStrategyGuidance(
    position: 'beginning' | 'middle' | 'end',
    strategy: 'awareness' | 'consideration' | 'conversion'
  ): string {
    
    const guidanceMap: Record<string, string> = {
      'beginning-awareness': `
BEGINNING/AWARENESS STRATEGY:
- Reader is just becoming aware of their problem
- Focus on pain point recognition and problem validation
- Use empathetic language that shows you understand their struggle
- Introduce Apollo as the category leader/solution provider
- Keep CTA low-commitment (free trial, assessment, resources)
- Avoid being too sales-heavy or feature-focused`,
      
      'middle-consideration': `
MIDDLE/CONSIDERATION STRATEGY:
- Reader understands their problem and is evaluating solutions
- Focus on differentiation and unique value proposition
- Address common objections and concerns
- Use social proof and credibility indicators
- Compare against status quo or inferior solutions
- CTA can be more specific (demo, consultation, ROI calculator)`,
      
      'end-conversion': `
END/CONVERSION STRATEGY:
- Reader is ready to take action or make a decision
- Focus on urgency and clear next steps
- Address final concerns and remove friction
- Emphasize immediate value and quick wins
- Use stronger social proof (customer stories, results)
- CTA should be direct and action-oriented (demo, trial, contact sales)`
    };

    const key = `${position}-${strategy}`;
    return guidanceMap[key] || guidanceMap['middle-consideration']; // Fallback to middle strategy
  }

  /**
   * Get system prompt for CTA generation
   * Why this matters: Sets the context for OpenAI to understand Apollo's brand voice,
   * CTA structure requirements, and conversion optimization principles.
   */
  private getCTASystemPrompt(): string {
    return `You are an expert CRO (Conversion Rate Optimization) copywriter specializing in creating hyper-relevant CTAs for Apollo, a leading B2B sales intelligence platform. 

Apollo helps sales teams:
- Find and connect with ideal prospects
- Automate outreach sequences
- Track pipeline and forecast accurately
- Enrich contact and company data
- Increase sales productivity and quota achievement

Your expertise includes:
- Using Voice of Customer data to create authentic messaging
- Persona-specific pain point targeting
- Progressive funnel optimization (awareness → consideration → conversion)
- B2B sales psychology and buying behavior
- Apollo's value propositions and competitive advantages

Key Apollo differentiators:
- 275M+ contacts and 73M+ companies in database
- AI-powered sales insights and recommendations
- Seamless integrations with major CRM platforms
- Proven ROI with measurable pipeline impact
- Trusted by 1M+ sales professionals globally

Your CTAs must:
- Follow the exact 4-part structure provided
- Use actual customer language from pain point data
- Be hyper-relevant to the specific persona
- Apply proven CRO principles
- Maintain Apollo's professional, results-driven brand voice
- Drive measurable conversion actions

Always prioritize customer language and pain point relevance over generic sales messaging.`;
  }

  /**
   * Validate CTA structure and content quality
   * Why this matters: Ensures generated CTAs meet format requirements and quality standards
   * before being used in article injection.
   */
  private validateCTAStructure(cta: CTAStructure, position: string): void {
    // Validate required fields
    if (!cta.category_header || !cta.headline || !cta.description || !cta.action_button) {
      throw new Error(`Invalid CTA structure for ${position} position - missing required fields`);
    }

    // Validate category header format
    if (cta.category_header !== cta.category_header.toUpperCase()) {
      console.warn(`⚠️ Category header should be ALL CAPS for ${position} CTA`);
    }

    // Validate action button has arrow
    if (!cta.action_button.includes('→')) {
      console.warn(`⚠️ Action button should include arrow (→) for ${position} CTA`);
    }

    // Validate length constraints
    if (cta.headline.length > 60) {
      console.warn(`⚠️ Headline may be too long (${cta.headline.length} chars) for ${position} CTA`);
    }

    if (cta.description.length > 400) {
      console.warn(`⚠️ Description may be too long (${cta.description.length} chars) for ${position} CTA`);
    }

    console.log(`✅ CTA structure validated for ${position} position`);
  }

  /**
   * Generate shortcode for article injection
   * Why this matters: Creates ready-to-use shortcode syntax that can be dynamically injected
   * into articles at strategic positions without disrupting content flow.
   */
  private generateShortcode(cta: CTAStructure, position: string): string {
    const shortcodeId = `apollo_cta_${position}_${Date.now()}`;
    
    return `[apollo-cta id="${shortcodeId}" position="${position}"]
  [cta-category]${cta.category_header}[/cta-category]
  [cta-headline]${cta.headline}[/cta-headline]
  [cta-description]${cta.description}[/cta-description]
  [cta-action]${cta.action_button}[/cta-action]
[/apollo-cta]`;
  }

  /**
   * Extract pain point context for metadata
   * Why this matters: Provides transparency into which pain points and customer quotes
   * were used for CTA generation for optimization and quality assessment.
   */
  private extractPainPointContext(personaPainPointMatch: PersonaPainPointMatch): {
    primary_pain_points: string[];
    customer_quotes_used: string[];
    liquid_variables_referenced: string[];
  } {
    
    const primaryPainPoints = personaPainPointMatch.matched_pain_points
      .slice(0, 3)
      .map(pp => pp.pain_point.theme);

    const customerQuotesUsed = personaPainPointMatch.matched_pain_points
      .flatMap(pp => pp.customer_quotes)
      .slice(0, 5);

    const liquidVariablesReferenced = personaPainPointMatch.matched_pain_points
      .map(pp => pp.liquid_variable);

    return {
      primary_pain_points: primaryPainPoints,
      customer_quotes_used: customerQuotesUsed,
      liquid_variables_referenced: liquidVariablesReferenced
    };
  }

  /**
   * Calculate confidence score for CTA generation
   * Why this matters: Provides quality metric based on pain point matching confidence
   * and persona detection accuracy to guide usage decisions.
   */
  private calculateConfidenceScore(
    personaPainPointMatch: PersonaPainPointMatch,
    enhancedPersona?: EnhancedPersonaResult
  ): number {
    
    // Base confidence from pain point matching
    let confidence = personaPainPointMatch.matching_confidence;

    // Boost from enhanced persona detection
    if (enhancedPersona) {
      const personaConfidence = enhancedPersona.primary_persona.confidence;
      const validationScore = enhancedPersona.persona_validation.consistency_score;
      
      // Average persona-related confidence factors
      const personaBoost = (personaConfidence + validationScore) / 2;
      confidence = (confidence * 0.7) + (personaBoost * 0.3);
    }

    // Adjust based on number of matched pain points
    const painPointCount = personaPainPointMatch.matched_pain_points.length;
    if (painPointCount >= 3) {
      confidence += 5; // Bonus for good matching
    } else if (painPointCount === 1) {
      confidence -= 10; // Penalty for limited data
    }

    // Adjust based on pain point quality
    const avgRelevanceScore = personaPainPointMatch.matched_pain_points
      .reduce((sum, pp) => sum + pp.relevance_score, 0) / painPointCount;
    
    if (avgRelevanceScore > 0.7) {
      confidence += 5; // Bonus for high relevance
    }

    return Math.max(0, Math.min(100, Math.round(confidence)));
  }

  /**
   * Test CTA generation functionality
   * Why this matters: Validates that the service is working correctly with mock data.
   */
  async testCTAGeneration(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.openai) {
        return { success: false, message: 'OpenAI client not initialized' };
      }

      // Create mock persona-pain point match for testing
      const mockMatch: PersonaPainPointMatch = {
        persona: 'Chief Revenue Officer (CRO)',
        matched_pain_points: [
          {
            pain_point: {
              id: 'test-1',
              theme: 'Pipeline Visibility',
              liquidVariable: 'pipeline_visibility',
              description: 'Lack of clear pipeline visibility affecting forecast accuracy',
              frequency: 5,
              severity: 'high',
              customerQuotes: ['We never know where our deals actually stand', 'Forecasting is just guesswork'],
              emotionalTriggers: ['frustration', 'anxiety']
            },
            relevance_score: 0.85,
            matching_reason: 'High persona alignment for CRO',
            liquid_variable: '{{ pain_points.pipeline_visibility }}',
            customer_quotes: ['We never know where our deals actually stand']
          }
        ],
        content_context: {
          article_themes: ['Sales Pipeline Management'],
          industry_context: 'B2B Software',
          content_intent: 'consideration'
        },
        matching_confidence: 85,
        matching_timestamp: new Date().toISOString()
      };

      const result = await this.generateCTAs(mockMatch);
      
      if (result.cta_variants.beginning && result.cta_variants.middle && result.cta_variants.end) {
        return {
          success: true,
          message: `Test successful - Generated 3 CTAs with ${result.generation_metadata.confidence_score}% confidence`
        };
      } else {
        return {
          success: false,
          message: 'Test failed - Incomplete CTA generation'
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
   * Why this matters: Provides health check information for monitoring.
   */
  getServiceStatus(): { available: boolean; openaiReady: boolean } {
    return {
      available: true,
      openaiReady: !!this.openai
    };
  }
}

export default CTAGenerationService;
