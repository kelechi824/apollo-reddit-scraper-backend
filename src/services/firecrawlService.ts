import FirecrawlApp from '@mendable/firecrawl-js';
import { 
  retryWithBackoff, 
  CircuitBreaker, 
  RateLimiter,
  DEFAULT_RETRY_CONFIGS,
  DEFAULT_CIRCUIT_BREAKER_CONFIGS,
  DEFAULT_RATE_LIMITS,
  createServiceError
} from './errorHandling';

export interface CompetitorAnalysis {
  url: string;
  title: string;
  content: string;
  meta_description?: string;
  word_count: number;
  headings: string[];
  key_topics: string[];
  content_structure: {
    intro_present: boolean;
    conclusion_present: boolean;
    numbered_lists: number;
    bullet_points: number;
  };
}

export interface FirecrawlSearchResult {
  keyword: string;
  top_results: CompetitorAnalysis[];
  search_metadata: {
    total_results: number;
    search_query: string;
    timestamp: string;
  };
}

class FirecrawlService {
  private client: FirecrawlApp | null = null;
  private circuitBreaker: CircuitBreaker;
  private rateLimiter: RateLimiter;

  constructor() {
    // Initialize error handling components
    this.circuitBreaker = new CircuitBreaker(
      DEFAULT_CIRCUIT_BREAKER_CONFIGS.firecrawl,
      'Firecrawl'
    );
    this.rateLimiter = new RateLimiter(
      DEFAULT_RATE_LIMITS.firecrawl,
      'Firecrawl'
    );

    // Delay initialization to allow environment variables to load
    setTimeout(() => {
      this.initializeClient();
    }, 100);
  }

  /**
   * Initialize Firecrawl client with API key
   * Why this matters: Firecrawl requires API key authentication for search and scraping requests.
   */
  private async initializeClient(): Promise<void> {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    
    if (!apiKey) {
      console.error('Firecrawl API key not found in environment variables');
      return;
    }

    try {
      this.client = new FirecrawlApp({ apiKey });
      console.log('✅ Firecrawl client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Firecrawl client:', error);
    }
  }

  /**
   * Search for top 3 search results and extract content for competitor analysis
   * Why this matters: Provides comprehensive competitor content analysis to identify 
   * what topics are already covered, helping with gap analysis for original content creation.
   */
  async searchAndAnalyzeCompetitors(keyword: string): Promise<FirecrawlSearchResult> {
    // Ensure client is initialized before proceeding
    if (!this.client) {
      console.log('⚠️ Firecrawl client not ready, initializing now...');
      await this.initializeClient();
    }
    
    if (!this.client) {
      throw createServiceError(new Error('Firecrawl client failed to initialize'), 'Firecrawl', 'Client check');
    }

    if (!keyword || keyword.trim().length === 0) {
      throw createServiceError(new Error('Keyword is required for competitor analysis'), 'Firecrawl', 'Input validation');
    }

    console.log(`🔍 Searching for top 3 results for keyword: "${keyword}"`);

    // Production fallback: Skip Firecrawl in production if environment variable is set
    if (process.env.NODE_ENV === 'production' && process.env.SKIP_FIRECRAWL === 'true') {
      console.log(`⚠️ Skipping Firecrawl in production (fallback mode)`);
      return this.createMockFirecrawlResult(keyword);
    }

    // Use circuit breaker and retry logic for the entire operation
    return await this.circuitBreaker.execute(async () => {
      return await retryWithBackoff(
        async () => {
          // Rate limiting before API call
          await this.rateLimiter.waitForNext();

          const searchQuery = keyword.trim();
          console.log(`🔍 Searching for: "${searchQuery}"`);
          console.log(`🌐 Firecrawl client initialized: ${!!this.client}`);
          
          // Perform the search with reduced timeout and better error handling
          const searchStartTime = Date.now();
          console.log(`⏰ Starting Firecrawl search at ${new Date().toISOString()}`);
          
          const searchResponse = await Promise.race([
            (async () => {
              try {
                console.log(`📡 Making Firecrawl API call...`);
                const result = await this.client!.search(searchQuery, {
                  limit: 3, // Top 3 results only
                  scrapeOptions: {
                    formats: ['markdown', 'html'],
                    includeTags: ['title', 'meta', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
                    excludeTags: ['nav', 'footer', 'sidebar', 'ads'],
                    onlyMainContent: true
                  }
                });
                const duration = Date.now() - searchStartTime;
                console.log(`✅ Firecrawl search completed in ${duration}ms`);
                return result;
              } catch (error) {
                const duration = Date.now() - searchStartTime;
                console.error(`❌ Firecrawl search failed after ${duration}ms:`, error);
                throw error;
              }
            })(),
            this.createTimeoutPromise(15000) // Reduced to 15 second timeout for faster feedback
          ]);

          if (!searchResponse.success || !searchResponse.data) {
            throw new Error('Failed to get search results from Firecrawl');
          }

          const results = searchResponse.data;
          console.log(`📊 Found ${results.length} results for analysis`);

          // Analyze each result for competitor content analysis
          const competitorAnalyses: CompetitorAnalysis[] = [];

          for (let i = 0; i < Math.min(3, results.length); i++) {
            const result = results[i];
            
            try {
              console.log(`📄 Analyzing result ${i + 1}: ${result.url}`);
              
              const analysis = await this.analyzeContentWithRetry(result);
              competitorAnalyses.push(analysis);
              
              // Rate limiting between content analyses
              if (i < results.length - 1) {
                await this.rateLimiter.waitForNext();
              }
              
            } catch (error) {
              console.error(`❌ Failed to analyze ${result.url}:`, error);
              
              // Create fallback analysis for failed extractions
              const fallbackAnalysis: CompetitorAnalysis = {
                url: result.url || 'Unknown URL',
                title: result.title || 'Title not available',
                content: result.markdown || result.html || 'Content extraction failed',
                meta_description: result.description || undefined,
                word_count: 0,
                headings: [],
                key_topics: [],
                content_structure: {
                  intro_present: false,
                  conclusion_present: false,
                  numbered_lists: 0,
                  bullet_points: 0
                }
              };
              
              competitorAnalyses.push(fallbackAnalysis);
            }
          }

          const firecrawlResult: FirecrawlSearchResult = {
            keyword: searchQuery,
            top_results: competitorAnalyses,
            search_metadata: {
              total_results: results.length,
              search_query: searchQuery,
              timestamp: new Date().toISOString()
            }
          };

          console.log(`✅ Completed competitor analysis for "${keyword}" - ${competitorAnalyses.length} results analyzed`);
          return firecrawlResult;
        },
        DEFAULT_RETRY_CONFIGS.firecrawl,
        'Firecrawl',
        `Keyword: ${keyword}`
      );
    });
  }

  /**
   * Create timeout promise for API calls
   * Why this matters: Prevents hanging requests from blocking the entire workflow.
   */
  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(createServiceError(new Error(`Request timeout after ${timeoutMs}ms`), 'Firecrawl', 'Timeout'));
      }, timeoutMs);
    });
  }

  /**
   * Analyze content with retry logic
   * Why this matters: Content analysis can fail due to parsing issues, so we need
   * retry logic for individual content pieces while maintaining overall resilience.
   */
  private async analyzeContentWithRetry(result: any): Promise<CompetitorAnalysis> {
    return await retryWithBackoff(
      async () => {
        return await this.analyzeContent(result);
      },
      {
        maxRetries: 2, // Fewer retries for individual content analysis
        baseDelayMs: 500,
        maxDelayMs: 2000,
        backoffMultiplier: 1.5,
        jitterMs: 250
      },
      'Firecrawl Content Analysis',
      `URL: ${result.url}`
    );
  }

  /**
   * Analyze individual content result for competitor insights
   * Why this matters: Extracts structured data about competitor content including
   * topics covered, content structure, and key elements that inform gap analysis.
   */
  private async analyzeContent(result: any): Promise<CompetitorAnalysis> {
    const content = result.markdown || result.html || '';
    const title = result.title || 'Untitled';
    const url = result.url || 'Unknown URL';
    
    // Extract headings from markdown content
    const headings = this.extractHeadings(content);
    
    // Analyze content structure
    const contentStructure = this.analyzeContentStructure(content);
    
    // Extract key topics from content
    const keyTopics = this.extractKeyTopics(content, title);
    
    // Calculate word count
    const wordCount = this.calculateWordCount(content);

    return {
      url,
      title,
      content,
      meta_description: result.description,
      word_count: wordCount,
      headings,
      key_topics: keyTopics,
      content_structure: contentStructure
    };
  }

  /**
   * Extract headings from markdown content
   * Why this matters: Headings reveal the content structure and topics covered by competitors,
   * essential for identifying gaps in coverage.
   */
  private extractHeadings(content: string): string[] {
    const headingRegex = /^#{1,6}\s+(.+)$/gm;
    const headings: string[] = [];
    let match;

    while ((match = headingRegex.exec(content)) !== null) {
      headings.push(match[1].trim());
    }

    return headings;
  }

  /**
   * Analyze content structure for competitor comparison
   * Why this matters: Understanding how competitors structure their content helps
   * identify format patterns and structural elements to include or improve upon.
   */
  private analyzeContentStructure(content: string): CompetitorAnalysis['content_structure'] {
    // Check for intro patterns
    const introPatterns = [
      /^.{0,500}?(introduction|intro|overview|what is)/i,
      /^.{0,500}?(in this (article|post|guide))/i,
      /^.{0,500}?(we'll (explore|discuss|cover))/i
    ];
    const introPresent = introPatterns.some(pattern => pattern.test(content));

    // Check for conclusion patterns
    const conclusionPatterns = [
      /(conclusion|summary|final thoughts|in summary|to summarize)/i,
      /(wrapping up|key takeaways|the bottom line)/i
    ];
    const conclusionPresent = conclusionPatterns.some(pattern => pattern.test(content));

    // Count numbered lists
    const numberedLists = (content.match(/^\d+\.\s+/gm) || []).length;

    // Count bullet points
    const bulletPoints = (content.match(/^[-*+]\s+/gm) || []).length;

    return {
      intro_present: introPresent,
      conclusion_present: conclusionPresent,
      numbered_lists: numberedLists,
      bullet_points: bulletPoints
    };
  }

  /**
   * Extract key topics from content and title
   * Why this matters: Identifies the main themes and topics competitors are covering,
   * crucial for gap analysis and ensuring comprehensive topic coverage.
   */
  private extractKeyTopics(content: string, title: string): string[] {
    const text = `${title} ${content}`.toLowerCase();
    
    // Remove common words and extract meaningful terms
    const commonWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have',
      'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
      'might', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she',
      'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his',
      'her', 'its', 'our', 'their'
    ]);

    // Extract words and phrases
    const words = text.match(/\b[a-z]{3,}\b/g) || [];
    const wordCounts = new Map<string, number>();

    words.forEach(word => {
      if (!commonWords.has(word)) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    });

    // Get top 10 most frequent terms
    const sortedTopics = Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);

    return sortedTopics;
  }

  /**
   * Calculate word count from content
   * Why this matters: Helps understand the content length competitors are using,
   * informing decisions about optimal content length for gap analysis.
   */
  private calculateWordCount(content: string): number {
    // Remove markdown syntax and count words
    const cleanText = content
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]*`/g, '') // Remove inline code
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // Replace links with text
      .replace(/[#*_~]/g, '') // Remove markdown formatting
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    if (!cleanText) return 0;
    
    return cleanText.split(/\s+/).length;
  }

  /**
   * Create mock Firecrawl result for production fallback
   * Why this matters: Allows the workflow to continue in production when Firecrawl is unavailable
   */
  private createMockFirecrawlResult(keyword: string): FirecrawlSearchResult {
    console.log(`🎭 Creating mock Firecrawl result for keyword: "${keyword}"`);
    
    const mockAnalyses: CompetitorAnalysis[] = [
      {
        url: `https://example.com/article-about-${keyword.replace(/\s+/g, '-')}`,
        title: `${keyword.charAt(0).toUpperCase() + keyword.slice(1)}: Complete Guide`,
        content: `This is a comprehensive guide about ${keyword}. It covers the main aspects and provides valuable insights.`,
        meta_description: `Learn everything about ${keyword} in this complete guide.`,
        word_count: 1500,
        headings: [`Introduction to ${keyword}`, `Key Benefits`, `Best Practices`, `Conclusion`],
        key_topics: [keyword, 'guide', 'best practices', 'benefits', 'implementation'],
        content_structure: {
          intro_present: true,
          conclusion_present: true,
          numbered_lists: 2,
          bullet_points: 5
        }
      },
      {
        url: `https://example.com/advanced-${keyword.replace(/\s+/g, '-')}`,
        title: `Advanced ${keyword} Strategies`,
        content: `Advanced strategies and techniques for ${keyword} implementation.`,
        meta_description: `Advanced ${keyword} strategies for professionals.`,
        word_count: 2200,
        headings: [`Advanced Techniques`, `Strategy Overview`, `Implementation`, `Results`],
        key_topics: [keyword, 'advanced', 'strategies', 'implementation', 'techniques'],
        content_structure: {
          intro_present: true,
          conclusion_present: true,
          numbered_lists: 3,
          bullet_points: 8
        }
      },
      {
        url: `https://example.com/${keyword.replace(/\s+/g, '-')}-tips`,
        title: `Top Tips for ${keyword}`,
        content: `Essential tips and tricks for mastering ${keyword}.`,
        meta_description: `Top tips and tricks for ${keyword} success.`,
        word_count: 1200,
        headings: [`Getting Started`, `Pro Tips`, `Common Mistakes`, `Expert Advice`],
        key_topics: [keyword, 'tips', 'tricks', 'expert advice', 'mistakes'],
        content_structure: {
          intro_present: true,
          conclusion_present: true,
          numbered_lists: 1,
          bullet_points: 10
        }
      }
    ];

         return {
       keyword: keyword.trim(),
       search_metadata: {
         search_query: keyword.trim(),
         total_results: 3,
         timestamp: new Date().toISOString()
       },
       top_results: mockAnalyses
     };
  }

  /**
   * Test Firecrawl connection and functionality
   * Why this matters: Validates that Firecrawl integration is working before processing real keywords.
   */
  async testConnection(): Promise<boolean> {
    // Ensure client is initialized before testing
    if (!this.client) {
      console.log('⚠️ Firecrawl client not ready for testing, initializing now...');
      await this.initializeClient();
    }
    
    if (!this.client) {
      console.log('❌ Firecrawl client failed to initialize for testing');
      return false;
    }

    try {
      // Test with retry logic but shorter timeout
      const testResult = await retryWithBackoff(
        async () => {
          const testResponse = await Promise.race([
            this.client!.search('test query', {
              limit: 1,
              scrapeOptions: {
                formats: ['markdown'],
                onlyMainContent: true
              }
            }),
            this.createTimeoutPromise(10000) // 10 second timeout for test
          ]);

          if (!testResponse.success || !testResponse.data || testResponse.data.length === 0) {
            throw new Error('Test search returned no results');
          }

          return true;
        },
        {
          maxRetries: 2, // Fewer retries for connection test
          baseDelayMs: 1000,
          maxDelayMs: 3000,
          backoffMultiplier: 2,
          jitterMs: 500
        },
        'Firecrawl Connection Test'
      );

      console.log('✅ Firecrawl connection test successful');
      return testResult;
    } catch (error) {
      console.error('❌ Firecrawl connection test failed:', error);
      return false;
    }
  }

  /**
   * Get service status for monitoring
   */
  getServiceStatus(): { 
    initialized: boolean; 
    hasApiKey: boolean; 
    circuitBreakerState: any;
    rateLimitActive: boolean;
  } {
    return {
      initialized: !!this.client,
      hasApiKey: !!process.env.FIRECRAWL_API_KEY,
      circuitBreakerState: this.circuitBreaker.getState(),
      rateLimitActive: Date.now() - (this.rateLimiter as any).lastRequestTime < DEFAULT_RATE_LIMITS.firecrawl
    };
  }
}

// Export singleton instance
export const firecrawlService = new FirecrawlService();
export default firecrawlService; 