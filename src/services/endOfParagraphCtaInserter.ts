import SmartInsertionPointDetector, { InsertionPoint, InsertionPointAnalysisResult } from './smartInsertionPointDetector';
import ContentSemanticAnalyzer, { ContentSemanticAnalysisResult, SemanticChunk } from './contentSemanticAnalyzer';
import ContentSolutionMatcher, { ContentSolutionMatch } from './contentSolutionMatcher';
import ContextualCtaComposer, { ContextualCTA, CtaCompositionRequest, CtaCompositionResult } from './contextualCtaComposer';

/**
 * Enhanced Content represents content with contextual CTAs inserted
 * Why this matters: Provides structured output showing original content enhanced with contextual CTAs
 */
export interface EnhancedContent {
  originalContent: string;
  enhancedContent: string;
  insertedCtas: InsertedCTA[];
  totalInsertions: number;
  processingTimeMs: number;
  enhancementTimestamp: string;
  metadata: {
    originalParagraphs: number;
    enhancedParagraphs: number;
    ctaDensity: number; // CTAs per 100 paragraphs
    averageCtaConfidence: number;
    insertionStrategy: string;
  };
}

/**
 * Inserted CTA represents a CTA that was successfully inserted into content
 * Why this matters: Tracks where and how CTAs were inserted for analytics and optimization
 */
export interface InsertedCTA {
  ctaId: string;
  insertionPoint: InsertionPoint;
  contextualCta: ContextualCTA;
  originalParagraph: string;
  enhancedParagraph: string;
  insertionPosition: 'end_of_paragraph';
  insertionSuccess: boolean;
  insertionReason: string;
}

/**
 * CTA Insertion Request
 * Why this matters: Structured input for the insertion process with content and campaign context
 */
export interface CtaInsertionRequest {
  content: string;
  contentFormat: 'html' | 'markdown' | 'text';
  targetKeyword: string;
  campaignType: 'blog_creator' | 'competitor_conquesting';
  competitorName?: string;
  maxCtasPerArticle?: number;
  minCtaSpacing?: number; // Minimum paragraphs between CTAs
  ctaConfidenceThreshold?: number; // Minimum confidence score for CTA insertion
  insertionStrategy?: 'conservative' | 'moderate' | 'aggressive';
}

/**
 * End-of-Paragraph CTA Insertion Engine
 * Why this matters: Intelligently inserts contextual CTAs at the end of relevant paragraphs
 * while maintaining natural content flow and readability.
 */
class EndOfParagraphCtaInserter {
  private semanticAnalyzer: ContentSemanticAnalyzer;
  private solutionMatcher: ContentSolutionMatcher;
  private insertionDetector: SmartInsertionPointDetector;
  private ctaComposer: ContextualCtaComposer;

  constructor(skipApiKey: boolean = false) {
    this.semanticAnalyzer = new ContentSemanticAnalyzer(skipApiKey);
    this.solutionMatcher = new ContentSolutionMatcher(skipApiKey);
    this.insertionDetector = new SmartInsertionPointDetector(skipApiKey);
    this.ctaComposer = new ContextualCtaComposer(skipApiKey);
    
    console.log('✅ End-of-Paragraph CTA Inserter initialized');
  }

  /**
   * Insert contextual CTAs into content at optimal paragraph endings
   * Why this matters: This is the main function that transforms regular content into
   * engagement-driving content with contextual CTAs.
   */
  async insertContextualCTAs(request: CtaInsertionRequest): Promise<EnhancedContent> {
    const startTime = Date.now();
    
    try {
      console.log(`🎯 Starting contextual CTA insertion for ${request.contentFormat} content`);
      console.log(`📊 Target keyword: "${request.targetKeyword}", Campaign: ${request.campaignType}`);

      // Step 1: Analyze content semantically
      console.log(`📝 Content preview (first 200 chars): ${request.content.substring(0, 200)}...`);
      const articleContent = this.prepareArticleContent(request.content, request.contentFormat);
      console.log(`📄 Prepared article content:`, {
        title: articleContent.title,
        contentLength: articleContent.content?.length || 0,
        rawHtmlLength: articleContent.rawHtml?.length || 0,
        hasRawHtml: !!articleContent.rawHtml,
        contentPreview: articleContent.content?.substring(0, 200) + '...',
        rawHtmlPreview: articleContent.rawHtml?.substring(0, 200) + '...'
      });
      
      const semanticAnalysis = await this.semanticAnalyzer.analyzeContentSemantics(articleContent);
      console.log(`🧠 Semantic analysis: ${semanticAnalysis.chunks.length} chunks, ${semanticAnalysis.ctaCandidateChunks.length} CTA candidates`);
      console.log(`🧠 CTA candidate chunks:`, semanticAnalysis.ctaCandidateChunks.map(chunk => ({
        content: chunk.content.substring(0, 100) + '...',
        confidenceScore: chunk.confidenceScore,
        painPoints: chunk.painPoints,
        themes: chunk.themes
      })));

      // Step 2: Find insertion points
      const insertionAnalysis = await this.insertionDetector.analyzeInsertionPoints(
        semanticAnalysis.chunks,
        articleContent.url || `article-${Date.now()}`
      );
      console.log(`📍 Insertion analysis: ${insertionAnalysis.recommendedInsertions.length} recommended insertion points`);

      // Step 3: Match content to Apollo solutions
      // For now, we'll use a simplified approach and create mock solution matches
      // In production, this would integrate with the full Apollo Solutions Database
      const solutionMatches = this.createMockSolutionMatches(semanticAnalysis.chunks, request.targetKeyword);
      console.log(`🎯 Solution matching: ${solutionMatches.length} solution matches found`);

      // Step 4: Generate contextual CTAs for recommended insertion points
      console.log(`🎯 Step 4: Generating CTAs for ${insertionAnalysis.recommendedInsertions.length} insertion points...`);
      const ctaInsertions = await this.generateCtasForInsertionPoints(
        insertionAnalysis.recommendedInsertions,
        solutionMatches,
        request
      );
      console.log(`🎨 CTA generation: ${ctaInsertions.length} CTAs generated`);
      ctaInsertions.forEach((insertion, index) => {
        console.log(`   CTA ${index + 1}: "${insertion.contextualCta.fullCta}" (confidence: ${insertion.contextualCta.confidence}%)`);
      });

      // Step 5: Insert CTAs into content
      const enhancedContent = this.insertCtasIntoContent(
        request.content,
        request.contentFormat,
        ctaInsertions,
        semanticAnalysis.chunks
      );

      const processingTime = Date.now() - startTime;

      const result: EnhancedContent = {
        originalContent: request.content,
        enhancedContent: enhancedContent.content,
        insertedCtas: ctaInsertions,
        totalInsertions: ctaInsertions.length,
        processingTimeMs: processingTime,
        enhancementTimestamp: new Date().toISOString(),
        metadata: {
          originalParagraphs: semanticAnalysis.chunks.length,
          enhancedParagraphs: semanticAnalysis.chunks.length, // Same number, just enhanced
          ctaDensity: Math.round((ctaInsertions.length / semanticAnalysis.chunks.length) * 100),
          averageCtaConfidence: ctaInsertions.length > 0 
            ? ctaInsertions.reduce((sum, cta) => sum + cta.contextualCta.confidence, 0) / ctaInsertions.length 
            : 0,
          insertionStrategy: request.insertionStrategy || 'moderate'
        }
      };

      console.log(`✅ CTA insertion completed in ${processingTime}ms`);
      console.log(`📈 Results: ${result.totalInsertions} CTAs inserted, ${result.metadata.ctaDensity}% density`);

      return result;

    } catch (error) {
      console.error('❌ CTA insertion failed:', error);
      throw new Error(`CTA insertion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Prepare article content for semantic analysis
   * Why this matters: Converts different content formats into a standardized structure for analysis.
   */
  private prepareArticleContent(content: string, format: 'html' | 'markdown' | 'text'): any {
    const wordCount = content.split(/\s+/).length;
    
    // CRITICAL FIX: Don't strip HTML tags for semantic analysis
    // Why this matters: The semantic analyzer needs HTML structure to identify paragraphs and insertion points
    let processedContent = content;
    if (format === 'html') {
      // Keep HTML structure but clean up formatting for better analysis
      processedContent = content
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')   // Remove styles
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .trim();
    }
    
    return {
      url: `${format}-content-${Date.now()}`,
      title: 'Content for CTA Enhancement',
      content: processedContent, // Use processed content that preserves HTML structure
      wordCount,
      extractedAt: new Date().toISOString(),
      metadata: {
        description: `${format} content for contextual CTA insertion`,
        author: 'CTA Insertion Engine',
        publishDate: new Date().toISOString(),
        tags: ['contextual-cta', format]
      },
      rawHtml: format === 'html' ? content : undefined,
      rawMarkdown: format === 'markdown' ? content : undefined
    };
  }

  /**
   * Strip HTML tags for text analysis
   * Why this matters: Provides clean text for semantic analysis while preserving structure.
   */
  private stripHtmlTags(html: string): string {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Generate CTAs for recommended insertion points
   * Why this matters: Creates contextual CTAs specifically for the identified insertion opportunities.
   */
  private async generateCtasForInsertionPoints(
    insertionPoints: InsertionPoint[],
    solutionMatches: ContentSolutionMatch[],
    request: CtaInsertionRequest
  ): Promise<InsertedCTA[]> {
    const insertedCtas: InsertedCTA[] = [];
    const maxCtas = request.maxCtasPerArticle || 3;
    const confidenceThreshold = request.ctaConfidenceThreshold || 60;

    // Sort insertion points by score (highest first)
    const sortedInsertionPoints = insertionPoints
      .filter(point => point.insertionScore >= confidenceThreshold)
      .slice(0, maxCtas);

    for (const insertionPoint of sortedInsertionPoints) {
      try {
        // Find best solution match for this insertion point
        const bestMatch = this.findBestSolutionMatch(insertionPoint, solutionMatches);
        
        if (!bestMatch) {
          console.log(`⚠️ No solution match found for insertion point ${insertionPoint.chunkId}`);
          continue;
        }

        // Generate CTA for this insertion point
        const ctaRequest: CtaCompositionRequest = {
          match: bestMatch,
          targetKeyword: request.targetKeyword,
          campaignType: request.campaignType,
          competitorName: request.competitorName,
          preferredAnchorStyle: 'benefit_focused',
          maxAnchorLength: 80
        };

        const ctaResult = await this.ctaComposer.composeContextualCTA(ctaRequest);
        const bestCta = this.ctaComposer.getBestCTA(ctaResult);

        // Create inserted CTA record
        const insertedCta: InsertedCTA = {
          ctaId: bestCta.id,
          insertionPoint,
          contextualCta: bestCta,
          originalParagraph: insertionPoint.paragraphContent,
          enhancedParagraph: this.createEnhancedParagraph(insertionPoint.paragraphContent, bestCta, request.contentFormat),
          insertionPosition: 'end_of_paragraph',
          insertionSuccess: true,
          insertionReason: `High-quality insertion (${insertionPoint.insertionScore}/100) with relevant solution match`
        };

        insertedCtas.push(insertedCta);
        console.log(`✅ Generated CTA for chunk ${insertionPoint.chunkId}: "${bestCta.anchorText}"`);

      } catch (error) {
        console.error(`❌ Failed to generate CTA for insertion point ${insertionPoint.chunkId}:`, error);
        continue;
      }
    }

    return insertedCtas;
  }

  /**
   * Find best solution match for an insertion point
   * Why this matters: Matches insertion opportunities with the most relevant Apollo solutions.
   */
  private findBestSolutionMatch(
    insertionPoint: InsertionPoint,
    solutionMatches: ContentSolutionMatch[]
  ): ContentSolutionMatch | null {
    // Find matches for the same chunk
    const chunkMatches = solutionMatches.filter(match => match.chunkId === insertionPoint.chunkId);
    
    if (chunkMatches.length === 0) {
      // Fallback to highest confidence match from any chunk
      return solutionMatches.length > 0 
        ? solutionMatches.reduce((best, current) => 
            current.confidenceScore > best.confidenceScore ? current : best
          )
        : null;
    }

    // Return highest confidence match for this chunk
    return chunkMatches.reduce((best, current) => 
      current.confidenceScore > best.confidenceScore ? current : best
    );
  }

  /**
   * Create enhanced paragraph with CTA appended
   * Why this matters: Naturally appends CTAs to paragraph endings while maintaining flow.
   */
  private createEnhancedParagraph(originalParagraph: string, cta: ContextualCTA, format: 'html' | 'markdown' | 'text' = 'html'): string {
    // Ensure paragraph ends with proper punctuation
    let paragraph = originalParagraph.trim();
    if (!paragraph.match(/[.!?]$/)) {
      paragraph += '.';
    }

    // Convert CTA to appropriate format
    let ctaText = cta.fullCta;
    if (format === 'html') {
      // Convert Markdown link to HTML link
      ctaText = this.convertMarkdownLinkToHtml(cta.fullCta);
    }

    // Append CTA with natural spacing
    return `${paragraph} ${ctaText}`;
  }

  /**
   * Convert Markdown link to HTML link
   * Why this matters: Ensures CTAs are properly formatted as clickable links in HTML content
   */
  private convertMarkdownLinkToHtml(markdownLink: string): string {
    // Match Markdown link pattern: [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    return markdownLink.replace(linkRegex, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  /**
   * Insert CTAs into the original content
   * Why this matters: Replaces original paragraphs with enhanced versions containing CTAs.
   */
  private insertCtasIntoContent(
    originalContent: string,
    format: 'html' | 'markdown' | 'text',
    insertedCtas: InsertedCTA[],
    chunks: SemanticChunk[]
  ): { content: string; insertionCount: number } {
    if (insertedCtas.length === 0) {
      return { content: originalContent, insertionCount: 0 };
    }

    let enhancedContent = originalContent;
    let insertionCount = 0;

    // Sort CTAs by chunk position (reverse order to avoid position shifts)
    const sortedCtas = insertedCtas.sort((a, b) => b.insertionPoint.position - a.insertionPoint.position);

    for (const insertedCta of sortedCtas) {
      try {
        // Find and replace the original paragraph with enhanced version
        const originalParagraph = insertedCta.originalParagraph;
        const enhancedParagraph = insertedCta.enhancedParagraph;

        if (format === 'html') {
          enhancedContent = this.replaceHtmlParagraph(enhancedContent, originalParagraph, enhancedParagraph);
        } else if (format === 'markdown') {
          enhancedContent = this.replaceMarkdownParagraph(enhancedContent, originalParagraph, enhancedParagraph);
        } else {
          enhancedContent = this.replaceTextParagraph(enhancedContent, originalParagraph, enhancedParagraph);
        }

        insertionCount++;
        console.log(`✅ Inserted CTA into paragraph at position ${insertedCta.insertionPoint.position}`);

      } catch (error) {
        console.error(`❌ Failed to insert CTA for chunk ${insertedCta.insertionPoint.chunkId}:`, error);
      }
    }

    return { content: enhancedContent, insertionCount };
  }

  /**
   * Replace paragraph in HTML content
   * Why this matters: Maintains HTML structure while enhancing paragraph content.
   */
  private replaceHtmlParagraph(content: string, original: string, enhanced: string): string {
    // Find the paragraph tag containing the original text
    const paragraphRegex = new RegExp(`<p[^>]*>([^<]*${this.escapeRegex(original.substring(0, 50))}[^<]*)</p>`, 'i');
    const match = content.match(paragraphRegex);
    
    if (match) {
      const fullParagraphTag = match[0];
      const paragraphContent = match[1];
      
      // Replace the content within the paragraph tag
      const enhancedParagraphTag = fullParagraphTag.replace(paragraphContent, enhanced);
      return content.replace(fullParagraphTag, enhancedParagraphTag);
    }

    // Fallback: simple text replacement
    return content.replace(original, enhanced);
  }

  /**
   * Replace paragraph in Markdown content
   * Why this matters: Maintains Markdown formatting while enhancing paragraph content.
   */
  private replaceMarkdownParagraph(content: string, original: string, enhanced: string): string {
    // In markdown, paragraphs are separated by double newlines
    return content.replace(original, enhanced);
  }

  /**
   * Replace paragraph in plain text content
   * Why this matters: Simple text replacement for plain text content.
   */
  private replaceTextParagraph(content: string, original: string, enhanced: string): string {
    return content.replace(original, enhanced);
  }

  /**
   * Create mock solution matches for testing
   * Why this matters: Provides test data for CTA generation without requiring full Apollo Solutions Database.
   */
  private createMockSolutionMatches(chunks: SemanticChunk[], targetKeyword: string): ContentSolutionMatch[] {
    const mockSolutions = [
      {
        id: 'apollo-data-enrichment',
        title: 'Apollo Data Enrichment',
        description: 'Keep your data up-to-date with 270M+ verified contacts',
        url: '/data-enrichment',
        category: 'data_quality_enrichment' as const,
        painPointKeywords: ['inaccurate data', 'bounced emails', 'dirty data', 'data quality'],
        solutionKeywords: ['data enrichment', 'contact verification', 'data cleansing'],
        contextClues: ['contact database', 'email verification', 'data accuracy'],
        priority: 9,
        source: 'brand_kit' as const
      },
      {
        id: 'apollo-sales-engagement',
        title: 'Apollo Sales Engagement',
        description: 'Automate your outreach with intelligent sequences',
        url: '/sales-engagement',
        category: 'sales_engagement' as const,
        painPointKeywords: ['manual outreach', 'low response rates', 'time consuming', 'outreach'],
        solutionKeywords: ['sales engagement', 'email sequences', 'automation'],
        contextClues: ['email campaigns', 'outreach automation', 'sequence'],
        priority: 8,
        source: 'brand_kit' as const
      },
      {
        id: 'apollo-prospecting',
        title: 'Apollo Prospecting',
        description: 'Find and connect with your ideal prospects',
        url: '/prospecting',
        category: 'sales_prospecting' as const,
        painPointKeywords: ['finding prospects', 'lead generation', 'targeting', 'prospecting'],
        solutionKeywords: ['prospecting', 'lead generation', 'target prospects'],
        contextClues: ['prospect search', 'lead discovery', 'targeting'],
        priority: 8,
        source: 'brand_kit' as const
      }
    ];

    const matches: ContentSolutionMatch[] = [];

    chunks.forEach(chunk => {
      if (!chunk.isCtaCandidate) return;

      // Find relevant solutions for this chunk
      const relevantSolutions = mockSolutions.filter(solution => {
        const chunkText = chunk.content.toLowerCase();
        return solution.painPointKeywords.some(painPoint => 
          chunkText.includes(painPoint.toLowerCase())
        ) || solution.solutionKeywords.some(keyword => 
          chunkText.includes(keyword.toLowerCase())
        );
      });

      relevantSolutions.forEach(solution => {
        const match: ContentSolutionMatch = {
          chunkId: chunk.id,
          chunk: chunk,
          matchedSolution: solution,
          confidenceScore: Math.min(95, chunk.confidenceScore + Math.random() * 10),
          matchReasons: [`Content discusses ${solution.painPointKeywords[0]} which aligns with ${solution.title}`],
          semanticSimilarity: Math.random() * 30 + 70, // 70-100
          keywordMatches: solution.solutionKeywords.filter(keyword => 
            chunk.content.toLowerCase().includes(keyword.toLowerCase())
          ),
          contextRelevance: Math.random() * 20 + 80, // 80-100
          apolloUrl: `https://www.apollo.io${solution.url}`
        };

        matches.push(match);
      });
    });

    return matches.sort((a, b) => b.confidenceScore - a.confidenceScore);
  }

  /**
   * Escape special regex characters
   * Why this matters: Prevents regex errors when searching for paragraph content.
   */
  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get insertion statistics
   * Why this matters: Provides insights into CTA insertion performance and quality.
   */
  getInsertionStatistics(enhancedContent: EnhancedContent): {
    totalInsertions: number;
    successRate: number;
    averageConfidence: number;
    ctaDensity: number;
    insertionsByReason: Record<string, number>;
    confidenceDistribution: {
      high: number; // 80-100
      medium: number; // 60-79
      low: number; // <60
    };
  } {
    const insertions = enhancedContent.insertedCtas;
    const successful = insertions.filter(cta => cta.insertionSuccess);
    
    const insertionsByReason: Record<string, number> = {};
    insertions.forEach(cta => {
      const reason = cta.insertionReason;
      insertionsByReason[reason] = (insertionsByReason[reason] || 0) + 1;
    });

    const confidenceDistribution = {
      high: insertions.filter(cta => cta.contextualCta.confidence >= 80).length,
      medium: insertions.filter(cta => cta.contextualCta.confidence >= 60 && cta.contextualCta.confidence < 80).length,
      low: insertions.filter(cta => cta.contextualCta.confidence < 60).length
    };

    return {
      totalInsertions: insertions.length,
      successRate: insertions.length > 0 ? (successful.length / insertions.length) * 100 : 0,
      averageConfidence: enhancedContent.metadata.averageCtaConfidence,
      ctaDensity: enhancedContent.metadata.ctaDensity,
      insertionsByReason,
      confidenceDistribution
    };
  }

  /**
   * Preview CTA insertions without modifying content
   * Why this matters: Allows users to preview where CTAs would be inserted before applying changes.
   */
  async previewCtaInsertions(request: CtaInsertionRequest): Promise<{
    insertionPoints: InsertionPoint[];
    potentialCtas: number;
    previewParagraphs: Array<{
      original: string;
      enhanced: string;
      ctaPreview: string;
      confidence: number;
    }>;
  }> {
    // Run analysis without actually inserting CTAs
    const articleContent = this.prepareArticleContent(request.content, request.contentFormat);
    const semanticAnalysis = await this.semanticAnalyzer.analyzeContentSemantics(articleContent);
    const insertionAnalysis = await this.insertionDetector.analyzeInsertionPoints(semanticAnalysis.chunks);
    
    const previewParagraphs = insertionAnalysis.recommendedInsertions.slice(0, 3).map(point => ({
      original: point.paragraphContent,
      enhanced: `${point.paragraphContent} [Contextual CTA would be inserted here]`,
      ctaPreview: `Based on: ${point.painPointsIdentified.join(', ') || 'content analysis'}`,
      confidence: point.insertionScore
    }));

    return {
      insertionPoints: insertionAnalysis.recommendedInsertions,
      potentialCtas: Math.min(insertionAnalysis.recommendedInsertions.length, request.maxCtasPerArticle || 3),
      previewParagraphs
    };
  }
}

export default EndOfParagraphCtaInserter;
