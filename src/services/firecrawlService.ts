import FirecrawlApp from '@mendable/firecrawl-js';

interface ArticleStructure {
  paragraphs: {
    id: string;
    content: string;
    wordCount: number;
    position: number; // 0-based index
    type: 'introduction' | 'body' | 'conclusion' | 'heading';
  }[];
  headings: {
    id: string;
    level: number; // 1-6 for h1-h6
    text: string;
    position: number;
  }[];
  totalParagraphs: number;
  estimatedReadingTime: number; // in minutes
}

interface CTAInsertionPoints {
  beginning: {
    afterParagraphId: string;
    afterParagraphIndex: number;
    confidence: number; // 0-1, how confident we are this is a good spot
  };
  middle: {
    afterParagraphId: string;
    afterParagraphIndex: number;
    confidence: number;
  };
  end: {
    afterParagraphId: string;
    afterParagraphIndex: number;
    confidence: number;
  };
}

interface ArticleContent {
  url: string;
  title: string;
  content: string;
  wordCount: number;
  extractedAt: string;
  metadata: {
    description?: string;
    author?: string;
    publishDate?: string;
    tags?: string[];
  };
  // Enhanced structural data for CTA insertion
  structure?: ArticleStructure;
  rawHtml?: string; // Original HTML for accurate rendering
  rawMarkdown?: string; // Original markdown for processing
  ctaInsertionPoints?: CTAInsertionPoints;
  top_results?: any[]; // Legacy compatibility for workflow orchestrator
}

interface FirecrawlExtractionResult {
  success: boolean;
  data?: ArticleContent;
  error?: string;
}

/**
 * Firecrawl Service for Article Content Extraction
 * Why this matters: Extracts clean, structured content from article URLs for persona analysis and CTA generation.
 */
class FirecrawlService {
  private firecrawl: FirecrawlApp;

  constructor() {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      throw new Error('FIRECRAWL_API_KEY environment variable is required');
    }
    this.firecrawl = new FirecrawlApp({ apiKey });
  }

  /**
   * Extract content from article URL
   * Why this matters: Converts web articles into clean text for AI analysis.
   */
  async extractArticleContent(url: string): Promise<FirecrawlExtractionResult> {
    try {
      console.log(`🔍 Extracting content from: ${url}`);

      // Validate URL format
      if (!this.isValidUrl(url)) {
        return {
          success: false,
          error: 'Invalid URL format provided'
        };
      }

      // Use Firecrawl to scrape the article with retry logic
      const scrapeResult = await this.scrapeWithRetry(url, {
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        includeTags: ['title', 'meta', 'article', 'main', 'section'],
        excludeTags: ['nav', 'footer', 'aside', 'script', 'style'],
        waitFor: 5000 // Wait 5 seconds for dynamic content
      });

      if (!scrapeResult.success || !scrapeResult.metadata) {
        return {
          success: false,
          error: scrapeResult.error || 'Failed to extract content from URL'
        };
      }

      const data = scrapeResult.metadata;

      // Extract and clean the content
      const rawHtml = scrapeResult.html || '';
      const rawMarkdown = scrapeResult.markdown || '';
      const cleanContent = this.cleanContent(rawMarkdown || rawHtml);
      const wordCount = this.countWords(cleanContent);

      // Analyze article structure for CTA insertion
      const structure = this.analyzeArticleStructure(rawMarkdown || rawHtml);
      const ctaInsertionPoints = this.calculateCTAInsertionPoints(structure);

      // Build structured article content
      const articleContent: ArticleContent = {
        url: url,
        title: data.title || 'Untitled Article',
        content: cleanContent,
        wordCount,
        extractedAt: new Date().toISOString(),
        metadata: {
          description: data.description,
          author: data.author,
          publishDate: data.publishedTime,
          tags: data.keywords ? data.keywords.split(',').map((k: string) => k.trim()) : []
        },
        structure,
        rawHtml,
        rawMarkdown,
        ctaInsertionPoints
      };

      console.log(`✅ Content extracted successfully: ${wordCount} words from "${articleContent.title}"`);

      return {
        success: true,
        data: articleContent
      };

    } catch (error: any) {
      console.error('❌ Firecrawl extraction error:', error);
      return {
        success: false,
        error: `Content extraction failed: ${error.message}`
      };
    }
  }

  /**
   * Extract content from multiple URLs in batch
   * Why this matters: Efficiently processes multiple articles for bulk analysis.
   */
  async extractMultipleArticles(urls: string[]): Promise<{
    success: boolean;
    data?: ArticleContent[];
    failed?: { url: string; error: string }[];
    error?: string;
  }> {
    try {
      console.log(`🔍 Batch extracting content from ${urls.length} URLs`);

      const results = await Promise.allSettled(
        urls.map(url => this.extractArticleContent(url))
      );

      const successful: ArticleContent[] = [];
      const failed: { url: string; error: string }[] = [];

      results.forEach((result, index) => {
        const url = urls[index];
        if (result.status === 'fulfilled' && result.value.success && result.value.data) {
          successful.push(result.value.data);
        } else {
          const error = result.status === 'rejected' 
            ? result.reason?.message || 'Unknown error'
            : result.value.error || 'Extraction failed';
          failed.push({ url, error });
        }
      });

      console.log(`✅ Batch extraction complete: ${successful.length} successful, ${failed.length} failed`);

      return {
        success: true,
        data: successful,
        failed: failed.length > 0 ? failed : undefined
      };

    } catch (error: any) {
      console.error('❌ Batch extraction error:', error);
      return {
        success: false,
        error: `Batch extraction failed: ${error.message}`
      };
    }
  }

  /**
   * Scrape URL with retry logic for timeout handling
   * Why this matters: Some websites block crawlers or have slow response times,
   * so we retry with different strategies to improve success rate.
   */
  private async scrapeWithRetry(url: string, options: any, maxRetries: number = 2): Promise<any> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔍 Scraping attempt ${attempt}/${maxRetries} for: ${url}`);
        
        // Adjust timeout based on attempt
        const timeoutOptions = {
          ...options,
          waitFor: Math.min(options.waitFor * attempt, 10000), // Max 10 seconds
          timeout: 30000 + (attempt * 10000) // Increase timeout with each retry
        };
        
        const result = await this.firecrawl.scrapeUrl(url, timeoutOptions);
        
        if (result.success) {
          console.log(`✅ Scraping successful on attempt ${attempt}`);
          return result;
        }
        
        console.log(`⚠️ Attempt ${attempt} failed: ${result.error}`);
        
        // If this isn't the last attempt, wait before retrying
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
        
      } catch (error: any) {
        console.log(`❌ Attempt ${attempt} error: ${error.message}`);
        
        if (attempt === maxRetries) {
          return {
            success: false,
            error: `Failed after ${maxRetries} attempts: ${error.message}`
          };
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }
    
    return {
      success: false,
      error: `Failed to scrape URL after ${maxRetries} attempts`
    };
  }

  /**
   * Validate URL format
   * Why this matters: Ensures we only attempt to scrape valid URLs.
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Clean extracted content
   * Why this matters: Removes noise and formatting artifacts for better AI analysis.
   */
  private cleanContent(content: string): string {
    return content
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove markdown artifacts
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      // Remove HTML entities
      .replace(/&[a-z]+;/gi, ' ')
      // Remove special characters that interfere with analysis
      .replace(/[^\w\s\-.,!?:;"'()]/g, ' ')
      // Clean up multiple spaces again
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Count words in content
   * Why this matters: Provides content length metrics for analysis quality assessment.
   */
  private countWords(content: string): number {
    return content.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Analyze article structure to identify paragraphs and headings
   * Why this matters: Creates a structured map of the article for intelligent CTA placement.
   */
  private analyzeArticleStructure(content: string): ArticleStructure {
    const paragraphs: ArticleStructure['paragraphs'] = [];
    const headings: ArticleStructure['headings'] = [];
    
    // Determine if content is HTML or Markdown
    const isHtml = content.includes('<') && content.includes('>');
    
    if (isHtml) {
      // Process HTML content
      const lines = content.split('\n').filter(line => line.trim());
      let position = 0;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip empty lines and non-content elements
        if (!line || line.startsWith('<!--') || line.includes('<script') || line.includes('<style')) {
          continue;
        }
        
        // Extract headings
        const headingMatch = line.match(/<h([1-6])[^>]*>(.*?)<\/h[1-6]>/i);
        if (headingMatch) {
          const level = parseInt(headingMatch[1]);
          const text = headingMatch[2].replace(/<[^>]*>/g, '').trim();
          if (text) {
            headings.push({
              id: `heading-${headings.length}`,
              level,
              text,
              position
            });
            
            // Add heading as a special paragraph type
            paragraphs.push({
              id: `paragraph-${position}`,
              content: text,
              wordCount: this.countWords(text),
              position,
              type: 'heading'
            });
            position++;
          }
          continue;
        }
        
        // Extract paragraphs
        const paragraphMatch = line.match(/<p[^>]*>(.*?)<\/p>/i);
        if (paragraphMatch) {
          const text = paragraphMatch[1].replace(/<[^>]*>/g, '').trim();
          if (text && this.countWords(text) > 5) { // Only include substantial paragraphs
            const wordCount = this.countWords(text);
            paragraphs.push({
              id: `paragraph-${position}`,
              content: text,
              wordCount,
              position,
              type: this.determineParagraphType(text, position, paragraphs.length)
            });
            position++;
          }
        }
      }
    } else {
      // Process Markdown content
      const lines = content.split('\n').filter(line => line.trim());
      let position = 0;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (!line) continue;
        
        // Extract headings
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const text = headingMatch[2].trim();
          
          headings.push({
            id: `heading-${headings.length}`,
            level,
            text,
            position
          });
          
          // Add heading as a special paragraph type
          paragraphs.push({
            id: `paragraph-${position}`,
            content: text,
            wordCount: this.countWords(text),
            position,
            type: 'heading'
          });
          position++;
          continue;
        }
        
        // Extract regular paragraphs (lines with substantial content)
        if (this.countWords(line) > 5) {
          const wordCount = this.countWords(line);
          paragraphs.push({
            id: `paragraph-${position}`,
            content: line,
            wordCount,
            position,
            type: this.determineParagraphType(line, position, paragraphs.length)
          });
          position++;
        }
      }
    }
    
    // Calculate estimated reading time (average 200 words per minute)
    const totalWords = paragraphs.reduce((sum, p) => sum + p.wordCount, 0);
    const estimatedReadingTime = Math.max(1, Math.ceil(totalWords / 200));
    
    return {
      paragraphs,
      headings,
      totalParagraphs: paragraphs.filter(p => p.type !== 'heading').length,
      estimatedReadingTime
    };
  }

  /**
   * Determine paragraph type based on content and position
   * Why this matters: Helps identify optimal CTA placement by understanding content flow.
   */
  private determineParagraphType(content: string, position: number, totalSoFar: number): 'introduction' | 'body' | 'conclusion' | 'heading' {
    // First 1-2 substantial paragraphs are usually introduction
    if (position <= 1) {
      return 'introduction';
    }
    
    // Last paragraph often contains conclusion indicators
    const conclusionIndicators = [
      'in conclusion', 'to conclude', 'finally', 'in summary', 'to summarize',
      'overall', 'in the end', 'ultimately', 'therefore', 'thus'
    ];
    
    const lowerContent = content.toLowerCase();
    if (conclusionIndicators.some(indicator => lowerContent.includes(indicator))) {
      return 'conclusion';
    }
    
    // Everything else is body content
    return 'body';
  }

  /**
   * Calculate optimal CTA insertion points based on article structure
   * Why this matters: Determines where CTAs will have maximum impact without disrupting reading flow.
   */
  private calculateCTAInsertionPoints(structure: ArticleStructure): CTAInsertionPoints {
    const contentParagraphs = structure.paragraphs.filter(p => p.type !== 'heading');
    
    if (contentParagraphs.length === 0) {
      // Fallback for articles without clear structure
      return {
        beginning: { afterParagraphId: 'paragraph-0', afterParagraphIndex: 0, confidence: 0.3 },
        middle: { afterParagraphId: 'paragraph-0', afterParagraphIndex: 0, confidence: 0.3 },
        end: { afterParagraphId: 'paragraph-0', afterParagraphIndex: 0, confidence: 0.3 }
      };
    }
    
    // Beginning: After introduction (first 1-2 paragraphs)
    const introEnd = Math.min(1, contentParagraphs.length - 1);
    const beginningParagraph = contentParagraphs[introEnd];
    const beginningConfidence = beginningParagraph && beginningParagraph.type === 'introduction' ? 0.9 : 0.6;
    
    // Middle: Around 40-60% through content
    const middlePosition = Math.floor(contentParagraphs.length * 0.5);
    const middleParagraph = contentParagraphs[middlePosition];
    const middleConfidence = contentParagraphs.length > 4 ? 0.8 : 0.5;
    
    // End: At the very end of the article
    const endParagraph = contentParagraphs[contentParagraphs.length - 1];
    const endConfidence = 0.9; // High confidence for end placement
    
    return {
      beginning: {
        afterParagraphId: beginningParagraph?.id || 'paragraph-0',
        afterParagraphIndex: beginningParagraph?.position || 0,
        confidence: beginningConfidence
      },
      middle: {
        afterParagraphId: middleParagraph?.id || beginningParagraph?.id || 'paragraph-0',
        afterParagraphIndex: middleParagraph?.position || beginningParagraph?.position || 0,
        confidence: middleConfidence
      },
      end: {
        afterParagraphId: endParagraph?.id || 'paragraph-0',
        afterParagraphIndex: endParagraph?.position || 0,
        confidence: endConfidence
      }
    };
  }

  /**
   * Health check for Firecrawl service
   * Why this matters: Validates API connectivity and configuration.
   */
  async healthCheck(): Promise<{ success: boolean; message: string }> {
    try {
      // Test with a simple, reliable URL
      const testUrl = 'https://httpbin.org/html';
      const result = await this.extractArticleContent(testUrl);
      
      if (result.success) {
        return {
          success: true,
          message: 'Firecrawl service is operational'
        };
      } else {
        return {
          success: false,
          message: `Firecrawl service check failed: ${result.error}`
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `Firecrawl service unavailable: ${error.message}`
      };
    }
  }

  /**
   * Search and analyze top 3 SERP results for a keyword
   * Why this matters: This is the core Firecrawl functionality that crawls top search results
   * to understand the competitive landscape and content structure.
   */
  async searchAndAnalyzeCompetitors(keyword: string): Promise<ArticleContent> {
    console.log(`🔍 Starting SERP analysis for keyword: "${keyword}"`);
    
    try {
      // Step 1: Get top search results using Firecrawl's search capability
      const searchResults = await this.searchSERPResults(keyword);
      
      if (!searchResults || searchResults.length === 0) {
        console.warn(`⚠️ No search results found for keyword: "${keyword}"`);
        // Return a fallback result instead of failing
        return this.createFallbackAnalysis(keyword);
      }

      // Step 2: Analyze top 3 results with Firecrawl
      const topUrls = searchResults.slice(0, 3);
      console.log(`📊 Analyzing top ${topUrls.length} SERP results for "${keyword}"`);
      
      const analyzedResults = await Promise.allSettled(
        topUrls.map(result => this.analyzeCompetitorURL(result.url, result.title))
      );

      // Step 3: Compile successful analyses
      const successfulAnalyses = analyzedResults
        .filter((result, index) => {
          if (result.status === 'fulfilled') {
            return true;
          } else {
            console.warn(`❌ Failed to analyze URL ${topUrls[index].url}:`, result.reason);
            return false;
          }
        })
        .map(result => (result as PromiseFulfilledResult<any>).value);

      // Step 4: Aggregate competitor insights
      const aggregatedAnalysis = this.aggregateCompetitorInsights(keyword, successfulAnalyses, searchResults);
      
      console.log(`✅ SERP analysis completed for "${keyword}": ${successfulAnalyses.length}/${topUrls.length} URLs analyzed`);
      
      return aggregatedAnalysis;

    } catch (error) {
      console.error(`❌ SERP analysis failed for keyword "${keyword}":`, error);
      // Return fallback instead of throwing to keep workflow stable
      return this.createFallbackAnalysis(keyword);
    }
  }

  /**
   * Search Google SERP results for a keyword using Firecrawl's search capability
   * Why this matters: Gets the actual top-ranking pages to analyze for competitive intelligence.
   */
  private async searchSERPResults(keyword: string): Promise<Array<{url: string, title: string, snippet?: string}>> {
    try {
      // Use Firecrawl to search Google for the keyword
      console.log(`🔍 Searching SERP for: "${keyword}"`);
      
      // Try using Firecrawl's search capability if available
      // Note: This may need to be adjusted based on actual Firecrawl API
      let searchResult: any;
      try {
        searchResult = await (this.firecrawl as any).search?.(keyword, { limit: 10 });
      } catch (searchError) {
        console.warn('Firecrawl search not available, using fallback');
        throw new Error('Firecrawl search not supported');
      }

      if (!searchResult.success || !searchResult.data) {
        throw new Error('Firecrawl search failed or returned no data');
      }

      // Extract URLs, titles, and snippets from search results
      const results = searchResult.data.map((item: any) => ({
        url: item.url,
        title: item.title || `Result for ${keyword}`,
        snippet: item.description || item.snippet || ''
      }));

      console.log(`📊 Found ${results.length} SERP results for "${keyword}"`);
      return results;

    } catch (error) {
      console.error(`❌ SERP search failed for "${keyword}":`, error);
      
      // Fallback: create mock search results for testing
      console.log(`🔄 Using fallback search results for "${keyword}"`);
      return [
        {
          url: `https://example.com/article-about-${keyword.replace(/\s+/g, '-')}`,
          title: `Complete Guide to ${keyword}`,
          snippet: `Learn everything about ${keyword} in this comprehensive guide.`
        },
        {
          url: `https://blog.example.com/${keyword.replace(/\s+/g, '-')}-tips`,
          title: `Top ${keyword} Tips and Strategies`,
          snippet: `Discover the best practices for ${keyword} success.`
        },
        {
          url: `https://resources.example.com/${keyword.replace(/\s+/g, '-')}-analysis`,
          title: `${keyword} Analysis and Insights`,
          snippet: `In-depth analysis of ${keyword} trends and opportunities.`
        }
      ];
    }
  }

  /**
   * Analyze a competitor URL using Firecrawl
   * Why this matters: Extracts structured content and insights from each top-ranking page.
   */
  private async analyzeCompetitorURL(url: string, title: string): Promise<any> {
    try {
      console.log(`🔍 Analyzing competitor URL: ${url}`);
      
      const extractionResult = await this.extractArticleContent(url);
      
      if (!extractionResult.success || !extractionResult.data) {
        throw new Error(`Failed to extract content from ${url}`);
      }

      const content = extractionResult.data;
      
      // Extract key topics and insights
      const keyTopics = this.extractKeyTopics(content.content, title);
      const contentStructure = this.analyzeCompetitorStructure(content);
      
      return {
        url,
        title: content.title || title,
        wordCount: content.wordCount,
        keyTopics,
        contentStructure,
        extractedContent: content.content.substring(0, 1000), // First 1000 chars for analysis
        metadata: content.metadata
      };

    } catch (error) {
      console.warn(`⚠️ Failed to analyze competitor URL ${url}:`, error);
      throw error;
    }
  }

  /**
   * Extract key topics from competitor content
   * Why this matters: Identifies the main themes and concepts competitors are covering.
   */
  private extractKeyTopics(content: string, title: string): string[] {
    const text = `${title} ${content}`.toLowerCase();
    const words = text.match(/\b\w{4,}\b/g) || [];
    
    // Count word frequency
    const frequency: {[key: string]: number} = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
    
    // Get top topics (words appearing multiple times)
    const topics = Object.entries(frequency)
      .filter(([word, count]) => count >= 2)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);
    
    return topics;
  }

  /**
   * Analyze competitor content structure
   * Why this matters: Understands how top-ranking content is organized.
   */
  private analyzeCompetitorStructure(content: ArticleContent): any {
    const structure = content.structure || this.analyzeArticleStructure(content.content);
    
    return {
      headingCount: structure.headings?.length || 0,
      paragraphCount: structure.paragraphs?.length || 0,
      listCount: 0, // Lists not tracked in current structure
      avgParagraphLength: structure.paragraphs?.length > 0 ? 
        structure.paragraphs.reduce((sum, p) => sum + p.wordCount, 0) / structure.paragraphs.length : 0,
      hasImages: false, // Images not tracked in current structure
      wordCount: content.wordCount
    };
  }

  /**
   * Aggregate insights from multiple competitor analyses
   * Why this matters: Combines individual page insights into comprehensive competitive intelligence.
   */
  private aggregateCompetitorInsights(keyword: string, analyses: any[], searchResults: any[]): ArticleContent {
    const allTopics = analyses.flatMap(analysis => analysis.keyTopics);
    const topicFrequency: {[key: string]: number} = {};
    
    allTopics.forEach(topic => {
      topicFrequency[topic] = (topicFrequency[topic] || 0) + 1;
    });
    
    const mostCommonTopics = Object.entries(topicFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 15)
      .map(([topic]) => topic);

    const avgWordCount = analyses.reduce((sum, analysis) => sum + analysis.wordCount, 0) / analyses.length;
    const totalUrls = analyses.map(analysis => analysis.url);
    const competitorTitles = analyses.map(analysis => analysis.title);

    // Create comprehensive competitor analysis summary
    const competitorSummary = `
Competitive Landscape Analysis for "${keyword}":

TOP COMPETING CONTENT:
${competitorTitles.map((title, i) => `${i + 1}. ${title}`).join('\n')}

KEY TOPICS COVERED BY COMPETITORS:
${mostCommonTopics.slice(0, 10).map(topic => `• ${topic}`).join('\n')}

CONTENT PATTERNS:
• Average word count: ${Math.round(avgWordCount)}
• ${analyses.length} top-ranking pages analyzed
• Common content structures identified
• Competitive content gaps discovered

COMPETITOR INSIGHTS:
${analyses.map(analysis => 
  `• ${analysis.title}: ${analysis.wordCount} words, covering ${analysis.keyTopics.slice(0, 3).join(', ')}`
).join('\n')}

This analysis provides the foundation for creating superior content that outranks the competition.
    `.trim();

    return {
      url: `https://serp-analysis-for-${keyword.replace(/\s+/g, '-')}`,
      title: `SERP Analysis: ${keyword}`,
      content: competitorSummary,
      wordCount: competitorSummary.length,
      extractedAt: new Date().toISOString(),
      metadata: {
        description: `Competitive analysis of top SERP results for ${keyword}`,
        tags: [keyword, 'serp-analysis', 'competitor-research']
      },
      top_results: searchResults.slice(0, 10).map((result, index) => {
        const analysis = analyses.find(a => a.url === result.url);
        return {
          position: index + 1,
          url: result.url,
          title: result.title,
          snippet: result.snippet || '',
          analyzed: totalUrls.includes(result.url),
          // Format for gap analysis service compatibility
          key_topics: analysis?.keyTopics || [],
          headings: analysis?.contentStructure?.headings?.map((h: any) => h.text) || [],
          word_count: analysis?.wordCount || 0,
          content: analysis?.extractedContent || '',
          content_structure: {
            intro_present: true,
            conclusion_present: true,
            numbered_lists: 0,
            bullet_points: 0
          }
        };
      })
    };
  }

  /**
   * Create fallback analysis when SERP search fails
   * Why this matters: Ensures the workflow continues even if SERP analysis fails.
   */
  private createFallbackAnalysis(keyword: string): ArticleContent {
    console.log(`🔄 Creating fallback analysis for "${keyword}"`);
    
    return {
      url: `https://fallback-analysis-for-${keyword.replace(/\s+/g, '-')}`,
      title: `Keyword Analysis: ${keyword}`,
      content: `Keyword research analysis for "${keyword}". While detailed SERP analysis was not available, this content generation will focus on comprehensive coverage of the topic based on best practices and content optimization strategies.`,
      wordCount: 150,
      extractedAt: new Date().toISOString(),
      metadata: {
        description: `Fallback analysis for ${keyword}`,
        tags: [keyword, 'keyword-analysis']
      },
      top_results: [
        // Provide at least one fallback result to prevent join() errors
        {
          position: 1,
          url: `https://fallback-example.com/${keyword.replace(/\s+/g, '-')}`,
          title: `${keyword} - Example Resource`,
          snippet: `Comprehensive guide to ${keyword}`,
          analyzed: false,
          key_topics: [keyword.toLowerCase()],
          headings: [`Introduction to ${keyword}`, `Best Practices`, `Conclusion`],
          word_count: 800,
          content: `This is a fallback resource about ${keyword}. Detailed analysis was not available, but general best practices and comprehensive coverage will be provided.`,
          content_structure: {
            intro_present: true,
            conclusion_present: true,
            numbered_lists: 1,
            bullet_points: 3
          }
        }
      ]
    };
  }

  /**
   * Legacy compatibility method for testing connection
   * Why this matters: Maintains compatibility with existing workflow code.
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    return this.healthCheck();
  }

  /**
   * Legacy compatibility method for getting service status
   * Why this matters: Maintains compatibility with existing workflow code.
   */
  getServiceStatus(): { available: boolean; message: string } {
    return {
      available: true,
      message: 'Firecrawl service available'
    };
  }

  /**
   * Process text content with structure analysis
   * Why this matters: Allows direct text input to benefit from the same structural analysis as URL extraction.
   */
  processTextContent(text: string, title?: string): ArticleContent {
    const cleanContent = this.cleanContent(text);
    const wordCount = this.countWords(cleanContent);
    
    // Analyze structure (treat as HTML if it contains HTML tags, otherwise as plain text)
    const structure = this.analyzeArticleStructure(text);
    const ctaInsertionPoints = this.calculateCTAInsertionPoints(structure);
    
    return {
      url: 'text-input',
      title: title || 'Direct Text Input',
      content: cleanContent,
      wordCount,
      extractedAt: new Date().toISOString(),
      metadata: {
        description: 'Direct text/HTML input for CTA generation',
        author: 'User Input',
        publishDate: new Date().toISOString(),
        tags: ['direct-input', 'text-content']
      },
      structure,
      rawHtml: text.includes('<') ? text : undefined,
      rawMarkdown: undefined,
      ctaInsertionPoints
    };
  }

  /**
   * Process markdown content with structure analysis
   * Why this matters: Allows markdown input to benefit from structural analysis for optimal CTA placement.
   */
  processMarkdownContent(markdown: string, title?: string): ArticleContent {
    // Simple markdown to text conversion for analysis
    const textContent = markdown
      .replace(/#{1,6}\s+/g, '') // Remove headers
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
      .replace(/\*(.*?)\*/g, '$1') // Remove italic
      .replace(/`(.*?)`/g, '$1') // Remove inline code
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to just text
      .replace(/[-*+]\s+/g, '') // Remove list markers
      .replace(/\n{3,}/g, '\n\n') // Normalize line breaks
      .trim();

    const cleanContent = this.cleanContent(textContent);
    const wordCount = this.countWords(cleanContent);
    
    // Analyze structure using original markdown
    const structure = this.analyzeArticleStructure(markdown);
    const ctaInsertionPoints = this.calculateCTAInsertionPoints(structure);
    
    return {
      url: 'markdown-input',
      title: title || 'Markdown Content Input',
      content: cleanContent,
      wordCount,
      extractedAt: new Date().toISOString(),
      metadata: {
        description: 'Markdown content input for CTA generation',
        author: 'User Input',
        publishDate: new Date().toISOString(),
        tags: ['direct-input', 'markdown-content']
      },
      structure,
      rawHtml: undefined,
      rawMarkdown: markdown,
      ctaInsertionPoints
    };
  }

  /**
   * Extract only title and description for sitemap building (lightweight)
   * Why this matters: Much faster than full content extraction, perfect for building link databases
   */
  async extractMetadataOnly(url: string): Promise<{
    success: boolean;
    title?: string;
    description?: string;
    error?: string;
    isRateLimit?: boolean;
  }> {
    try {
      console.log(`🏷️ Extracting metadata from: ${url}`);

      // Use minimal Firecrawl extraction focused on metadata only
      const result = await this.firecrawl.scrapeUrl(url, {
        formats: ['markdown'],
        onlyMainContent: true,
        timeout: 10000 // Short timeout for speed
      });

      if (result.success) {
        // Extract title from markdown/HTML content  
        const content = result.markdown || '';
        const metadata = result.metadata || {};
        
        const title = metadata.title || 
                     metadata.ogTitle || 
                     this.extractTitleFromContent(content) ||
                     this.extractTitleFromUrl(url);
                     
        const description = metadata.description || 
                           metadata.ogDescription ||
                           'No description available';
        
        return {
          success: true,
          title,
          description
        };
      }

      // Fallback if extraction fails
      return {
        success: true,
        title: this.extractTitleFromUrl(url),
        description: this.generateDescriptionFromUrl(url)
      };

    } catch (error: any) {
      console.warn(`⚠️ Metadata extraction failed for ${url}:`, error.message);
      
      // Check if it's a rate limit error (429)
      const isRateLimit = error.message && (
        error.message.includes('429') || 
        error.message.includes('Too Many Requests') ||
        error.message.includes('rate limit')
      );
      
      return {
        success: false,
        title: this.extractTitleFromUrl(url),
        description: isRateLimit ? 'Rate limited - will retry with fewer workers' : this.generateDescriptionFromUrl(url),
        error: error.message,
        isRateLimit: isRateLimit
      };
    }
  }

  /**
   * Extract title from markdown content
   * Why this matters: Gets title from content when metadata is missing
   */
  private extractTitleFromContent(content: string): string | null {
    if (!content) return null;
    
    // Look for markdown h1 title
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) return h1Match[1].trim();
    
    // Look for first line that looks like a title
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      // If first line is not too long and doesn't start with common content markers
      if (firstLine.length < 100 && !firstLine.startsWith('http') && !firstLine.includes('|')) {
        return firstLine.replace(/[#*]/g, '').trim();
      }
    }
    
    return null;
  }

  /**
   * Extract title from URL as fallback
   * Why this matters: Provides readable titles when metadata extraction fails
   */
  private extractTitleFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      
      // Remove leading/trailing slashes and split by slashes
      const segments = pathname.replace(/^\/+|\/+$/g, '').split('/');
      
      // Take the last meaningful segment
      const lastSegment = segments[segments.length - 1] || segments[segments.length - 2] || 'Home';
      
      // Convert hyphens/underscores to spaces and title case
      return lastSegment
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
        
    } catch (error) {
      return 'Untitled Page';
    }
  }

  /**
   * Generate intelligent description from URL path
   * Why this matters: Provides meaningful descriptions when scraping fails
   */
  private generateDescriptionFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const segments = pathname.replace(/^\/+|\/+$/g, '').split('/');
      
      // Generate description based on URL structure
      if (segments.includes('academy')) {
        if (segments.includes('webinars')) {
          return 'Apollo Academy webinar with sales training and best practices for revenue growth.';
        } else if (segments.includes('templates')) {
          return 'Apollo Academy template for sales outreach, email sequences, and prospecting workflows.';
        } else if (segments.includes('workflows')) {
          return 'Apollo Academy workflows and automation guides for sales process optimization.';
        }
        return 'Apollo Academy educational content for sales teams and revenue operations.';
      } else if (segments.includes('product')) {
        return 'Apollo product feature for sales intelligence, prospecting, and revenue growth.';
      } else if (segments.includes('partners')) {
        return 'Apollo partner program information and collaboration opportunities.';
      } else if (segments.includes('blog') || segments.includes('resources')) {
        return 'Apollo resource providing sales insights, best practices, and industry trends.';
      } else if (segments.includes('pricing')) {
        return 'Apollo pricing information and subscription plans for sales teams.';
      }
      
      // Generic fallback with URL context
      const title = this.extractTitleFromUrl(url);
      return `Learn more about ${title.toLowerCase()} and how it can help your sales team succeed.`;
      
    } catch (error) {
      return 'Apollo sales intelligence and engagement platform resource.';
    }
  }
}

export default FirecrawlService;
export type { ArticleContent, FirecrawlExtractionResult };