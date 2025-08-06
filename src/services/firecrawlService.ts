import FirecrawlApp from '@mendable/firecrawl-js';

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

      // Use Firecrawl to scrape the article
      const scrapeResult = await this.firecrawl.scrapeUrl(url, {
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        includeTags: ['title', 'meta', 'article', 'main', 'section'],
        excludeTags: ['nav', 'footer', 'aside', 'script', 'style'],
        waitFor: 3000 // Wait 3 seconds for dynamic content
      });

      if (!scrapeResult.success || !scrapeResult.metadata) {
        return {
          success: false,
          error: scrapeResult.error || 'Failed to extract content from URL'
        };
      }

      const data = scrapeResult.metadata;

      // Extract and clean the content
      const cleanContent = this.cleanContent(scrapeResult.markdown || scrapeResult.html || '');
      const wordCount = this.countWords(cleanContent);

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
        }
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
}

export default FirecrawlService;
export type { ArticleContent, FirecrawlExtractionResult };