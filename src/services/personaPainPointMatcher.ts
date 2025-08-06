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

      // Execute persona-based matching algorithm
      const matchedPainPoints = await this.executePersonaMatching(
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

      // Only include pain points with meaningful relevance (> 0.3)
      if (compositeScore > 0.3) {
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

    // Apply theme priorities
    const themeKey = painPoint.liquidVariable.toLowerCase();
    if (themePriorities[themeKey]) {
      score += themePriorities[themeKey] * 0.3;
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
