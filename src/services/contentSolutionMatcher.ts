import OpenAI from 'openai';
import { SemanticChunk, ContentSemanticAnalysisResult } from './contentSemanticAnalyzer';
import { ApolloSolution, ApolloSolutionCategory } from './apolloSolutionsDatabase';

/**
 * Content-Solution Match represents a matched solution for a specific content chunk
 * Why this matters: Provides structured matching results with confidence scoring for contextual CTA generation
 */
export interface ContentSolutionMatch {
  chunkId: string;
  chunk: SemanticChunk;
  matchedSolution: ApolloSolution;
  confidenceScore: number; // 0-100 confidence in the match
  matchReasons: string[]; // Specific reasons why this solution matches
  semanticSimilarity: number; // 0-100 semantic similarity score
  keywordMatches: string[]; // Keywords that triggered the match
  contextRelevance: number; // 0-100 relevance to surrounding content
  apolloUrl: string; // Specific Apollo URL for this solution
}

/**
 * Matching Strategy Configuration
 * Why this matters: Allows fine-tuning of matching behavior for different content types and use cases
 */
export interface MatchingConfig {
  minConfidenceThreshold: number; // Minimum confidence score to consider a match (default: 70)
  maxMatchesPerChunk: number; // Maximum solutions to match per chunk (default: 2)
  semanticWeight: number; // Weight for semantic similarity (0-1, default: 0.4)
  keywordWeight: number; // Weight for keyword matching (0-1, default: 0.3)
  contextWeight: number; // Weight for context relevance (0-1, default: 0.3)
  priorityBoost: number; // Boost factor for high-priority solutions (default: 1.2)
  categoryPreferences: ApolloSolutionCategory[]; // Preferred solution categories
}

/**
 * Content-Solution Matching Result
 * Why this matters: Comprehensive matching results for all content chunks with metadata for optimization
 */
export interface ContentSolutionMatchingResult {
  articleId: string;
  totalChunks: number;
  totalMatches: number;
  matches: ContentSolutionMatch[];
  unmatchedChunks: SemanticChunk[];
  averageConfidence: number;
  topSolutions: ApolloSolution[];
  processingTimeMs: number;
  matchingTimestamp: string;
}

/**
 * Content-Solution Matching Engine
 * Why this matters: Intelligently matches content themes to specific Apollo solutions using semantic similarity,
 * keyword matching, and context analysis for contextual CTA generation.
 */
class ContentSolutionMatcher {
  private client: OpenAI | null;
  private defaultConfig: MatchingConfig;

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
    
    // Default matching configuration
    this.defaultConfig = {
      minConfidenceThreshold: 70,
      maxMatchesPerChunk: 2,
      semanticWeight: 0.4,
      keywordWeight: 0.3,
      contextWeight: 0.3,
      priorityBoost: 1.2,
      categoryPreferences: ['data_quality_enrichment', 'sales_prospecting', 'sales_engagement']
    };

    console.log('✅ Content-Solution Matcher initialized');
  }

  /**
   * Match content chunks to relevant Apollo solutions with sitemap intelligence
   * Why this matters: This is the core function that creates intelligent matches between content
   * and Apollo solutions, enabling contextual CTA generation with specific Apollo URLs.
   */
  async matchContentToSolutions(
    contentAnalysis: ContentSemanticAnalysisResult,
    apolloSolutions: ApolloSolution[],
    config?: Partial<MatchingConfig>
  ): Promise<ContentSolutionMatchingResult> {
    const startTime = Date.now();
    const matchingConfig = { ...this.defaultConfig, ...config };
    
    try {
      console.log(`🎯 Starting content-solution matching for: ${contentAnalysis.articleId}`);
      console.log(`📊 Input: ${contentAnalysis.ctaCandidateChunks.length} CTA candidate chunks, ${apolloSolutions.length} Apollo solutions`);

      // Step 1: Filter and prepare solutions for matching
      const relevantSolutions = this.filterRelevantSolutions(apolloSolutions, matchingConfig);
      console.log(`🔍 Filtered to ${relevantSolutions.length} relevant solutions`);

      // Step 2: Perform semantic matching for each CTA candidate chunk
      const matches: ContentSolutionMatch[] = [];
      const unmatchedChunks: SemanticChunk[] = [];

      for (const chunk of contentAnalysis.ctaCandidateChunks) {
        console.log(`🧠 Matching chunk ${chunk.id}: "${chunk.content.substring(0, 100)}..."`);
        
        const chunkMatches = await this.matchChunkToSolutions(chunk, relevantSolutions, matchingConfig);
        
        if (chunkMatches.length > 0) {
          matches.push(...chunkMatches);
          console.log(`✅ Found ${chunkMatches.length} matches for chunk ${chunk.id} (confidence: ${chunkMatches[0].confidenceScore})`);
        } else {
          unmatchedChunks.push(chunk);
          console.log(`❌ No matches found for chunk ${chunk.id}`);
        }

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Step 3: Calculate result metadata
      const averageConfidence = matches.length > 0 
        ? matches.reduce((sum, match) => sum + match.confidenceScore, 0) / matches.length 
        : 0;

      const topSolutions = this.extractTopSolutions(matches);
      const processingTime = Date.now() - startTime;

      const result: ContentSolutionMatchingResult = {
        articleId: contentAnalysis.articleId,
        totalChunks: contentAnalysis.ctaCandidateChunks.length,
        totalMatches: matches.length,
        matches: matches.sort((a, b) => b.confidenceScore - a.confidenceScore), // Sort by confidence
        unmatchedChunks,
        averageConfidence,
        topSolutions,
        processingTimeMs: processingTime,
        matchingTimestamp: new Date().toISOString()
      };

      console.log(`✅ Content-solution matching completed in ${processingTime}ms`);
      console.log(`📊 Results: ${matches.length} matches, ${unmatchedChunks.length} unmatched, avg confidence: ${averageConfidence.toFixed(1)}`);

      return result;

    } catch (error) {
      console.error('❌ Content-solution matching failed:', error);
      throw new Error(`Content-solution matching failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Filter solutions relevant to content analysis
   * Why this matters: Pre-filters solutions to focus matching on the most relevant Apollo solutions
   * based on overall content themes and category preferences.
   */
  private filterRelevantSolutions(solutions: ApolloSolution[], config: MatchingConfig): ApolloSolution[] {
    return solutions
      .filter(solution => {
        // Filter by priority (minimum priority of 6)
        if (solution.priority < 6) return false;
        
        // Prefer solutions in preferred categories
        if (config.categoryPreferences.length > 0) {
          return config.categoryPreferences.includes(solution.category);
        }
        
        return true;
      })
      .sort((a, b) => {
        // Sort by priority and category preference
        let scoreA = a.priority;
        let scoreB = b.priority;
        
        if (config.categoryPreferences.includes(a.category)) scoreA += 2;
        if (config.categoryPreferences.includes(b.category)) scoreB += 2;
        
        return scoreB - scoreA;
      });
  }

  /**
   * Match individual chunk to Apollo solutions
   * Why this matters: Performs detailed matching analysis for a single content chunk,
   * using multiple scoring methods to find the most relevant Apollo solutions.
   */
  private async matchChunkToSolutions(
    chunk: SemanticChunk,
    solutions: ApolloSolution[],
    config: MatchingConfig
  ): Promise<ContentSolutionMatch[]> {
    const matches: ContentSolutionMatch[] = [];

    // Step 1: Calculate semantic similarity scores for all solutions
    const semanticScores = await this.calculateSemanticSimilarity(chunk, solutions);

    // Step 2: Calculate keyword match scores
    const keywordScores = this.calculateKeywordMatches(chunk, solutions);

    // Step 3: Calculate context relevance scores
    const contextScores = this.calculateContextRelevance(chunk, solutions);

    // Step 4: Combine scores and create matches
    for (let i = 0; i < solutions.length; i++) {
      const solution = solutions[i];
      const semanticScore = semanticScores[i] || 0;
      const keywordScore = keywordScores[i] || 0;
      const contextScore = contextScores[i] || 0;

      // Calculate weighted confidence score
      const baseConfidence = (
        semanticScore * config.semanticWeight +
        keywordScore * config.keywordWeight +
        contextScore * config.contextWeight
      );

      // Apply priority boost for high-priority solutions
      const priorityMultiplier = solution.priority >= 9 ? config.priorityBoost : 1.0;
      const confidenceScore = Math.min(baseConfidence * priorityMultiplier, 100);

      // Only include matches above threshold
      if (confidenceScore >= config.minConfidenceThreshold) {
        const match: ContentSolutionMatch = {
          chunkId: chunk.id,
          chunk,
          matchedSolution: solution,
          confidenceScore: Math.round(confidenceScore),
          matchReasons: this.generateMatchReasons(chunk, solution, semanticScore, keywordScore, contextScore),
          semanticSimilarity: Math.round(semanticScore),
          keywordMatches: this.extractKeywordMatches(chunk, solution),
          contextRelevance: Math.round(contextScore),
          apolloUrl: solution.url
        };

        matches.push(match);
      }
    }

    // Return top matches for this chunk
    return matches
      .sort((a, b) => b.confidenceScore - a.confidenceScore)
      .slice(0, config.maxMatchesPerChunk);
  }

  /**
   * Calculate semantic similarity between chunk and solutions using AI
   * Why this matters: Uses AI to understand deep semantic relationships between content
   * and Apollo solutions beyond simple keyword matching.
   */
  private async calculateSemanticSimilarity(chunk: SemanticChunk, solutions: ApolloSolution[]): Promise<number[]> {
    try {
      // If no client available, return keyword-based similarity scores
      if (!this.client) {
        return this.calculateKeywordBasedSimilarity(chunk, solutions);
      }

      const similarityPrompt = this.buildSemanticSimilarityPrompt(chunk, solutions);

      const completion = await this.client.responses.create({
        model: "gpt-5-nano",
        input: similarityPrompt
      });

      const responseContent = completion.output_text;
      if (!responseContent) {
        throw new Error('Empty response from OpenAI');
      }

      return this.parseSemanticSimilarityResponse(responseContent, solutions.length);

    } catch (error) {
      console.error(`❌ Failed to calculate semantic similarity for chunk ${chunk.id}:`, error);
      // Return default scores on error
      return solutions.map(() => 50); // Default moderate similarity
    }
  }

  /**
   * Build semantic similarity analysis prompt
   * Why this matters: Creates focused prompts that guide AI to evaluate semantic relationships
   * between content and Apollo solutions.
   */
  private buildSemanticSimilarityPrompt(chunk: SemanticChunk, solutions: ApolloSolution[]): string {
    const solutionsList = solutions.map((solution, index) => 
      `${index + 1}. ${solution.title}: ${solution.description}`
    ).join('\n');

    return `You are an expert content analyst specializing in semantic similarity analysis for B2B sales and marketing content. Analyze the semantic similarity between the following content chunk and Apollo solutions.

CONTENT CHUNK TO ANALYZE:
"${chunk.content}"

CHUNK CONTEXT:
- Themes: ${chunk.themes.join(', ')}
- Pain Points: ${chunk.painPoints.join(', ')}
- Solution Opportunities: ${chunk.solutionOpportunities.join(', ')}

APOLLO SOLUTIONS:
${solutionsList}

ANALYSIS REQUIREMENTS:
Rate the semantic similarity between the content chunk and each Apollo solution on a scale of 0-100:
- 90-100: Perfect semantic match (content directly discusses this solution's problem/benefit)
- 70-89: Strong semantic match (content themes strongly align with solution)
- 50-69: Moderate semantic match (some thematic overlap)
- 30-49: Weak semantic match (minimal thematic connection)
- 0-29: No semantic match (unrelated content)

Consider:
1. How well the content's pain points align with the solution's purpose
2. Whether the content context suggests need for this solution
3. Semantic relationships beyond exact keyword matches
4. Natural flow from content problem to solution

CRITICAL: Respond with ONLY a JSON array of similarity scores in order:
[85, 72, 45, 90, 23, 67, ...]`;
  }

  /**
   * Calculate keyword-based similarity when AI is not available
   * Why this matters: Provides fallback similarity scoring using keyword matching for testing
   */
  private calculateKeywordBasedSimilarity(chunk: SemanticChunk, solutions: ApolloSolution[]): number[] {
    const chunkText = `${chunk.content} ${chunk.themes.join(' ')} ${chunk.painPoints.join(' ')}`.toLowerCase();
    
    return solutions.map(solution => {
      let similarity = 0;
      let totalKeywords = 0;

      // Check pain point keywords
      solution.painPointKeywords.forEach(keyword => {
        totalKeywords++;
        if (chunkText.includes(keyword.toLowerCase())) {
          similarity += 30;
        }
      });

      // Check solution keywords
      solution.solutionKeywords.forEach(keyword => {
        totalKeywords++;
        if (chunkText.includes(keyword.toLowerCase())) {
          similarity += 20;
        }
      });

      // Check themes overlap
      chunk.themes.forEach(theme => {
        if (solution.category.includes(theme.toLowerCase().replace(/\s+/g, '_'))) {
          similarity += 25;
        }
      });

      // Normalize and add base similarity
      const normalizedSimilarity = totalKeywords > 0 ? (similarity / totalKeywords) * 2 : 0;
      return Math.min(100, Math.max(30, normalizedSimilarity + 40)); // Base 40 + normalized
    });
  }

  /**
   * Parse semantic similarity response from AI
   * Why this matters: Safely extracts similarity scores from AI response with error handling.
   */
  private parseSemanticSimilarityResponse(response: string, expectedLength: number): number[] {
    try {
      const cleanedResponse = response.trim();
      const jsonMatch = cleanedResponse.match(/\[[\d\s,]+\]/);
      
      if (!jsonMatch) {
        throw new Error('No JSON array found in response');
      }

      const scores = JSON.parse(jsonMatch[0]);
      
      if (!Array.isArray(scores) || scores.length !== expectedLength) {
        throw new Error(`Expected ${expectedLength} scores, got ${scores.length}`);
      }

      return scores.map(score => Math.max(0, Math.min(100, Number(score) || 0)));
    } catch (error) {
      console.error('Failed to parse semantic similarity response:', error);
      // Return default moderate scores
      return Array(expectedLength).fill(50);
    }
  }

  /**
   * Calculate keyword match scores between chunk and solutions
   * Why this matters: Provides keyword-based matching to complement semantic analysis
   * with exact term matching for pain points and solution keywords.
   */
  private calculateKeywordMatches(chunk: SemanticChunk, solutions: ApolloSolution[]): number[] {
    const chunkText = `${chunk.content} ${chunk.themes.join(' ')} ${chunk.painPoints.join(' ')} ${chunk.solutionOpportunities.join(' ')}`.toLowerCase();
    const chunkWords = new Set(chunkText.split(/\s+/));

    return solutions.map(solution => {
      let score = 0;
      let matches = 0;

      // Check pain point keywords (highest weight)
      solution.painPointKeywords.forEach(keyword => {
        const keywordWords = keyword.toLowerCase().split(/\s+/);
        if (keywordWords.every(word => chunkWords.has(word))) {
          score += 30;
          matches++;
        } else if (keywordWords.some(word => chunkWords.has(word))) {
          score += 15;
          matches++;
        }
      });

      // Check solution keywords (medium weight)
      solution.solutionKeywords.forEach(keyword => {
        const keywordWords = keyword.toLowerCase().split(/\s+/);
        if (keywordWords.every(word => chunkWords.has(word))) {
          score += 20;
          matches++;
        } else if (keywordWords.some(word => chunkWords.has(word))) {
          score += 10;
          matches++;
        }
      });

      // Check context clues (lower weight)
      solution.contextClues.forEach(clue => {
        const clueWords = clue.toLowerCase().split(/\s+/);
        if (clueWords.some(word => chunkWords.has(word))) {
          score += 5;
          matches++;
        }
      });

      // Normalize score based on number of potential matches
      const maxPossibleScore = (solution.painPointKeywords.length * 30) + 
                              (solution.solutionKeywords.length * 20) + 
                              (solution.contextClues.length * 5);
      
      return maxPossibleScore > 0 ? Math.min(100, (score / maxPossibleScore) * 100) : 0;
    });
  }

  /**
   * Calculate context relevance scores
   * Why this matters: Evaluates how well solutions fit the broader context of the content chunk
   * considering surrounding themes and article context.
   */
  private calculateContextRelevance(chunk: SemanticChunk, solutions: ApolloSolution[]): number[] {
    return solutions.map(solution => {
      let relevanceScore = 0;

      // Theme alignment (40% of context score)
      const themeAlignment = this.calculateThemeAlignment(chunk.themes, solution);
      relevanceScore += themeAlignment * 0.4;

      // Pain point alignment (35% of context score)
      const painPointAlignment = this.calculatePainPointAlignment(chunk.painPoints, solution);
      relevanceScore += painPointAlignment * 0.35;

      // Solution opportunity alignment (25% of context score)
      const opportunityAlignment = this.calculateOpportunityAlignment(chunk.solutionOpportunities, solution);
      relevanceScore += opportunityAlignment * 0.25;

      return Math.min(100, relevanceScore);
    });
  }

  /**
   * Calculate theme alignment between chunk and solution
   * Why this matters: Measures how well the solution's category aligns with content themes.
   */
  private calculateThemeAlignment(themes: string[], solution: ApolloSolution): number {
    const categoryKeywords = this.getCategoryKeywords(solution.category);
    const themeText = themes.join(' ').toLowerCase();
    
    let alignment = 0;
    categoryKeywords.forEach(keyword => {
      if (themeText.includes(keyword.toLowerCase())) {
        alignment += 25;
      }
    });

    return Math.min(100, alignment);
  }

  /**
   * Calculate pain point alignment
   * Why this matters: Measures how well the solution addresses the specific pain points mentioned in the chunk.
   */
  private calculatePainPointAlignment(painPoints: string[], solution: ApolloSolution): number {
    const painPointText = painPoints.join(' ').toLowerCase();
    let alignment = 0;

    solution.painPointKeywords.forEach(keyword => {
      if (painPointText.includes(keyword.toLowerCase())) {
        alignment += 20;
      }
    });

    return Math.min(100, alignment);
  }

  /**
   * Calculate solution opportunity alignment
   * Why this matters: Measures how well the solution matches the identified solution opportunities.
   */
  private calculateOpportunityAlignment(opportunities: string[], solution: ApolloSolution): number {
    const opportunityText = opportunities.join(' ').toLowerCase();
    let alignment = 0;

    solution.solutionKeywords.forEach(keyword => {
      if (opportunityText.includes(keyword.toLowerCase())) {
        alignment += 15;
      }
    });

    return Math.min(100, alignment);
  }

  /**
   * Get category-specific keywords
   * Why this matters: Provides category-specific keywords for theme alignment calculation.
   */
  private getCategoryKeywords(category: ApolloSolutionCategory): string[] {
    const categoryKeywords: Record<ApolloSolutionCategory, string[]> = {
      data_quality_enrichment: ['data', 'quality', 'enrichment', 'accuracy', 'verification', 'cleansing'],
      sales_prospecting: ['prospecting', 'leads', 'contacts', 'discovery', 'targeting', 'research'],
      sales_engagement: ['engagement', 'outreach', 'email', 'sequences', 'automation', 'communication'],
      pipeline_management: ['pipeline', 'deals', 'management', 'tracking', 'forecasting', 'process'],
      sales_intelligence: ['intelligence', 'insights', 'analytics', 'competitive', 'market', 'signals'],
      revenue_operations: ['revenue', 'operations', 'optimization', 'workflow', 'efficiency', 'performance'],
      call_assistant: ['calls', 'meetings', 'conversations', 'scheduling', 'recording', 'insights'],
      integrations: ['integration', 'api', 'connectivity', 'systems', 'workflow', 'automation'],
      general: ['sales', 'marketing', 'business', 'growth', 'efficiency', 'productivity']
    };

    return categoryKeywords[category] || [];
  }

  /**
   * Generate match reasons for transparency
   * Why this matters: Provides explainable AI results showing why specific solutions were matched.
   */
  private generateMatchReasons(
    chunk: SemanticChunk,
    solution: ApolloSolution,
    semanticScore: number,
    keywordScore: number,
    contextScore: number
  ): string[] {
    const reasons: string[] = [];

    if (semanticScore >= 80) {
      reasons.push(`Strong semantic similarity (${Math.round(semanticScore)}%) - content themes align well with solution purpose`);
    } else if (semanticScore >= 60) {
      reasons.push(`Moderate semantic similarity (${Math.round(semanticScore)}%) - some thematic overlap detected`);
    }

    if (keywordScore >= 70) {
      reasons.push(`High keyword relevance (${Math.round(keywordScore)}%) - multiple pain point/solution keywords match`);
    } else if (keywordScore >= 40) {
      reasons.push(`Moderate keyword relevance (${Math.round(keywordScore)}%) - some keyword matches found`);
    }

    if (contextScore >= 70) {
      reasons.push(`Strong contextual fit (${Math.round(contextScore)}%) - solution category aligns with content context`);
    }

    if (solution.priority >= 9) {
      reasons.push(`High-priority Apollo solution - core product offering`);
    }

    if (reasons.length === 0) {
      reasons.push(`Basic relevance match - solution may address content themes`);
    }

    return reasons;
  }

  /**
   * Extract specific keyword matches for transparency
   * Why this matters: Shows which specific keywords triggered the match for debugging and optimization.
   */
  private extractKeywordMatches(chunk: SemanticChunk, solution: ApolloSolution): string[] {
    const chunkText = `${chunk.content} ${chunk.themes.join(' ')} ${chunk.painPoints.join(' ')}`.toLowerCase();
    const matches: string[] = [];

    // Check pain point keywords
    solution.painPointKeywords.forEach(keyword => {
      if (chunkText.includes(keyword.toLowerCase())) {
        matches.push(`Pain Point: "${keyword}"`);
      }
    });

    // Check solution keywords
    solution.solutionKeywords.forEach(keyword => {
      if (chunkText.includes(keyword.toLowerCase())) {
        matches.push(`Solution: "${keyword}"`);
      }
    });

    return matches.slice(0, 5); // Limit to top 5 matches
  }

  /**
   * Extract top solutions from matches
   * Why this matters: Identifies the most frequently matched solutions for article-level insights.
   */
  private extractTopSolutions(matches: ContentSolutionMatch[]): ApolloSolution[] {
    const solutionCounts = new Map<string, { solution: ApolloSolution; count: number; totalConfidence: number }>();

    matches.forEach(match => {
      const existing = solutionCounts.get(match.matchedSolution.id);
      if (existing) {
        existing.count++;
        existing.totalConfidence += match.confidenceScore;
      } else {
        solutionCounts.set(match.matchedSolution.id, {
          solution: match.matchedSolution,
          count: 1,
          totalConfidence: match.confidenceScore
        });
      }
    });

    return Array.from(solutionCounts.values())
      .sort((a, b) => {
        // Sort by average confidence, then by count
        const avgConfidenceA = a.totalConfidence / a.count;
        const avgConfidenceB = b.totalConfidence / b.count;
        return avgConfidenceB - avgConfidenceA;
      })
      .slice(0, 5)
      .map(item => item.solution);
  }

  /**
   * Get matches for specific chunk
   * Why this matters: Allows retrieval of matches for a specific content chunk for CTA generation.
   */
  getMatchesForChunk(matches: ContentSolutionMatch[], chunkId: string): ContentSolutionMatch[] {
    return matches.filter(match => match.chunkId === chunkId);
  }

  /**
   * Get best match for chunk
   * Why this matters: Retrieves the highest-confidence match for a chunk for primary CTA generation.
   */
  getBestMatchForChunk(matches: ContentSolutionMatch[], chunkId: string): ContentSolutionMatch | null {
    const chunkMatches = this.getMatchesForChunk(matches, chunkId);
    return chunkMatches.length > 0 ? chunkMatches[0] : null;
  }
}

export default ContentSolutionMatcher;
