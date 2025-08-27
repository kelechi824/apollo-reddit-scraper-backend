/**
 * Pre-Generation CTA Service
 * Why this matters: Generates contextual CTAs before content creation to include in prompts,
 * following the same pattern as internal links integration
 */

import ContentSemanticAnalyzer from './contentSemanticAnalyzer';
import ContextualCtaComposer from './contextualCtaComposer';
import SmartInsertionPointDetector from './smartInsertionPointDetector';

export interface PreGeneratedCta {
  id: string;
  anchorText: string;
  apolloUrl: string;
  context: string; // What type of content this CTA should follow
  painPoints: string[]; // Pain points this CTA addresses
  solutionCategory: string; // Apollo solution category
  confidence: number; // Confidence score 0-100
}

export interface PreGenerationCtaRequest {
  targetKeyword: string;
  campaignType: 'blog_creator' | 'competitor_conquesting';
  competitorName?: string;
  maxCtas?: number;
  confidenceThreshold?: number;
}

export interface PreGenerationCtaResult {
  success: boolean;
  ctas: PreGeneratedCta[];
  totalGenerated: number;
  averageConfidence: number;
  processingTimeMs: number;
  error?: string;
}

/**
 * Pre-Generation CTA Service
 * Why this matters: Leverages existing CTA infrastructure to generate contextual CTAs
 * before content creation, allowing them to be naturally integrated during generation
 */
class PreGenerationCtaService {
  private semanticAnalyzer: ContentSemanticAnalyzer;
  private ctaComposer: ContextualCtaComposer;
  private insertionDetector: SmartInsertionPointDetector;

  constructor() {
    this.semanticAnalyzer = new ContentSemanticAnalyzer();
    this.ctaComposer = new ContextualCtaComposer();
    this.insertionDetector = new SmartInsertionPointDetector();
    console.log('✅ Pre-Generation CTA Service initialized');
  }

  /**
   * Generate contextual CTAs for a target keyword before content creation
   * Why this matters: Creates relevant CTAs that can be included in content generation prompts
   */
  async generateCtasForKeyword(request: PreGenerationCtaRequest): Promise<PreGenerationCtaResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🎯 Pre-generating contextual CTAs for keyword: "${request.targetKeyword}"`);
      console.log(`📊 Campaign: ${request.campaignType}, Max CTAs: ${request.maxCtas || 3}`);

      // Step 1: Analyze the target keyword semantically
      const keywordAnalysis = await this.analyzeKeywordContext(request.targetKeyword);
      console.log(`🧠 Keyword analysis: ${keywordAnalysis.themes.length} themes, ${keywordAnalysis.painPoints.length} pain points`);

      // Step 2: Generate contextual CTAs based on keyword analysis
      const generatedCtas = await this.generateContextualCtas(keywordAnalysis, request);
      console.log(`🎨 Generated ${generatedCtas.length} contextual CTAs`);

      // Step 3: Filter by confidence threshold
      const confidenceThreshold = request.confidenceThreshold || 60;
      const filteredCtas = generatedCtas.filter(cta => cta.confidence >= confidenceThreshold);
      console.log(`✅ ${filteredCtas.length} CTAs passed confidence threshold (${confidenceThreshold}%)`);

      // Step 4: Limit to max CTAs
      const maxCtas = request.maxCtas || 3;
      const finalCtas = filteredCtas
        .sort((a, b) => b.confidence - a.confidence) // Sort by confidence descending
        .slice(0, maxCtas);

      const averageConfidence = finalCtas.length > 0 
        ? finalCtas.reduce((sum, cta) => sum + cta.confidence, 0) / finalCtas.length 
        : 0;

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        ctas: finalCtas,
        totalGenerated: generatedCtas.length,
        averageConfidence,
        processingTimeMs: processingTime
      };

    } catch (error) {
      console.error('❌ Pre-generation CTA creation failed:', error);
      return {
        success: false,
        ctas: [],
        totalGenerated: 0,
        averageConfidence: 0,
        processingTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Analyze target keyword to understand context and pain points
   * Why this matters: Provides semantic understanding of the keyword for relevant CTA generation
   */
  private async analyzeKeywordContext(keyword: string): Promise<{
    themes: string[];
    painPoints: string[];
    solutionOpportunities: string[];
    contextClues: string[];
  }> {
    // Create a mock article content for keyword analysis
    const mockContent = {
      url: `keyword-analysis-${Date.now()}`,
      title: `${keyword} Guide`,
      content: `This article covers ${keyword} and related topics. Users are looking for solutions to improve their ${keyword} processes and overcome common challenges.`,
      wordCount: 20,
      extractedAt: new Date().toISOString(),
      metadata: {
        description: `Analysis content for ${keyword}`,
        author: 'CTA Pre-Generation Service',
        publishDate: new Date().toISOString(),
        tags: ['keyword-analysis', keyword.replace(/\s+/g, '-')]
      }
    };

    // Use semantic analyzer to understand keyword context
    const analysis = await this.semanticAnalyzer.analyzeContentSemantics(mockContent);
    
    // Extract themes and pain points from all chunks
    const themes = [...new Set(analysis.chunks.flatMap(chunk => chunk.themes))];
    const painPoints = [...new Set(analysis.chunks.flatMap(chunk => chunk.painPoints))];
    const solutionOpportunities = [...new Set(analysis.chunks.flatMap(chunk => chunk.solutionOpportunities))];
    const contextClues = [...new Set(analysis.chunks.flatMap(chunk => chunk.contextClues))];

    // Add keyword-specific themes and pain points
    const keywordThemes = this.extractKeywordThemes(keyword);
    const keywordPainPoints = this.extractKeywordPainPoints(keyword);

    return {
      themes: [...themes, ...keywordThemes],
      painPoints: [...painPoints, ...keywordPainPoints],
      solutionOpportunities,
      contextClues
    };
  }

  /**
   * Generate contextual CTAs based on keyword analysis
   * Why this matters: Creates relevant CTAs that match the keyword context
   */
  private async generateContextualCtas(
    keywordAnalysis: any, 
    request: PreGenerationCtaRequest
  ): Promise<PreGeneratedCta[]> {
    const ctas: PreGeneratedCta[] = [];

    // Generate CTAs for each pain point/theme combination
    for (const painPoint of keywordAnalysis.painPoints.slice(0, 5)) { // Limit to top 5
      for (const theme of keywordAnalysis.themes.slice(0, 3)) { // Limit to top 3
        try {
          const ctaRequest = {
            painPoint,
            solutionContext: theme,
            targetKeyword: request.targetKeyword,
            campaignType: request.campaignType,
            competitorName: request.competitorName
          };

          const contextualCta = await this.ctaComposer.generateContextualCTA(ctaRequest);
          
          if (contextualCta && contextualCta.confidence >= 50) { // Minimum threshold
            const preGeneratedCta: PreGeneratedCta = {
              id: `cta-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              anchorText: this.extractAnchorText(contextualCta.fullCta),
              apolloUrl: contextualCta.apolloUrl,
              context: `${painPoint} related to ${theme}`,
              painPoints: [painPoint],
              solutionCategory: contextualCta.solutionCategory,
              confidence: contextualCta.confidence
            };

            ctas.push(preGeneratedCta);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to generate CTA for ${painPoint} + ${theme}:`, error);
        }
      }
    }

    return ctas;
  }

  /**
   * Extract anchor text from full CTA markdown link
   * Why this matters: Separates the clickable text from the full CTA for prompt inclusion
   */
  private extractAnchorText(fullCta: string): string {
    const match = fullCta.match(/\[([^\]]+)\]/);
    return match ? match[1] : 'Try Apollo for free';
  }

  /**
   * Extract themes from target keyword
   * Why this matters: Provides keyword-specific context for CTA generation
   */
  private extractKeywordThemes(keyword: string): string[] {
    const keywordLower = keyword.toLowerCase();
    const themes: string[] = [];

    // Sales-related themes
    if (keywordLower.includes('sales')) themes.push('sales process', 'sales performance', 'sales productivity');
    if (keywordLower.includes('automation')) themes.push('process automation', 'workflow efficiency', 'time savings');
    if (keywordLower.includes('prospecting')) themes.push('lead generation', 'prospect research', 'outreach');
    if (keywordLower.includes('data')) themes.push('data quality', 'data enrichment', 'contact accuracy');
    if (keywordLower.includes('email')) themes.push('email outreach', 'email automation', 'email deliverability');
    if (keywordLower.includes('crm')) themes.push('CRM integration', 'data management', 'pipeline tracking');

    return themes.length > 0 ? themes : ['sales improvement', 'business growth', 'productivity enhancement'];
  }

  /**
   * Extract pain points from target keyword
   * Why this matters: Identifies specific challenges the keyword addresses
   */
  private extractKeywordPainPoints(keyword: string): string[] {
    const keywordLower = keyword.toLowerCase();
    const painPoints: string[] = [];

    // Common sales pain points
    if (keywordLower.includes('automation')) painPoints.push('manual processes', 'repetitive tasks', 'time waste');
    if (keywordLower.includes('prospecting')) painPoints.push('finding qualified leads', 'research time', 'low response rates');
    if (keywordLower.includes('data')) painPoints.push('inaccurate contact information', 'outdated databases', 'bounced emails');
    if (keywordLower.includes('sales')) painPoints.push('missed quotas', 'long sales cycles', 'poor conversion rates');
    if (keywordLower.includes('email')) painPoints.push('low open rates', 'spam filters', 'generic messaging');

    return painPoints.length > 0 ? painPoints : ['inefficient processes', 'poor results', 'wasted time'];
  }
}

export default PreGenerationCtaService;
