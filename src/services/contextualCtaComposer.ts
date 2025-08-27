import ContextualAnchorTextGenerator, { AnchorTextRequest, AnchorTextResult } from './contextualAnchorTextGenerator';
import UTMUrlGenerator, { UTMConfig } from './utmUrlGenerator';
import { ContentSolutionMatch } from './contentSolutionMatcher';

/**
 * Contextual CTA represents a complete, ready-to-insert CTA
 * Why this matters: Provides the final CTA output with all components combined
 */
export interface ContextualCTA {
  id: string;
  chunkId: string;
  anchorText: string;
  apolloUrl: string;
  utmUrl: string;
  fullCta: string; // Complete CTA ready for insertion
  confidence: number; // Overall confidence in the CTA quality
  solutionTitle: string;
  solutionCategory: string;
  targetKeyword: string;
  campaignType: 'blog_creator' | 'competitor_conquesting';
  generatedAt: string;
  metadata: {
    anchorTextStyle: string;
    semanticSimilarity: number;
    contextualFit: number;
    utmParameters: {
      utm_campaign: string;
      utm_medium: string;
      utm_term: string;
    };
  };
}

/**
 * CTA Composition Request
 * Why this matters: Structured input for generating complete contextual CTAs
 */
export interface CtaCompositionRequest {
  match: ContentSolutionMatch;
  targetKeyword: string;
  campaignType: 'blog_creator' | 'competitor_conquesting';
  competitorName?: string; // For competitor conquesting
  preferredAnchorStyle?: string;
  maxAnchorLength?: number;
}

/**
 * CTA Composition Result
 * Why this matters: Complete result with multiple CTA options and metadata
 */
export interface CtaCompositionResult {
  primaryCta: ContextualCTA;
  alternativeCtas: ContextualCTA[];
  totalGenerated: number;
  averageConfidence: number;
  processingTimeMs: number;
  generationTimestamp: string;
}

/**
 * Contextual CTA Composition Engine
 * Why this matters: Combines anchor text generation, UTM URL creation, and solution messaging
 * into complete, ready-to-insert contextual CTAs that feel natural within content.
 */
class ContextualCtaComposer {
  private anchorTextGenerator: ContextualAnchorTextGenerator;
  private utmUrlGenerator: UTMUrlGenerator;

  constructor(skipApiKey: boolean = false) {
    this.anchorTextGenerator = new ContextualAnchorTextGenerator(skipApiKey);
    this.utmUrlGenerator = new UTMUrlGenerator();
    
    console.log('✅ Contextual CTA Composer initialized');
  }

  /**
   * Compose contextual CTA from content-solution match
   * Why this matters: This is the core function that creates complete, ready-to-insert
   * contextual CTAs by combining all the Phase 2 components.
   */
  async composeContextualCTA(request: CtaCompositionRequest): Promise<CtaCompositionResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🎨 Composing contextual CTA for solution: ${request.match.matchedSolution.title}`);
      console.log(`📝 Target keyword: ${request.targetKeyword}, Campaign: ${request.campaignType}`);

      // Step 1: Generate anchor text
      const anchorTextRequest: AnchorTextRequest = {
        match: request.match,
        targetKeyword: request.targetKeyword,
        campaignType: request.campaignType,
        preferredStyle: request.preferredAnchorStyle as any,
        maxLength: request.maxAnchorLength || 80,
        includeValueProp: true
      };

      const anchorTextResult = await this.anchorTextGenerator.generateAnchorText(anchorTextRequest);
      console.log(`✅ Generated anchor text: "${anchorTextResult.anchorText}"`);

      // Step 2: Generate UTM URL
      const utmConfig: UTMConfig = {
        targetKeyword: request.targetKeyword,
        campaignType: request.campaignType,
        competitorName: request.competitorName
      };

      const utmResult = this.utmUrlGenerator.generateUTMUrl(
        request.match.matchedSolution.url,
        utmConfig
      );
      console.log(`✅ Generated UTM URL: ${utmResult.utmUrl}`);

      // Step 3: Compose the complete CTA
      const primaryCta = this.createContextualCTA(
        request,
        anchorTextResult,
        utmResult,
        'primary'
      );

      // Step 4: Generate alternative CTAs with different anchor text styles
      const alternativeCtas = await this.generateAlternativeCTAs(
        request,
        utmResult,
        anchorTextResult.style
      );

      // Step 5: Calculate overall metrics
      const allCtas = [primaryCta, ...alternativeCtas];
      const averageConfidence = allCtas.reduce((sum, cta) => sum + cta.confidence, 0) / allCtas.length;
      const processingTime = Date.now() - startTime;

      const result: CtaCompositionResult = {
        primaryCta,
        alternativeCtas,
        totalGenerated: allCtas.length,
        averageConfidence,
        processingTimeMs: processingTime,
        generationTimestamp: new Date().toISOString()
      };

      console.log(`✅ CTA composition completed in ${processingTime}ms`);
      console.log(`📊 Generated ${result.totalGenerated} CTAs with ${averageConfidence.toFixed(1)}% average confidence`);

      return result;

    } catch (error) {
      console.error('❌ CTA composition failed:', error);
      throw new Error(`CTA composition failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a contextual CTA from components
   * Why this matters: Assembles all the pieces into a complete, ready-to-insert CTA
   */
  private createContextualCTA(
    request: CtaCompositionRequest,
    anchorTextResult: AnchorTextResult,
    utmResult: any,
    ctaType: 'primary' | 'alternative'
  ): ContextualCTA {
    // Generate unique CTA ID
    const ctaId = this.generateCtaId(request.match.chunkId, ctaType);

    // Create the full CTA markdown link
    const fullCta = `[${anchorTextResult.anchorText}](${utmResult.utmUrl})`;

    // Calculate overall confidence (weighted average)
    const confidence = Math.round(
      (anchorTextResult.confidence * 0.6) + // Anchor text quality is most important
      (request.match.confidenceScore * 0.3) + // Solution match quality
      (anchorTextResult.contextualFit * 0.1) // Contextual fit
    );

    return {
      id: ctaId,
      chunkId: request.match.chunkId,
      anchorText: anchorTextResult.anchorText,
      apolloUrl: request.match.matchedSolution.url,
      utmUrl: utmResult.utmUrl,
      fullCta,
      confidence,
      solutionTitle: request.match.matchedSolution.title,
      solutionCategory: request.match.matchedSolution.category,
      targetKeyword: request.targetKeyword,
      campaignType: request.campaignType,
      generatedAt: new Date().toISOString(),
      metadata: {
        anchorTextStyle: anchorTextResult.style,
        semanticSimilarity: request.match.semanticSimilarity,
        contextualFit: anchorTextResult.contextualFit,
        utmParameters: utmResult.utmParameters
      }
    };
  }

  /**
   * Generate alternative CTAs with different anchor text styles
   * Why this matters: Provides options for A/B testing and different content contexts
   */
  private async generateAlternativeCTAs(
    request: CtaCompositionRequest,
    utmResult: any,
    primaryStyle: string
  ): Promise<ContextualCTA[]> {
    const alternativeStyles = ['benefit_focused', 'action_oriented', 'question_based']
      .filter(style => style !== primaryStyle)
      .slice(0, 2); // Generate 2 alternatives

    const alternatives: ContextualCTA[] = [];

    for (const style of alternativeStyles) {
      try {
        const anchorTextRequest: AnchorTextRequest = {
          match: request.match,
          targetKeyword: request.targetKeyword,
          campaignType: request.campaignType,
          preferredStyle: style as any,
          maxLength: request.maxAnchorLength || 80,
          includeValueProp: true
        };

        const anchorTextResult = await this.anchorTextGenerator.generateAnchorText(anchorTextRequest);
        
        const alternativeCta = this.createContextualCTA(
          request,
          anchorTextResult,
          utmResult,
          'alternative'
        );

        alternatives.push(alternativeCta);
      } catch (error) {
        console.error(`Failed to generate alternative CTA with style ${style}:`, error);
        // Continue with other alternatives
      }
    }

    return alternatives;
  }

  /**
   * Generate unique CTA ID
   * Why this matters: Provides unique identifier for tracking and management
   */
  private generateCtaId(chunkId: string, ctaType: string): string {
    const timestamp = Date.now().toString(36);
    return `cta_${chunkId}_${ctaType}_${timestamp}`;
  }

  /**
   * Compose multiple contextual CTAs for different content chunks
   * Why this matters: Batch processing for multiple contextual CTAs in the same article
   */
  async composeMultipleContextualCTAs(
    requests: CtaCompositionRequest[]
  ): Promise<CtaCompositionResult[]> {
    const results: CtaCompositionResult[] = [];

    for (const request of requests) {
      try {
        const result = await this.composeContextualCTA(request);
        results.push(result);
        
        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Failed to compose CTA for chunk ${request.match.chunkId}:`, error);
        // Continue with other requests
      }
    }

    return results;
  }

  /**
   * Get best CTA from composition result
   * Why this matters: Automatically selects the highest quality CTA for insertion
   */
  getBestCTA(compositionResult: CtaCompositionResult): ContextualCTA {
    const allCtas = [compositionResult.primaryCta, ...compositionResult.alternativeCtas];
    return allCtas.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );
  }

  /**
   * Format CTA for content insertion
   * Why this matters: Prepares CTA for insertion into different content formats
   */
  formatCtaForInsertion(
    cta: ContextualCTA,
    format: 'markdown' | 'html' | 'plain_text' = 'markdown'
  ): string {
    switch (format) {
      case 'html':
        return `<a href="${cta.utmUrl}" target="_blank">${cta.anchorText}</a>`;
      
      case 'plain_text':
        return `${cta.anchorText}: ${cta.utmUrl}`;
      
      case 'markdown':
      default:
        return cta.fullCta;
    }
  }

  /**
   * Generate CTA insertion preview
   * Why this matters: Shows how the CTA will look when inserted into content
   */
  generateCtaInsertionPreview(
    originalParagraph: string,
    cta: ContextualCTA,
    insertionPosition: 'end' | 'middle' = 'end'
  ): string {
    const formattedCta = this.formatCtaForInsertion(cta, 'markdown');
    
    if (insertionPosition === 'end') {
      // Append CTA to the end of the paragraph
      return `${originalParagraph} ${formattedCta}`;
    } else {
      // Insert in the middle (after first sentence)
      const sentences = originalParagraph.split('. ');
      if (sentences.length > 1) {
        const firstSentence = sentences[0] + '.';
        const restOfParagraph = sentences.slice(1).join('. ');
        return `${firstSentence} ${formattedCta} ${restOfParagraph}`;
      } else {
        // Fallback to end insertion if only one sentence
        return `${originalParagraph} ${formattedCta}`;
      }
    }
  }

  /**
   * Validate CTA quality
   * Why this matters: Ensures CTAs meet quality standards before insertion
   */
  validateCtaQuality(cta: ContextualCTA): {
    isValid: boolean;
    issues: string[];
    score: number;
  } {
    const issues: string[] = [];
    let score = 100;

    // Check confidence threshold
    if (cta.confidence < 70) {
      issues.push(`Low confidence score: ${cta.confidence}%`);
      score -= 20;
    }

    // Check anchor text length
    if (cta.anchorText.length > 80) {
      issues.push(`Anchor text too long: ${cta.anchorText.length} chars`);
      score -= 10;
    }

    if (cta.anchorText.length < 10) {
      issues.push(`Anchor text too short: ${cta.anchorText.length} chars`);
      score -= 15;
    }

    // Check URL validity
    try {
      new URL(cta.utmUrl);
    } catch {
      issues.push('Invalid UTM URL format');
      score -= 30;
    }

    // Check Apollo URL
    if (!cta.utmUrl.includes('apollo.io')) {
      issues.push('URL is not an Apollo domain');
      score -= 25;
    }

    // Check UTM parameters
    if (!cta.utmUrl.includes('utm_campaign=') || 
        !cta.utmUrl.includes('utm_medium=') || 
        !cta.utmUrl.includes('utm_term=')) {
      issues.push('Missing required UTM parameters');
      score -= 20;
    }

    return {
      isValid: issues.length === 0,
      issues,
      score: Math.max(0, score)
    };
  }

  /**
   * Generate CTA analytics summary
   * Why this matters: Provides insights into CTA generation performance and quality
   */
  generateCtaAnalyticsSummary(compositionResults: CtaCompositionResult[]): {
    totalCtas: number;
    averageConfidence: number;
    campaignDistribution: Record<string, number>;
    solutionCategoryDistribution: Record<string, number>;
    anchorStyleDistribution: Record<string, number>;
    qualityMetrics: {
      highQuality: number; // >80% confidence
      mediumQuality: number; // 60-80% confidence
      lowQuality: number; // <60% confidence
    };
    processingMetrics: {
      averageProcessingTime: number;
      totalProcessingTime: number;
    };
  } {
    const allCtas = compositionResults.flatMap(result => 
      [result.primaryCta, ...result.alternativeCtas]
    );

    const campaignDistribution: Record<string, number> = {};
    const solutionCategoryDistribution: Record<string, number> = {};
    const anchorStyleDistribution: Record<string, number> = {};
    
    let totalConfidence = 0;
    let highQuality = 0;
    let mediumQuality = 0;
    let lowQuality = 0;

    allCtas.forEach(cta => {
      // Campaign distribution
      campaignDistribution[cta.campaignType] = (campaignDistribution[cta.campaignType] || 0) + 1;
      
      // Solution category distribution
      solutionCategoryDistribution[cta.solutionCategory] = (solutionCategoryDistribution[cta.solutionCategory] || 0) + 1;
      
      // Anchor style distribution
      anchorStyleDistribution[cta.metadata.anchorTextStyle] = (anchorStyleDistribution[cta.metadata.anchorTextStyle] || 0) + 1;
      
      // Confidence tracking
      totalConfidence += cta.confidence;
      
      // Quality metrics
      if (cta.confidence >= 80) highQuality++;
      else if (cta.confidence >= 60) mediumQuality++;
      else lowQuality++;
    });

    const totalProcessingTime = compositionResults.reduce((sum, result) => sum + result.processingTimeMs, 0);

    return {
      totalCtas: allCtas.length,
      averageConfidence: allCtas.length > 0 ? totalConfidence / allCtas.length : 0,
      campaignDistribution,
      solutionCategoryDistribution,
      anchorStyleDistribution,
      qualityMetrics: {
        highQuality,
        mediumQuality,
        lowQuality
      },
      processingMetrics: {
        averageProcessingTime: compositionResults.length > 0 ? totalProcessingTime / compositionResults.length : 0,
        totalProcessingTime
      }
    };
  }
}

export default ContextualCtaComposer;
