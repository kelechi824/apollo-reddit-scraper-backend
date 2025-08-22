import OpenAI from 'openai';
import { PersonaPainPointMatch } from './personaPainPointMatcher';
import { EnhancedPersonaResult } from './enhancedPersonaDetector';
import claudeService from './claudeService';

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
  position_specific_context?: {
    beginning: {
      pain_points: string[];
      customer_quotes: string[];
      liquid_variables: string[];
    };
    middle: {
      pain_points: string[];
      customer_quotes: string[];
      liquid_variables: string[];
    };
    end: {
      pain_points: string[];
      customer_quotes: string[];
      liquid_variables: string[];
    };
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
  private claude: typeof claudeService = claudeService;
  private generatedCTAs: Array<{position: string, headline: string, description: string}> = [];

  constructor() {
    this.initializeOpenAI();
    console.log('✅ CTA Generation Service initialized');
  }

  /**
   * Initialize OpenAI client
   * Why this matters: OpenAI powers the intelligent CTA generation using gpt-5-nano model.
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
      if (!this.claude) {
        throw new Error('Claude client not initialized');
      }

      console.log(`🎯 Generating hyper-relevant CTAs for persona: ${personaPainPointMatch.persona}`);
      console.log(`📊 Using ${personaPainPointMatch.matched_pain_points.length} matched pain points`);

      // For backwards compatibility, use the original method if position-specific matching is not available
      // But try to create diverse pain point selections for each position
      const beginningPainPoints = this.selectPainPointsForPosition(personaPainPointMatch.matched_pain_points, 'beginning');
      const middlePainPoints = this.selectPainPointsForPosition(personaPainPointMatch.matched_pain_points, 'middle'); 
      const endPainPoints = this.selectPainPointsForPosition(personaPainPointMatch.matched_pain_points, 'end');

      // Create position-specific matches
      const beginningMatch = { ...personaPainPointMatch, matched_pain_points: beginningPainPoints };
      const middleMatch = { ...personaPainPointMatch, matched_pain_points: middlePainPoints };
      const endMatch = { ...personaPainPointMatch, matched_pain_points: endPainPoints };

      // Generate position-specific CTAs with diverse pain points
      const beginningCTA = await this.generatePositionCTA(
        'beginning',
        beginningMatch,
        enhancedPersona,
        'awareness'
      );

      const middleCTA = await this.generatePositionCTA(
        'middle',
        middleMatch,
        enhancedPersona,
        'consideration'
      );

      const endCTA = await this.generatePositionCTA(
        'end',
        endMatch,
        enhancedPersona,
        'conversion'
      );

      // Extract pain point context for metadata from all used pain points
      const allUsedPainPoints = [
        ...beginningPainPoints,
        ...middlePainPoints.filter(mp => !beginningPainPoints.some(bp => bp.pain_point.id === mp.pain_point.id)),
        ...endPainPoints.filter(ep => !beginningPainPoints.some(bp => bp.pain_point.id === ep.pain_point.id) && 
                                     !middlePainPoints.some(mp => mp.pain_point.id === ep.pain_point.id))
      ];
      
      const diversePainPointMatch = { ...personaPainPointMatch, matched_pain_points: allUsedPainPoints };
      const painPointContext = this.extractPainPointContext(diversePainPointMatch);

      // Extract position-specific contexts for detailed insights
      const positionSpecificContext = {
        beginning: this.extractPainPointContext(beginningMatch),
        middle: this.extractPainPointContext(middleMatch),
        end: this.extractPainPointContext(endMatch)
      };

      // Calculate overall confidence score
      const confidenceScore = this.calculateConfidenceScore(personaPainPointMatch, enhancedPersona);

      const result: CTAGenerationResult = {
        article_url: articleUrl,
        persona: personaPainPointMatch.persona,
        matched_pain_points: allUsedPainPoints.length,
        cta_variants: {
          beginning: beginningCTA,
          middle: middleCTA,
          end: endCTA
        },
        pain_point_context: painPointContext,
        position_specific_context: {
          beginning: {
            pain_points: positionSpecificContext.beginning.primary_pain_points,
            customer_quotes: positionSpecificContext.beginning.customer_quotes_used,
            liquid_variables: positionSpecificContext.beginning.liquid_variables_referenced
          },
          middle: {
            pain_points: positionSpecificContext.middle.primary_pain_points,
            customer_quotes: positionSpecificContext.middle.customer_quotes_used,
            liquid_variables: positionSpecificContext.middle.liquid_variables_referenced
          },
          end: {
            pain_points: positionSpecificContext.end.primary_pain_points,
            customer_quotes: positionSpecificContext.end.customer_quotes_used,
            liquid_variables: positionSpecificContext.end.liquid_variables_referenced
          }
        },
        generation_metadata: {
          total_variants: 3,
          generation_timestamp: new Date().toISOString(),
          model_used: 'gpt-5-nano',
          confidence_score: confidenceScore,
          cro_principles_applied: [
            'Pain point-driven messaging',
            'Persona-specific language',
            'Progressive funnel strategy',
            'Position-specific pain point targeting',
            'Diverse pain point utilization',
            'Social proof integration',
            'Clear value proposition',
            'Action-oriented CTAs'
          ]
        }
      };

      console.log(`✅ Generated 3 diverse position-specific CTAs using ${allUsedPainPoints.length} unique pain points with ${confidenceScore}% confidence`);
      return result;

    } catch (error: any) {
      console.error('❌ CTA generation failed:', error);
      throw new Error(`CTA generation failed: ${error.message}`);
    }
  }

  /**
   * Generate CTAs with enhanced position-specific pain point matching
   * Why this matters: Uses the new position-specific matching to ensure maximum variety and relevance across all three CTAs.
   */
  async generateCTAsWithPositionMatching(
    contentAnalysis: any,
    vocPainPoints: any[],
    enhancedPersona?: EnhancedPersonaResult,
    articleUrl?: string
  ): Promise<CTAGenerationResult> {
    
    // Clear previous CTAs for diversity checking
    this.generatedCTAs = [];
    
    const PersonaPainPointMatcher = require('./personaPainPointMatcher').default;
    const matcher = new PersonaPainPointMatcher();
    
    try {
      console.log(`🎯 Generating CTAs with position-specific pain point matching for persona: ${contentAnalysis.persona}`);

      // Track used pain point IDs to ensure variety
      const usedPainPointIds: string[] = [];

      // Generate position-specific matches
      const beginningMatch = await matcher.matchPersonaToPainPointsForPosition(
        contentAnalysis, 'beginning', vocPainPoints, usedPainPointIds
      );
      
      beginningMatch.matched_pain_points.forEach((pp: any) => usedPainPointIds.push(pp.pain_point.id));

      const middleMatch = await matcher.matchPersonaToPainPointsForPosition(
        contentAnalysis, 'middle', vocPainPoints, usedPainPointIds
      );
      
      middleMatch.matched_pain_points.forEach((pp: any) => usedPainPointIds.push(pp.pain_point.id));

      const endMatch = await matcher.matchPersonaToPainPointsForPosition(
        contentAnalysis, 'end', vocPainPoints, usedPainPointIds
      );

      // Generate position-specific CTAs
      const beginningCTA = await this.generatePositionCTA(
        'beginning',
        beginningMatch,
        enhancedPersona,
        'awareness'
      );

      const middleCTA = await this.generatePositionCTA(
        'middle',
        middleMatch,
        enhancedPersona,
        'consideration'
      );

      const endCTA = await this.generatePositionCTA(
        'end',
        endMatch,
        enhancedPersona,
        'conversion'
      );

      // Combine all pain points for comprehensive context
      const allPainPoints = [
        ...beginningMatch.matched_pain_points,
        ...middleMatch.matched_pain_points,
        ...endMatch.matched_pain_points
      ];

      const combinedMatch = {
        persona: contentAnalysis.persona,
        matched_pain_points: allPainPoints,
        content_context: beginningMatch.content_context,
        matching_confidence: Math.round((beginningMatch.matching_confidence + middleMatch.matching_confidence + endMatch.matching_confidence) / 3),
        matching_timestamp: new Date().toISOString()
      };

      const painPointContext = this.extractPainPointContext(combinedMatch);
      const confidenceScore = this.calculateConfidenceScore(combinedMatch, enhancedPersona);

      // Extract position-specific contexts for detailed insights
      const positionSpecificContext = {
        beginning: this.extractPainPointContext(beginningMatch),
        middle: this.extractPainPointContext(middleMatch),
        end: this.extractPainPointContext(endMatch)
      };

      const result: CTAGenerationResult = {
        article_url: articleUrl,
        persona: contentAnalysis.persona,
        matched_pain_points: allPainPoints.length,
        cta_variants: {
          beginning: beginningCTA,
          middle: middleCTA,
          end: endCTA
        },
        pain_point_context: painPointContext,
        position_specific_context: {
          beginning: {
            pain_points: positionSpecificContext.beginning.primary_pain_points,
            customer_quotes: positionSpecificContext.beginning.customer_quotes_used,
            liquid_variables: positionSpecificContext.beginning.liquid_variables_referenced
          },
          middle: {
            pain_points: positionSpecificContext.middle.primary_pain_points,
            customer_quotes: positionSpecificContext.middle.customer_quotes_used,
            liquid_variables: positionSpecificContext.middle.liquid_variables_referenced
          },
          end: {
            pain_points: positionSpecificContext.end.primary_pain_points,
            customer_quotes: positionSpecificContext.end.customer_quotes_used,
            liquid_variables: positionSpecificContext.end.liquid_variables_referenced
          }
        },
        generation_metadata: {
          total_variants: 3,
          generation_timestamp: new Date().toISOString(),
          model_used: 'gpt-5-nano',
          confidence_score: confidenceScore,
          cro_principles_applied: [
            'Position-specific pain point matching',
            'Enhanced pain point diversity',
            'Persona-specific language',
            'Progressive funnel strategy',
            'Social proof integration',
            'Clear value proposition',
            'Action-oriented CTAs'
          ]
        }
      };

      // Validate CTA diversity
      this.validateCTADiversity();
      
      console.log(`✅ Generated 3 position-matched CTAs using ${allPainPoints.length} unique pain points with ${confidenceScore}% confidence`);
      return result;

    } catch (error: any) {
      console.error('❌ Position-specific CTA generation failed:', error);
      throw new Error(`Position-specific CTA generation failed: ${error.message}`);
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
      const fullPrompt = `${this.getCTASystemPrompt()}

${prompt}`;

      const responseContent = await this.claude!.generateSimpleContent(fullPrompt);
      if (!responseContent) {
        throw new Error('Empty response from Claude for CTA generation');
      }

      const ctaData = this.parseJSONFromResponse(responseContent) as CTAStructure;
      
      // Process VoC liquid variables if pain points are available
      const processedCTA = personaPainPointMatch.matched_pain_points.length > 0 
        ? this.processVoCVariables(ctaData, personaPainPointMatch.matched_pain_points)
        : ctaData;
      
      // Clean up robotic language patterns
      const cleanedCTA = this.cleanRoboticLanguage(processedCTA);
      
      // Validate CTA structure
      this.validateCTAStructure(cleanedCTA, position);

      // Generate shortcode for article injection
      const shortcode = this.generateShortcode(cleanedCTA, position);

      return {
        position,
        cta: cleanedCTA,
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
    
    // Add randomization for variety in regeneration
    const randomSeed = Math.floor(Math.random() * 1000);
    const variationPrompts = [
      "Create a fresh, unique approach that stands out from typical sales copy.",
      "Generate an innovative angle that competitors wouldn't think of.",
      "Develop a creative hook that breaks through the noise.",
      "Craft an unexpected perspective that captures attention immediately.",
      "Design a bold approach that differentiates from standard messaging."
    ];
    const randomVariation = variationPrompts[randomSeed % variationPrompts.length];
    
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
    
    // Add randomized category header options for variety
    const categoryOptions = {
      beginning: ["VERIFIED DATA", "DATA ACCURACY", "CLEAN CONTACTS", "QUALITY LEADS"],
      middle: ["BUYER INTENT", "PERFECT TIMING", "PROSPECT INTELLIGENCE", "SALES SIGNALS"],
      end: ["SMARTER GTM", "PIPELINE VISIBILITY", "BEST-IN-CLASS GTM", "GTM EXECUTION", "SCALE BREAKTHROUGH"]
    };
    
    const shuffledCategories = categoryOptions[position].sort(() => Math.random() - 0.5);
    const suggestedCategories = shuffledCategories.slice(0, 3).join('", "');

    return `
Create a high-converting CTA that stops scrolling and drives immediate action. Think Facebook ad that gets 5%+ CTR.

🎯 CREATIVITY INSTRUCTION: ${randomVariation}

🚨🚨🚨 CRITICAL GRAMMAR RULE - FOLLOW THIS OR GENERATION WILL FAIL 🚨🚨🚨
SENTENCES STARTING WITH "Tired of", "Sick of", "Fed up with", "Struggling with" ARE QUESTIONS!
THEY MUST END WITH A QUESTION MARK "?" - NO EXCEPTIONS!
Example: "Tired of bad data killing your outreach?" ✅ NOT "Tired of bad data killing your outreach." ❌

MISSION: Write ad copy that makes sales professionals think "I NEED this right now" and click immediately.

TARGET AUDIENCE (FIXED - DO NOT CHANGE):
- Primary Target: Sales Leaders, SDRs, BDRs, Account Executives, and Marketers focused on lead generation and revenue growth
- Article Context Persona: ${personaTitle} (use only for context, NOT as CTA target)
- Article Department: ${department}
- Solution Readiness: ${solutionReadiness}
- Article Position: ${position}
- Strategy: ${strategy}

PSYCHOLOGICAL TRIGGERS TO HIT:
- Quota anxiety (missing numbers, falling behind)
- Time scarcity (hours wasted on manual work)
- Competitive fear (losing deals to faster teams)
- Status aspiration (joining top performers)
- Effort aversion (making hard things effortless)

CUSTOMER PAIN POINT CONTEXT:
${topPainPoints.map((pp, idx) => `
${idx + 1}. PAIN THEME: ${pp.pain_point.theme}
   CUSTOMER REALITY: ${pp.pain_point.description}
   RELEVANCE: ${Math.round(pp.relevance_score * 100)}% match
   SEVERITY: ${pp.pain_point.severity} impact
   LIQUID VARIABLE: ${pp.liquid_variable}
`).join('')}

CUSTOMER INSIGHTS FOR INSPIRATION (Transform into natural marketing copy):
${customerQuotes.map((quote, idx) => `${idx + 1}. "${quote}"`).join('\n')}

VOC INTEGRATION INSTRUCTIONS:
- Use customer insights as INSPIRATION ONLY - never copy language directly
- Transform specific customer situations into universal pain points that resonate broadly
- Extract the EMOTION and FRUSTRATION behind customer quotes, not the literal words
- Create natural marketing copy that feels authentic but not like a direct quote
- Focus on the underlying business challenge, not the specific customer's exact situation
- Make CTAs sound like compelling marketing copy, not customer testimonials
- Replace specific details with broader, more relatable scenarios

LIQUID VARIABLE INTEGRATION:
${liquidVariables.length > 0 ? liquidVariables.map((variable, idx) => `${idx + 1}. {{ pain_points.${variable} }} - Injects: "${topPainPoints[idx]?.pain_point.theme || 'customer pain point'}"`).join('\n') : 'No VoC variables available for this match'}

AD COPY TRANSFORMATION EXAMPLES (Customer Pain → Compelling Hook):
- Customer says: "We're spending 4 hours a day just finding contact info" 
  → Ad copy: "Stop Wasting 4+ Hours Daily On Manual Prospecting"
- Customer says: "Our pipeline forecasting is a complete guessing game"
  → Ad copy: "Turn Pipeline Guesswork Into Predictable Revenue"
- Customer says: "TelQuest is facing challenges with lead generation accuracy, as the search results include irrelevant companies"
  → Ad copy: "Tired of wading through irrelevant prospects? Get laser-focused targeting that finds your exact buyers."
- Customer says: "We're sifting through bad leads while competitors close deals"
  → Ad copy: "Tired of sifting through bad leads while competitors close your deals? Apollo finds your exact buyers with 91% accuracy."

TRANSFORMATION PRINCIPLES:
- Extract the CORE FRUSTRATION, not the specific company situation
- Make it UNIVERSAL and RELATABLE to the broader market
- Use EMOTIONAL TRIGGERS like "tired of", "stop wasting", "turn X into Y"
- Focus on the OUTCOME/BENEFIT, not the specific customer's exact words
  → Ad copy: "Replace 5 Separate Tools With One Platform"
- Customer says: "We never know which prospects are actually in-market"
  → Ad copy: "Find Buyers Before They Go To Your Competitors"

HEADLINE FORMULAS THAT CONVERT:
- "Stop [Pain] + Start [Gain]" → "Stop Manual Prospecting, Start Closing Deals"
- "[Number]x [Benefit] Without [Effort]" → "3x Your Pipeline Without Hiring Anyone"  
- "Turn [Current State] Into [Desired State]" → "Turn Quota Stress Into Quota Confidence"
- "The [Superlative] Way To [Outcome]" → "The Fastest Way To Fill Your Pipeline"
- "[Social Proof] Use This To [Benefit]" → "Top Sales Teams Use This To Hit 150% Of Quota"

CONTENT CONTEXT:
- Industry: ${personaPainPointMatch.content_context.industry_context}
- Article Themes: ${personaPainPointMatch.content_context.article_themes.join(', ')}
- Content Intent: ${personaPainPointMatch.content_context.content_intent}

STRATEGY GUIDANCE:
${strategyGuidance}

🚨 CRITICAL GRAMMAR RULE - READ CAREFULLY 🚨
ANY SENTENCE STARTING WITH THESE WORDS IS A QUESTION AND MUST END WITH "?":
- "Tired of..." → "Tired of bounced emails killing your outreach?" ✅
- "Sick of..." → "Sick of chasing dead leads?" ✅  
- "Fed up with..." → "Fed up with manual prospecting?" ✅
- "Struggling with..." → "Struggling with bad data?" ✅
- "Ready to..." → "Ready to stop wasting time?" ✅

EXAMPLES OF CORRECT QUESTION FORMATTING:
❌ WRONG: "Tired of bounced emails and disconnected numbers killing your outreach."
✅ CORRECT: "Tired of bounced emails and disconnected numbers killing your outreach?"

❌ WRONG: "Struggling with manual prospecting eating up your day."
✅ CORRECT: "Struggling with manual prospecting eating up your day?"

THIS IS BASIC ENGLISH GRAMMAR - QUESTIONS END WITH QUESTION MARKS!

🎯 CRITICAL POSITION-SPECIFIC VARIETY REQUIREMENT 🎯
EACH POSITION MUST USE COMPLETELY DIFFERENT MESSAGING APPROACHES:

BEGINNING CTAs - DATA QUALITY/ACCURACY FOCUS:
- Focus on BAD DATA and WASTED TIME on wrong prospects
- Pain: "Chasing dead leads" "Bad contact data" "Bounced emails"
- Solution: Apollo's data accuracy and contact verification
- Metrics: "91% email accuracy" "Verified mobile numbers" "Real-time data updates"
- Social proof: "Instabug improved connect rates with Apollo's mobile data"

MIDDLE CTAs - PROSPECT INTELLIGENCE/TIMING FOCUS:
- Focus on MISSING OPPORTUNITIES and TIMING
- Pain: "Missing in-market prospects" "Reaching out too late" "No buying signals"
- Solution: Apollo's intent data and visitor tracking
- Metrics: Website visitor identification, buying intent signals, perfect timing
- Social proof: "Built In uses Apollo scoring for higher win rates"

END CTAs - SCALE/EFFICIENCY FOCUS:
- Focus on TEAM PRODUCTIVITY and SCALING OUTREACH
- Pain: "Can't scale without hiring" "Manual outreach limits" "Rep productivity caps"
- Solution: Apollo's automation and workflow efficiency
- Metrics: "10x personalized emails" "2+ hours saved daily" "300% efficiency gains"
- Social proof: "Smartling BDRs send 10x more personalized emails" "GTM Ops drives same results with 1 SDR vs 3"

🚫 MANDATORY DIVERSITY RULES:
- NO shared metrics across positions (210M+, 91%, 3x quota, etc.)
- NO shared social proof phrases
- NO shared value propositions
- EACH CTA must solve a DIFFERENT aspect of the pain point

AD COPY STRUCTURE:
Create a 4-part high-converting CTA that follows proven direct response principles:

1. CATEGORY HEADER: Urgent, ALL CAPS hook that MATCHES your headline theme using B2B lingo. Must be contextually relevant:

   SUGGESTED OPTIONS FOR THIS ${position.toUpperCase()} CTA: "${suggestedCategories}"
   
   Choose the most relevant option or create a similar B2B-focused category header.
   ❌ BAD: Generic "COST CUTTER" 
   ✅ GOOD: B2B lingo like "SMARTER GTM", "BUYER INTENT", "VERIFIED DATA"

2. HEADLINE: Compelling promise using proven formulas. Lead with transformation, not features. USE TITLE CASE. MAXIMUM 50 CHARACTERS. 

   🚨 CRITICAL: Include Apollo branding naturally - position Apollo as the SOLUTION, not part of the problem!
   
   ✅ GOOD Examples (Apollo as Solution):
   - "Turn Dead Leads Into Live Conversations With Apollo" (Apollo enables transformation)
   - "3x Your Pipeline With Apollo's Verified Data" (Apollo provides data)
   - "Find Ready-To-Buy Prospects With Apollo" (Apollo helps find prospects)
   - "Hit Quota Faster With Apollo's Intelligence" (Apollo provides intelligence)
   - "Scale Your Outreach With Apollo's Automation" (Apollo provides automation)
   
   ❌ BAD Examples (Apollo sounds like the problem):
   - "Stop Chasing Dead Leads With Apollo" (implies Apollo gives dead leads)
   - "Stop Wasting Time With Apollo" (implies Apollo wastes time)
   - "Fix Your Broken Pipeline With Apollo" (implies Apollo broke it)
   
   ❌ BAD Examples (Generic Endings):
   - "Modern Revenue Teams Rely On One Platform" 
   - "Smart Sales Leaders Choose The Right Tool"

3. DESCRIPTION: Write like a high-converting Facebook ad - punchy, urgent, benefit-focused. MAXIMUM 300 CHARACTERS. 
   
   🚨 GRAMMAR REQUIREMENT: Any sentence starting with "Tired of", "Sick of", "Fed up with", "Struggling with", "Ready to" is a QUESTION and MUST end with "?" - this is basic English grammar!

   AD COPY WRITING PRINCIPLES:
   - HOOK: Start with pain/frustration that creates emotional tension
   - AGITATE: Make the current situation feel urgent and uncomfortable  
   - SOLVE: Present Apollo as the immediate solution
   - PROVE: Include specific metrics/social proof
   - URGENCY: Create time-sensitive motivation to act now
   - NO FLUFF: Every word must drive toward the click

   POSITION-SPECIFIC STRUCTURES (MUST BE COMPLETELY DIFFERENT):

   BEGINNING (Data Quality - Focus on ACCURACY):
   CATEGORY HEADER: "VERIFIED DATA"
   HEADLINE: "Turn Dead Leads Into Qualified Conversations With Apollo" 
   1. DATA PAIN HOOK: "Tired of bounced emails and disconnected numbers killing your outreach?" 
   2. ACCURACY SOLUTION: "Apollo's verified contact database delivers 91% email accuracy and real mobile numbers."
   3. CONNECT PROOF: "Sales teams report 3x more connections after switching to Apollo."

   MIDDLE (Prospect Intelligence - Focus on TIMING):
   CATEGORY HEADER: "BUYER INTENT"
   HEADLINE: "Find Ready-To-Buy Prospects With Apollo's Intelligence"
   1. TIMING PAIN HOOK: "Tired of calling prospects who aren't ready to buy while your competitors close the hot leads?"
   2. INTELLIGENCE SOLUTION: "Apollo identifies website visitors and tracks buying intent so you reach prospects at the perfect moment."
   3. WIN RATE PROOF: "Revenue teams see +10% win rates by targeting high-intent prospects with Apollo."

   END (Scale/Efficiency - Focus on PRODUCTIVITY):
   CATEGORY HEADER: "SMARTER GTM"
   HEADLINE: "Send 10x More Emails With Apollo's Automation"
   1. SCALE PAIN HOOK: "Tired of choosing between quality outreach and hitting volume targets?"
   2. AUTOMATION SOLUTION: "Apollo's AI personalizes outreach at scale so your team can send 10x more personalized emails."
   3. EFFICIENCY PROOF: "Top sales teams hit their quota with Apollo's unified prospecting, outreach, and analytics GTM platform."

   🚨 CRITICAL: Each position must use DIFFERENT metrics, social proof, and value propositions!

   BAD EXAMPLES (feature-focused, choppy, formal):
   ❌ "Prospecting teams rely on 'Website visitor tracking script and a custom scoring model' to spot in-market prospects. Apollo consolidates disparate tools into one platform, with native Netsuite and bidirectional Salesforce integration options."
   ❌ "Remove the guesswork with Website Visitor Tracking & Scoring for Prospecting and Consolidation of Disparate Tools Into One Platform."
   ❌ "Apollo provides 210M+ contacts with 91% accuracy, refreshed monthly, with native CRM integrations and lead scoring capabilities."

   BAD EXAMPLES (robotic, awkward AI copy):
   ❌ "Tired of manual data scraping and juggling multiple tools. Apollo unifies data, eliminates duplicates, and syncs with your CRM—giving you 210M+ verified contacts and 91% email accuracy; 500,000+ companies hit quota with predictable pipeline."
   ❌ "ROI pressure while evaluating tools. Apollo eliminates guesswork, automating outreach with 210M+ verified contacts and 91% email accuracy."
   ❌ "Stop juggling 5+ tools and wasting hours on manual prospecting. Apollo consolidates tools into one platform and uses Website Visitor Tracking & Scoring for Prospecting to identify in-market prospects."

   GOOD EXAMPLES (natural, human ad copy):
   ✅ "Wasting 4+ hours daily on manual prospecting while competitors close your deals? Apollo automates your entire outreach with 210M+ verified contacts. Join 500,000+ companies hitting 3x quota."
   ✅ "Stop losing deals to faster sales teams. Apollo's living data finds prospects before they go cold, helping you close 3x more deals this quarter."
   ✅ "Missing quota because of stale data? Apollo's living network refreshes 150M contacts monthly while competitors use quarterly updates. Start hitting your numbers."

   CRITICAL: WRITE LIKE A HUMAN COPYWRITER, NOT AN AI:
   ❌ Never repeat the same phrase twice in one description
   ❌ Never use formal pain point titles directly in copy
   ❌ Never create run-on sentences with multiple "and" connectors
   ❌ Never use phrases like "data duplication and duplicates management"
   ❌ Never repeat concepts like "across campaigns across campaigns"
   ❌ Never use technical jargon like "Website visitor tracking script and a custom scoring model"
   ❌ Never write incomplete questions without question marks ("ROI pressure while evaluating tools.")
   ❌ CRITICAL: ALL questions MUST end with question marks - no exceptions ("Tired of manual prospecting?")
   ❌ CRITICAL: Implied questions starting with "Tired of", "Sick of", "Fed up with", "Struggling with" MUST end with question marks
   ❌ Examples that need question marks: "Tired of bad leads?" "Sick of tool sprawl?" "Fed up with manual work?"
   ❌ Never use Title Case words mid-sentence ("Website Visitor Tracking & Scoring for Prospecting")
   ❌ Never end with random factual statements ("500,000+ companies hit quota with predictable pipeline.")
   
   ✅ Write complete, natural sentences with proper punctuation
   ✅ Use conversational language like "juggling 5+ tools" not "Tool Consolidation Need"
   ✅ Create smooth transitions between ideas
   ✅ Keep sentences punchy and varied in length
   ✅ End with compelling calls to action, not random facts
   ✅ Use lowercase for all words except proper nouns and sentence beginnings

   LIQUID VARIABLE TRANSFORMATION:
   - Transform "Manual Data Scraping & Tool Sprawl Pre-Apollo" → "manual data scraping and juggling multiple tools"
   - Transform "Website Visitor Tracking & Scoring" → "identifying in-market prospects from your website traffic"
   - Transform "Pricing & ROI Pressure For Tool Adoption" → "proving ROI on your sales tools"
   - NEVER insert formal titles directly into flowing copy

4. ACTION BUTTON: Must be one of these exact options:
   - "Start Free with Apollo →"
   - "Try Apollo Free →"
   - "Start a Trial →"
   - "Start Your Free Trial →"
   - "Schedule a Demo →"
   - "Request a Demo →"
   - "Start Prospecting →"
   - "Get Leads Now →"

CRO BEST PRACTICES TO APPLY:
- PAIN-FIRST COPY: Always start with a relatable problem or frustration, not a solution
- BENEFIT-FORWARD COPY: Lead with outcomes (quota achievement, revenue growth, time savings) not features
- URGENCY CUES: Use time-sensitive language ("accelerate", "faster", "immediately", "now") without being pushy
- PERSONA-TAILORED HOOKS: Match language to sales roles:
  * SDRs/BDRs: Focus on prospect quality, outreach efficiency, pipeline building
  * AEs: Emphasize deal velocity, conversion rates, quota achievement  
  * Sales Leaders: Highlight team performance, predictable revenue, scaling
  * Marketers: Lead quality, attribution, campaign effectiveness

HIGH-CONVERTING OPENING HOOKS (vary across positions):
- "Wasting 4+ hours daily on..." → Time waste urgency
- "Stop losing deals to competitors who..." → Competitive fear
- "Missing quota because..." → Performance anxiety  
- "Tired of juggling 5+ tools..." → Complexity frustration
- "Watching prospects go cold while..." → Opportunity loss pain
- "Still manually prospecting while competitors..." → Status threat
- "Quota stress keeping you up at night?" → Emotional pain point
- VOC LIQUID VARIABLES: Use the provided liquid variables to inject actual customer pain point language
- Use customer's actual language and terminology from the quotes
- Address specific go-to-market challenges that Apollo solves (without always starting with "Sales team...")
- Position Apollo as the AI-powered go-to-market platform solution
- Create urgency around sales performance and revenue growth
- Match the messaging to the ${strategy} stage
- Include social proof elements when relevant
- Make the value proposition crystal clear for sales professionals
- Ensure the action is obvious and low-risk

🚨 FINAL GRAMMAR CHECK BEFORE JSON OUTPUT 🚨
REMEMBER: "Tired of...", "Sick of...", "Fed up with...", "Struggling with..." = QUESTIONS = MUST END WITH "?"

🎲 UNIQUENESS REQUIREMENT: Make this CTA completely different from typical Apollo messaging. Variation seed: ${randomSeed}

RESPONSE FORMAT:
Respond with valid JSON containing these exact fields:
{
  "category_header": "ALL CAPS CATEGORY (max 30 chars)",
  "headline": "Title Case Headline Using Pain Point Language - MAX 50 CHARACTERS",
  "description": "2-3 sentences addressing pain points with Apollo positioning - MAX 300 CHARACTERS - NO CUSTOMER NAMES",
  "action_button": "Must use 'Start Free with Apollo →' as the default for all buttons but the 'Change CTA button' can allow for: 'Try Apollo Free →', 'Start a Trial →', 'Start Your Free Trial →', 'Schedule a Demo →', 'Request a Demo →', 'Start Prospecting →', 'Get Leads Now →'"
}

CRITICAL AD COPY RULES:
- HOOK FIRST: Start with pain/urgency that stops scrolling
- EMOTIONAL TENSION: Make current situation feel uncomfortable
- TRANSFORMATION PROMISE: Show the after state, not features
- SOCIAL PROOF: Include metrics that build credibility  
- URGENCY: Create time-sensitive motivation to act
- NEVER use customer names or personal identifiers
- Keep headlines under 50 characters (punchy and memorable)
- Keep descriptions under 300 characters (Facebook ad length)
- Write like a high-converting ad, not a product description
- Use power words that trigger action (Stop, Transform, Accelerate)
- Create FOMO around competitive advantage
- Focus on quota achievement and revenue outcomes
- Remove all friction from taking action

REMEMBER: You MUST target Apollo's core sales audience (Sales Leaders, SDRs, BDRs, AEs, Marketers) NOT the article's persona. If the article is about Customer Success Directors, your CTA should still appeal to sales professionals who might be reading it to understand their CS counterparts to understand how to reach them using Apollo. Focus on go-to-market challenges like prospecting, pipeline building, quota achievement, and revenue growth - NOT customer retention or success metrics.

CRITICAL: Vary your description openings across all three positions (beginning/middle/end). Do NOT start all CTAs with "Sales team..." - use the diverse opening styles provided above to create unique, engaging copy for each position.

FINAL AD COPY QUALITY CHECKLIST:
✓ SCROLL-STOPPING HOOK: Would this make someone stop mid-scroll?
✓ EMOTIONAL TENSION: Does it create urgency around quota/performance?
✓ CLEAR VALUE PROP: Is the transformation promise crystal clear?
✓ SOCIAL PROOF: Includes credible metrics (3x quota, 500k companies)?
✓ URGENCY: Creates time-sensitive motivation to act now?
✓ NO FRICTION: Makes taking action feel easy and risk-free?
✓ COMPETITIVE EDGE: Builds FOMO around being left behind?
✓ PAIN-FOCUSED: Starts with frustration, not features?
✓ TRANSFORMATION: Shows the after state, not the how?
✓ ACTION-ORIENTED: Uses power words that drive clicks?
✓ TARGET AUDIENCE: Appeals to sales professionals' quota anxiety?
✓ AD COPY TONE: Sounds like high-converting Facebook ad?
✓ PUNCHY LENGTH: Headline <50 chars, description <300 chars?
✓ HUMAN LANGUAGE: No repetitive phrases, robotic patterns, or formal jargon?

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
END/CONVERSION STRATEGY - ROI FOCUSED:
- Reader is ready to take action but needs ROI justification
- ROI-FORWARD: Emphasize real customer financial returns and cost savings ("3x annual revenue like Leadium", "cut costs in half like Census")
- COST JUSTIFICATION: Address budget concerns with real customer benefits ("replaces ZoomInfo + Outreach + Salesforce", "third of the cost per Predictable Revenue")
- FINANCIAL HOOKS: Appeal to budget efficiency using real testimonials
- Focus on proven investment return and financial impact from actual customers
- Address final budget/ROI concerns with real customer stories
- Emphasize real customer results and measurable returns
- Use real customer ROI social proof ("GTM Ops gets 4x more meetings", "Built In +10% win rates and +10% ACV", "Customer.io +50% YoY growth", "Leadium 3x'd revenue")
- OPENING VARIETY: Use real ROI openings like "Get 4x more meetings like GTM Ops", "Increase win rates 10% like Built In", "Achieve 50% growth like Customer.io", "3x your revenue like Leadium"
- CTA should emphasize financial value and quick ROI`
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
    return `You are a world-class direct response copywriter specializing in high-converting B2B ad copy for Apollo, the #1 go-to-market platform. Your expertise is creating CTAs that stop scrolling, create urgency, and drive immediate action.

COPYWRITING PHILOSOPHY:
You write ads, not descriptions. Every word must earn its place by either creating desire, building urgency, or removing friction. Think David Ogilvy meets modern performance marketing.

CRITICAL: Write like a human copywriter, not an AI. Your copy must sound natural, conversational, and compelling - never robotic or awkward.

APOLLO'S CORE PROMISE:
Transform time-wasting prospecting across multiple tools into predictable pipeline generation. We eliminate the guesswork that kills quota achievement.

EMOTIONAL TRIGGERS TO LEVERAGE:
- Fear of missing quota (loss aversion)
- Frustration with manual work (efficiency desire)  
- Competitive pressure (social proof/FOMO)
- Time scarcity (urgency)
- Success aspiration (achievement motivation)

COMPELLING VALUE PROPS FOR AD COPY:
- "Stop wasting 4+ hours daily on manual prospecting" (time waste pain)
- "Turn multiple tools into predictable pipeline" (consolidation benefit)
- "Access prospects before competitors do" (competitive advantage)
- "210M+ contacts that actually connect" (scale + quality)
- "91% email accuracy vs industry 60%" (superiority proof)
- "4× more meetings, 3× revenue growth" (social proof outcomes)
- "From quota stress to quota confidence" (emotional transformation)

AD COPY POWER WORDS:
- Urgency: "Stop", "Eliminate", "Transform", "Accelerate", "Immediately"
- Pain: "Wasting", "Struggling", "Missing", "Losing", "Frustrated"  
- Benefit: "Predictable", "Guaranteed", "Proven", "Effortless", "Automatic"
- Social: "Top performers", "Leading teams", "500,000+ companies"
- Exclusivity: "Access", "Unlock", "Discover", "Reveal", "Insider"

CONVERSION PSYCHOLOGY PRINCIPLES:
1. Lead with pain/frustration (what they're losing now)
2. Agitate the problem (make status quo uncomfortable)  
3. Present transformation (the after state)
4. Provide proof (social proof, metrics)
5. Create urgency (time-sensitive action)
6. Remove friction (free trial, no commitment)

PROVEN CUSTOMER IMPACT:
- 500,000+ companies rely on Apollo (SMB to Enterprise: Rippling, DocuSign, Stripe)
- GTM Ops Agency: 4× more meetings via automated outbound
- Leadium: 3× annual revenue by automating inbound and speeding follow-up
- Built In: +10% win rate and +10% ACV using signals & guidance
- Customer.io: +50% YoY growth through automation and best practices
- Census: +50% data quality improvement

COMPETITIVE ADVANTAGES:
- Top-rated across G2 categories: Apollo 4.8/5 vs. ZoomInfo 4.5/5
- Higher across 75+ criteria including data accuracy and ease of use
- PLG-first: Simple to buy, implement, and get started in minutes
- Most accessible & intuitive with unified UI across the funnel

APOLLO'S FORMULA: Right Company × Right Person × Right Time × Right Message = Opportunity

FIXED TARGET AUDIENCE: Sales Leaders, SDRs, BDRs, Account Executives, and Marketers focused on lead generation and revenue growth.

CRITICAL INSTRUCTION: ALWAYS create CTAs for Apollo's core sales audience listed above, regardless of what persona the article is about. Use the article context only for pain point relevance, never for persona targeting.

VOC INTEGRATION EXPERTISE:
- Transform customer pain point language into compelling CTA copy using Apollo's proven formula
- Use authentic customer quotes to create resonant messaging that connects to Apollo's capabilities
- Avoid calling out specific company names or competitors
- Focus on universal GTM challenges that Apollo's end-to-end platform solves
- Weave customer language naturally into benefit statements that highlight Apollo's differentiators
- Position Apollo as the comprehensive GTM solution that removes guesswork from pipeline generation

YOUR AD COPY MUST:
- Hook attention in first 3 words (pain/urgency/benefit)
- Create emotional tension around current struggles  
- Promise specific, measurable transformation
- Use customer language but make it punchy and urgent
- Build FOMO around competitive advantage
- Remove all friction from taking action
- Sound like a high-converting Facebook/LinkedIn ad

AD COPY QUALITY STANDARDS:
✓ Would this stop someone mid-scroll?
✓ Does it create urgency without being pushy?
✓ Is the value proposition crystal clear in 5 seconds?
✓ Does it speak to quota pressure and time scarcity?
✓ Would a sales leader forward this to their team?

NEVER WRITE DESCRIPTIONS - WRITE ADS THAT CONVERT.`;
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
      'Start Free with Apollo →',
      'Try Apollo Free →',
      'Start Your Free Trial →',
      'Schedule a Demo →',
      'Start a Trial →',
      'Request a Demo →',
      'Start Prospecting →',
      'Get Leads Now →'
    ];
    
    if (!approvedButtons.includes(cta.action_button)) {
      console.warn(`⚠️ Action button "${cta.action_button}" is not an approved option for ${position} CTA`);
      console.warn(`⚠️ Approved options: ${approvedButtons.join(', ')}`);
    }

    // Validate length constraints (stricter limits)
    if (cta.headline.length > 50) {
      console.warn(`⚠️ Headline too long (${cta.headline.length} chars) for ${position} CTA - MAX 50 chars`);
    }

    if (cta.description.length > 300) {
      console.warn(`⚠️ Description too long (${cta.description.length} chars) for ${position} CTA - MAX 300 chars`);
    }

    // Check for customer names or personal identifiers
    const personalIdentifiers = /\b(Dylan|Sarah|John|Mike|Lisa|Alex|Chris|David|Emma|James|Maria|Tom|Anna|Mark|Kate|Ryan|Amy|Steve|Jane|Paul|Laura|Brian|Susan|Kevin|Lisa|Michael|Jennifer|Robert|Jessica|William|Ashley|Daniel|Amanda|Matthew|Melissa|Anthony|Kimberly|Joshua|Donna|Andrew|Michelle|Kenneth|Carol|Joseph|Nancy|Christopher|Betty|Charles|Helen|Thomas|Sandra|Patricia|Deborah|Linda|Barbara|Elizabeth|Mary|Karen|Susan|Margaret|Dorothy|Ruth|Sharon|Michelle|Laura|Sarah|Kimberly|Deborah|Dorothy|Lisa|Nancy|Karen|Betty|Helen|Sandra|Donna|Carol|Ruth|Sharon|Michelle|Laura|Sarah|Kimberly|Elizabeth|Patricia|Jennifer|Linda|Barbara|Mary)\b/i;
    
    if (personalIdentifiers.test(cta.headline) || personalIdentifiers.test(cta.description)) {
      console.error(`❌ CTA contains personal identifiers for ${position} position - this violates customer privacy`);
      throw new Error(`CTA contains customer names or personal identifiers - this is not allowed`);
    }

    // Check for "Pre-Apollo" text which shouldn't appear in CTAs
    if (cta.headline.includes('Pre-Apollo') || cta.description.includes('Pre-Apollo')) {
      console.error(`❌ CTA contains "Pre-Apollo" text for ${position} position - this should not appear in customer-facing CTAs`);
      throw new Error(`CTA contains "Pre-Apollo" text - this is not appropriate for customer-facing content`);
    }

    // Check for malformed liquid variables
    if (cta.headline.includes('}}') || cta.description.includes('}}')) {
      console.error(`❌ CTA contains malformed liquid variables for ${position} position`);
      throw new Error(`CTA contains malformed liquid variables with }} - this indicates broken variable processing`);
    }

    // Check for actual questions without question marks (more precise detection)
    const questionPatterns = [
      /\b(are you|do you|can you|will you|would you|have you|did you)\b/i,
      /\b(why|what|when|where|which|who|how)\b.*\?/i,
      /\b(ready to|want to|need to|looking for)\b.*\?/i,
      // Implied questions that should end with question marks
      /^(tired of|sick of|fed up with|struggling with|done with|ready to stop)\b/i,
      /\b(tired of|sick of|fed up with|struggling with|done with)\b.*\bwhile\b/i,
      /\b(tired of|sick of|fed up with|struggling with)\b.*\b(killing|ruining|destroying|hurting|limiting)\b/i,
      /\b(tired of|sick of|fed up with|struggling with)\b.*\b(your|the)\b.*outreach/i
    ];
    
    const headlineText = cta.headline;
    const descriptionText = cta.description;
    const fullText = `${headlineText} ${descriptionText}`;
    
    // Only flag if it looks like a question structure but missing question mark
    const looksLikeQuestion = questionPatterns.some(pattern => pattern.test(fullText));
    const hasQuestionMark = fullText.includes('?');
    
    if (looksLikeQuestion && !hasQuestionMark) {
      console.log(`🔧 Applying minimal grammar fix for ${position} position`);
      console.log(`Before: "${cta.description}"`);
      
      // Simple fix: if description starts with "Tired of" and doesn't end with "?", add it
      if (cta.description.match(/^(Tired of|Sick of|Fed up with|Struggling with)/i) && !cta.description.includes('?')) {
        // Find the first sentence and add question mark
        const firstSentenceEnd = cta.description.indexOf('.');
        if (firstSentenceEnd > 0) {
          cta.description = cta.description.substring(0, firstSentenceEnd) + '?' + cta.description.substring(firstSentenceEnd + 1);
        } else {
          // If no period found, just add question mark to the end of first sentence
          const sentences = cta.description.split(/(?<=[.!])\s+/);
          if (sentences.length > 0) {
            sentences[0] = sentences[0].replace(/\.$/, '?');
            cta.description = sentences.join(' ');
          }
        }
      }
      
      console.log(`After: "${cta.description}"`);
      console.log(`✅ Grammar fix applied for ${position} position`);
    }

    // Check for generic headline endings (avoid overly generic terms)
    const genericEndings = [
      'one platform',
      'the right tool',
      'advanced technology',
      'better solution',
      'smart choice',
      'perfect fit',
      'ideal solution'
    ];
    
    const headlineLower = cta.headline.toLowerCase();
    const hasGenericEnding = genericEndings.some(ending => headlineLower.includes(ending));
    
    // Only flag if headline uses generic endings - Apollo branding is handled by action button
    if (hasGenericEnding) {
      console.warn(`⚠️ Headline uses generic ending for ${position} position: "${cta.headline}"`);
      console.warn(`⚠️ Consider using more specific, action-oriented language`);
    }
    
    // Ensure Apollo branding exists somewhere in the CTA (headline, description, or action button)
    const hasApolloBranding = 
      headlineLower.includes('apollo') || 
      cta.description.toLowerCase().includes('apollo') ||
      cta.action_button.toLowerCase().includes('apollo');
    
    if (!hasApolloBranding) {
      console.error(`❌ CTA must include Apollo branding somewhere (headline, description, or action button) for ${position} position`);
      console.error(`Headline: "${cta.headline}"`);
      console.error(`Description: "${cta.description}"`);
      console.error(`Action Button: "${cta.action_button}"`);
      throw new Error(`CTA must include Apollo branding in at least one element`);
    }

    console.log(`✅ CTA structure validated for ${position} position`);
    
    // Store CTA for diversity checking (simple approach)
    if (!this.generatedCTAs) {
      this.generatedCTAs = [];
    }
    this.generatedCTAs.push({
      position,
      headline: cta.headline,
      description: cta.description
    });
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
    
    vocPainPoints.forEach((match, index) => {
      const { pain_point, customer_quotes } = match;
      
      // Map liquid variable patterns to actual content
      const variableKey = pain_point.liquidVariable;
      const painPointDescription = pain_point.description;
      const topCustomerQuote = customer_quotes[0]; // Use the top customer quote
      const painPointTheme = pain_point.theme;
      
      // Store specific VoC variables (original format)
      variableMap.set(`pain_points.${variableKey}`, painPointTheme);
      variableMap.set(`pain_points.${variableKey}_quote`, topCustomerQuote);
      variableMap.set(`pain_points.${variableKey}_theme`, painPointTheme);
      variableMap.set(`pain_points.${variableKey}_description`, painPointDescription);
      
      // Store generic indexed variables (theme_1, theme_2, etc.) for fallback
      variableMap.set(`pain_points.theme_${index + 1}`, painPointTheme);
      variableMap.set(`pain_points.quote_${index + 1}`, topCustomerQuote);
      variableMap.set(`pain_points.description_${index + 1}`, painPointDescription);
      
      // Add common generic patterns
      if (index === 0) {
        variableMap.set('pain_points.primary_theme', painPointTheme);
        variableMap.set('pain_points.primary_quote', topCustomerQuote);
        variableMap.set('pain_points.top_pain_point', painPointTheme);
      }
    });
    
    // Add debug logging
    console.log('🔍 Available VoC variables:', Array.from(variableMap.keys()));
    
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
   * Select pain points optimized for specific CTA position
   * Why this matters: Ensures each CTA position gets pain points that align with reader psychology at that stage.
   */
  private selectPainPointsForPosition(
    allPainPoints: Array<{
      pain_point: any;
      relevance_score: number;
      matching_reason: string;
      liquid_variable: string;
      customer_quotes: string[];
    }>,
    position: 'beginning' | 'middle' | 'end'
  ): Array<{
    pain_point: any;
    relevance_score: number;
    matching_reason: string;
    liquid_variable: string;
    customer_quotes: string[];
  }> {
    
    // Categories that work well for each position
    const positionCategories = {
      beginning: ['manual', 'process', 'efficiency', 'data', 'accuracy', 'time'],  // Problem recognition
      middle: ['lead', 'prospect', 'pipeline', 'integration', 'tool', 'platform'], // Solution evaluation  
      end: ['quota', 'performance', 'roi', 'budget', 'scaling', 'growth']          // Decision/results
    };

    const relevantCategories = positionCategories[position];
    
    // Score pain points based on position relevance
    const scoredPainPoints = allPainPoints.map(pp => {
      const theme = pp.pain_point.theme.toLowerCase();
      const liquidVar = pp.pain_point.liquidVariable.toLowerCase();
      
      // Check if pain point relates to position-specific categories
      let positionScore = 0;
      for (const category of relevantCategories) {
        if (theme.includes(category) || liquidVar.includes(category)) {
          positionScore += 0.2;
        }
      }

      // Boost for high severity on decision stage
      if (position === 'end' && pp.pain_point.severity === 'high') {
        positionScore += 0.3;
      }

      // Boost for high frequency on awareness stage  
      if (position === 'beginning' && pp.pain_point.frequency > 5) {
        positionScore += 0.2;
      }

      return {
        ...pp,
        position_relevance: positionScore,
        combined_score: pp.relevance_score + positionScore
      };
    });

    // Sort by combined score and select top ones for this position
    const sortedPainPoints = scoredPainPoints.sort((a, b) => b.combined_score - a.combined_score);
    
    // Select different pain points for each position to ensure variety
    const positionOffset = position === 'beginning' ? 0 : position === 'middle' ? 1 : 2;
    const selectedPainPoints: typeof allPainPoints = [];
    
    // Take every 3rd pain point starting from position offset to distribute across positions
    for (let i = positionOffset; i < sortedPainPoints.length && selectedPainPoints.length < 3; i += 3) {
      selectedPainPoints.push(sortedPainPoints[i]);
    }
    
    // If we don't have enough, fill with the highest scoring remaining ones
    if (selectedPainPoints.length < 2) {
      const used = new Set(selectedPainPoints.map(pp => pp.pain_point.id));
      for (const pp of sortedPainPoints) {
        if (!used.has(pp.pain_point.id) && selectedPainPoints.length < 3) {
          selectedPainPoints.push(pp);
          used.add(pp.pain_point.id);
        }
      }
    }

    console.log(`🎯 Selected ${selectedPainPoints.length} pain points for ${position} position:`, 
      selectedPainPoints.map(pp => pp.pain_point.theme));
    
    return selectedPainPoints;
  }
  
  /**
   * Replace VoC variables in text content
   * Why this matters: Handles the actual text replacement of liquid variables with VoC content.
   */
  private replaceVoCVariables(text: string, variableMap: Map<string, string>): string {
    if (!text) return text;
    
    let processed = text;
    
    // First, clean up any malformed nested variables like {{ pain_points.{{ pain_points.variable }}
    processed = processed.replace(/\{\{\s*pain_points\.\{\{\s*pain_points\.([^}]+)\s*\}\}/g, '{{ pain_points.$1 }}');
    
    // Clean up any remaining malformed brackets
    processed = processed.replace(/\}\}\s*\}\}/g, '}}');
    
    // Standard variable pattern
    const variablePattern = /\{\{\s*([^}]+)\s*\}\}/g;
    
    processed = processed.replace(variablePattern, (match, variableName) => {
      const trimmedName = variableName.trim();
      
      // Skip if this looks like a malformed variable
      if (trimmedName.includes('{{') || trimmedName.includes('}}')) {
        console.log(`⚠️ Skipping malformed variable: ${match}`);
        return '';
      }
      
      if (variableMap.has(trimmedName)) {
        let replacement = variableMap.get(trimmedName) || '';
        
        // Transform formal titles into conversational language
        replacement = this.transformToConversationalLanguage(replacement);
        
        console.log(`🔄 Replacing ${match} with "${replacement}"`);
        return replacement;
      }
      
      // Enhanced fallback: try common patterns if exact match not found
      const fallbackPatterns = [
        trimmedName.replace('theme_', 'description_'), // theme_2 -> description_2
        trimmedName.replace('pain_points.', ''),       // Remove prefix and try again
        'pain_points.primary_theme',                   // Default to primary theme
        'pain_points.top_pain_point'                   // Default to top pain point
      ];
      
      for (const pattern of fallbackPatterns) {
        if (variableMap.has(pattern)) {
          let replacement = variableMap.get(pattern) || '';
          replacement = this.transformToConversationalLanguage(replacement);
          console.log(`🔄 Fallback replacing ${match} with "${replacement}" using pattern ${pattern}`);
          return replacement;
        }
      }
      
      // If still no match, remove the variable entirely rather than showing broken text
      console.log(`⚠️ No replacement found for ${match}, removing variable`);
      return '';
    });
    
    // Clean up any remaining double spaces or awkward spacing
    processed = processed.replace(/\s+/g, ' ').trim();
    
    return processed;
  }

  /**
   * Transform formal pain point titles into conversational language
   * Why this matters: Converts formal titles into natural, flowing ad copy language that doesn't sound robotic.
   */
  private transformToConversationalLanguage(formalTitle: string): string {
    if (!formalTitle) return '';
    
    // Enhanced transformations that create natural ad copy phrases
    const transformations: { [key: string]: string } = {
      'Manual Data Scraping & Tool Sprawl Pre-Apollo': 'wasting hours on manual prospecting',
      'Manual Data Scraping & Tool Sprawl': 'wasting hours on manual prospecting', 
      'Website Visitor Tracking & Scoring': 'missing in-market prospects',
      'Website Visitor Tracking & Scoring for Prospecting': 'missing in-market prospects',
      'Tool Consolidation Need': 'juggling multiple tools',
      'Consolidation of Disparate Tools Into One Platform': 'juggling multiple tools',
      'Netsuite & Salesforce Integration Options': 'broken CRM workflows',
      'Pricing & ROI Pressure For Tool Adoption': 'struggling to prove ROI',
      'Targeted Vertical Markets & Geographic Focus': 'missing your target market',
      'Lead Generation Accuracy Challenges (Pre-Apollo)': 'chasing bad leads',
      'Lead Generation Accuracy Challenges': 'chasing bad leads',
      'Data Duplication Campaigns': 'dealing with duplicate contacts',
      'CRM Integration Sync': 'broken CRM sync',
      'International Dialer Availability & Scale': 'limited global reach',
      'API Access & Automation Demand': 'stuck with manual work',
      'Multichannel Outreach & Cadence Automation': 'inconsistent follow-up'
    };
    
    // Check for exact matches first
    if (transformations[formalTitle]) {
      return transformations[formalTitle];
    }
    
    // Enhanced general transformations for ad copy
    let conversational = formalTitle
      .replace(/Pre-Apollo/gi, '') // Remove "Pre-Apollo" entirely
      .replace(/\s*&\s*/g, ' and ') // Replace & with "and"
      .replace(/\s+/g, ' ') // Clean up extra spaces
      .toLowerCase()
      .trim();
    
    // Transform common patterns into ad copy language
    conversational = conversational
      .replace(/^(manual|lack of|poor|limited|insufficient)\s+(.+)$/i, 'struggling with $2')
      .replace(/^(.+)\s+(challenges?|problems?|issues?)$/i, 'struggling with $1')
      .replace(/^(.+)\s+(needs?|requirements?)$/i, 'need better $1')
      .replace(/^(.+)\s+(gaps?|shortfalls?)$/i, 'missing $1')
      .replace(/^(.+)\s+(pressure|demand)$/i, 'pressure around $1')
      .replace(/\s+(for|into|with)\s+.+$/i, '') // Remove trailing prepositional phrases
      .trim();
    
    // If still formal-sounding, make it more conversational
    if (conversational.length > 40) {
      conversational = conversational.substring(0, 35) + '...';
    }
    
    return conversational || 'sales challenges'; // Better fallback
  }

  /**
   * Clean robotic language patterns from CTA copy
   * Why this matters: Removes AI-generated repetitive phrases and awkward constructions
   * to create natural, human-sounding ad copy that converts better.
   */
  private cleanRoboticLanguage(cta: CTAStructure): CTAStructure {
    const cleanedCTA = { ...cta };
    
    // Clean headline
    cleanedCTA.headline = this.cleanRoboticText(cta.headline);
    
    // Clean description with more aggressive cleanup
    cleanedCTA.description = this.cleanRoboticDescription(cta.description);
    
    return cleanedCTA;
  }

  /**
   * Clean robotic patterns from text
   * Why this matters: Removes repetitive phrases and awkward AI constructions.
   */
  private cleanRoboticText(text: string): string {
    if (!text) return text;
    
    let cleaned = text;
    
    // Remove duplicate phrases
    const words = cleaned.split(' ');
    const seenPhrases = new Set<string>();
    const cleanWords: string[] = [];
    
    for (let i = 0; i < words.length; i++) {
      const twoWordPhrase = words.slice(i, i + 2).join(' ').toLowerCase();
      const threeWordPhrase = words.slice(i, i + 3).join(' ').toLowerCase();
      
      // Skip if we've seen this phrase before
      if (seenPhrases.has(twoWordPhrase) || seenPhrases.has(threeWordPhrase)) {
        continue;
      }
      
      seenPhrases.add(twoWordPhrase);
      seenPhrases.add(threeWordPhrase);
      cleanWords.push(words[i]);
    }
    
    cleaned = cleanWords.join(' ');
    
    // Remove common robotic patterns
    cleaned = cleaned
      .replace(/\band\s+and\b/gi, 'and') // Remove "and and"
      .replace(/\bdata\s+data\b/gi, 'data') // Remove "data data"
      .replace(/\btools?\s+tools?\b/gi, 'tools') // Remove "tools tools"
      .replace(/\bprospecting\s+prospecting\b/gi, 'prospecting')
      .replace(/\bsales\s+sales\b/gi, 'sales')
      .replace(/\bacross\s+campaigns\s+across\s+campaigns/gi, 'across campaigns')
      .replace(/\s+/g, ' ') // Clean up extra spaces
      .trim();
    
    return cleaned;
  }

  /**
   * Clean robotic patterns from description with more aggressive cleanup
   * Why this matters: Descriptions are longer and more prone to robotic repetition.
   */
  private cleanRoboticDescription(description: string): string {
    if (!description) return description;
    
    let cleaned = description;
    
    // First pass - basic robotic text cleanup
    cleaned = this.cleanRoboticText(cleaned);
    
    // Remove repetitive sentence patterns
    const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim());
    const uniqueSentences: string[] = [];
    const seenConcepts = new Set<string>();
    
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;
      
      // Extract key concepts from sentence
      const concepts = trimmed.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 3);
      
      // Check if this sentence introduces new concepts
      const newConcepts = concepts.filter(concept => !seenConcepts.has(concept));
      
      // Keep sentence if it has enough new concepts or is very short
      if (newConcepts.length >= 2 || trimmed.length < 50) {
        uniqueSentences.push(trimmed);
        concepts.forEach(concept => seenConcepts.add(concept));
      }
    }
    
    // Reconstruct description
    cleaned = uniqueSentences.join('. ');
    if (cleaned && !cleaned.endsWith('.')) {
      cleaned += '.';
    }
    
    // Final cleanup of common robotic phrases
    cleaned = cleaned
      .replace(/\bprove ROI on sales tools and improved lead-gen accuracy/gi, 'prove ROI and improve lead quality')
      .replace(/\bWebsite visitor tracking script and a custom scoring model/gi, 'visitor tracking and lead scoring')
      .replace(/\bcrm integration and data sync strategy/gi, 'seamless CRM sync')
      .replace(/\btargeted verticals\/geos/gi, 'target markets')
      .replace(/\bfinding accurate prospect data/gi, 'finding quality prospects')
      .replace(/\bdata duplication and duplicates management/gi, 'duplicate management')
      .replace(/\s+/g, ' ')
      .trim();
    
    return cleaned;
  }

  /**
   * Test CTA generation functionality
   * Why this matters: Validates that the service is working correctly with mock data.
   */
  async testCTAGeneration(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.claude) {
        return { success: false, message: 'Claude client not initialized' };
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
  getServiceStatus(): { available: boolean; openaiReady: boolean; claudeReady: boolean } {
    return {
      available: true,
      openaiReady: !!this.openai,
      claudeReady: !!this.claude
    };
  }

  /**
   * Validate CTA diversity across positions
   * Why this matters: Ensures each position uses distinct messaging approaches for maximum engagement variety
   */
  private validateCTADiversity(): void {
    if (this.generatedCTAs.length !== 3) {
      console.log(`⚠️ Expected 3 CTAs for diversity check, got ${this.generatedCTAs.length}`);
      return;
    }

    const descriptions = this.generatedCTAs.map(cta => cta.description.toLowerCase());
    
    // Check for similar opening patterns
    const openingPatterns = [
      'tired of',
      'sick of', 
      'fed up with',
      'struggling with',
      'while others',
      'top performers',
      'modern teams',
      'transform your',
      'start closing',
      'accelerate your'
    ];

    const usedPatterns = new Set<string>();
    let diversityIssues: string[] = [];

    descriptions.forEach((desc, idx) => {
      const position = this.generatedCTAs[idx].position;
      const foundPattern = openingPatterns.find(pattern => desc.includes(pattern));
      
      if (foundPattern) {
        if (usedPatterns.has(foundPattern)) {
          diversityIssues.push(`${position} CTA reuses "${foundPattern}" pattern`);
        }
        usedPatterns.add(foundPattern);
      }
    });

    // Check for similar social proof patterns and metrics
    const socialProofPatterns = [
      '500,000+ companies',
      'join 500,000+',
      'hitting 3x quota',
      'hitting quota',
      'hitting 150%',
      '210m+ verified contacts',
      '91% email accuracy',
      '91% accuracy',
      'apollo consolidates',
      'apollo unifies',
      'apollo delivers',
      'top performers',
      'revenue leaders',
      'competitors close faster',
      'while competitors',
      'seamless CRM integration'
    ];

    const usedSocialProof = new Set<string>();
    descriptions.forEach((desc, idx) => {
      const position = this.generatedCTAs[idx].position;
      socialProofPatterns.forEach(pattern => {
        if (desc.includes(pattern)) {
          if (usedSocialProof.has(pattern)) {
            diversityIssues.push(`${position} CTA reuses "${pattern}" social proof`);
          }
          usedSocialProof.add(pattern);
        }
      });
    });

    if (diversityIssues.length > 0) {
      console.log(`⚠️ CTA Diversity Issues Detected:`);
      diversityIssues.forEach(issue => console.log(`   - ${issue}`));
      console.log(`💡 Consider regenerating with more distinct messaging approaches`);
    } else {
      console.log(`✅ CTA diversity validated - each position uses distinct messaging`);
    }
  }

  /**
   * Parse JSON from Claude's response, handling markdown code blocks
   * Why this matters: Claude often wraps JSON responses in ```json blocks, which breaks JSON.parse()
   */
  private parseJSONFromResponse(response: string): any {
    try {
      // First try parsing as-is
      return JSON.parse(response);
    } catch (error) {
      // If that fails, try extracting JSON from markdown code blocks
      const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          return JSON.parse(jsonMatch[1].trim());
        } catch (innerError) {
          console.error('Failed to parse JSON from markdown block:', jsonMatch[1]);
          throw new Error(`Invalid JSON in response: ${innerError}`);
        }
      }
      
      // If no markdown blocks found, try extracting JSON between { and }
      const jsonStart = response.indexOf('{');
      const jsonEnd = response.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        const jsonStr = response.substring(jsonStart, jsonEnd + 1);
        try {
          return JSON.parse(jsonStr);
        } catch (innerError) {
          console.error('Failed to parse extracted JSON:', jsonStr);
          throw new Error(`Invalid JSON in response: ${innerError}`);
        }
      }
      
      console.error('Could not extract valid JSON from response:', response);
      throw new Error(`Could not parse JSON from response: ${error}`);
    }
  }
}

export default CTAGenerationService;
