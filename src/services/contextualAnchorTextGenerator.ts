import OpenAI from 'openai';
import { ContentSolutionMatch } from './contentSolutionMatcher';
import { ApolloSolution } from './apolloSolutionsDatabase';

/**
 * Anchor Text Style represents different CTA anchor text approaches
 * Why this matters: Provides variety in CTA presentation to avoid repetitive messaging
 */
export type AnchorTextStyle = 
  | 'question_based'      // "Tired of dirty data? Start free with Apollo"
  | 'benefit_focused'     // "Get 210M+ verified contacts instantly"
  | 'action_oriented'     // "Start cleaning your data today"
  | 'problem_solution'    // "Fix your data quality issues now"
  | 'value_proposition'   // "Join 1M+ sales professionals using Apollo"
  | 'urgency_driven';     // "Don't let bad data cost you deals"

/**
 * Anchor Text Generation Request
 * Why this matters: Structured input for generating contextual anchor text with all necessary context
 */
export interface AnchorTextRequest {
  match: ContentSolutionMatch;
  targetKeyword?: string; // For UTM term parameter
  campaignType: 'blog_creator' | 'competitor_conquesting' | 'general';
  preferredStyle?: AnchorTextStyle;
  maxLength?: number; // Maximum character length (default: 80)
  includeValueProp?: boolean; // Include Apollo value proposition (default: true)
}

/**
 * Generated Anchor Text Result
 * Why this matters: Comprehensive anchor text with metadata for CTA composition
 */
export interface AnchorTextResult {
  anchorText: string;
  style: AnchorTextStyle;
  confidence: number; // 0-100 confidence in quality
  contextualFit: number; // 0-100 how well it fits the content context
  apolloValueProp: string; // Apollo-specific value proposition used
  characterCount: number;
  wordCount: number;
  alternatives: string[]; // Alternative anchor text options
  reasoningNotes: string[]; // Why this anchor text was chosen
}

/**
 * Anchor Text Generation Configuration
 * Why this matters: Allows fine-tuning of anchor text generation behavior
 */
export interface AnchorTextConfig {
  apolloBrandVoice: 'professional' | 'conversational' | 'direct' | 'consultative';
  includeNumbers: boolean; // Include specific numbers/stats (default: true)
  includeActionWords: boolean; // Include action verbs (default: true)
  avoidSuperlatives: boolean; // Avoid words like "best", "amazing" (default: false)
  maxAlternatives: number; // Number of alternative options to generate (default: 3)
  contextualWeight: number; // Weight for contextual relevance (0-1, default: 0.7)
  brandConsistencyWeight: number; // Weight for Apollo brand consistency (0-1, default: 0.3)
}

/**
 * Contextual Anchor Text Generator Service
 * Why this matters: Creates natural, compelling anchor text that flows seamlessly within content
 * while maintaining Apollo's brand voice and driving action.
 */
class ContextualAnchorTextGenerator {
  private client: OpenAI | null;
  private defaultConfig: AnchorTextConfig;

  constructor(skipApiKey: boolean = false) {
    if (!skipApiKey) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is required');
      }
      this.client = new OpenAI({ apiKey });
    } else {
      this.client = null;
    }

    // Default configuration optimized for Apollo's brand voice
    this.defaultConfig = {
      apolloBrandVoice: 'conversational',
      includeNumbers: true,
      includeActionWords: true,
      avoidSuperlatives: false,
      maxAlternatives: 3,
      contextualWeight: 0.7,
      brandConsistencyWeight: 0.3
    };

    console.log('✅ Contextual Anchor Text Generator initialized');
  }

  /**
   * Generate contextual anchor text for a content-solution match
   * Why this matters: This is the core function that creates natural, compelling anchor text
   * that feels like an organic continuation of the paragraph content.
   */
  async generateAnchorText(
    request: AnchorTextRequest,
    config?: Partial<AnchorTextConfig>
  ): Promise<AnchorTextResult> {
    const generationConfig = { ...this.defaultConfig, ...config };
    
    try {
      console.log(`🎨 Generating anchor text for solution: ${request.match.matchedSolution.title}`);
      console.log(`📝 Content context: "${request.match.chunk.content.substring(0, 100)}..."`);

      // Step 1: Analyze content context for anchor text generation
      const contextAnalysis = this.analyzeContentContext(request.match);
      console.log(`🧠 Context analysis: ${contextAnalysis.contextType}, tone: ${contextAnalysis.tone}`);

      // Step 2: Generate anchor text using AI or fallback method
      let anchorTextResult: AnchorTextResult;
      
      if (this.client) {
        anchorTextResult = await this.generateAnchorTextWithAI(request, generationConfig, contextAnalysis);
      } else {
        anchorTextResult = this.generateAnchorTextFallback(request, generationConfig, contextAnalysis);
      }

      // Step 3: Validate and refine the generated anchor text
      const refinedResult = this.refineAnchorText(anchorTextResult, request, generationConfig);

      console.log(`✅ Generated anchor text: "${refinedResult.anchorText}" (${refinedResult.confidence}% confidence)`);
      
      return refinedResult;

    } catch (error) {
      console.error('❌ Anchor text generation failed:', error);
      throw new Error(`Anchor text generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analyze content context for anchor text generation
   * Why this matters: Understanding the content context helps generate anchor text that flows naturally
   */
  private analyzeContentContext(match: ContentSolutionMatch): {
    contextType: 'problem_statement' | 'solution_discussion' | 'benefit_explanation' | 'general';
    tone: 'formal' | 'conversational' | 'urgent' | 'educational';
    painPointIntensity: 'low' | 'medium' | 'high';
    solutionReadiness: 'low' | 'medium' | 'high';
  } {
    const content = match.chunk.content.toLowerCase();
    const painPoints = match.chunk.painPoints.join(' ').toLowerCase();

    // Determine context type
    let contextType: 'problem_statement' | 'solution_discussion' | 'benefit_explanation' | 'general' = 'general';
    if (content.includes('problem') || content.includes('challenge') || content.includes('struggle')) {
      contextType = 'problem_statement';
    } else if (content.includes('solution') || content.includes('tool') || content.includes('platform')) {
      contextType = 'solution_discussion';
    } else if (content.includes('benefit') || content.includes('improve') || content.includes('better')) {
      contextType = 'benefit_explanation';
    }

    // Determine tone
    let tone: 'formal' | 'conversational' | 'urgent' | 'educational' = 'conversational';
    if (content.includes('must') || content.includes('critical') || content.includes('urgent')) {
      tone = 'urgent';
    } else if (content.includes('understand') || content.includes('learn') || content.includes('consider')) {
      tone = 'educational';
    } else if (content.includes('organization') || content.includes('enterprise') || content.includes('company')) {
      tone = 'formal';
    }

    // Determine pain point intensity
    const painPointIntensity = painPoints.includes('fail') || painPoints.includes('crisis') || painPoints.includes('critical') 
      ? 'high' 
      : painPoints.includes('challenge') || painPoints.includes('problem') 
        ? 'medium' 
        : 'low';

    // Determine solution readiness
    const solutionReadiness = content.includes('need') || content.includes('require') || content.includes('must have')
      ? 'high'
      : content.includes('consider') || content.includes('explore') || content.includes('evaluate')
        ? 'medium'
        : 'low';

    return { contextType, tone, painPointIntensity, solutionReadiness };
  }

  /**
   * Generate anchor text using AI
   * Why this matters: Uses AI to create natural, contextual anchor text that maintains Apollo's brand voice
   */
  private async generateAnchorTextWithAI(
    request: AnchorTextRequest,
    config: AnchorTextConfig,
    contextAnalysis: any
  ): Promise<AnchorTextResult> {
    const prompt = this.buildAnchorTextPrompt(request, config, contextAnalysis);

    const completion = await this.client!.responses.create({
      model: "gpt-5-nano",
      input: prompt
    });

    const responseContent = completion.output_text;
    if (!responseContent) {
      throw new Error('Empty response from OpenAI');
    }

    return this.parseAnchorTextResponse(responseContent, request);
  }

  /**
   * Build AI prompt for anchor text generation
   * Why this matters: Creates focused prompts that guide AI to generate high-quality, contextual anchor text
   */
  private buildAnchorTextPrompt(
    request: AnchorTextRequest,
    config: AnchorTextConfig,
    contextAnalysis: any
  ): string {
    const solution = request.match.matchedSolution;
    const chunk = request.match.chunk;
    const maxLength = request.maxLength || 80;

    return `You are an expert copywriter specializing in B2B SaaS anchor text that converts. Create compelling, contextual anchor text for Apollo (a sales intelligence and engagement platform) that flows naturally within content.

CONTENT CONTEXT:
"${chunk.content}"

CONTENT ANALYSIS:
- Themes: ${chunk.themes.join(', ')}
- Pain Points: ${chunk.painPoints.join(', ')}
- Context Type: ${contextAnalysis.contextType}
- Tone: ${contextAnalysis.tone}
- Pain Point Intensity: ${contextAnalysis.painPointIntensity}

APOLLO SOLUTION:
- Title: ${solution.title}
- Description: ${solution.description}
- Category: ${solution.category}
- URL: ${solution.url}

APOLLO VALUE PROPOSITIONS:
- 270M+ verified B2B contacts and 73M+ companies
- AI-powered sales engagement and automation
- Data enrichment and quality management
- Multichannel outreach sequences
- Sales intelligence and insights

ANCHOR TEXT REQUIREMENTS:
1. Maximum ${maxLength} characters
2. Natural continuation of the paragraph content
3. Apollo brand voice: ${config.apolloBrandVoice}
4. Include specific numbers/stats: ${config.includeNumbers}
5. Include action words: ${config.includeActionWords}
6. Campaign type: ${request.campaignType}
7. Preferred style: ${request.preferredStyle || 'benefit_focused'}

STYLE GUIDELINES:
- Question-based: Start with engaging question, follow with benefit
- Benefit-focused: Lead with specific value proposition
- Action-oriented: Strong action verb + immediate benefit
- Problem-solution: Acknowledge problem + present solution
- Value-proposition: Highlight Apollo's unique advantages
- Urgency-driven: Create sense of urgency + clear action

CRITICAL: Respond with ONLY valid JSON in this exact format:
{
  "anchorText": "Get 270M+ verified contacts instantly",
  "style": "benefit_focused",
  "confidence": 92,
  "contextualFit": 88,
  "apolloValueProp": "270M+ verified B2B contacts",
  "alternatives": [
    "Start with 270M+ verified contacts today",
    "Access Apollo's contact database now",
    "Try Apollo's data enrichment free"
  ],
  "reasoningNotes": [
    "Flows naturally from data quality discussion",
    "Includes specific Apollo value proposition",
    "Action-oriented with immediate benefit"
  ]
}`;
  }

  /**
   * Parse anchor text response from AI
   * Why this matters: Safely extracts structured anchor text data from AI response
   */
  private parseAnchorTextResponse(response: string, request: AnchorTextRequest): AnchorTextResult {
    try {
      const cleanedResponse = response.trim();
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        anchorText: parsed.anchorText || 'Try Apollo free',
        style: parsed.style || 'benefit_focused',
        confidence: Math.max(0, Math.min(100, parsed.confidence || 75)),
        contextualFit: Math.max(0, Math.min(100, parsed.contextualFit || 70)),
        apolloValueProp: parsed.apolloValueProp || 'Sales intelligence platform',
        characterCount: (parsed.anchorText || 'Try Apollo free').length,
        wordCount: (parsed.anchorText || 'Try Apollo free').split(' ').length,
        alternatives: parsed.alternatives || [],
        reasoningNotes: parsed.reasoningNotes || []
      };
    } catch (error) {
      console.error('Failed to parse anchor text response:', error);
      return this.generateAnchorTextFallback(request, this.defaultConfig, {
        contextType: 'general',
        tone: 'conversational',
        painPointIntensity: 'medium',
        solutionReadiness: 'medium'
      });
    }
  }

  /**
   * Generate anchor text using fallback method (no AI)
   * Why this matters: Provides reliable anchor text generation when AI is not available
   */
  private generateAnchorTextFallback(
    request: AnchorTextRequest,
    config: AnchorTextConfig,
    contextAnalysis: any
  ): AnchorTextResult {
    const solution = request.match.matchedSolution;
    const style = request.preferredStyle || 'benefit_focused';
    
    // Apollo value propositions based on solution category
    const valueProps = this.getApolloValueProps(solution.category);
    const selectedValueProp = valueProps[0];

    // Generate anchor text based on style and solution
    let anchorText = '';
    const alternatives: string[] = [];

    switch (style) {
      case 'question_based':
        anchorText = `${this.getPainPointQuestion(request.match)}? ${this.getActionPhrase(solution)}`;
        alternatives.push(
          `Ready to ${this.getSolutionAction(solution)}?`,
          `${this.getPainPointQuestion(request.match)}? Try Apollo free`,
          `Want to ${this.getSolutionAction(solution)}? Start now`
        );
        break;

      case 'benefit_focused':
        anchorText = `${this.getBenefitPhrase(solution)} ${this.getCategorySpecificBenefit(solution)}`;
        alternatives.push(
          `Access ${selectedValueProp} instantly`,
          `Get ${this.getCategorySpecificBenefit(solution)} today`,
          `Start with ${selectedValueProp} free`
        );
        break;

      case 'action_oriented':
        anchorText = `${this.getActionVerb()} ${this.getSolutionBenefit(solution)} now`;
        alternatives.push(
          `Start ${this.getSolutionAction(solution)} today`,
          `Try Apollo's ${solution.category.replace(/_/g, ' ')} free`,
          `Get started with Apollo instantly`
        );
        break;

      case 'problem_solution':
        anchorText = `Fix your ${this.getProblemArea(request.match)} with Apollo`;
        alternatives.push(
          `Solve ${this.getProblemArea(request.match)} issues now`,
          `End ${this.getProblemArea(request.match)} problems today`,
          `Transform your ${this.getProblemArea(request.match)} process`
        );
        break;

      case 'value_proposition':
        anchorText = `Join 1M+ sales professionals using Apollo`;
        alternatives.push(
          `See why 1M+ sales teams choose Apollo`,
          `Join the Apollo community of sales professionals`,
          `Discover what 1M+ users already know`
        );
        break;

      case 'urgency_driven':
        anchorText = `Don't let ${this.getProblemArea(request.match)} cost you deals`;
        alternatives.push(
          `Stop losing deals to ${this.getProblemArea(request.match)}`,
          `Fix ${this.getProblemArea(request.match)} before it's too late`,
          `Act now to solve ${this.getProblemArea(request.match)}`
        );
        break;

      default:
        anchorText = `Try Apollo's ${solution.title.toLowerCase()} free`;
        alternatives.push(
          `Get started with Apollo today`,
          `Start your Apollo free trial`,
          `Discover Apollo's solutions`
        );
    }

    // Ensure anchor text fits length requirements
    const maxLength = request.maxLength || 80;
    if (anchorText.length > maxLength) {
      anchorText = anchorText.substring(0, maxLength - 3) + '...';
    }

    return {
      anchorText,
      style,
      confidence: 75, // Default confidence for fallback
      contextualFit: 70,
      apolloValueProp: selectedValueProp,
      characterCount: anchorText.length,
      wordCount: anchorText.split(' ').length,
      alternatives: alternatives.slice(0, config.maxAlternatives),
      reasoningNotes: [
        `Generated using ${style} style`,
        `Matched to ${solution.category} solution`,
        `Contextual fit based on ${contextAnalysis.contextType} content`
      ]
    };
  }

  /**
   * Get Apollo value propositions by solution category
   * Why this matters: Provides category-specific value props for more relevant anchor text
   */
  private getApolloValueProps(category: string): string[] {
    const valueProps: Record<string, string[]> = {
      data_quality_enrichment: [
        '270M+ verified contacts',
        'Real-time data enrichment',
        '95% email deliverability',
        'Automated data cleansing'
      ],
      sales_prospecting: [
        '270M+ B2B contacts',
        '73M+ companies',
        'Advanced search filters',
        'Prospect intelligence'
      ],
      sales_engagement: [
        'Multichannel sequences',
        'AI-powered personalization',
        '3x higher response rates',
        'Automated follow-ups'
      ],
      pipeline_management: [
        'Deal tracking automation',
        'Pipeline visibility',
        'Forecasting accuracy',
        'Sales analytics'
      ],
      call_assistant: [
        'AI meeting insights',
        'Automated scheduling',
        'Call recording & analysis',
        'Meeting preparation'
      ],
      revenue_operations: [
        'Revenue optimization',
        'Workflow automation',
        'Performance analytics',
        'Process efficiency'
      ]
    };

    return valueProps[category] || ['Sales intelligence platform', 'B2B sales automation', 'Contact database access'];
  }

  /**
   * Helper methods for generating anchor text components
   * Why this matters: Provides reusable components for consistent anchor text generation
   */
  private getPainPointQuestion(match: ContentSolutionMatch): string {
    const painPoints = match.chunk.painPoints;
    if (painPoints.includes('data')) return 'Tired of dirty data';
    if (painPoints.includes('email')) return 'Struggling with email deliverability';
    if (painPoints.includes('prospect')) return 'Need more qualified prospects';
    if (painPoints.includes('outreach')) return 'Want better outreach results';
    return 'Ready to solve this challenge';
  }

  private getActionPhrase(solution: any): string {
    const category = solution.category;
    if (category.includes('data')) return 'Start with clean data';
    if (category.includes('prospect')) return 'Find better prospects';
    if (category.includes('engagement')) return 'Automate your outreach';
    return 'Try Apollo free';
  }

  private getBenefitPhrase(solution: any): string {
    const category = solution.category;
    if (category.includes('data')) return 'Access';
    if (category.includes('prospect')) return 'Discover';
    if (category.includes('engagement')) return 'Automate with';
    return 'Get';
  }

  private getActionVerb(): string {
    const verbs = ['Start', 'Begin', 'Launch', 'Initiate', 'Try', 'Access', 'Discover'];
    return verbs[Math.floor(Math.random() * verbs.length)];
  }

  private getSolutionAction(solution: any): string {
    const category = solution.category;
    if (category.includes('data')) return 'clean your data';
    if (category.includes('prospect')) return 'find better prospects';
    if (category.includes('engagement')) return 'automate outreach';
    return 'improve your sales process';
  }

  private getSolutionBenefit(solution: any): string {
    const category = solution.category;
    if (category.includes('data')) return 'data quality';
    if (category.includes('prospect')) return 'prospecting results';
    if (category.includes('engagement')) return 'engagement rates';
    return 'sales performance';
  }

  private getProblemArea(match: ContentSolutionMatch): string {
    const painPoints = match.chunk.painPoints.join(' ').toLowerCase();
    if (painPoints.includes('data')) return 'data quality issues';
    if (painPoints.includes('email')) return 'email problems';
    if (painPoints.includes('prospect')) return 'prospecting challenges';
    if (painPoints.includes('outreach')) return 'outreach inefficiencies';
    return 'sales challenges';
  }

  private getCategorySpecificBenefit(solution: any): string {
    const category = solution.category;
    if (category.includes('data')) return 'clean, verified data';
    if (category.includes('prospect')) return 'qualified prospects instantly';
    if (category.includes('engagement')) return 'automated engagement sequences';
    if (category.includes('pipeline')) return 'pipeline visibility';
    if (category.includes('call')) return 'AI meeting insights';
    return 'sales intelligence platform';
  }

  /**
   * Refine and validate generated anchor text
   * Why this matters: Ensures anchor text meets quality standards and Apollo brand guidelines
   */
  private refineAnchorText(
    result: AnchorTextResult,
    request: AnchorTextRequest,
    config: AnchorTextConfig
  ): AnchorTextResult {
    let refinedAnchorText = result.anchorText;

    // Ensure proper capitalization
    refinedAnchorText = this.ensureProperCapitalization(refinedAnchorText);

    // Validate length constraints
    const maxLength = request.maxLength || 80;
    if (refinedAnchorText.length > maxLength) {
      refinedAnchorText = this.truncateAnchorText(refinedAnchorText, maxLength);
    }

    // Apply brand voice adjustments
    refinedAnchorText = this.applyBrandVoice(refinedAnchorText, config.apolloBrandVoice);

    // Calculate refined confidence based on quality factors
    const refinedConfidence = this.calculateRefinedConfidence(refinedAnchorText, request, result);

    return {
      ...result,
      anchorText: refinedAnchorText,
      confidence: refinedConfidence,
      characterCount: refinedAnchorText.length,
      wordCount: refinedAnchorText.split(' ').length
    };
  }

  /**
   * Ensure proper capitalization for anchor text
   * Why this matters: Maintains professional appearance and readability
   */
  private ensureProperCapitalization(text: string): string {
    // Capitalize first letter and proper nouns (Apollo)
    return text.replace(/\bapollo\b/gi, 'Apollo')
               .replace(/^./, text[0].toUpperCase());
  }

  /**
   * Truncate anchor text while maintaining meaning
   * Why this matters: Ensures anchor text fits within length constraints without losing impact
   */
  private truncateAnchorText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    
    // Try to truncate at word boundary
    const truncated = text.substring(0, maxLength - 3);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > maxLength * 0.7) {
      return truncated.substring(0, lastSpace) + '...';
    }
    
    return truncated + '...';
  }

  /**
   * Apply Apollo brand voice to anchor text
   * Why this matters: Ensures consistency with Apollo's brand personality and messaging
   */
  private applyBrandVoice(text: string, brandVoice: string): string {
    switch (brandVoice) {
      case 'professional':
        return text.replace(/\b(get|try)\b/gi, 'access')
                  .replace(/\bnow\b/gi, 'today');
      
      case 'conversational':
        return text; // Already conversational
      
      case 'direct':
        return text.replace(/\?.*$/, '') // Remove questions
                  .replace(/\bwant to\b/gi, '')
                  .replace(/\bready to\b/gi, '');
      
      case 'consultative':
        return text.replace(/\btry\b/gi, 'explore')
                  .replace(/\bget\b/gi, 'discover');
      
      default:
        return text;
    }
  }

  /**
   * Calculate refined confidence score
   * Why this matters: Provides accurate quality assessment for anchor text selection
   */
  private calculateRefinedConfidence(
    anchorText: string,
    request: AnchorTextRequest,
    originalResult: AnchorTextResult
  ): number {
    let confidence = originalResult.confidence;

    // Length penalty/bonus
    const idealLength = 40; // Sweet spot for anchor text
    const lengthDiff = Math.abs(anchorText.length - idealLength);
    if (lengthDiff < 10) confidence += 5;
    else if (lengthDiff > 30) confidence -= 10;

    // Apollo mention bonus
    if (anchorText.toLowerCase().includes('apollo')) confidence += 5;

    // Action word bonus
    const actionWords = ['start', 'get', 'try', 'access', 'discover', 'begin'];
    if (actionWords.some(word => anchorText.toLowerCase().includes(word))) confidence += 3;

    // Number inclusion bonus (if configured)
    if (/\d/.test(anchorText)) confidence += 5;

    return Math.max(0, Math.min(100, confidence));
  }

  /**
   * Generate multiple anchor text variations
   * Why this matters: Provides options for A/B testing and different content contexts
   */
  async generateAnchorTextVariations(
    request: AnchorTextRequest,
    styles: AnchorTextStyle[],
    config?: Partial<AnchorTextConfig>
  ): Promise<AnchorTextResult[]> {
    const variations: AnchorTextResult[] = [];

    for (const style of styles) {
      const styleRequest = { ...request, preferredStyle: style };
      const result = await this.generateAnchorText(styleRequest, config);
      variations.push(result);
    }

    // Sort by confidence score
    return variations.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get best anchor text for context
   * Why this matters: Automatically selects the most appropriate anchor text for the content context
   */
  getBestAnchorTextForContext(variations: AnchorTextResult[], contextType: string): AnchorTextResult {
    // Prefer certain styles based on context
    const contextPreferences: Record<string, AnchorTextStyle[]> = {
      problem_statement: ['question_based', 'problem_solution', 'urgency_driven'],
      solution_discussion: ['benefit_focused', 'action_oriented', 'value_proposition'],
      benefit_explanation: ['benefit_focused', 'value_proposition', 'action_oriented'],
      general: ['benefit_focused', 'action_oriented', 'question_based']
    };

    const preferredStyles = contextPreferences[contextType] || contextPreferences.general;
    
    // Find the highest confidence variation with a preferred style
    for (const style of preferredStyles) {
      const match = variations.find(v => v.style === style);
      if (match && match.confidence >= 70) {
        return match;
      }
    }

    // Fallback to highest confidence variation
    return variations[0] || variations.find(v => v.confidence > 0)!;
  }
}

export default ContextualAnchorTextGenerator;
