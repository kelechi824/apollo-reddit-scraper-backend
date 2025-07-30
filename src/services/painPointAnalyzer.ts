import OpenAI from 'openai';
import { ExtractedPainPoint, CustomerPhrase, CallAnalysisResult } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface PainPointExtractionRequest {
  prospectStatements: string[];
  callId: string;
  callTitle: string;
  callDate: string;
}

interface OpenAIPainPointResponse {
  painPoints: Array<{
    text: string;
    category: string;
    emotionalTrigger: string;
    confidence: number;
    context?: string;
  }>;
  customerPhrases: Array<{
    phrase: string;
    frequency: number;
    category: string;
    context: string;
  }>;
  competitorMentions: string[];
  summary: string;
}

// CRO-specific interfaces for conversion optimization
interface CROAnalysisResult {
  conversionBarriers: Array<{
    barrier: string;
    category: 'trust_issues' | 'form_friction' | 'value_clarity' | 'pricing_concerns' | 'urgency_lack' | 'social_proof_missing' | 'technical_concerns' | 'process_uncertainty';
    severity: 'high' | 'medium' | 'low';
    customerQuote: string;
    adCopyOpportunity: string;
    landingPageFix: string;
  }>;
  customerObjections: Array<{
    objection: string;
    frequency: number;
    emotionalState: string;
    adCopyResponse: string;
    landingPageElement: string;
  }>;
  adCopyInsights: {
    headlines: string[];
    descriptions: string[];
    emotionalTriggers: string[];
    customerLanguage: string[];
  };
  conversionMotivators: Array<{
    motivator: string;
    customerQuote: string;
    urgencyLevel: 'high' | 'medium' | 'low';
    adCopyUse: string;
  }>;
}

/**
 * Service for analyzing prospect statements and extracting pain points using OpenAI GPT-4.1-nano
 * Why this matters: Transforms raw customer conversations into structured insights for CRO and ad copy optimization.
 */
class PainPointAnalyzer {
  private client: OpenAI | null = null;
  private model = 'gpt-4.1-nano-2025-04-14'; // Use exact model specified in memory

  constructor() {
    setTimeout(() => {
      this.initializeClient();
    }, 100);
  }

  /**
   * Initialize OpenAI client with API key
   * Why this matters: OpenAI GPT-4.1-nano provides superior analysis of customer language and pain points.
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

      console.log('✅ Pain Point Analyzer (OpenAI GPT-4.1-nano) initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Pain Point Analyzer:', error);
    }
  }

  /**
   * Create the system prompt for pain point extraction
   * Why this matters: Provides clear instructions to GPT-4.1-nano for consistent, accurate analysis.
   */
  private createPainPointExtractionPrompt(): string {
    return `You are an expert customer insight analyst specializing in B2B sales conversations. Your task is to analyze prospect statements from sales calls and extract:

1. PAIN POINTS: Specific problems, challenges, or frustrations the prospect mentions
2. EMOTIONAL TRIGGERS: The emotional state behind each pain point
3. CUSTOMER LANGUAGE: Exact phrases and terminology prospects use
4. COMPETITOR MENTIONS: Any references to competing solutions

CATEGORIES FOR PAIN POINTS:
- manual_tasks: Manual processes, repetitive work, time-consuming activities
- data_quality: Poor data, accuracy issues, data hygiene problems  
- deliverability: Email deliverability, spam issues, sender reputation
- compliance: GDPR, security, legal concerns, audit requirements
- integration: Tool connectivity, API issues, platform compatibility
- cost: Budget concerns, pricing, ROI, cost-effectiveness
- other: Any other pain points not covered above

EMOTIONAL TRIGGERS:
- frustration: Annoyed, irritated, upset about current situation
- anxiety: Worried, stressed, concerned about risks or outcomes
- excitement: Enthusiastic, eager, positive about potential solutions
- relief: Seeking comfort, ease, reduction of burden
- fear: Afraid of consequences, failure, or making wrong decisions
- neutral: Matter-of-fact statements without strong emotion

CUSTOMER PHRASE CONTEXTS:
- early_call: Initial statements, introductions, background
- mid_call: Main discussion, feature exploration
- late_call: Decision-making, next steps, objections
- objection: Concerns, hesitations, pushback
- excitement: Positive reactions, interest, enthusiasm

Analyze ONLY the prospect's statements (ignore sales rep talk). Focus on authentic customer language, not marketing jargon.

Return a JSON object with this exact structure:
{
  "painPoints": [
    {
      "text": "exact customer quote expressing the pain point",
      "category": "category from list above", 
      "emotionalTrigger": "emotion from list above",
      "confidence": 0.85,
      "context": "additional context if helpful"
    }
  ],
  "customerPhrases": [
    {
      "phrase": "exact phrase customer used",
      "frequency": 1,
      "category": "descriptive category",
      "context": "context from list above"
    }
  ],
  "competitorMentions": ["competitor name or solution mentioned"],
  "summary": "Brief summary of main customer concerns and interests"
}`;
  }

  /**
   * Create CRO-specific analysis prompt for conversion optimization
   * Why this matters: CRO managers need conversion barriers and objections, not just general pain points, to optimize landing pages and ad copy effectively.
   */
  private createCROAnalysisPrompt(): string {
    return `You are a Conversion Rate Optimization expert analyzing customer calls to identify conversion barriers and ad copy opportunities. Focus on:

1. CONVERSION BARRIERS: What prevents prospects from converting/buying
2. CUSTOMER OBJECTIONS: Specific hesitations, concerns, or pushback
3. AD COPY INSIGHTS: Customer language that can be used in Google Ads
4. CONVERSION MOTIVATORS: What drives them to take action

CONVERSION BARRIER CATEGORIES:
- trust_issues: Concerns about company credibility, security, reliability
- form_friction: Issues with signup processes, forms, onboarding complexity
- value_clarity: Confusion about benefits, unclear value proposition
- pricing_concerns: Cost objections, budget limitations, ROI uncertainty
- urgency_lack: No immediate need, procrastination, timing issues
- social_proof_missing: Need for testimonials, case studies, peer validation
- technical_concerns: Integration worries, technical capabilities, support
- process_uncertainty: Unclear about implementation, next steps, timeline

SEVERITY LEVELS:
- high: Major conversion blocker, likely prevents most prospects from converting
- medium: Moderate concern, may cause hesitation but not full stop
- low: Minor friction point, easy to address

EMOTIONAL STATES:
- skeptical: Doubtful, questioning, needs proof
- anxious: Worried about risks, consequences, making wrong choice
- excited: Interested, eager, seeing potential value
- frustrated: Annoyed with current situation, seeking relief
- cautious: Careful, methodical, wants reassurance
- impatient: Wants quick results, dislikes complexity

Return a JSON object with this exact structure:
{
  "conversionBarriers": [
    {
      "barrier": "specific conversion barrier",
      "category": "category from list above",
      "severity": "high/medium/low",
      "customerQuote": "exact customer statement",
      "adCopyOpportunity": "how to address in ad copy",
      "landingPageFix": "how to fix on landing page"
    }
  ],
  "customerObjections": [
    {
      "objection": "specific customer objection",
      "frequency": 1,
      "emotionalState": "emotional state from list above",
      "adCopyResponse": "ad copy that addresses this objection",
      "landingPageElement": "page element to add/improve"
    }
  ],
  "adCopyInsights": {
    "headlines": ["customer phrases suitable for ad headlines"],
    "descriptions": ["customer phrases for ad descriptions"],
    "emotionalTriggers": ["emotional words/phrases customers use"],
    "customerLanguage": ["exact terms customers use vs marketing jargon"]
  },
  "conversionMotivators": [
    {
      "motivator": "what drives them to act",
      "customerQuote": "exact quote showing motivation",
      "urgencyLevel": "high/medium/low",
      "adCopyUse": "how to use this motivation in ads"
    }
  ]
}`;
  }

  /**
   * Analyze prospect statements for pain points and customer language
   * Why this matters: Core analysis that powers both CRO recommendations and ad copy generation.
   */
  async analyzePainPoints(request: PainPointExtractionRequest): Promise<CallAnalysisResult> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const { prospectStatements, callId, callTitle, callDate } = request;
    
    if (!prospectStatements || prospectStatements.length === 0) {
      throw new Error('No prospect statements provided for analysis');
    }

    console.log(`🧠 Analyzing pain points for call ${callId} with GPT-4.1-nano...`);
    console.log(`📄 Processing ${prospectStatements.length} prospect statements`);

    try {
      const combinedProspectText = prospectStatements.join('\n\n');
      
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: this.createPainPointExtractionPrompt()
          },
          {
            role: 'user', 
            content: `Analyze these prospect statements from a sales call:

CALL: ${callTitle}
DATE: ${callDate}

PROSPECT STATEMENTS:
${combinedProspectText}

Extract pain points, emotional triggers, customer phrases, and competitor mentions. Return valid JSON only.`
          }
        ],
        temperature: 0.3, // Lower temperature for more consistent analysis
        max_tokens: 2000,
        response_format: { type: "json_object" }
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No response from OpenAI');
      }

      console.log(`🤖 GPT-4.1-nano response received (${responseContent.length} chars)`);

      // Parse the JSON response
      const analysis: OpenAIPainPointResponse = JSON.parse(responseContent);

      // Convert to our structured format
      const painPoints: ExtractedPainPoint[] = analysis.painPoints.map(pp => ({
        id: uuidv4(),
        text: pp.text,
        category: pp.category as ExtractedPainPoint['category'],
        emotionalTrigger: pp.emotionalTrigger as ExtractedPainPoint['emotionalTrigger'],
        frequency: 1, // Individual call frequency
        confidence: pp.confidence,
        callId: callId,
        speakerId: 'prospect', // We know these are prospect statements
        timestamp: undefined
      }));

      const customerPhrases: CustomerPhrase[] = analysis.customerPhrases.map(cp => ({
        id: uuidv4(),
        phrase: cp.phrase,
        frequency: cp.frequency,
        category: cp.category,
        context: cp.context as CustomerPhrase['context'],
        callIds: [callId]
      }));

      // Create speakers info (simplified since we processed transcript already)
      const speakers = [
        {
          id: 'prospect',
          name: 'Prospect',
          role: 'prospect' as const
        },
        {
          id: 'sales_rep', 
          name: 'Sales Rep',
          role: 'sales_rep' as const
        }
      ];

      const result: CallAnalysisResult = {
        callId,
        callTitle,
        callDate,
        painPoints,
        customerPhrases,
        speakers,
        summary: analysis.summary,
        competitorMentions: analysis.competitorMentions
      };

      console.log(`✅ Pain point analysis complete for call ${callId}:`);
      console.log(`   🔍 ${painPoints.length} pain points extracted`);
      console.log(`   💬 ${customerPhrases.length} customer phrases identified`);
      console.log(`   🏢 ${analysis.competitorMentions.length} competitor mentions found`);

      return result;

    } catch (error: any) {
      console.error(`❌ Failed to analyze pain points for call ${callId}:`, error);
      
      if (error.message.includes('JSON')) {
        console.error('🚨 JSON parsing error - OpenAI response may be malformed');
      }
      
      throw new Error(`Pain point analysis failed: ${error.message}`);
    }
  }

  /**
   * Perform CRO-specific analysis for conversion optimization
   * Why this matters: CRO managers need conversion barriers and ad copy insights, not just general pain points, to optimize landing pages and Google Ads effectively.
   */
  async analyzeCROInsights(request: PainPointExtractionRequest): Promise<CROAnalysisResult> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const { prospectStatements, callId, callTitle, callDate } = request;
    
    if (!prospectStatements || prospectStatements.length === 0) {
      throw new Error('No prospect statements provided for CRO analysis');
    }

    console.log(`🎯 Analyzing CRO insights for call ${callId} with GPT-4.1-nano...`);
    console.log(`📊 Processing ${prospectStatements.length} prospect statements for conversion barriers`);

    try {
      const combinedProspectText = prospectStatements.join('\n\n');
      
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: this.createCROAnalysisPrompt()
          },
          {
            role: 'user', 
            content: `Analyze these prospect statements for CRO insights:

CALL: ${callTitle}
DATE: ${callDate}

PROSPECT STATEMENTS:
${combinedProspectText}

Focus on conversion barriers, objections, ad copy opportunities, and conversion motivators. Return valid JSON only.`
          }
        ],
        temperature: 0.3,
        max_tokens: 3000, // More tokens for comprehensive CRO analysis
        response_format: { type: "json_object" }
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No CRO analysis response from OpenAI');
      }

      console.log(`🤖 CRO analysis received (${responseContent.length} chars)`);

      const croAnalysis: CROAnalysisResult = JSON.parse(responseContent);

      console.log(`✅ CRO analysis complete for call ${callId}:`);
      console.log(`   🚧 ${croAnalysis.conversionBarriers?.length || 0} conversion barriers identified`);
      console.log(`   ❌ ${croAnalysis.customerObjections?.length || 0} customer objections found`);
      console.log(`   📝 ${croAnalysis.adCopyInsights?.headlines?.length || 0} ad copy headlines extracted`);
      console.log(`   ⚡ ${croAnalysis.conversionMotivators?.length || 0} conversion motivators identified`);

      return croAnalysis;

    } catch (error: any) {
      console.error(`❌ Failed to analyze CRO insights for call ${callId}:`, error);
      
      if (error.message.includes('JSON')) {
        console.error('🚨 JSON parsing error - CRO analysis response may be malformed');
      }
      
      throw new Error(`CRO analysis failed: ${error.message}`);
    }
  }

  /**
   * Identify conversion barriers across multiple calls
   * Why this matters: Understanding what prevents conversions across the customer base helps prioritize landing page optimizations and ad copy improvements.
   */
  async identifyConversionBarriers(analysisResults: CallAnalysisResult[]): Promise<{
    topBarriers: Array<{
      category: string;
      count: number;
      severity: string;
      examples: string[];
      adCopyFixes: string[];
      landingPageFixes: string[];
    }>;
    objectionPatterns: Array<{
      objection: string;
      frequency: number;
      callCount: number;
      recommendedResponse: string;
    }>;
    adCopyOpportunities: {
      topHeadlines: string[];
      topDescriptions: string[];
      emotionalTriggers: string[];
    };
  }> {
    console.log(`🔍 Identifying conversion barriers across ${analysisResults.length} calls...`);

    // For this analysis, we'll use the existing pain point data and enhance it with CRO context
    const barrierCategories: { [key: string]: { count: number; examples: string[]; severity: string[] } } = {};
    const objectionFrequency: { [key: string]: { count: number; callIds: Set<string> } } = {};
    const adCopyPhrases: string[] = [];
    const emotionalTriggers: string[] = [];

    analysisResults.forEach(result => {
      result.painPoints.forEach(pp => {
        // Map general pain points to conversion barriers
        const barrierCategory = this.mapPainPointToConversionBarrier(pp.category);
        
        if (!barrierCategories[barrierCategory]) {
          barrierCategories[barrierCategory] = { count: 0, examples: [], severity: [] };
        }
        
        barrierCategories[barrierCategory].count++;
        barrierCategories[barrierCategory].examples.push(pp.text);
        barrierCategories[barrierCategory].severity.push(pp.confidence > 0.8 ? 'high' : pp.confidence > 0.6 ? 'medium' : 'low');

        // Extract potential objections
        if (pp.emotionalTrigger === 'anxiety' || pp.emotionalTrigger === 'fear') {
          const objectionKey = pp.text.substring(0, 100); // Use first 100 chars as key
          if (!objectionFrequency[objectionKey]) {
            objectionFrequency[objectionKey] = { count: 0, callIds: new Set() };
          }
          objectionFrequency[objectionKey].count++;
          objectionFrequency[objectionKey].callIds.add(result.callId);
        }
      });

      // Extract ad copy phrases from customer language
      result.customerPhrases.forEach(cp => {
        if (cp.context === 'excitement' || cp.context === 'early_call') {
          adCopyPhrases.push(cp.phrase);
        }
        
        // Extract emotional triggers
        if (cp.category.includes('emotion') || cp.category.includes('trigger')) {
          emotionalTriggers.push(cp.phrase);
        }
      });
    });

    // Format results
    const topBarriers = Object.entries(barrierCategories)
      .map(([category, data]) => ({
        category,
        count: data.count,
        severity: this.getMostCommonSeverity(data.severity),
        examples: data.examples.slice(0, 3),
        adCopyFixes: this.generateAdCopyFixes(category),
        landingPageFixes: this.generateLandingPageFixes(category)
      }))
      .sort((a, b) => b.count - a.count);

    const objectionPatterns = Object.entries(objectionFrequency)
      .map(([objection, data]) => ({
        objection,
        frequency: data.count,
        callCount: data.callIds.size,
        recommendedResponse: this.generateObjectionResponse(objection)
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10); // Top 10 objections

    const adCopyOpportunities = {
      topHeadlines: adCopyPhrases.slice(0, 10),
      topDescriptions: adCopyPhrases.slice(10, 20),
      emotionalTriggers: [...new Set(emotionalTriggers)].slice(0, 15)
    };

    console.log(`✅ Conversion barrier analysis complete:`);
    console.log(`   🚧 ${topBarriers.length} barrier categories identified`);
    console.log(`   ❌ ${objectionPatterns.length} objection patterns found`);
    console.log(`   📝 ${adCopyOpportunities.topHeadlines.length} ad copy opportunities extracted`);

    return {
      topBarriers,
      objectionPatterns,
      adCopyOpportunities
    };
  }

  /**
   * Map general pain point categories to CRO-specific conversion barriers
   * Why this matters: CRO analysis needs conversion-focused categorization, not general sales categories.
   */
  private mapPainPointToConversionBarrier(category: string): string {
    const mappings: { [key: string]: string } = {
      'manual_tasks': 'process_uncertainty',
      'data_quality': 'trust_issues', 
      'deliverability': 'technical_concerns',
      'compliance': 'trust_issues',
      'integration': 'technical_concerns',
      'cost': 'pricing_concerns',
      'other': 'value_clarity'
    };
    
    return mappings[category] || 'value_clarity';
  }

  /**
   * Determine most common severity level
   * Why this matters: Helps prioritize which conversion barriers to fix first.
   */
  private getMostCommonSeverity(severities: string[]): string {
    const counts = severities.reduce((acc, severity) => {
      acc[severity] = (acc[severity] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });
    
    return Object.entries(counts).sort(([,a], [,b]) => b - a)[0][0];
  }

  /**
   * Generate ad copy fixes for conversion barriers
   * Why this matters: Provides actionable Google Ads copy that addresses specific conversion concerns.
   */
  private generateAdCopyFixes(category: string): string[] {
    const fixes: { [key: string]: string[] } = {
      'trust_issues': ['Trusted by 10,000+ companies', 'Enterprise-grade security', 'SOC 2 compliant'],
      'form_friction': ['Quick 2-minute setup', 'No credit card required', 'Start free trial instantly'],
      'value_clarity': ['See ROI in 30 days', 'Increase sales by 40%', 'Save 10 hours per week'],
      'pricing_concerns': ['Free forever plan', 'Cancel anytime', 'Money-back guarantee'],
      'urgency_lack': ['Limited time offer', 'Join before price increase', 'Start saving today'],
      'social_proof_missing': ['Join 50K+ users', 'Rated #1 by G2', '4.8/5 star rating'],
      'technical_concerns': ['Works with your CRM', '24/7 support included', 'Easy integration'],
      'process_uncertainty': ['Step-by-step onboarding', 'Dedicated success manager', 'Implementation in 1 day']
    };
    
    return fixes[category] || ['Solve your challenges today', 'Get started now', 'See the difference'];
  }

  /**
   * Generate landing page fixes for conversion barriers  
   * Why this matters: Provides specific landing page elements to add or improve for better conversions.
   */
  private generateLandingPageFixes(category: string): string[] {
    const fixes: { [key: string]: string[] } = {
      'trust_issues': ['Add security badges', 'Customer testimonials section', 'Company logos/case studies'],
      'form_friction': ['Reduce form fields', 'Add progress indicator', 'Social login options'],
      'value_clarity': ['Clearer headline', 'Benefits over features', 'ROI calculator'],
      'pricing_concerns': ['Pricing comparison table', 'Money-back guarantee', 'Free trial callout'],
      'urgency_lack': ['Limited time banner', 'Countdown timer', 'Scarcity messaging'],
      'social_proof_missing': ['Customer review carousel', 'Usage statistics', 'Awards/badges'],
      'technical_concerns': ['Integration logos', 'Technical specs page', 'Support chat widget'],
      'process_uncertainty': ['Onboarding video', 'Implementation timeline', 'FAQ section']
    };
    
    return fixes[category] || ['Clearer value proposition', 'Stronger call-to-action', 'Remove friction'];
  }

  /**
   * Generate recommended response to customer objections
   * Why this matters: Helps create ad copy and landing page content that preemptively addresses common objections.
   */
  private generateObjectionResponse(objection: string): string {
    // Simple pattern matching for common objection types
    if (objection.toLowerCase().includes('cost') || objection.toLowerCase().includes('price')) {
      return 'Highlight ROI and cost savings in ad copy';
    } else if (objection.toLowerCase().includes('time') || objection.toLowerCase().includes('implement')) {
      return 'Emphasize quick setup and immediate value';
    } else if (objection.toLowerCase().includes('trust') || objection.toLowerCase().includes('security')) {
      return 'Add security badges and customer testimonials';
    } else if (objection.toLowerCase().includes('complex') || objection.toLowerCase().includes('difficult')) {
      return 'Highlight ease of use and simple onboarding';
    } else {
      return 'Address with clear value proposition and social proof';
    }
  }

  /**
   * Batch analyze multiple calls for pain points
   * Why this matters: Efficiently processes multiple calls to build comprehensive customer insight database.
   */
  async batchAnalyzePainPoints(
    requests: PainPointExtractionRequest[]
  ): Promise<CallAnalysisResult[]> {
    console.log(`🔄 Starting batch pain point analysis for ${requests.length} calls...`);
    
    const results: CallAnalysisResult[] = [];
    const errors: string[] = [];

    // Process calls sequentially to respect rate limits
    for (let i = 0; i < requests.length; i++) {
      const request = requests[i];
      
      try {
        console.log(`📊 Processing call ${i + 1}/${requests.length}: ${request.callTitle}`);
        
        const result = await this.analyzePainPoints(request);
        results.push(result);
        
        // Small delay to avoid rate limiting
        if (i < requests.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error: any) {
        console.error(`❌ Failed to analyze call ${request.callId}:`, error.message);
        errors.push(`Call ${request.callId}: ${error.message}`);
      }
    }

    const totalPainPoints = results.reduce((sum, r) => sum + r.painPoints.length, 0);
    const totalPhrases = results.reduce((sum, r) => sum + r.customerPhrases.length, 0);

    console.log(`✅ Batch analysis complete:`);
    console.log(`   📞 ${results.length}/${requests.length} calls successfully analyzed`);
    console.log(`   🔍 ${totalPainPoints} total pain points extracted`);
    console.log(`   💬 ${totalPhrases} total customer phrases identified`);
    
    if (errors.length > 0) {
      console.log(`   ⚠️ ${errors.length} analysis errors occurred`);
    }

    return results;
  }

  /**
   * Aggregate pain points across multiple calls for insights
   * Why this matters: Identifies patterns and frequency of pain points across customer base.
   */
  aggregatePainPoints(analysisResults: CallAnalysisResult[]): {
    topPainPoints: Array<{
      category: string;
      count: number;
      examples: string[];
      avgConfidence: number;
    }>;
    topCustomerPhrases: Array<{
      phrase: string;
      frequency: number;
      callCount: number;
    }>;
    emotionalTriggers: Array<{
      trigger: string;
      count: number;
      percentage: number;
    }>;
    competitorMentions: Array<{
      competitor: string;
      mentionCount: number;
      callCount: number;
    }>;
  } {
    console.log(`📈 Aggregating insights from ${analysisResults.length} call analyses...`);

    // Aggregate pain points by category
    const painPointsByCategory: { [key: string]: { count: number; examples: string[]; confidences: number[] } } = {};
    const phraseFrequency: { [key: string]: { frequency: number; callIds: Set<string> } } = {};
    const emotionalTriggerCount: { [key: string]: number } = {};
    const competitorMentionCount: { [key: string]: Set<string> } = {};

    analysisResults.forEach(result => {
      // Process pain points
      result.painPoints.forEach(pp => {
        if (!painPointsByCategory[pp.category]) {
          painPointsByCategory[pp.category] = { count: 0, examples: [], confidences: [] };
        }
        painPointsByCategory[pp.category].count++;
        painPointsByCategory[pp.category].examples.push(pp.text);
        painPointsByCategory[pp.category].confidences.push(pp.confidence);

        // Count emotional triggers
        emotionalTriggerCount[pp.emotionalTrigger] = (emotionalTriggerCount[pp.emotionalTrigger] || 0) + 1;
      });

      // Process customer phrases  
      result.customerPhrases.forEach(cp => {
        if (!phraseFrequency[cp.phrase]) {
          phraseFrequency[cp.phrase] = { frequency: 0, callIds: new Set() };
        }
        phraseFrequency[cp.phrase].frequency += cp.frequency;
        phraseFrequency[cp.phrase].callIds.add(result.callId);
      });

      // Process competitor mentions
      result.competitorMentions?.forEach(competitor => {
        if (!competitorMentionCount[competitor]) {
          competitorMentionCount[competitor] = new Set();
        }
        competitorMentionCount[competitor].add(result.callId);
      });
    });

    // Format results
    const topPainPoints = Object.entries(painPointsByCategory)
      .map(([category, data]) => ({
        category,
        count: data.count,
        examples: data.examples.slice(0, 3), // Top 3 examples
        avgConfidence: data.confidences.reduce((sum, c) => sum + c, 0) / data.confidences.length
      }))
      .sort((a, b) => b.count - a.count);

    const topCustomerPhrases = Object.entries(phraseFrequency)
      .map(([phrase, data]) => ({
        phrase,
        frequency: data.frequency,
        callCount: data.callIds.size
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 20); // Top 20 phrases

    const totalEmotionalTriggers = Object.values(emotionalTriggerCount).reduce((sum, count) => sum + count, 0);
    const emotionalTriggers = Object.entries(emotionalTriggerCount)
      .map(([trigger, count]) => ({
        trigger,
        count,
        percentage: Math.round((count / totalEmotionalTriggers) * 100)
      }))
      .sort((a, b) => b.count - a.count);

    const competitorMentions = Object.entries(competitorMentionCount)
      .map(([competitor, callIds]) => ({
        competitor,
        mentionCount: callIds.size,
        callCount: callIds.size
      }))
      .sort((a, b) => b.mentionCount - a.mentionCount);

    console.log(`✅ Aggregation complete:`);
    console.log(`   🏷️ ${topPainPoints.length} pain point categories`);
    console.log(`   💬 ${topCustomerPhrases.length} unique customer phrases`);
    console.log(`   😊 ${emotionalTriggers.length} emotional trigger types`);
    console.log(`   🏢 ${competitorMentions.length} competitors mentioned`);

    return {
      topPainPoints,
      topCustomerPhrases,
      emotionalTriggers,
      competitorMentions
    };
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
        max_tokens: 1
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

export default PainPointAnalyzer; 
export type { CROAnalysisResult }; 