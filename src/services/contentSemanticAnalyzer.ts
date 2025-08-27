import OpenAI from 'openai';

/**
 * Semantic Chunk represents a paragraph or content section with its analysis
 * Why this matters: Provides structured data for each content chunk that can be matched to Apollo solutions
 */
export interface SemanticChunk {
  id: string;
  content: string;
  position: number; // Position in the article (0-based)
  wordCount: number;
  themes: string[]; // Main themes identified in this chunk
  painPoints: string[]; // Specific pain points mentioned
  solutionOpportunities: string[]; // Opportunities for Apollo solutions
  contextClues: string[]; // Context clues for solution matching
  confidenceScore: number; // 0-100 confidence in the analysis
  isCtaCandidate: boolean; // Whether this chunk is suitable for CTA insertion
}

/**
 * Content Semantic Analysis Result
 * Why this matters: Complete analysis of article content broken down by semantic chunks
 */
export interface ContentSemanticAnalysisResult {
  articleId: string;
  totalChunks: number;
  chunks: SemanticChunk[];
  overallThemes: string[];
  primaryPainPoints: string[];
  ctaCandidateChunks: SemanticChunk[];
  analysisTimestamp: string;
  processingTimeMs: number;
}

/**
 * Content Semantic Analyzer Service
 * Why this matters: Analyzes paragraph-level content to identify themes, pain points, and solution opportunities
 * for contextual CTA insertion. This is the foundation for intelligent CTA placement.
 */
class ContentSemanticAnalyzer {
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
    console.log('✅ Content Semantic Analyzer initialized');
  }

  /**
   * Analyze article content at paragraph level for contextual CTA opportunities
   * Why this matters: This is the core function that transforms article content into semantic chunks
   * that can be matched to specific Apollo solutions for contextual CTA insertion.
   */
  async analyzeContentSemantics(articleContent: any): Promise<ContentSemanticAnalysisResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🧠 Starting semantic analysis for: "${articleContent.title}" (${articleContent.wordCount} words)`);

      // Step 1: Parse content into semantic chunks
      const chunks = this.parseContentIntoChunks(articleContent);
      console.log(`📄 Parsed content into ${chunks.length} semantic chunks`);

      // Step 2: Analyze each chunk for themes and pain points
      const analyzedChunks = await this.analyzeChunks(chunks);
      console.log(`🔍 Analyzed ${analyzedChunks.length} chunks for themes and pain points`);

      // Step 3: Identify CTA candidate chunks
      const ctaCandidateChunks = this.identifyCtaCandidates(analyzedChunks);
      console.log(`🎯 Identified ${ctaCandidateChunks.length} CTA candidate chunks`);

      // Step 4: Extract overall themes and pain points
      const overallThemes = this.extractOverallThemes(analyzedChunks);
      const primaryPainPoints = this.extractPrimaryPainPoints(analyzedChunks);

      const processingTime = Date.now() - startTime;

      const result: ContentSemanticAnalysisResult = {
        articleId: articleContent.url || `article-${Date.now()}`,
        totalChunks: analyzedChunks.length,
        chunks: analyzedChunks,
        overallThemes,
        primaryPainPoints,
        ctaCandidateChunks,
        analysisTimestamp: new Date().toISOString(),
        processingTimeMs: processingTime
      };

      console.log(`✅ Semantic analysis completed in ${processingTime}ms`);
      console.log(`📊 Results: ${overallThemes.length} themes, ${primaryPainPoints.length} pain points, ${ctaCandidateChunks.length} CTA opportunities`);

      return result;

    } catch (error) {
      console.error('❌ Content semantic analysis failed:', error);
      throw new Error(`Semantic analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse content into semantic chunks (paragraphs)
   * Why this matters: Breaks down content into analyzable units while preserving context and structure.
   */
  private parseContentIntoChunks(articleContent: any): Omit<SemanticChunk, 'themes' | 'painPoints' | 'solutionOpportunities' | 'contextClues' | 'confidenceScore' | 'isCtaCandidate'>[] {
    let content = '';
    let inputMethod: 'html' | 'markdown' | 'text' = 'text';

    // Determine content source and format
    if (articleContent.rawHtml) {
      content = articleContent.rawHtml;
      inputMethod = 'html';
    } else if (articleContent.rawMarkdown) {
      content = articleContent.rawMarkdown;
      inputMethod = 'markdown';
    } else {
      content = articleContent.content || '';
      inputMethod = 'text';
    }

    // Parse content based on format
    let paragraphs: string[] = [];

    if (inputMethod === 'html') {
      // Extract text from HTML paragraphs
      paragraphs = this.parseHtmlIntoParagraphs(content);
    } else if (inputMethod === 'markdown') {
      // Parse markdown into paragraphs
      paragraphs = this.parseMarkdownIntoParagraphs(content);
    } else {
      // Parse plain text into paragraphs
      paragraphs = this.parseTextIntoParagraphs(content);
    }

    // Convert paragraphs to semantic chunks
    return paragraphs
      .filter(p => p.length > 50) // Filter out very short paragraphs
      .map((paragraph, index) => ({
        id: `chunk-${index}`,
        content: paragraph.trim(),
        position: index,
        wordCount: this.countWords(paragraph)
      }));
  }

  /**
   * Parse HTML content into paragraphs
   * Why this matters: Extracts meaningful paragraphs from HTML while preserving semantic structure.
   */
  private parseHtmlIntoParagraphs(html: string): string[] {
    // Remove HTML tags and extract paragraph content
    const paragraphs: string[] = [];
    
    // Extract content from paragraph tags
    const pTagMatches = html.match(/<p[^>]*>(.*?)<\/p>/gs);
    if (pTagMatches) {
      paragraphs.push(...pTagMatches.map(match => 
        match.replace(/<[^>]*>/g, '').trim()
      ));
    }

    // If no paragraph tags, split by double line breaks
    if (paragraphs.length === 0) {
      const cleanText = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
      paragraphs.push(...cleanText.split(/\n\s*\n/).map(p => p.trim()));
    }

    return paragraphs.filter(p => p.length > 0);
  }

  /**
   * Parse Markdown content into paragraphs
   * Why this matters: Handles markdown-specific formatting while extracting semantic paragraphs.
   */
  private parseMarkdownIntoParagraphs(markdown: string): string[] {
    return markdown
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0 && !p.match(/^#{1,6}\s/)) // Filter out headers
      .map(p => p.replace(/\*\*(.*?)\*\*/g, '$1')) // Remove bold formatting
      .map(p => p.replace(/\*(.*?)\*/g, '$1')) // Remove italic formatting
      .map(p => p.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')) // Convert links to text
      .filter(p => p.length > 0);
  }

  /**
   * Parse plain text into paragraphs
   * Why this matters: Handles plain text content with intelligent paragraph detection.
   */
  private parseTextIntoParagraphs(text: string): string[] {
    return text
      .split(/\n\s*\n|\r\n\s*\r\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }

  /**
   * Analyze chunks for themes, pain points, and solution opportunities
   * Why this matters: Uses AI to understand the semantic meaning of each content chunk
   * for intelligent solution matching.
   */
  private async analyzeChunks(chunks: Omit<SemanticChunk, 'themes' | 'painPoints' | 'solutionOpportunities' | 'contextClues' | 'confidenceScore' | 'isCtaCandidate'>[]): Promise<SemanticChunk[]> {
    const analyzedChunks: SemanticChunk[] = [];

    // Process chunks in batches to avoid rate limits
    const batchSize = 3;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(chunk => this.analyzeIndividualChunk(chunk))
      );
      analyzedChunks.push(...batchResults);

      // Small delay between batches
      if (i + batchSize < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return analyzedChunks;
  }

  /**
   * Analyze individual chunk for semantic content
   * Why this matters: Performs detailed AI analysis of each paragraph to identify
   * themes, pain points, and Apollo solution opportunities.
   */
  private async analyzeIndividualChunk(chunk: Omit<SemanticChunk, 'themes' | 'painPoints' | 'solutionOpportunities' | 'contextClues' | 'confidenceScore' | 'isCtaCandidate'>): Promise<SemanticChunk> {
    try {
      const analysisPrompt = this.buildChunkAnalysisPrompt(chunk.content);

      const completion = await this.client.responses.create({
        model: "gpt-5-nano",
        input: analysisPrompt
      });

      const responseContent = completion.output_text;
      if (!responseContent) {
        throw new Error('Empty response from OpenAI');
      }

      // Parse AI response
      const analysis = this.parseChunkAnalysisResponse(responseContent);

      return {
        ...chunk,
        themes: analysis.themes || [],
        painPoints: analysis.painPoints || [],
        solutionOpportunities: analysis.solutionOpportunities || [],
        contextClues: analysis.contextClues || [],
        confidenceScore: analysis.confidenceScore || 0,
        isCtaCandidate: analysis.isCtaCandidate || false
      };

    } catch (error) {
      console.error(`❌ Failed to analyze chunk ${chunk.id}:`, error);
      
      // Return chunk with empty analysis on error
      return {
        ...chunk,
        themes: [],
        painPoints: [],
        solutionOpportunities: [],
        contextClues: [],
        confidenceScore: 0,
        isCtaCandidate: false
      };
    }
  }

  /**
   * Build analysis prompt for individual chunk
   * Why this matters: Creates focused prompts that guide AI to identify specific elements
   * relevant to Apollo solution matching.
   */
  private buildChunkAnalysisPrompt(content: string): string {
    return `You are an expert content analyst specializing in B2B sales and marketing content analysis. Analyze the following paragraph for themes, pain points, and solution opportunities that could be addressed by Apollo (a sales intelligence and engagement platform).

APOLLO SOLUTION CATEGORIES:
- Data Quality & Enrichment (contact data, lead verification, data cleansing)
- Sales Prospecting (lead generation, contact discovery, audience targeting)
- Sales Engagement (email outreach, multichannel sequences, automation)
- Pipeline Management (deal tracking, sales process optimization)
- Sales Intelligence (market insights, competitive analysis, buyer signals)
- Revenue Operations (sales analytics, performance tracking, workflow automation)

CONTENT TO ANALYZE:
"${content}"

ANALYSIS REQUIREMENTS:
1. Identify 2-5 main themes in this paragraph
2. Extract specific pain points or challenges mentioned
3. Identify opportunities where Apollo solutions could help
4. Note context clues that indicate target audience or use case
5. Rate confidence in analysis (0-100)
6. Determine if this paragraph is suitable for CTA insertion (ends naturally, discusses problems/solutions)

CRITICAL: Respond with ONLY valid JSON in this exact format:
{
  "themes": ["theme1", "theme2"],
  "painPoints": ["pain1", "pain2"],
  "solutionOpportunities": ["opportunity1", "opportunity2"],
  "contextClues": ["clue1", "clue2"],
  "confidenceScore": 85,
  "isCtaCandidate": true
}`;
  }

  /**
   * Parse chunk analysis response from AI
   * Why this matters: Safely extracts structured data from AI response with error handling.
   */
  private parseChunkAnalysisResponse(response: string): any {
    try {
      // Clean response and extract JSON
      const cleanedResponse = response.trim();
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('Failed to parse chunk analysis response:', error);
      return {
        themes: [],
        painPoints: [],
        solutionOpportunities: [],
        contextClues: [],
        confidenceScore: 0,
        isCtaCandidate: false
      };
    }
  }

  /**
   * Identify chunks suitable for CTA insertion
   * Why this matters: Filters chunks to find the best candidates for contextual CTA placement
   * based on content analysis and natural flow.
   */
  private identifyCtaCandidates(chunks: SemanticChunk[]): SemanticChunk[] {
    return chunks
      .filter(chunk => {
        // Must be marked as CTA candidate by AI
        if (!chunk.isCtaCandidate) return false;
        
        // Must have reasonable confidence score
        if (chunk.confidenceScore < 60) return false;
        
        // Must have identified pain points or solution opportunities
        if (chunk.painPoints.length === 0 && chunk.solutionOpportunities.length === 0) return false;
        
        // Must be substantial enough (minimum word count)
        if (chunk.wordCount < 30) return false;
        
        return true;
      })
      .sort((a, b) => b.confidenceScore - a.confidenceScore) // Sort by confidence
      .slice(0, 3); // Limit to top 3 candidates to avoid over-insertion
  }

  /**
   * Extract overall themes from all chunks
   * Why this matters: Provides article-level theme understanding for solution matching.
   */
  private extractOverallThemes(chunks: SemanticChunk[]): string[] {
    const themeCount: { [key: string]: number } = {};
    
    chunks.forEach(chunk => {
      chunk.themes.forEach(theme => {
        themeCount[theme] = (themeCount[theme] || 0) + 1;
      });
    });

    // Return all themes, but prioritize those mentioned in multiple chunks
    return Object.entries(themeCount)
      .sort(([_, a], [__, b]) => b - a) // Sort by frequency
      .map(([theme, _]) => theme)
      .slice(0, 8); // Top 8 themes (more inclusive)
  }

  /**
   * Extract primary pain points from all chunks
   * Why this matters: Identifies the most common pain points for solution matching.
   */
  private extractPrimaryPainPoints(chunks: SemanticChunk[]): string[] {
    const painPointCount: { [key: string]: number } = {};
    
    chunks.forEach(chunk => {
      chunk.painPoints.forEach(painPoint => {
        painPointCount[painPoint] = (painPointCount[painPoint] || 0) + 1;
      });
    });

    // Return pain points mentioned in multiple chunks or with high confidence
    return Object.entries(painPointCount)
      .sort(([_, a], [__, b]) => b - a)
      .map(([painPoint, _]) => painPoint)
      .slice(0, 5); // Top 5 pain points
  }

  /**
   * Count words in text
   * Why this matters: Provides accurate word count for chunk analysis.
   */
  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }
}

export default ContentSemanticAnalyzer;
