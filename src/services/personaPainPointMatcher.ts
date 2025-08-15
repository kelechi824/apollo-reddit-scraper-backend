import VoCThematicAnalyzer from './vocThematicAnalyzer';
import { ArticleContentAnalysisResult } from './contentAnalysisService';

/**
 * VoC Pain Point Interface (local copy for matching)
 * Why this matters: Defines the structure of pain points from VoC analysis.
 */
interface VoCPainPoint {
  id: string;
  theme: string;
  liquidVariable: string;
  description: string;
  frequency: number;
  severity: 'high' | 'medium' | 'low';
  customerQuotes: string[];
  emotionalTriggers: string[];
  extractionTimestamp?: string;
  analysisMetadata?: {
    modelUsed: string;
    callsAnalyzed: number;
    processingTime: number;
  };
  sourceExcerpts?: Array<{
    quote: string;
    callTitle: string;
    callDate: string;
    excerpt: string;
    callId: string;
  }>;
}

/**
 * Persona-Pain Point Matching Result Interface
 * Why this matters: Standardizes the output of persona-to-pain point matching for CTA generation.
 */
export interface PersonaPainPointMatch {
  persona: string;
  matched_pain_points: Array<{
    pain_point: VoCPainPoint;
    relevance_score: number;
    matching_reason: string;
    liquid_variable: string;
    customer_quotes: string[];
  }>;
  content_context: {
    article_themes: string[];
    industry_context: string;
    content_intent: string;
  };
  matching_confidence: number;
  matching_timestamp: string;
}

/**
 * Persona Pain Point Matcher Service
 * Why this matters: Creates the intelligent bridge between detected personas and relevant customer pain points.
 * This ensures CTAs use the right customer language for the right audience, maximizing relevance and conversion.
 */
class PersonaPainPointMatcher {
  private vocAnalyzer: VoCThematicAnalyzer;

  constructor() {
    this.vocAnalyzer = new VoCThematicAnalyzer();
    console.log('✅ Persona Pain Point Matcher initialized');
  }

  /**
   * Match persona to relevant pain points from VoC Kit
   * Why this matters: This is the core function that connects article analysis to customer pain points,
   * enabling hyper-relevant CTA generation using actual customer language.
   */
  async matchPersonaToPainPoints(
    contentAnalysis: ArticleContentAnalysisResult,
    vocPainPoints?: VoCPainPoint[]
  ): Promise<PersonaPainPointMatch> {
    try {
      console.log(`🎯 Matching persona "${contentAnalysis.persona}" to pain points`);
      console.log(`📄 Content analysis:`, {
        persona: contentAnalysis.persona,
        industry: contentAnalysis.industry_context,
        themes: contentAnalysis.content_themes,
        topics: contentAnalysis.key_topics,
        intent: contentAnalysis.content_intent
      });

      // Get VoC pain points if not provided
      if (!vocPainPoints) {
        console.log('📊 Fetching latest VoC pain points...');
        const vocResult = await this.vocAnalyzer.analyzeThemes(30, 25);
        vocPainPoints = vocResult.painPoints;
      }

      if (vocPainPoints.length === 0) {
        throw new Error('No VoC pain points available for matching');
      }

      console.log(`🔍 Analyzing ${vocPainPoints.length} pain points for persona matching`);

      // Execute persona-based matching algorithm with variety enhancement
      const matchedPainPoints = await this.executePersonaMatchingWithVariety(
        contentAnalysis,
        vocPainPoints
      );

      // Calculate overall matching confidence
      const matchingConfidence = this.calculateOverallConfidence(matchedPainPoints);

      const result: PersonaPainPointMatch = {
        persona: contentAnalysis.persona,
        matched_pain_points: matchedPainPoints,
        content_context: {
          article_themes: contentAnalysis.content_themes,
          industry_context: contentAnalysis.industry_context,
          content_intent: contentAnalysis.content_intent
        },
        matching_confidence: matchingConfidence,
        matching_timestamp: new Date().toISOString()
      };

      console.log(`✅ Matched ${matchedPainPoints.length} pain points with ${matchingConfidence}% confidence`);
      return result;

    } catch (error: any) {
      console.error('❌ Persona-pain point matching failed:', error);
      throw new Error(`Persona matching failed: ${error.message}`);
    }
  }

  /**
   * Match persona to pain points for specific CTA position
   * Why this matters: Different CTA positions need different pain point types to match reader mindset.
   * Beginning = awareness, Middle = consideration, End = decision-focused pain points.
   */
  async matchPersonaToPainPointsForPosition(
    contentAnalysis: ArticleContentAnalysisResult,
    position: 'beginning' | 'middle' | 'end',
    vocPainPoints?: VoCPainPoint[],
    excludePainPointIds: string[] = []
  ): Promise<PersonaPainPointMatch> {
    try {
      console.log(`🎯 Matching persona "${contentAnalysis.persona}" to pain points for ${position} CTA`);

      // Get VoC pain points if not provided
      if (!vocPainPoints) {
        console.log('📊 Fetching latest VoC pain points...');
        const vocResult = await this.vocAnalyzer.analyzeThemes(30, 25);
        vocPainPoints = vocResult.painPoints;
      }

      if (vocPainPoints.length === 0) {
        throw new Error('No VoC pain points available for matching');
      }

      // Filter out already used pain points
      const availablePainPoints = vocPainPoints.filter(pp => !excludePainPointIds.includes(pp.id));
      console.log(`🔍 Analyzing ${availablePainPoints.length} available pain points for ${position} position`);

      // Execute position-specific matching algorithm
      const matchedPainPoints = await this.executePositionSpecificMatching(
        contentAnalysis,
        availablePainPoints,
        position
      );

      // Calculate overall matching confidence
      const matchingConfidence = this.calculateOverallConfidence(matchedPainPoints);

      const result: PersonaPainPointMatch = {
        persona: contentAnalysis.persona,
        matched_pain_points: matchedPainPoints,
        content_context: {
          article_themes: contentAnalysis.content_themes,
          industry_context: contentAnalysis.industry_context,
          content_intent: contentAnalysis.content_intent
        },
        matching_confidence: matchingConfidence,
        matching_timestamp: new Date().toISOString()
      };

      console.log(`✅ Matched ${matchedPainPoints.length} ${position} pain points with ${matchingConfidence}% confidence`);
      return result;

    } catch (error: any) {
      console.error(`❌ ${position} position persona-pain point matching failed:`, error);
      throw new Error(`${position} position matching failed: ${error.message}`);
    }
  }

  /**
   * Execute persona matching with enhanced variety
   * Why this matters: Ensures diverse pain point selection to avoid repetition across multiple CTA generations.
   */
  private async executePersonaMatchingWithVariety(
    contentAnalysis: ArticleContentAnalysisResult,
    vocPainPoints: VoCPainPoint[]
  ): Promise<Array<{
    pain_point: VoCPainPoint;
    relevance_score: number;
    matching_reason: string;
    liquid_variable: string;
    customer_quotes: string[];
  }>> {
    
    // Get all possible matches first
    const allMatches = await this.executePersonaMatching(contentAnalysis, vocPainPoints);
    
    // Apply variety enhancement - group by pain point categories and select diverse ones
    const diverseMatches = this.selectDiversePainPoints(allMatches);
    
    console.log(`🎨 Enhanced variety: Selected ${diverseMatches.length} diverse pain points from ${allMatches.length} matches`);
    return diverseMatches;
  }

  /**
   * Execute position-specific matching algorithm  
   * Why this matters: Different CTA positions require different psychological approaches and pain point types.
   */
  private async executePositionSpecificMatching(
    contentAnalysis: ArticleContentAnalysisResult,
    vocPainPoints: VoCPainPoint[],
    position: 'beginning' | 'middle' | 'end'
  ): Promise<Array<{
    pain_point: VoCPainPoint;
    relevance_score: number;
    matching_reason: string;
    liquid_variable: string;
    customer_quotes: string[];
  }>> {
    
    const matches: Array<{
      pain_point: VoCPainPoint;
      relevance_score: number;
      matching_reason: string;
      liquid_variable: string;
      customer_quotes: string[];
    }> = [];

    // Get position-specific priority adjustments
    const positionPriorities = this.getPositionSpecificPriorities(position);
    
    // Get persona-based priority mappings
    const personaPriorities = this.getPersonaPriorities(contentAnalysis.persona);
    
    // Get content theme priorities
    const themePriorities = this.getContentThemePriorities(contentAnalysis.content_themes);

    for (const painPoint of vocPainPoints) {
      // Calculate multiple relevance factors
      const personaScore = this.calculatePersonaRelevance(
        contentAnalysis.persona,
        contentAnalysis.persona_details,
        painPoint,
        personaPriorities
      );

      const themeScore = this.calculateThemeRelevance(
        contentAnalysis.content_themes,
        contentAnalysis.key_topics,
        painPoint,
        themePriorities
      );

      const contextScore = this.calculateContextualRelevance(
        contentAnalysis.industry_context,
        contentAnalysis.content_intent,
        contentAnalysis.pain_point_indicators,
        painPoint
      );

      // Position-specific boost based on pain point type
      const positionScore = this.calculatePositionRelevance(painPoint, position, positionPriorities);

      // Weighted composite score with position emphasis
      const compositeScore = (
        personaScore * 0.3 +      // 30% weight on persona match
        themeScore * 0.25 +       // 25% weight on content themes  
        contextScore * 0.2 +      // 20% weight on context
        positionScore * 0.25      // 25% weight on position-specific relevance
      );

      console.log(`🔍 ${position} pain point "${painPoint.theme}" scores:`, {
        personaScore: personaScore.toFixed(3),
        themeScore: themeScore.toFixed(3),
        contextScore: contextScore.toFixed(3),
        positionScore: positionScore.toFixed(3),
        compositeScore: compositeScore.toFixed(3),
        threshold: 0.05,
        willMatch: compositeScore > 0.05
      });

      // Include pain points with meaningful relevance
      if (compositeScore > 0.05) {
        const matchingReason = this.generatePositionMatchingReason(
          personaScore,
          themeScore,
          contextScore,
          positionScore,
          contentAnalysis,
          painPoint,
          position
        );

        matches.push({
          pain_point: painPoint,
          relevance_score: compositeScore,
          matching_reason: matchingReason,
          liquid_variable: `{{ pain_points.${painPoint.liquidVariable} }}`,
          customer_quotes: painPoint.customerQuotes.slice(0, 3) // Top 3 quotes
        });
      }
    }

    // Sort by relevance score and return top matches for this position
    matches.sort((a, b) => b.relevance_score - a.relevance_score);
    
    // Return top 3 matches for focused CTA generation per position
    return matches.slice(0, 3);
  }

  /**
   * Execute sophisticated persona-based matching algorithm
   * Why this matters: Uses both rule-based logic and contextual analysis to find the most relevant pain points
   * for each persona, ensuring CTAs speak directly to their specific concerns.
   */
  private async executePersonaMatching(
    contentAnalysis: ArticleContentAnalysisResult,
    vocPainPoints: VoCPainPoint[]
  ): Promise<Array<{
    pain_point: VoCPainPoint;
    relevance_score: number;
    matching_reason: string;
    liquid_variable: string;
    customer_quotes: string[];
  }>> {
    
    const matches: Array<{
      pain_point: VoCPainPoint;
      relevance_score: number;
      matching_reason: string;
      liquid_variable: string;
      customer_quotes: string[];
    }> = [];

    // Get persona-based priority mappings
    const personaPriorities = this.getPersonaPriorities(contentAnalysis.persona);
    
    // Get content theme priorities
    const themePriorities = this.getContentThemePriorities(contentAnalysis.content_themes);

    for (const painPoint of vocPainPoints) {
      // Calculate multiple relevance factors
      const personaScore = this.calculatePersonaRelevance(
        contentAnalysis.persona,
        contentAnalysis.persona_details,
        painPoint,
        personaPriorities
      );

      const themeScore = this.calculateThemeRelevance(
        contentAnalysis.content_themes,
        contentAnalysis.key_topics,
        painPoint,
        themePriorities
      );

      const contextScore = this.calculateContextualRelevance(
        contentAnalysis.industry_context,
        contentAnalysis.content_intent,
        contentAnalysis.pain_point_indicators,
        painPoint
      );

      // Weighted composite score
      const compositeScore = (
        personaScore * 0.4 +      // 40% weight on persona match
        themeScore * 0.35 +       // 35% weight on content themes
        contextScore * 0.25       // 25% weight on context
      );

      console.log(`🔍 Pain point "${painPoint.theme}" scores:`, {
        personaScore: personaScore.toFixed(3),
        themeScore: themeScore.toFixed(3),
        contextScore: contextScore.toFixed(3),
        compositeScore: compositeScore.toFixed(3),
        threshold: 0.05,
        willMatch: compositeScore > 0.05
      });

      // Include pain points with any meaningful relevance (> 0.05) - very permissive for broader matching
      if (compositeScore > 0.05) {
        const matchingReason = this.generateMatchingReason(
          personaScore,
          themeScore,
          contextScore,
          contentAnalysis,
          painPoint
        );

        matches.push({
          pain_point: painPoint,
          relevance_score: compositeScore,
          matching_reason: matchingReason,
          liquid_variable: `{{ pain_points.${painPoint.liquidVariable} }}`,
          customer_quotes: painPoint.customerQuotes.slice(0, 3) // Top 3 quotes
        });
      }
    }

    // Sort by relevance score and return top matches
    matches.sort((a, b) => b.relevance_score - a.relevance_score);
    
    // Return top 5 matches for focused CTA generation
    return matches.slice(0, 5);
  }

  /**
   * Get persona-specific priority mappings
   * Why this matters: Different personas care about different aspects. CEOs focus on ROI, Sales Reps on quotas.
   */
  private getPersonaPriorities(persona: string): Record<string, number> {
    const normalizedPersona = persona.toLowerCase();

    // C-Suite priorities
    if (normalizedPersona.includes('ceo') || normalizedPersona.includes('chief executive')) {
      return {
        budget_roi: 0.9,
        revenue_growth: 0.9,
        competitive_advantage: 0.8,
        scalability_concerns: 0.8,
        integration_challenges: 0.6,
        compliance_security: 0.7,
        manual_processes: 0.5
      };
    }

    if (normalizedPersona.includes('cro') || normalizedPersona.includes('chief revenue')) {
      return {
        revenue_growth: 0.95,
        pipeline_visibility: 0.9,
        quota_achievement: 0.9,
        lead_quality_issues: 0.85,
        forecasting_accuracy: 0.8,
        sales_efficiency: 0.8,
        budget_roi: 0.75
      };
    }

    if (normalizedPersona.includes('cfo') || normalizedPersona.includes('chief financial')) {
      return {
        budget_roi: 0.95,
        cost_optimization: 0.9,
        financial_reporting: 0.8,
        compliance_security: 0.85,
        scalability_concerns: 0.7,
        integration_challenges: 0.6
      };
    }

    if (normalizedPersona.includes('cpo') || normalizedPersona.includes('chief product')) {
      return {
        product_development: 0.9,
        user_feedback: 0.85,
        feature_prioritization: 0.8,
        integration_challenges: 0.75,
        scalability_concerns: 0.8,
        competitive_advantage: 0.7
      };
    }

    if (normalizedPersona.includes('cmo') || normalizedPersona.includes('chief marketing')) {
      return {
        lead_generation: 0.9,
        campaign_performance: 0.85,
        attribution_tracking: 0.8,
        budget_roi: 0.8,
        lead_quality_issues: 0.75,
        integration_challenges: 0.7
      };
    }

    // VP-Level priorities
    if (normalizedPersona.includes('vp sales') || normalizedPersona.includes('vice president sales')) {
      return {
        quota_achievement: 0.9,
        pipeline_visibility: 0.85,
        sales_efficiency: 0.8,
        lead_quality_issues: 0.8,
        forecasting_accuracy: 0.75,
        team_productivity: 0.7
      };
    }

    if (normalizedPersona.includes('vp marketing') || normalizedPersona.includes('vice president marketing')) {
      return {
        lead_generation: 0.9,
        campaign_performance: 0.85,
        attribution_tracking: 0.8,
        lead_quality_issues: 0.75,
        budget_roi: 0.7,
        integration_challenges: 0.65
      };
    }

    // Manager-Level priorities
    if (normalizedPersona.includes('sales manager')) {
      return {
        quota_achievement: 0.85,
        team_productivity: 0.8,
        pipeline_management: 0.8,
        lead_quality_issues: 0.75,
        sales_efficiency: 0.7,
        manual_processes: 0.7
      };
    }

    if (normalizedPersona.includes('marketing manager')) {
      return {
        campaign_performance: 0.8,
        lead_generation: 0.75,
        attribution_tracking: 0.7,
        budget_constraints: 0.7,
        manual_processes: 0.65,
        integration_challenges: 0.6
      };
    }

    // Individual Contributor priorities
    if (normalizedPersona.includes('sdr') || normalizedPersona.includes('sales development')) {
      return {
        lead_quality_issues: 0.85,
        prospecting_efficiency: 0.8,
        quota_pressure: 0.8,
        manual_processes: 0.75,
        data_accuracy: 0.7,
        tool_usability: 0.65
      };
    }

    if (normalizedPersona.includes('ae') || normalizedPersona.includes('account executive')) {
      return {
        deal_closing: 0.85,
        pipeline_management: 0.8,
        quota_achievement: 0.8,
        customer_relationships: 0.75,
        sales_efficiency: 0.7,
        manual_processes: 0.65
      };
    }

    // Default priorities for unspecified personas
    return {
      budget_roi: 0.6,
      efficiency_gains: 0.6,
        integration_challenges: 0.5,
        manual_processes: 0.5,
        data_accuracy: 0.5
      };
  }

  /**
   * Get content theme-specific priorities
   * Why this matters: Article themes indicate which pain points are most relevant to the content context.
   */
  private getContentThemePriorities(themes: string[]): Record<string, number> {
    const priorities: Record<string, number> = {};

    themes.forEach(theme => {
      const normalizedTheme = theme.toLowerCase();

      if (normalizedTheme.includes('sales') || normalizedTheme.includes('revenue')) {
        priorities.sales_efficiency = 0.9;
        priorities.quota_achievement = 0.85;
        priorities.pipeline_visibility = 0.8;
        priorities.lead_quality_issues = 0.75;
      }

      if (normalizedTheme.includes('marketing') || normalizedTheme.includes('lead generation')) {
        priorities.lead_generation = 0.9;
        priorities.campaign_performance = 0.8;
        priorities.attribution_tracking = 0.75;
        priorities.lead_quality_issues = 0.7;
      }

      if (normalizedTheme.includes('roi') || normalizedTheme.includes('budget')) {
        priorities.budget_roi = 0.95;
        priorities.cost_optimization = 0.8;
        priorities.financial_reporting = 0.7;
      }

      if (normalizedTheme.includes('integration') || normalizedTheme.includes('platform')) {
        priorities.integration_challenges = 0.9;
        priorities.technical_complexity = 0.8;
        priorities.scalability_concerns = 0.7;
      }

      if (normalizedTheme.includes('automation') || normalizedTheme.includes('efficiency')) {
        priorities.manual_processes = 0.9;
        priorities.efficiency_gains = 0.85;
        priorities.time_savings = 0.8;
      }
    });

    return priorities;
  }

  /**
   * Calculate persona-specific relevance score
   * Why this matters: Determines how well a pain point aligns with the detected persona's typical concerns.
   */
  private calculatePersonaRelevance(
    persona: string,
    personaDetails: any,
    painPoint: VoCPainPoint,
    priorities: Record<string, number>
  ): number {
    let score = 0;

    // Check if pain point theme matches persona priorities
    const themeKey = painPoint.liquidVariable.toLowerCase();
    if (priorities[themeKey]) {
      score += priorities[themeKey];
    }

    // Seniority level adjustments
    if (personaDetails.seniority_level === 'C-Suite') {
      if (painPoint.theme.toLowerCase().includes('strategic') || 
          painPoint.theme.toLowerCase().includes('roi') ||
          painPoint.theme.toLowerCase().includes('revenue')) {
        score += 0.2;
      }
    }

    if (personaDetails.seniority_level === 'Manager-Level' || 
        personaDetails.seniority_level === 'Individual Contributor') {
      if (painPoint.theme.toLowerCase().includes('efficiency') || 
          painPoint.theme.toLowerCase().includes('manual') ||
          painPoint.theme.toLowerCase().includes('daily')) {
        score += 0.2;
      }
    }

    // Department-specific adjustments
    if (personaDetails.department === 'Sales') {
      if (painPoint.theme.toLowerCase().includes('quota') || 
          painPoint.theme.toLowerCase().includes('pipeline') ||
          painPoint.theme.toLowerCase().includes('prospecting')) {
        score += 0.15;
      }
    }

    if (personaDetails.department === 'Marketing') {
      if (painPoint.theme.toLowerCase().includes('lead') || 
          painPoint.theme.toLowerCase().includes('campaign') ||
          painPoint.theme.toLowerCase().includes('attribution')) {
        score += 0.15;
      }
    }

    // Generous fallback: any sales-related persona gets minimum score for all sales pain points
    if (persona.toLowerCase().includes('sales') || 
        persona.toLowerCase().includes('sdr') ||
        persona.toLowerCase().includes('bdr') ||
        persona.toLowerCase().includes('ae') ||
        persona.toLowerCase().includes('rep') ||
        persona.toLowerCase().includes('vp') ||
        persona.toLowerCase().includes('director')) {
      score = Math.max(score, 0.3); // Minimum baseline for sales personas
    }

    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Calculate theme-based relevance score
   * Why this matters: Ensures pain points align with the article's content themes and topics.
   */
  private calculateThemeRelevance(
    contentThemes: string[],
    keyTopics: string[],
    painPoint: VoCPainPoint,
    themePriorities: Record<string, number>
  ): number {
    let score = 0;

    // Check theme alignment
    const painPointTheme = painPoint.theme.toLowerCase();
    const painPointDescription = painPoint.description.toLowerCase();

    contentThemes.forEach(theme => {
      const normalizedTheme = theme.toLowerCase();
      if (painPointTheme.includes(normalizedTheme) || 
          painPointDescription.includes(normalizedTheme)) {
        score += 0.3;
      }
    });

    keyTopics.forEach(topic => {
      const normalizedTopic = topic.toLowerCase();
      if (painPointTheme.includes(normalizedTopic) || 
          painPointDescription.includes(normalizedTopic)) {
        score += 0.2;
      }
    });

    // Generous keyword matching - look for sales-related keywords in any content
    const allContent = (contentThemes.join(' ') + ' ' + keyTopics.join(' ')).toLowerCase();
    const salesKeywords = [
      'sales', 'prospect', 'lead', 'outreach', 'pipeline', 'quota', 'revenue',
      'automation', 'ai', 'personalization', 'efficiency', 'productivity',
      'data', 'contact', 'crm', 'sequence', 'campaign', 'conversion',
      'research', 'qualification', 'forecasting', 'scaling', 'team',
      'manual', 'process', 'workflow', 'integration', 'visibility'
    ];

    // Give base score for sales-related content
    const matchedKeywords = salesKeywords.filter(keyword => allContent.includes(keyword));
    if (matchedKeywords.length > 0) {
      score += 0.3; // Base sales content bonus
    }

    // Apply theme priorities
    const themeKey = painPoint.liquidVariable.toLowerCase();
    if (themePriorities[themeKey]) {
      score += themePriorities[themeKey] * 0.3;
    }

    // Minimum score for any sales-related content to ensure matches
    if (allContent.includes('sales') || allContent.includes('prospect') || 
        allContent.includes('lead') || allContent.includes('outreach')) {
      score = Math.max(score, 0.2);
    }

    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Calculate contextual relevance score
   * Why this matters: Considers industry context and content intent to fine-tune pain point relevance.
   */
  private calculateContextualRelevance(
    industryContext: string,
    contentIntent: string,
    painPointIndicators: string[],
    painPoint: VoCPainPoint
  ): number {
    let score = 0;

    // Industry context matching
    if (industryContext && industryContext !== 'General Business') {
      const industryLower = industryContext.toLowerCase();
      const painPointText = (painPoint.theme + ' ' + painPoint.description).toLowerCase();
      
      if (painPointText.includes(industryLower)) {
        score += 0.3;
      }
    }

    // Content intent alignment
    if (contentIntent === 'decision' && painPoint.severity === 'high') {
      score += 0.2;
    }
    if (contentIntent === 'awareness' && painPoint.frequency > 5) {
      score += 0.15;
    }

    // Pain point indicator matching
    painPointIndicators.forEach(indicator => {
      const indicatorLower = indicator.toLowerCase();
      const painPointText = (painPoint.theme + ' ' + painPoint.description).toLowerCase();
      
      if (painPointText.includes(indicatorLower)) {
        score += 0.2;
      }
    });

    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Generate human-readable matching reason
   * Why this matters: Provides transparency into why specific pain points were matched for debugging and optimization.
   */
  private generateMatchingReason(
    personaScore: number,
    themeScore: number,
    contextScore: number,
    contentAnalysis: ArticleContentAnalysisResult,
    painPoint: VoCPainPoint
  ): string {
    const reasons: string[] = [];

    if (personaScore > 0.7) {
      reasons.push(`High persona alignment for ${contentAnalysis.persona}`);
    } else if (personaScore > 0.4) {
      reasons.push(`Moderate persona relevance for ${contentAnalysis.persona}`);
    }

    if (themeScore > 0.6) {
      reasons.push(`Strong content theme match with ${contentAnalysis.content_themes.join(', ')}`);
    }

    if (contextScore > 0.5) {
      reasons.push(`Contextual relevance in ${contentAnalysis.industry_context}`);
    }

    if (painPoint.severity === 'high') {
      reasons.push(`High-severity customer pain point`);
    }

    if (painPoint.frequency > 3) {
      reasons.push(`Frequently mentioned issue (${painPoint.frequency} occurrences)`);
    }

    return reasons.length > 0 ? reasons.join('; ') : 'General pain point relevance';
  }

  /**
   * Calculate overall matching confidence
   * Why this matters: Provides a quality metric for the matching results to guide CTA generation decisions.
   */
  private calculateOverallConfidence(matches: Array<{ relevance_score: number }>): number {
    if (matches.length === 0) return 0;

    // Calculate average relevance score
    const avgScore = matches.reduce((sum, match) => sum + match.relevance_score, 0) / matches.length;
    
    // Adjust based on number of matches (more matches = higher confidence if scores are good)
    const matchCountFactor = Math.min(matches.length / 3, 1); // Normalize to 3 matches
    
    // Final confidence score
    const confidence = (avgScore * 0.7 + matchCountFactor * 0.3) * 100;
    
    return Math.round(confidence);
  }

  /**
   * Select diverse pain points to avoid repetition
   * Why this matters: Ensures CTA variety by selecting pain points from different categories.
   */
  private selectDiversePainPoints(matches: Array<{
    pain_point: VoCPainPoint;
    relevance_score: number;
    matching_reason: string;
    liquid_variable: string;
    customer_quotes: string[];
  }>): Array<{
    pain_point: VoCPainPoint;
    relevance_score: number;
    matching_reason: string;
    liquid_variable: string;
    customer_quotes: string[];
  }> {
    
    // Group pain points by category/theme type
    const categoryGroups = new Map<string, typeof matches>();
    
    matches.forEach(match => {
      const category = this.categorizePainPoint(match.pain_point);
      if (!categoryGroups.has(category)) {
        categoryGroups.set(category, []);
      }
      categoryGroups.get(category)!.push(match);
    });

    // Select top pain point from each category, then fill remaining slots
    const diverseMatches: typeof matches = [];
    const categoriesUsed = new Set<string>();
    
    // First pass: select best from each category
    for (const [category, categoryMatches] of categoryGroups) {
      const sortedCategoryMatches = categoryMatches.sort((a, b) => b.relevance_score - a.relevance_score);
      diverseMatches.push(sortedCategoryMatches[0]);
      categoriesUsed.add(category);
      
      if (diverseMatches.length >= 7) break; // Limit to avoid too many
    }
    
    // Second pass: fill remaining slots with next best, avoiding used categories initially
    const remainingMatches = matches
      .filter(match => !diverseMatches.some(dm => dm.pain_point.id === match.pain_point.id))
      .sort((a, b) => b.relevance_score - a.relevance_score);
    
    for (const match of remainingMatches) {
      const category = this.categorizePainPoint(match.pain_point);
      
      // Prefer unused categories first, then allow duplicates if needed
      if (!categoriesUsed.has(category) || diverseMatches.length < 5) {
        diverseMatches.push(match);
        categoriesUsed.add(category);
        
        if (diverseMatches.length >= 8) break; // Total limit
      }
    }

    console.log(`🎨 Selected ${diverseMatches.length} diverse pain points from ${categoryGroups.size} categories`);
    return diverseMatches.slice(0, 8); // Return top 8 diverse matches
  }

  /**
   * Categorize pain point for diversity selection
   * Why this matters: Groups pain points by type to ensure variety in selection.
   */
  private categorizePainPoint(painPoint: VoCPainPoint): string {
    const theme = painPoint.theme.toLowerCase();
    const liquidVar = painPoint.liquidVariable.toLowerCase();
    
    // Manual/Process Efficiency
    if (theme.includes('manual') || theme.includes('process') || theme.includes('efficiency') || 
        liquidVar.includes('manual') || liquidVar.includes('process')) {
      return 'manual_efficiency';
    }
    
    // Data Quality & Accuracy
    if (theme.includes('data') || theme.includes('accuracy') || theme.includes('quality') ||
        liquidVar.includes('data') || liquidVar.includes('accuracy')) {
      return 'data_quality';
    }
    
    // Pipeline & Forecasting
    if (theme.includes('pipeline') || theme.includes('forecast') || theme.includes('visibility') ||
        liquidVar.includes('pipeline') || liquidVar.includes('forecast')) {
      return 'pipeline_forecasting';
    }
    
    // Lead Generation & Prospecting
    if (theme.includes('lead') || theme.includes('prospect') || theme.includes('generation') ||
        liquidVar.includes('lead') || liquidVar.includes('prospect')) {
      return 'lead_prospecting';
    }
    
    // Sales Performance & Quota
    if (theme.includes('quota') || theme.includes('performance') || theme.includes('target') ||
        liquidVar.includes('quota') || liquidVar.includes('performance')) {
      return 'sales_performance';
    }
    
    // Communication & Outreach
    if (theme.includes('outreach') || theme.includes('communication') || theme.includes('email') ||
        liquidVar.includes('outreach') || liquidVar.includes('communication')) {
      return 'communication_outreach';
    }
    
    // ROI & Budget
    if (theme.includes('roi') || theme.includes('budget') || theme.includes('cost') ||
        liquidVar.includes('roi') || liquidVar.includes('budget')) {
      return 'roi_budget';
    }
    
    // Integration & Tools
    if (theme.includes('integration') || theme.includes('tool') || theme.includes('platform') ||
        liquidVar.includes('integration') || liquidVar.includes('tool')) {
      return 'integration_tools';
    }
    
    // Scaling & Team
    if (theme.includes('scaling') || theme.includes('team') || theme.includes('growth') ||
        liquidVar.includes('scaling') || liquidVar.includes('team')) {
      return 'scaling_team';
    }
    
    return 'general'; // Fallback category
  }

  /**
   * Get position-specific priority adjustments
   * Why this matters: Different CTA positions should emphasize different pain point categories.
   */
  private getPositionSpecificPriorities(position: 'beginning' | 'middle' | 'end'): Record<string, number> {
    switch (position) {
      case 'beginning':
        // Awareness stage: Focus on problem recognition and inefficiencies
        return {
          manual_efficiency: 0.9,      // "You're probably spending too much time on..."
          data_quality: 0.8,           // "Struggling with inaccurate data?"
          communication_outreach: 0.7, // "Tired of low response rates?"
          general: 0.6,
          lead_prospecting: 0.5,
          pipeline_forecasting: 0.4,
          sales_performance: 0.3,
          roi_budget: 0.2,
          integration_tools: 0.2,
          scaling_team: 0.2
        };
        
      case 'middle':
        // Consideration stage: Focus on solution evaluation and capabilities
        return {
          lead_prospecting: 0.9,       // "Modern teams use AI-powered prospecting..."
          pipeline_forecasting: 0.8,   // "Get real-time pipeline visibility"
          integration_tools: 0.7,      // "Seamlessly integrates with your CRM"
          data_quality: 0.6,
          communication_outreach: 0.6,
          manual_efficiency: 0.5,
          scaling_team: 0.4,
          sales_performance: 0.4,
          roi_budget: 0.3,
          general: 0.3
        };
        
      case 'end':
        // Decision stage: Focus on results, ROI, and immediate action
        return {
          sales_performance: 0.9,      // "Hit your quota faster"
          roi_budget: 0.8,            // "See immediate ROI"
          scaling_team: 0.7,          // "Scale your team's productivity"
          pipeline_forecasting: 0.6,  // "Accelerate deal closure"
          lead_prospecting: 0.5,
          manual_efficiency: 0.4,
          data_quality: 0.4,
          communication_outreach: 0.4,
          integration_tools: 0.3,
          general: 0.2
        };
        
      default:
        return {};
    }
  }

  /**
   * Calculate position-specific relevance score
   * Why this matters: Boosts pain points that align with the CTA position strategy.
   */
  private calculatePositionRelevance(
    painPoint: VoCPainPoint,
    position: 'beginning' | 'middle' | 'end',
    positionPriorities: Record<string, number>
  ): number {
    
    const category = this.categorizePainPoint(painPoint);
    const basePriority = positionPriorities[category] || 0.1;
    
    // Additional boosts based on pain point characteristics
    let score = basePriority;
    
    // Severity boost for decision stage
    if (position === 'end' && painPoint.severity === 'high') {
      score += 0.2;
    }
    
    // Frequency boost for awareness stage
    if (position === 'beginning' && painPoint.frequency > 5) {
      score += 0.15;
    }
    
    // Customer quote availability boost
    if (painPoint.customerQuotes && painPoint.customerQuotes.length > 2) {
      score += 0.1;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Generate position-specific matching reason
   * Why this matters: Provides transparency for position-specific pain point selection.
   */
  private generatePositionMatchingReason(
    personaScore: number,
    themeScore: number,
    contextScore: number,
    positionScore: number,
    contentAnalysis: ArticleContentAnalysisResult,
    painPoint: VoCPainPoint,
    position: 'beginning' | 'middle' | 'end'
  ): string {
    const reasons: string[] = [];

    if (positionScore > 0.7) {
      const stageMap = {
        beginning: 'awareness stage',
        middle: 'consideration stage', 
        end: 'decision stage'
      };
      reasons.push(`High ${stageMap[position]} relevance`);
    }

    if (personaScore > 0.6) {
      reasons.push(`Strong persona alignment for ${contentAnalysis.persona}`);
    }

    if (themeScore > 0.5) {
      reasons.push(`Content theme match`);
    }

    if (painPoint.severity === 'high' && position === 'end') {
      reasons.push(`High-impact pain point for decision stage`);
    }

    if (painPoint.frequency > 3 && position === 'beginning') {
      reasons.push(`Common issue for awareness building`);
    }

    return reasons.length > 0 ? reasons.join('; ') : `General ${position} position relevance`;
  }

  /**
   * Get service status
   * Why this matters: Provides health check information for monitoring and debugging.
   */
  getServiceStatus(): { available: boolean; vocAnalyzerReady: boolean } {
    return {
      available: true,
      vocAnalyzerReady: !!this.vocAnalyzer
    };
  }

  /**
   * Test matching functionality
   * Why this matters: Validates that the matching service is working correctly.
   */
  async testMatching(): Promise<{ success: boolean; message: string }> {
    try {
      // Create test content analysis
      const testAnalysis: ArticleContentAnalysisResult = {
        persona: 'Chief Revenue Officer (CRO)',
        persona_details: {
          job_title: 'Chief Revenue Officer',
          seniority_level: 'C-Suite',
          department: 'Sales',
          company_size: 'Enterprise'
        },
        content_themes: ['Sales Pipeline Management', 'Revenue Growth'],
        key_topics: ['quota achievement', 'pipeline visibility', 'forecasting'],
        industry_context: 'B2B Software',
        content_intent: 'consideration',
        pain_point_indicators: ['pipeline visibility challenges', 'forecasting accuracy'],
        confidence_score: 85,
        analysis_timestamp: new Date().toISOString()
      };

      // Test with mock pain points if no real data available
      const mockPainPoints: VoCPainPoint[] = [
        {
          id: 'test-1',
          theme: 'Pipeline Visibility',
          liquidVariable: 'pipeline_visibility',
          description: 'Lack of clear pipeline visibility affecting forecast accuracy',
          frequency: 5,
          severity: 'high',
          customerQuotes: ['We never know where our deals actually stand'],
          emotionalTriggers: ['frustration', 'anxiety']
        }
      ];

      const result = await this.matchPersonaToPainPoints(testAnalysis, mockPainPoints);
      
      if (result.matched_pain_points.length > 0) {
        return {
          success: true,
          message: `Test successful - Matched ${result.matched_pain_points.length} pain points with ${result.matching_confidence}% confidence`
        };
      } else {
        return {
          success: false,
          message: 'Test failed - No pain points matched'
        };
      }

    } catch (error: any) {
      return {
        success: false,
        message: `Test failed: ${error.message}`
      };
    }
  }
}

export default PersonaPainPointMatcher;
