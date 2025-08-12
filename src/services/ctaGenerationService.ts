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
        max_completion_tokens: 800,
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
      
      // Process VoC liquid variables if pain points are available
      const processedCTA = personaPainPointMatch.matched_pain_points.length > 0 
        ? this.processVoCVariables(ctaData, personaPainPointMatch.matched_pain_points)
        : ctaData;
      
      // Validate CTA structure
      this.validateCTAStructure(processedCTA, position);

      // Generate shortcode for article injection
      const shortcode = this.generateShortcode(processedCTA, position);

      return {
        position,
        cta: processedCTA,
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

CRITICAL: ALWAYS target Apollo's core sales audience regardless of article topic. The article may be about Customer Success Directors, but your CTA must appeal to sales professionals who are reading it or trying to reach customer success professionals.

TARGET AUDIENCE (FIXED - DO NOT CHANGE):
- Primary Target: Sales Leaders, SDRs, BDRs, Account Executives, and Marketers focused on lead generation and revenue growth
- Article Context Persona: ${personaTitle} (use only for context, NOT as CTA target)
- Article Department: ${department}
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

AVAILABLE VOC LIQUID VARIABLES:
${liquidVariables.length > 0 ? liquidVariables.map((variable, idx) => `${idx + 1}. ${variable} - Use this to inject actual customer pain point language`).join('\n') : 'No VoC variables available'}

You can use these liquid variables in your CTA copy to inject authentic customer language:
- ${liquidVariables.join('\n- ')}
- Add "_quote" suffix for customer quotes (e.g., {{ pain_points.pipeline_visibility_quote }})
- Add "_theme" suffix for pain point themes (e.g., {{ pain_points.pipeline_visibility_theme }})

CONTENT CONTEXT:
- Industry: ${personaPainPointMatch.content_context.industry_context}
- Article Themes: ${personaPainPointMatch.content_context.article_themes.join(', ')}
- Content Intent: ${personaPainPointMatch.content_context.content_intent}

STRATEGY GUIDANCE:
${strategyGuidance}

CTA REQUIREMENTS:
Generate a 4-part CTA structure following Apollo's format:

1. CATEGORY HEADER: Short, ALL CAPS category that captures the value theme (e.g., "DATA-DRIVEN SALES", "REVENUE ACCELERATION", "PIPELINE INTELLIGENCE")

2. HEADLINE: Benefit-forward headline that promises a specific outcome using pain point language (25-40 characters ideal). Lead with the benefit/result, not the feature. USE TITLE CASE - capitalize the first letter of every word (e.g., "Close Funding Faster With Targeted Outreach").

3. DESCRIPTION: 2-3 sentences using these CRO best practices:
   - BENEFIT-FORWARD COPY: Lead with outcomes and results, not features
   - URGENCY CUES: Create time-sensitive motivation without being pushy
   - PERSONA-TAILORED HOOKS: Use language that resonates with specific sales roles (SDRs, AEs, Sales Leaders, etc.)
   - VARIED OPENINGS: Avoid starting every CTA with "Sales team..." - use diverse openings like "Accelerate your prospecting", "Transform your pipeline", "Stop wasting time on", "Identify high-quality prospects", etc.
   Address specific go-to-market challenges using customer language from quotes above.

4. ACTION BUTTON: Must be one of these exact options:
   - "Start Your Free Trial →"
   - "Try Apollo Free →"
   - "Start a Trial →"
   - "Schedule a Demo →"
   - "Request a Demo →"
   - "Start Prospecting →"
   - "Get Leads Now →"

CRO BEST PRACTICES TO APPLY:
- BENEFIT-FORWARD COPY: Lead with outcomes (quota achievement, revenue growth, time savings) not features
- URGENCY CUES: Use time-sensitive language ("accelerate", "faster", "immediately", "now") without being pushy
- PERSONA-TAILORED HOOKS: Match language to sales roles:
  * SDRs/BDRs: Focus on prospect quality, outreach efficiency, pipeline building
  * AEs: Emphasize deal velocity, conversion rates, quota achievement  
  * Sales Leaders: Highlight team performance, predictable revenue, scaling
  * Marketers: Lead quality, attribution, campaign effectiveness
- VARIED OPENING STYLES: Use diverse description openings to avoid repetition:
  * Problem-focused: "Stop wasting time on...", "Eliminate the guesswork from...", "Struggling with..."
  * Action-oriented: "Accelerate your...", "Transform your...", "Optimize your..."
  * Benefit-forward: "Achieve quota faster by...", "Increase pipeline velocity with...", "Double your..."
  * Question-based: "Ready to close more deals?", "Tired of missing targets?"
  * Direct statements: "Modern revenue teams rely on...", "Top-performing reps use..."
- VOC LIQUID VARIABLES: Use the provided liquid variables to inject actual customer pain point language
- Use customer's actual language and terminology from the quotes
- Address specific go-to-market challenges that Apollo solves (without always starting with "Sales team...")
- Position Apollo as the AI-powered go-to-market platform solution
- Create urgency around sales performance and revenue growth
- Match the messaging to the ${strategy} stage
- Include social proof elements when relevant
- Make the value proposition crystal clear for sales professionals
- Ensure the action is obvious and low-risk

RESPONSE FORMAT:
Respond with valid JSON containing these exact fields:
{
  "category_header": "ALL CAPS CATEGORY",
  "headline": "Title Case Headline Using Pain Point Language (Every Word Capitalized)",
  "description": "2-3 sentences addressing pain points with customer language and positioning Apollo as solution",
  "action_button": "Must be exactly one of: 'Start Your Free Trial', 'Try Apollo Free', 'Start a Trial', 'Schedule a Demo', 'Request a Demo', 'Start Prospecting', 'Get Leads Now'"
}

REMEMBER: You MUST target Apollo's core sales audience (Sales Leaders, SDRs, BDRs, AEs, Marketers) NOT the article's persona. If the article is about Customer Success Directors, your CTA should still appeal to sales professionals who might be reading it to understand their CS counterparts to understand how to reach them using Apollo. Focus on go-to-market challenges like prospecting, pipeline building, quota achievement, and revenue growth - NOT customer retention or success metrics.

CRITICAL: Vary your description openings across all three positions (beginning/middle/end). Do NOT start all CTAs with "Sales team..." - use the diverse opening styles provided above to create unique, engaging copy for each position.

STRONGLY ENCOURAGED: Use the provided VoC liquid variables in your CTA copy to inject authentic customer language and pain points directly from Gong call analysis.`;
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
- BENEFIT-FORWARD: Focus on outcomes they'll achieve, not features
- URGENCY CUES: Use gentle time-sensitive language ("start accelerating", "begin improving")
- PERSONA-TAILORED HOOKS: Match pain recognition to their specific sales role
- Use empathetic language that shows you understand their struggle
- Introduce Apollo as the category leader/solution provider
- Keep CTA low-commitment (free trial, assessment, resources)
- OPENING VARIETY: Use empathetic/problem-recognition openings like "Struggling with low-quality leads?", "Tired of manual prospecting?", "Ready to streamline your outreach?"
- Avoid being too sales-heavy or feature-focused`,
      
      'middle-consideration': `
MIDDLE/CONSIDERATION STRATEGY:
- Reader understands their problem and is evaluating solutions
- BENEFIT-FORWARD: Emphasize competitive advantages and measurable outcomes
- URGENCY CUES: Create scarcity around timing ("meet your quota", "accelerate decision")
- PERSONA-TAILORED HOOKS: Address specific evaluation criteria by role
- Focus on differentiation and unique value proposition
- Address common objections and concerns
- Use social proof and credibility indicators
- Compare against status quo or inferior solutions
- OPENING VARIETY: Use comparison/differentiation openings like "Modern revenue teams rely on...", "Top performers use...", "While others struggle with..."
- CTA can be more specific (demo, consultation, ROI calculator)`,
      
      'end-conversion': `
END/CONVERSION STRATEGY:
- Reader is ready to take action or make a decision
- BENEFIT-FORWARD: Emphasize immediate value and quick wins they'll get (meet your quota, hit your numbers, close more deals faster)
- URGENCY CUES: Strong time-sensitive language ("start today", "immediate access", "don't wait")
- PERSONA-TAILORED HOOKS: Appeal to their specific success metrics and KPIs
- Focus on urgency and clear next steps
- Address final concerns and remove friction
- Emphasize immediate value and quick wins
- Use stronger social proof (customer stories, results)
- OPENING VARIETY: Use action/urgency openings like "Transform your pipeline today", "Start closing more deals now", "Accelerate your quota achievement"
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

Apollo is an AI-powered go-to-market platform that helps sales professionals:
- Find and connect with ideal prospects using AI-driven prospecting
- Automate outreach sequences and personalize at scale
- Track pipeline and forecast accurately with integrated sales tools
- Enrich contact and company data from vast B2B database
- Increase sales productivity and quota achievement
- Manage entire go-to-market process from single command center

FIXED TARGET AUDIENCE: Sales Leaders, SDRs, BDRs, Account Executives, and Marketers focused on lead generation and revenue growth.

CRITICAL INSTRUCTION: ALWAYS create CTAs for Apollo's core sales audience listed above, regardless of what persona the article is about. If analyzing an article about Customer Success Directors for example, your CTA must still target sales professionals, not CS professionals. Use the article context only for pain point relevance, never for persona targeting.

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
- Target sales professionals who need go-to-market solutions
- Address sales team challenges: prospecting, lead generation, pipeline management, hitting quota, etc.
- Speak to Apollo's core audience: Sales Leaders, SDRs, BDRs, AEs, Marketers
- Position Apollo as the AI-powered go-to-market platform solution
- Apply proven CRO principles
- Maintain Apollo's professional, results-driven brand voice
- Drive measurable conversion actions from sales professionals

Always prioritize customer language and sales team pain points. Focus on go-to-market challenges that Apollo solves for sales professionals.`;
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

    // Validate headline is in title case
    const titleCaseHeadline = cta.headline.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
    if (cta.headline !== titleCaseHeadline) {
      console.warn(`⚠️ Headline should be in Title Case for ${position} CTA. Expected: "${titleCaseHeadline}", Got: "${cta.headline}"`);
    }

    // Validate action button is one of approved options
    const approvedButtons = [
      'Try Apollo Free →',
      'Start Your Free Trial →',
      'Schedule a Demo →',
      'Start a Trial →',
      'Request a Demo →'
    ];
    
    if (!approvedButtons.includes(cta.action_button)) {
      console.warn(`⚠️ Action button "${cta.action_button}" is not an approved option for ${position} CTA`);
      console.warn(`⚠️ Approved options: ${approvedButtons.join(', ')}`);
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
   * Process VoC liquid variables in CTA content
   * Why this matters: Dynamically replaces VoC variables like {{ pain_points.pipeline_visibility }}
   * with actual customer language and pain point descriptions for authentic messaging.
   */
  private processVoCVariables(
    ctaContent: CTAStructure, 
    vocPainPoints: Array<{
      pain_point: any;
      relevance_score: number;
      matching_reason: string;
      liquid_variable: string;
      customer_quotes: string[];
    }>
  ): CTAStructure {
    console.log('🔄 Processing VoC liquid variables in CTA content...');
    
    // Create variable lookup map from matched pain points
    const variableMap = new Map<string, string>();
    
    vocPainPoints.forEach(match => {
      const { pain_point, customer_quotes } = match;
      
      // Map liquid variable patterns to actual content
      const variableKey = pain_point.liquidVariable;
      const painPointDescription = pain_point.description;
      const topCustomerQuote = customer_quotes[0]; // Use the top customer quote
      
      // Store multiple replacement options
      variableMap.set(`pain_points.${variableKey}`, painPointDescription);
      variableMap.set(`pain_points.${variableKey}_quote`, topCustomerQuote);
      variableMap.set(`pain_points.${variableKey}_theme`, pain_point.theme);
    });
    
    // Process each CTA component
    const processedCTA: CTAStructure = {
      category_header: this.replaceVoCVariables(ctaContent.category_header, variableMap),
      headline: this.replaceVoCVariables(ctaContent.headline, variableMap),
      description: this.replaceVoCVariables(ctaContent.description, variableMap),
      action_button: ctaContent.action_button // Action buttons should not contain variables
    };
    
    console.log(`✅ VoC variable processing complete - ${variableMap.size} variables available`);
    return processedCTA;
  }
  
  /**
   * Replace VoC variables in text content
   * Why this matters: Handles the actual text replacement of liquid variables with VoC content.
   */
  private replaceVoCVariables(text: string, variableMap: Map<string, string>): string {
    if (!text) return text;
    
    let processed = text;
    const variablePattern = /\{\{\s*([^}]+)\s*\}\}/g;
    
    processed = processed.replace(variablePattern, (match, variableName) => {
      const trimmedName = variableName.trim();
      
      if (variableMap.has(trimmedName)) {
        console.log(`🔄 Replacing ${match} with VoC content`);
        return variableMap.get(trimmedName) || match;
      }
      
      // Return original if no replacement found
      return match;
    });
    
    return processed;
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
