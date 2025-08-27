import { OpenAI } from 'openai';
import { SemanticChunk } from './contentSemanticAnalyzer';

/**
 * Insertion Point represents a paragraph suitable for CTA insertion
 * Why this matters: Provides structured data about where and why a CTA should be inserted
 */
export interface InsertionPoint {
  chunkId: string;
  paragraphContent: string;
  position: number;
  insertionScore: number; // 0-100 score indicating suitability for CTA insertion
  insertionReason: string; // Why this paragraph is suitable
  painPointsIdentified: string[];
  solutionOpportunities: string[];
  contextualFit: number; // How well a CTA would fit contextually
  readabilityImpact: number; // How much a CTA would impact readability (lower is better)
  insertionType: 'end_of_paragraph' | 'natural_break';
  confidenceScore: number;
}

/**
 * Insertion Point Analysis Result
 * Why this matters: Complete analysis of all potential insertion points in content
 */
export interface InsertionPointAnalysisResult {
  articleId: string;
  totalParagraphs: number;
  analyzedChunks: number;
  insertionPoints: InsertionPoint[];
  recommendedInsertions: InsertionPoint[]; // Top-scoring insertion points
  maxRecommendedCtas: number; // Maximum CTAs recommended for this content
  analysisTimestamp: string;
  processingTimeMs: number;
}

/**
 * Smart Insertion Point Detector
 * Why this matters: Identifies optimal paragraphs for end-of-paragraph CTA insertion
 * by analyzing content for pain points, solution opportunities, and natural flow.
 */
class SmartInsertionPointDetector {
  private client: OpenAI;

  constructor(skipApiKey: boolean = false) {
    if (!skipApiKey) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is required');
      }
      this.client = new OpenAI({ apiKey });
    } else {
      // For testing purposes
      this.client = null as any;
    }

    console.log('✅ Smart Insertion Point Detector initialized');
  }

  /**
   * Analyze content chunks to identify optimal CTA insertion points
   * Why this matters: This is the core function that determines where contextual CTAs
   * should be placed for maximum effectiveness and natural flow.
   */
  async analyzeInsertionPoints(
    chunks: SemanticChunk[],
    articleId: string = `article-${Date.now()}`
  ): Promise<InsertionPointAnalysisResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🎯 Analyzing ${chunks.length} chunks for optimal CTA insertion points`);

      // Step 1: Analyze each chunk for insertion potential
      const insertionPoints = await this.analyzeChunksForInsertion(chunks);
      console.log(`📍 Identified ${insertionPoints.length} potential insertion points`);

      // Step 2: Score and rank insertion points
      const scoredInsertionPoints = this.scoreInsertionPoints(insertionPoints);
      console.log(`📊 Scored ${scoredInsertionPoints.length} insertion points`);

      // Step 3: Select recommended insertions (avoid over-saturation)
      const recommendedInsertions = this.selectRecommendedInsertions(scoredInsertionPoints, chunks.length);
      console.log(`✅ Recommended ${recommendedInsertions.length} insertion points`);

      // Step 4: Calculate maximum recommended CTAs based on content length
      const maxRecommendedCtas = this.calculateMaxRecommendedCtas(chunks.length);

      const processingTime = Date.now() - startTime;

      const result: InsertionPointAnalysisResult = {
        articleId,
        totalParagraphs: chunks.length,
        analyzedChunks: chunks.length,
        insertionPoints: scoredInsertionPoints,
        recommendedInsertions,
        maxRecommendedCtas,
        analysisTimestamp: new Date().toISOString(),
        processingTimeMs: processingTime
      };

      console.log(`✅ Insertion point analysis completed in ${processingTime}ms`);
      console.log(`📈 Results: ${recommendedInsertions.length}/${maxRecommendedCtas} recommended insertions`);

      return result;

    } catch (error) {
      console.error('❌ Insertion point analysis failed:', error);
      throw new Error(`Insertion point analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analyze individual chunks for insertion potential using AI
   * Why this matters: Uses AI to understand paragraph context and identify natural
   * opportunities for solution-focused CTAs.
   */
  private async analyzeChunksForInsertion(chunks: SemanticChunk[]): Promise<InsertionPoint[]> {
    const insertionPoints: InsertionPoint[] = [];

    // Process chunks in batches to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      try {
        const batchResults = await this.analyzeBatchForInsertion(batch);
        insertionPoints.push(...batchResults);
        
        // Small delay between batches
        if (i + batchSize < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`Failed to analyze batch ${i}-${i + batchSize}:`, error);
        // Continue with other batches
      }
    }

    return insertionPoints;
  }

  /**
   * Analyze a batch of chunks for insertion opportunities
   * Why this matters: Efficient batch processing reduces API calls while maintaining accuracy.
   */
  private async analyzeBatchForInsertion(chunks: SemanticChunk[]): Promise<InsertionPoint[]> {
    if (!this.client) {
      // Return mock data for testing
      return chunks.map(chunk => this.createMockInsertionPoint(chunk));
    }

    const analysisPrompt = this.buildInsertionAnalysisPrompt(chunks);

    const completion = await this.client.responses.create({
      model: "gpt-5-nano",
      input: `You are an expert content strategist specializing in contextual CTA placement. You analyze paragraphs to identify optimal insertion points for solution-focused CTAs.

ANALYSIS CRITERIA:
- Pain points or challenges mentioned
- Solution opportunities (problems that need solving)
- Natural conversation flow for CTA insertion
- Contextual fit for sales/marketing solutions
- Readability impact of adding a CTA

INSERTION SCORING (0-100):
- 90-100: Perfect insertion opportunity (clear pain point + natural flow)
- 70-89: Good insertion opportunity (some pain points or natural break)
- 50-69: Moderate insertion opportunity (contextually relevant)
- 30-49: Poor insertion opportunity (forced or awkward)
- 0-29: Not suitable for insertion

CRITICAL: You must respond with ONLY valid JSON. No explanations, no markdown, no extra text.

${analysisPrompt}`
    });

    const responseContent = completion.output_text;
    if (!responseContent) {
      throw new Error('Empty response from OpenAI');
    }

    try {
      const analysisResult = JSON.parse(responseContent);
      return this.parseInsertionAnalysisResult(analysisResult, chunks);
    } catch (error) {
      console.error('Failed to parse insertion analysis result:', error);
      console.error('Raw response:', responseContent);
      // Return fallback analysis
      return chunks.map(chunk => this.createFallbackInsertionPoint(chunk));
    }
  }

  /**
   * Build analysis prompt for insertion point detection
   * Why this matters: Provides structured instructions for AI to identify optimal CTA placement.
   */
  private buildInsertionAnalysisPrompt(chunks: SemanticChunk[]): string {
    const chunksData = chunks.map(chunk => ({
      id: chunk.id,
      content: chunk.content.substring(0, 500), // Limit content length for prompt
      position: chunk.position,
      wordCount: chunk.wordCount
    }));

    return `
Analyze these content chunks for CTA insertion opportunities:

${JSON.stringify(chunksData, null, 2)}

For each chunk, provide:
{
  "insertionAnalysis": [
    {
      "chunkId": "chunk-id",
      "insertionScore": 85,
      "insertionReason": "Discusses data quality challenges - perfect for data enrichment solution",
      "painPointsIdentified": ["dirty data", "bounced emails", "wasted outreach"],
      "solutionOpportunities": ["data verification", "contact enrichment"],
      "contextualFit": 90,
      "readabilityImpact": 15,
      "insertionType": "end_of_paragraph",
      "confidenceScore": 88
    }
  ]
}`;
  }

  /**
   * Parse AI analysis result into InsertionPoint objects
   * Why this matters: Converts AI response into structured data for insertion planning.
   */
  private parseInsertionAnalysisResult(analysisResult: any, chunks: SemanticChunk[]): InsertionPoint[] {
    const insertionPoints: InsertionPoint[] = [];

    if (!analysisResult.insertionAnalysis || !Array.isArray(analysisResult.insertionAnalysis)) {
      console.error('Invalid analysis result structure');
      return chunks.map(chunk => this.createFallbackInsertionPoint(chunk));
    }

    for (const analysis of analysisResult.insertionAnalysis) {
      const chunk = chunks.find(c => c.id === analysis.chunkId);
      if (!chunk) continue;

      const insertionPoint: InsertionPoint = {
        chunkId: chunk.id,
        paragraphContent: chunk.content,
        position: chunk.position,
        insertionScore: Math.min(100, Math.max(0, analysis.insertionScore || 0)),
        insertionReason: analysis.insertionReason || 'General content relevance',
        painPointsIdentified: Array.isArray(analysis.painPointsIdentified) ? analysis.painPointsIdentified : [],
        solutionOpportunities: Array.isArray(analysis.solutionOpportunities) ? analysis.solutionOpportunities : [],
        contextualFit: Math.min(100, Math.max(0, analysis.contextualFit || 50)),
        readabilityImpact: Math.min(100, Math.max(0, analysis.readabilityImpact || 20)),
        insertionType: analysis.insertionType === 'natural_break' ? 'natural_break' : 'end_of_paragraph',
        confidenceScore: Math.min(100, Math.max(0, analysis.confidenceScore || 50))
      };

      insertionPoints.push(insertionPoint);
    }

    return insertionPoints;
  }

  /**
   * Score and rank insertion points for optimal selection
   * Why this matters: Prioritizes the best insertion opportunities while considering content flow.
   */
  private scoreInsertionPoints(insertionPoints: InsertionPoint[]): InsertionPoint[] {
    return insertionPoints
      .map(point => {
        // Calculate composite score considering multiple factors
        const compositeScore = Math.round(
          (point.insertionScore * 0.4) + // Primary insertion score
          (point.contextualFit * 0.3) + // Contextual fit
          (point.confidenceScore * 0.2) + // AI confidence
          ((100 - point.readabilityImpact) * 0.1) // Readability preservation
        );

        return {
          ...point,
          insertionScore: compositeScore
        };
      })
      .sort((a, b) => b.insertionScore - a.insertionScore); // Sort by score descending
  }

  /**
   * Select recommended insertions avoiding over-saturation
   * Why this matters: Prevents CTA spam by limiting insertions based on content length and quality.
   */
  private selectRecommendedInsertions(
    insertionPoints: InsertionPoint[],
    totalParagraphs: number
  ): InsertionPoint[] {
    const maxInsertions = this.calculateMaxRecommendedCtas(totalParagraphs);
    const minScore = 60; // Minimum score threshold
    const minSpacing = 3; // Minimum paragraphs between CTAs

    const recommended: InsertionPoint[] = [];
    
    for (const point of insertionPoints) {
      if (recommended.length >= maxInsertions) break;
      if (point.insertionScore < minScore) break;

      // Check spacing from previous insertions
      const hasGoodSpacing = recommended.every(existing => 
        Math.abs(existing.position - point.position) >= minSpacing
      );

      if (hasGoodSpacing) {
        recommended.push(point);
      }
    }

    return recommended;
  }

  /**
   * Calculate maximum recommended CTAs based on content length
   * Why this matters: Scales CTA density appropriately with content length to avoid spam.
   */
  private calculateMaxRecommendedCtas(totalParagraphs: number): number {
    if (totalParagraphs < 5) return 1;
    if (totalParagraphs < 10) return 2;
    if (totalParagraphs < 20) return 3;
    return Math.min(4, Math.floor(totalParagraphs / 8)); // Max 4 CTAs, 1 per 8 paragraphs
  }

  /**
   * Create mock insertion point for testing
   * Why this matters: Enables testing without API calls during development.
   */
  private createMockInsertionPoint(chunk: SemanticChunk): InsertionPoint {
    // Use semantic analysis data if available, otherwise fall back to heuristics
    let score = 30; // Base score
    let painPoints: string[] = [];
    let solutionOpportunities: string[] = [];
    let reason = 'General business relevance';

    // Use existing semantic analysis data if available
    if (chunk.painPoints && chunk.painPoints.length > 0) {
      score += chunk.painPoints.length * 15; // 15 points per pain point
      painPoints = chunk.painPoints;
      reason = `Contains ${chunk.painPoints.length} pain point(s): ${chunk.painPoints.slice(0, 2).join(', ')}`;
    }

    if (chunk.solutionOpportunities && chunk.solutionOpportunities.length > 0) {
      score += chunk.solutionOpportunities.length * 10; // 10 points per solution opportunity
      solutionOpportunities = chunk.solutionOpportunities;
    }

    if (chunk.isCtaCandidate) {
      score += 20; // Bonus for being identified as CTA candidate
    }

    // Use confidence score from semantic analysis if available
    if (chunk.confidenceScore) {
      score = Math.round((score * 0.6) + (chunk.confidenceScore * 0.4)); // Blend scores
    }

    // Fallback to heuristic analysis if no semantic data
    if (!chunk.painPoints || chunk.painPoints.length === 0) {
      const hasChallenge = /challenge|problem|difficult|struggle|issue|pain|obstacle/i.test(chunk.content);
      const hasSolution = /solution|solve|fix|improve|optimize|better/i.test(chunk.content);
      const hasBusinessContext = /sales|marketing|revenue|customer|lead|prospect|data|pipeline/i.test(chunk.content);

      if (hasChallenge) {
        score += 25;
        painPoints = ['business challenge'];
        reason = 'Contains challenge/problem statement';
      }
      if (hasSolution) {
        score += 20;
        solutionOpportunities = ['solution opportunity'];
      }
      if (hasBusinessContext) score += 15;
    }

    if (chunk.wordCount > 50) score += 10;

    return {
      chunkId: chunk.id,
      paragraphContent: chunk.content,
      position: chunk.position,
      insertionScore: Math.min(100, score),
      insertionReason: reason,
      painPointsIdentified: painPoints,
      solutionOpportunities,
      contextualFit: Math.min(100, score),
      readabilityImpact: 20,
      insertionType: 'end_of_paragraph',
      confidenceScore: Math.min(100, score)
    };
  }

  /**
   * Create fallback insertion point when AI analysis fails
   * Why this matters: Ensures system continues to function even when AI analysis fails.
   */
  private createFallbackInsertionPoint(chunk: SemanticChunk): InsertionPoint {
    return {
      chunkId: chunk.id,
      paragraphContent: chunk.content,
      position: chunk.position,
      insertionScore: 40, // Conservative fallback score
      insertionReason: 'Fallback analysis - general content relevance',
      painPointsIdentified: [],
      solutionOpportunities: [],
      contextualFit: 40,
      readabilityImpact: 25,
      insertionType: 'end_of_paragraph',
      confidenceScore: 30
    };
  }

  /**
   * Get insertion points above threshold score
   * Why this matters: Filters insertion points to only high-quality opportunities.
   */
  getHighQualityInsertionPoints(
    analysisResult: InsertionPointAnalysisResult,
    minScore: number = 70
  ): InsertionPoint[] {
    return analysisResult.insertionPoints.filter(point => point.insertionScore >= minScore);
  }

  /**
   * Get insertion points by type
   * Why this matters: Allows filtering by insertion strategy (end-of-paragraph vs natural breaks).
   */
  getInsertionPointsByType(
    analysisResult: InsertionPointAnalysisResult,
    insertionType: 'end_of_paragraph' | 'natural_break'
  ): InsertionPoint[] {
    return analysisResult.insertionPoints.filter(point => point.insertionType === insertionType);
  }

  /**
   * Generate insertion point summary
   * Why this matters: Provides insights into insertion opportunities and quality distribution.
   */
  generateInsertionSummary(analysisResult: InsertionPointAnalysisResult): {
    totalOpportunities: number;
    highQualityOpportunities: number;
    recommendedInsertions: number;
    averageScore: number;
    scoreDistribution: {
      excellent: number; // 90-100
      good: number; // 70-89
      moderate: number; // 50-69
      poor: number; // 0-49
    };
    insertionTypeDistribution: {
      endOfParagraph: number;
      naturalBreak: number;
    };
  } {
    const points = analysisResult.insertionPoints;
    const totalScore = points.reduce((sum, point) => sum + point.insertionScore, 0);

    const scoreDistribution = {
      excellent: points.filter(p => p.insertionScore >= 90).length,
      good: points.filter(p => p.insertionScore >= 70 && p.insertionScore < 90).length,
      moderate: points.filter(p => p.insertionScore >= 50 && p.insertionScore < 70).length,
      poor: points.filter(p => p.insertionScore < 50).length
    };

    const insertionTypeDistribution = {
      endOfParagraph: points.filter(p => p.insertionType === 'end_of_paragraph').length,
      naturalBreak: points.filter(p => p.insertionType === 'natural_break').length
    };

    return {
      totalOpportunities: points.length,
      highQualityOpportunities: points.filter(p => p.insertionScore >= 70).length,
      recommendedInsertions: analysisResult.recommendedInsertions.length,
      averageScore: points.length > 0 ? totalScore / points.length : 0,
      scoreDistribution,
      insertionTypeDistribution
    };
  }
}

export default SmartInsertionPointDetector;
