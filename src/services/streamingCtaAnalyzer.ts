/**
 * Streaming CTA Analyzer Service
 * Why this matters: Analyzes paragraph context in real-time during content generation
 * to insert truly contextual CTAs based on actual content, not just keywords
 */

import ContentSemanticAnalyzer from './contentSemanticAnalyzer';
import ContextualCtaComposer from './contextualCtaComposer';

export interface ParagraphContext {
  content: string;
  themes: string[];
  painPoints: string[];
  solutionOpportunities: string[];
  contextClues: string[];
  confidence: number;
}

export interface ContextualCtaCandidate {
  shouldInsertCta: boolean;
  cta?: {
    anchorText: string;
    apolloUrl: string;
    fullCta: string;
    confidence: number;
    reasoning: string;
  };
  analysis: {
    painPointsFound: string[];
    solutionMatch: string;
    contextRelevance: number;
  };
}

export interface StreamingCtaRequest {
  paragraphContent: string;
  targetKeyword: string;
  campaignType: 'blog_creator' | 'competitor_conquesting';
  competitorName?: string;
  articleContext?: {
    title?: string;
    previousParagraphs?: string[];
    overallTheme?: string;
  };
  ctaInsertionCount?: number; // How many CTAs already inserted
  maxCtasPerArticle?: number;
}

/**
 * Streaming CTA Analyzer
 * Why this matters: Provides real-time analysis of paragraph content to determine
 * if and what type of contextual CTA should be inserted
 */
class StreamingCtaAnalyzer {
  private semanticAnalyzer: ContentSemanticAnalyzer;
  private ctaComposer: ContextualCtaComposer;

  constructor() {
    this.semanticAnalyzer = new ContentSemanticAnalyzer();
    this.ctaComposer = new ContextualCtaComposer();
    console.log('✅ Streaming CTA Analyzer initialized');
  }

  /**
   * Analyze a single paragraph and determine if it needs a contextual CTA
   * Why this matters: Real-time analysis based on actual paragraph content and context
   */
  async analyzeParagraphForCta(request: StreamingCtaRequest): Promise<ContextualCtaCandidate> {
    try {
      console.log(`🔍 Analyzing paragraph for contextual CTA opportunity...`);
      console.log(`📝 Content preview: "${request.paragraphContent.substring(0, 100)}..."`);

      // Step 1: Analyze paragraph context
      const paragraphContext = await this.analyzeParagraphContext(request.paragraphContent);
      console.log(`🧠 Found ${paragraphContext.painPoints.length} pain points, ${paragraphContext.themes.length} themes`);

      // Step 2: Determine if CTA insertion is appropriate
      const shouldInsert = this.shouldInsertCta(paragraphContext, request);
      
      if (!shouldInsert.insert) {
        console.log(`⏭️ No CTA needed: ${shouldInsert.reason}`);
        return {
          shouldInsertCta: false,
          analysis: {
            painPointsFound: paragraphContext.painPoints,
            solutionMatch: 'none',
            contextRelevance: paragraphContext.confidence
          }
        };
      }

      // Step 3: Generate contextual CTA based on paragraph content
      const cta = await this.generateContextualCtaForParagraph(paragraphContext, request);
      
      if (cta && cta.confidence >= 60) {
        console.log(`✅ Generated contextual CTA: "${cta.anchorText}" (confidence: ${cta.confidence}%)`);
        return {
          shouldInsertCta: true,
          cta,
          analysis: {
            painPointsFound: paragraphContext.painPoints,
            solutionMatch: cta.reasoning,
            contextRelevance: paragraphContext.confidence
          }
        };
      } else {
        console.log(`❌ CTA generation failed or low confidence`);
        return {
          shouldInsertCta: false,
          analysis: {
            painPointsFound: paragraphContext.painPoints,
            solutionMatch: 'low_confidence',
            contextRelevance: paragraphContext.confidence
          }
        };
      }

    } catch (error) {
      console.error('❌ Paragraph CTA analysis failed:', error);
      return {
        shouldInsertCta: false,
        analysis: {
          painPointsFound: [],
          solutionMatch: 'error',
          contextRelevance: 0
        }
      };
    }
  }

  /**
   * Analyze paragraph content to extract context
   * Why this matters: Understands what the paragraph is actually about
   */
  private async analyzeParagraphContext(paragraphContent: string): Promise<ParagraphContext> {
    // Create article content for semantic analysis
    const articleContent = {
      url: `paragraph-analysis-${Date.now()}`,
      title: 'Paragraph Context Analysis',
      content: paragraphContent,
      wordCount: paragraphContent.split(/\s+/).length,
      extractedAt: new Date().toISOString(),
      metadata: {
        description: 'Real-time paragraph analysis for contextual CTA insertion',
        author: 'Streaming CTA Analyzer',
        publishDate: new Date().toISOString(),
        tags: ['paragraph-analysis', 'contextual-cta']
      }
    };

    // Analyze semantically
    const analysis = await this.semanticAnalyzer.analyzeContentSemantics(articleContent);
    
    if (analysis.chunks.length === 0) {
      return {
        content: paragraphContent,
        themes: [],
        painPoints: [],
        solutionOpportunities: [],
        contextClues: [],
        confidence: 0
      };
    }

    const chunk = analysis.chunks[0]; // Should only be one chunk for a single paragraph
    
    return {
      content: paragraphContent,
      themes: chunk.themes || [],
      painPoints: chunk.painPoints || [],
      solutionOpportunities: chunk.solutionOpportunities || [],
      contextClues: chunk.contextClues || [],
      confidence: chunk.confidenceScore || 0
    };
  }

  /**
   * Determine if a CTA should be inserted based on paragraph context
   * Why this matters: Prevents over-insertion and ensures CTAs are contextually appropriate
   */
  private shouldInsertCta(
    context: ParagraphContext, 
    request: StreamingCtaRequest
  ): { insert: boolean; reason: string } {
    // Check if we've already inserted too many CTAs
    const currentCtaCount = request.ctaInsertionCount || 0;
    const maxCtas = request.maxCtasPerArticle || 3;
    
    if (currentCtaCount >= maxCtas) {
      return { insert: false, reason: `Already inserted ${currentCtaCount}/${maxCtas} CTAs` };
    }

    // Check if paragraph is too short
    if (context.content.length < 100) {
      return { insert: false, reason: 'Paragraph too short for CTA insertion' };
    }

    // Check if paragraph has relevant pain points or solution opportunities
    if (context.painPoints.length === 0 && context.solutionOpportunities.length === 0) {
      return { insert: false, reason: 'No pain points or solution opportunities detected' };
    }

    // Check confidence threshold
    if (context.confidence < 50) {
      return { insert: false, reason: `Low confidence score: ${context.confidence}%` };
    }

    // Check for CTA-worthy content patterns
    const ctaPatterns = [
      /challenge/i, /problem/i, /difficult/i, /struggle/i, /issue/i,
      /manual/i, /time-consuming/i, /inefficient/i, /waste/i,
      /need/i, /require/i, /solution/i, /improve/i, /better/i
    ];

    const hasCtaPattern = ctaPatterns.some(pattern => pattern.test(context.content));
    
    if (!hasCtaPattern) {
      return { insert: false, reason: 'No CTA-worthy content patterns found' };
    }

    return { insert: true, reason: 'Paragraph suitable for contextual CTA insertion' };
  }

  /**
   * Generate contextual CTA specifically for the analyzed paragraph
   * Why this matters: Creates CTAs that directly respond to the paragraph's specific content
   */
  private async generateContextualCtaForParagraph(
    context: ParagraphContext,
    request: StreamingCtaRequest
  ): Promise<{
    anchorText: string;
    apolloUrl: string;
    fullCta: string;
    confidence: number;
    reasoning: string;
  } | null> {
    try {
      // Find the most relevant pain point for CTA generation
      const primaryPainPoint = context.painPoints[0] || 'process inefficiency';
      const primaryTheme = context.themes[0] || request.targetKeyword;

      // Generate CTA using existing composer
      const ctaRequest = {
        painPoint: primaryPainPoint,
        solutionContext: primaryTheme,
        targetKeyword: request.targetKeyword,
        campaignType: request.campaignType,
        competitorName: request.competitorName
      };

      // Note: We need to create a proper match object for the composer
      // For now, let's use a simplified approach
      const contextualCta = await this.generateSimplifiedCta(ctaRequest);
      
      if (!contextualCta) {
        return null;
      }

      // Extract anchor text from the full CTA
      const anchorTextMatch = contextualCta.fullCta.match(/\[([^\]]+)\]/);
      const anchorText = anchorTextMatch ? anchorTextMatch[1] : 'Try Apollo for free';

      return {
        anchorText,
        apolloUrl: contextualCta.apolloUrl,
        fullCta: contextualCta.fullCta,
        confidence: contextualCta.confidence,
        reasoning: `Addresses "${primaryPainPoint}" with ${contextualCta.solutionCategory} solution`
      };

    } catch (error) {
      console.error('❌ Failed to generate contextual CTA for paragraph:', error);
      return null;
    }
  }

  /**
   * Generate simplified CTA for streaming approach
   * Why this matters: Creates CTAs without complex solution matching for speed
   */
  private async generateSimplifiedCta(ctaRequest: any): Promise<{
    fullCta: string;
    apolloUrl: string;
    confidence: number;
    solutionCategory: string;
  } | null> {
    try {
      // Generate UTM-tracked URL
      const sanitizedKeyword = ctaRequest.targetKeyword.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .trim();

      const baseUrl = 'https://www.apollo.io/sign-up';
      const utmParams = new URLSearchParams({
        utm_campaign: ctaRequest.campaignType,
        utm_medium: 'contextual_cta',
        utm_term: sanitizedKeyword
      });
      const apolloUrl = `${baseUrl}?${utmParams.toString()}`;

      // Generate contextual anchor text based on pain point
      const anchorTexts = [
        'Try Apollo for free',
        'Start your free trial',
        'Get leads now',
        'Start prospecting',
        'Improve your sales process',
        'Automate your outreach',
        'Find better prospects'
      ];

      // Choose anchor text based on pain point context
      let anchorText = anchorTexts[0]; // default
      const painPoint = ctaRequest.painPoint?.toLowerCase() || '';
      
      if (painPoint.includes('manual') || painPoint.includes('time')) {
        anchorText = 'Automate your outreach';
      } else if (painPoint.includes('data') || painPoint.includes('contact')) {
        anchorText = 'Get verified contacts';
      } else if (painPoint.includes('prospect') || painPoint.includes('lead')) {
        anchorText = 'Find better prospects';
      } else if (painPoint.includes('process') || painPoint.includes('efficiency')) {
        anchorText = 'Improve your sales process';
      }

      const fullCta = `[${anchorText}](${apolloUrl})`;

      return {
        fullCta,
        apolloUrl,
        confidence: 75, // Good confidence for simplified approach
        solutionCategory: 'sales_automation'
      };

    } catch (error) {
      console.error('❌ Simplified CTA generation failed:', error);
      return null;
    }
  }

  /**
   * Quick analysis for simple CTA insertion decisions
   * Why this matters: Provides fast analysis for real-time content generation
   */
  async quickAnalyze(paragraphContent: string, targetKeyword: string): Promise<boolean> {
    // Simple heuristic-based analysis for speed
    const painPointKeywords = [
      'challenge', 'problem', 'difficult', 'struggle', 'issue',
      'manual', 'time-consuming', 'inefficient', 'waste', 'slow',
      'error', 'mistake', 'fail', 'poor', 'bad', 'wrong'
    ];

    const solutionKeywords = [
      'solution', 'improve', 'better', 'optimize', 'enhance',
      'automate', 'streamline', 'efficient', 'fast', 'easy'
    ];

    const content = paragraphContent.toLowerCase();
    const hasPainPoint = painPointKeywords.some(keyword => content.includes(keyword));
    const hasSolutionContext = solutionKeywords.some(keyword => content.includes(keyword));
    const hasTargetKeyword = content.includes(targetKeyword.toLowerCase());

    return (hasPainPoint || hasSolutionContext) && content.length > 100;
  }
}

export default StreamingCtaAnalyzer;
