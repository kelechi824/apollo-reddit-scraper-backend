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
   * Legacy compatibility method for workflow orchestrator
   * Why this matters: Maintains compatibility with existing workflow code.
   */
  async searchAndAnalyzeCompetitors(keyword: string): Promise<ArticleContent> {
    // For now, return a basic structure - this can be enhanced later
    // to actually search and analyze competitors
    const mockContent: ArticleContent = {
      url: `https://search-results-for-${keyword}`,
      title: `Competitor Analysis for ${keyword}`,
      content: `Mock competitor analysis content for keyword: ${keyword}. This would normally contain comprehensive competitor research.`,
      wordCount: 250,
      extractedAt: new Date().toISOString(),
      metadata: {
        description: `Competitor analysis for ${keyword}`,
        tags: [keyword, 'competitor-analysis']
      },
      top_results: [] // Legacy compatibility
    };
    
    return mockContent;
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
}

export default FirecrawlService;
export type { ArticleContent, FirecrawlExtractionResult };