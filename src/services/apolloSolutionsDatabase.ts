/**
 * Apollo Solution represents a specific Apollo product/feature with contextual information
 * Why this matters: Provides structured data for matching content themes to specific Apollo solutions
 */
export interface ApolloSolution {
  id: string;
  title: string;
  description: string;
  url: string;
  category: ApolloSolutionCategory;
  painPointKeywords: string[]; // Keywords that indicate this solution is relevant
  solutionKeywords: string[]; // Keywords that describe this solution
  contextClues: string[]; // Context clues that suggest this solution
  priority: number; // 1-10 priority for matching (10 = highest)
  source: 'sitemap' | 'brand_kit' | 'hybrid';
}

/**
 * Apollo Solution Categories
 * Why this matters: Organizes solutions by pain point categories for intelligent matching
 */
export type ApolloSolutionCategory = 
  | 'data_quality_enrichment'
  | 'sales_prospecting'
  | 'sales_engagement'
  | 'pipeline_management'
  | 'sales_intelligence'
  | 'revenue_operations'
  | 'call_assistant'
  | 'integrations'
  | 'general';

/**
 * Sitemap URL structure (matches frontend interface)
 * Why this matters: Ensures compatibility with existing sitemap data structure
 */
interface SitemapUrl {
  id: string;
  title: string;
  description: string;
  url: string;
  scrapedAt: Date;
  contentPreview?: string;
}

/**
 * Sitemap Data structure (matches frontend interface)
 * Why this matters: Ensures compatibility with existing sitemap data structure
 */
interface SitemapData {
  id: string;
  sitemapUrl: string;
  urls: SitemapUrl[];
  totalUrls: number;
  scrapedAt: Date;
  sessionId?: string;
  pendingUrls?: string[];
  status?: 'parsing' | 'scraping' | 'paused' | 'completed' | 'failed';
  progress?: number;
}

/**
 * Solutions Database Result
 * Why this matters: Provides comprehensive solution database with metadata for contextual matching
 */
export interface SolutionsDatabaseResult {
  solutions: ApolloSolution[];
  totalSolutions: number;
  categoryCounts: Record<ApolloSolutionCategory, number>;
  sitemapSolutions: number;
  brandKitSolutions: number;
  hybridSolutions: number;
  lastUpdated: string;
  processingTimeMs: number;
}

/**
 * Apollo Solutions Database Service
 * Why this matters: Creates a comprehensive database of Apollo solutions by combining
 * sitemap data with brand kit information for intelligent contextual CTA matching.
 */
class ApolloSolutionsDatabase {
  private solutions: ApolloSolution[] = [];
  private lastUpdated: string | null = null;

  constructor() {
    console.log('✅ Apollo Solutions Database initialized');
  }

  /**
   * Build comprehensive solutions database from sitemap and brand kit data
   * Why this matters: This is the core function that creates the foundation for
   * contextual CTA matching by combining live Apollo sitemap data with brand kit information.
   */
  async buildSolutionsDatabase(sitemapData?: SitemapData[], brandKitData?: any): Promise<SolutionsDatabaseResult> {
    const startTime = Date.now();
    
    try {
      console.log('🏗️ Building Apollo Solutions Database...');

      // Step 1: Load sitemap data (from localStorage simulation or provided data)
      const sitemap = await this.loadSitemapData(sitemapData);
      console.log(`📄 Loaded ${sitemap?.urls?.length || 0} URLs from sitemap data`);

      // Step 2: Extract solutions from sitemap
      const sitemapSolutions = sitemap ? this.extractSolutionsFromSitemap(sitemap) : [];
      console.log(`🔍 Extracted ${sitemapSolutions.length} solutions from sitemap`);

      // Step 3: Load brand kit solutions
      const brandKitSolutions = this.extractSolutionsFromBrandKit(brandKitData);
      console.log(`📋 Extracted ${brandKitSolutions.length} solutions from brand kit`);

      // Step 4: Combine and enhance solutions
      const combinedSolutions = this.combineAndEnhanceSolutions(sitemapSolutions, brandKitSolutions);
      console.log(`🔗 Combined into ${combinedSolutions.length} enhanced solutions`);

      // Step 5: Organize by categories and add semantic tags
      this.solutions = this.organizeSolutionsByCategories(combinedSolutions);
      console.log(`🏷️ Organized solutions into ${this.getCategoryCount()} categories`);

      // Step 6: Generate result metadata
      const processingTime = Date.now() - startTime;
      this.lastUpdated = new Date().toISOString();

      const result: SolutionsDatabaseResult = {
        solutions: this.solutions,
        totalSolutions: this.solutions.length,
        categoryCounts: this.calculateCategoryCounts(),
        sitemapSolutions: sitemapSolutions.length,
        brandKitSolutions: brandKitSolutions.length,
        hybridSolutions: combinedSolutions.filter(s => s.source === 'hybrid').length,
        lastUpdated: this.lastUpdated,
        processingTimeMs: processingTime
      };

      console.log(`✅ Solutions database built in ${processingTime}ms`);
      console.log(`📊 Results: ${result.totalSolutions} total solutions across ${Object.keys(result.categoryCounts).length} categories`);

      return result;

    } catch (error) {
      console.error('❌ Failed to build solutions database:', error);
      throw new Error(`Solutions database build failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load sitemap data (simulates localStorage access for backend)
   * Why this matters: Provides access to Apollo sitemap data that would normally be stored
   * in localStorage by SitemapPageEnhanced.tsx.
   */
  private async loadSitemapData(providedData?: SitemapData[]): Promise<SitemapData | null> {
    // If data is provided directly, use it
    if (providedData && providedData.length > 0) {
      // Find Apollo sitemap data
      const apolloSitemap = providedData.find(sitemap => 
        sitemap.sitemapUrl.includes('apollo.io') || 
        sitemap.urls.some(url => url.url.includes('apollo.io'))
      );
      return apolloSitemap || providedData[0]; // Return first if no Apollo-specific sitemap
    }

    // In a real implementation, this would access localStorage data
    // For now, return null and rely on brand kit data
    console.log('⚠️ No sitemap data provided - will rely on brand kit solutions');
    return null;
  }

  /**
   * Extract solutions from sitemap data
   * Why this matters: Converts raw sitemap URLs into structured Apollo solutions
   * with semantic information for contextual matching.
   */
  private extractSolutionsFromSitemap(sitemapData: SitemapData): ApolloSolution[] {
    const solutions: ApolloSolution[] = [];

    sitemapData.urls.forEach((url, index) => {
      // Filter for solution-related URLs
      if (this.isSolutionUrl(url.url)) {
        const solution: ApolloSolution = {
          id: `sitemap-${index}`,
          title: url.title,
          description: url.description,
          url: url.url,
          category: this.categorizeFromUrl(url.url, url.title, url.description),
          painPointKeywords: this.extractPainPointKeywords(url.title, url.description),
          solutionKeywords: this.extractSolutionKeywords(url.title, url.description),
          contextClues: this.extractContextClues(url.title, url.description),
          priority: this.calculatePriority(url.url, url.title),
          source: 'sitemap'
        };

        solutions.push(solution);
      }
    });

    return solutions;
  }

  /**
   * Extract solutions from brand kit data
   * Why this matters: Converts brand kit information into structured Apollo solutions
   * using the comprehensive product information from apollo-solutions.md.
   */
  private extractSolutionsFromBrandKit(brandKitData?: any): ApolloSolution[] {
    const solutions: ApolloSolution[] = [];

    // Core Apollo solutions from brand kit knowledge
    const coreApolloSolutions = [
      {
        id: 'brandkit-pipeline-builder',
        title: 'Pipeline Builder',
        description: 'Find the right people and book quality meetings with B2B prospecting data, multichannel outreach, AI assistants, and done-with-you outbound.',
        url: 'https://www.apollo.io/pipeline-builder',
        category: 'sales_prospecting' as ApolloSolutionCategory,
        painPointKeywords: ['lead generation', 'prospecting', 'finding contacts', 'booking meetings', 'outbound'],
        solutionKeywords: ['pipeline builder', 'prospecting', 'outreach', 'AI assistants', 'lead generation'],
        contextClues: ['need more leads', 'struggling to find prospects', 'booking meetings', 'outbound challenges'],
        priority: 9,
        source: 'brand_kit' as const
      },
      {
        id: 'brandkit-data-enrichment',
        title: 'Data Enrichment',
        description: 'Keep your data up-to-date, all the time with CRM enrichment, waterfall enrichment, CSV enrichment, and enrichment API.',
        url: 'https://www.apollo.io/data-enrichment',
        category: 'data_quality_enrichment' as ApolloSolutionCategory,
        painPointKeywords: ['dirty data', 'inaccurate data', 'data quality', 'bounced emails', 'outdated contacts'],
        solutionKeywords: ['data enrichment', 'CRM enrichment', 'data quality', 'contact verification', 'data cleansing'],
        contextClues: ['data problems', 'email bounces', 'inaccurate information', 'data maintenance'],
        priority: 10,
        source: 'brand_kit' as const
      },
      {
        id: 'brandkit-call-assistant',
        title: 'Call Assistant',
        description: 'Turn conversations into deals with AI assistance including meeting scheduler, pre-meeting insights, call recorder & insights, and automated meeting follow-up.',
        url: 'https://www.apollo.io/call-assistant',
        category: 'call_assistant' as ApolloSolutionCategory,
        painPointKeywords: ['meeting scheduling', 'call preparation', 'conversation intelligence', 'follow-up'],
        solutionKeywords: ['call assistant', 'meeting scheduler', 'call recording', 'conversation intelligence'],
        contextClues: ['scheduling challenges', 'call preparation', 'meeting insights', 'follow-up automation'],
        priority: 8,
        source: 'brand_kit' as const
      },
      {
        id: 'brandkit-sales-engagement',
        title: 'Sales Engagement Platform',
        description: 'Automate and scale your outreach with multichannel sequences, email automation, and personalized messaging at scale.',
        url: 'https://www.apollo.io/sales-engagement',
        category: 'sales_engagement' as ApolloSolutionCategory,
        painPointKeywords: ['email outreach', 'sequence automation', 'personalization', 'engagement', 'response rates'],
        solutionKeywords: ['sales engagement', 'email sequences', 'automation', 'multichannel outreach'],
        contextClues: ['low response rates', 'manual outreach', 'scaling challenges', 'engagement problems'],
        priority: 9,
        source: 'brand_kit' as const
      },
      {
        id: 'brandkit-revenue-operations',
        title: 'Revenue Operations',
        description: 'Optimize your entire revenue process with analytics, forecasting, and workflow automation for sales teams.',
        url: 'https://www.apollo.io/revenue-operations',
        category: 'revenue_operations' as ApolloSolutionCategory,
        painPointKeywords: ['pipeline visibility', 'forecasting', 'sales analytics', 'workflow automation', 'revenue optimization'],
        solutionKeywords: ['revenue operations', 'sales analytics', 'forecasting', 'pipeline management'],
        contextClues: ['pipeline problems', 'forecasting issues', 'lack of visibility', 'process optimization'],
        priority: 8,
        source: 'brand_kit' as const
      }
    ];

    solutions.push(...coreApolloSolutions);

    // Add brand kit specific information if provided
    if (brandKitData) {
      // Extract additional solutions from brand kit custom variables or about section
      const additionalSolutions = this.extractAdditionalBrandKitSolutions(brandKitData);
      solutions.push(...additionalSolutions);
    }

    return solutions;
  }

  /**
   * Extract additional solutions from brand kit data
   * Why this matters: Leverages custom brand kit information to create additional solution entries.
   */
  private extractAdditionalBrandKitSolutions(brandKitData: any): ApolloSolution[] {
    const solutions: ApolloSolution[] = [];

    // Extract from aboutBrand or custom variables if they contain solution information
    if (brandKitData.aboutBrand) {
      const aboutText = brandKitData.aboutBrand.toLowerCase();
      
      // Look for additional solution mentions
      if (aboutText.includes('integration') || aboutText.includes('api')) {
        solutions.push({
          id: 'brandkit-integrations',
          title: 'Apollo Integrations',
          description: 'Seamlessly connect Apollo with your existing tech stack through native integrations and APIs.',
          url: 'https://www.apollo.io/integrations',
          category: 'integrations',
          painPointKeywords: ['integration challenges', 'data silos', 'tech stack', 'API', 'connectivity'],
          solutionKeywords: ['integrations', 'API', 'connectors', 'tech stack'],
          contextClues: ['integration problems', 'data silos', 'system connectivity'],
          priority: 7,
          source: 'brand_kit'
        });
      }
    }

    return solutions;
  }

  /**
   * Combine and enhance solutions from different sources
   * Why this matters: Merges sitemap and brand kit solutions while avoiding duplicates
   * and creating hybrid solutions with enhanced information.
   */
  private combineAndEnhanceSolutions(sitemapSolutions: ApolloSolution[], brandKitSolutions: ApolloSolution[]): ApolloSolution[] {
    const combinedSolutions: ApolloSolution[] = [];
    const urlMap = new Map<string, ApolloSolution>();

    // Add brand kit solutions first (they have priority)
    brandKitSolutions.forEach(solution => {
      urlMap.set(this.normalizeUrl(solution.url), solution);
      combinedSolutions.push(solution);
    });

    // Add sitemap solutions, enhancing existing ones or adding new ones
    sitemapSolutions.forEach(sitemapSolution => {
      const normalizedUrl = this.normalizeUrl(sitemapSolution.url);
      const existingSolution = urlMap.get(normalizedUrl);

      if (existingSolution) {
        // Enhance existing solution with sitemap data
        const enhancedSolution: ApolloSolution = {
          ...existingSolution,
          title: sitemapSolution.title || existingSolution.title,
          description: sitemapSolution.description || existingSolution.description,
          painPointKeywords: [...new Set([...existingSolution.painPointKeywords, ...sitemapSolution.painPointKeywords])],
          solutionKeywords: [...new Set([...existingSolution.solutionKeywords, ...sitemapSolution.solutionKeywords])],
          contextClues: [...new Set([...existingSolution.contextClues, ...sitemapSolution.contextClues])],
          source: 'hybrid'
        };

        // Replace in combined solutions
        const index = combinedSolutions.findIndex(s => s.id === existingSolution.id);
        if (index !== -1) {
          combinedSolutions[index] = enhancedSolution;
        }
      } else {
        // Add new sitemap solution
        combinedSolutions.push(sitemapSolution);
      }
    });

    return combinedSolutions;
  }

  /**
   * Organize solutions by categories and add semantic tags
   * Why this matters: Structures solutions for efficient matching and adds additional semantic information.
   */
  private organizeSolutionsByCategories(solutions: ApolloSolution[]): ApolloSolution[] {
    return solutions.map(solution => ({
      ...solution,
      // Enhance with additional semantic tags based on category
      painPointKeywords: this.enhancePainPointKeywords(solution),
      solutionKeywords: this.enhanceSolutionKeywords(solution),
      contextClues: this.enhanceContextClues(solution)
    })).sort((a, b) => b.priority - a.priority); // Sort by priority
  }

  /**
   * Check if URL is a solution-related page
   * Why this matters: Filters sitemap URLs to focus on actual Apollo solution pages.
   */
  private isSolutionUrl(url: string): boolean {
    const solutionIndicators = [
      '/data-enrichment',
      '/sales-engagement',
      '/prospecting',
      '/pipeline',
      '/call-assistant',
      '/integrations',
      '/revenue-operations',
      '/features',
      '/products',
      '/solutions'
    ];

    return solutionIndicators.some(indicator => url.includes(indicator)) ||
           (url.match(/\/[a-z-]+\/?$/) !== null && !url.includes('/blog') && !url.includes('/about'));
  }

  /**
   * Categorize solution from URL and content
   * Why this matters: Automatically categorizes solutions based on URL patterns and content analysis.
   */
  private categorizeFromUrl(url: string, title: string, description: string): ApolloSolutionCategory {
    const content = `${url} ${title} ${description}`.toLowerCase();

    if (content.includes('data') && (content.includes('enrich') || content.includes('quality') || content.includes('clean'))) {
      return 'data_quality_enrichment';
    }
    if (content.includes('prospect') || content.includes('lead') || content.includes('find')) {
      return 'sales_prospecting';
    }
    if (content.includes('engagement') || content.includes('outreach') || content.includes('email') || content.includes('sequence')) {
      return 'sales_engagement';
    }
    if (content.includes('pipeline') || content.includes('deal') || content.includes('manage')) {
      return 'pipeline_management';
    }
    if (content.includes('intelligence') || content.includes('insight') || content.includes('analytics')) {
      return 'sales_intelligence';
    }
    if (content.includes('revenue') || content.includes('operations') || content.includes('forecast')) {
      return 'revenue_operations';
    }
    if (content.includes('call') || content.includes('meeting') || content.includes('conversation')) {
      return 'call_assistant';
    }
    if (content.includes('integration') || content.includes('api') || content.includes('connect')) {
      return 'integrations';
    }

    return 'general';
  }

  /**
   * Extract pain point keywords from content
   * Why this matters: Identifies keywords that indicate when this solution is relevant.
   */
  private extractPainPointKeywords(title: string, description: string): string[] {
    const content = `${title} ${description}`.toLowerCase();
    const keywords: string[] = [];

    // Common pain point patterns
    const painPointPatterns = [
      'dirty data', 'inaccurate data', 'bad data', 'data quality',
      'bounced emails', 'email bounces', 'delivery issues',
      'manual process', 'time consuming', 'inefficient',
      'low response rates', 'poor engagement', 'no replies',
      'pipeline visibility', 'forecasting', 'tracking deals',
      'finding prospects', 'lead generation', 'prospecting',
      'scaling outreach', 'automation', 'workflow'
    ];

    painPointPatterns.forEach(pattern => {
      if (content.includes(pattern)) {
        keywords.push(pattern);
      }
    });

    return keywords;
  }

  /**
   * Extract solution keywords from content
   * Why this matters: Identifies keywords that describe what this solution does.
   */
  private extractSolutionKeywords(title: string, description: string): string[] {
    const content = `${title} ${description}`.toLowerCase();
    const keywords: string[] = [];

    // Extract key terms
    const terms = content.match(/\b[a-z]{3,}\b/g) || [];
    const relevantTerms = terms.filter(term => 
      !['the', 'and', 'for', 'with', 'your', 'you', 'are', 'can', 'will', 'all'].includes(term)
    );

    keywords.push(...relevantTerms.slice(0, 10)); // Limit to top 10 terms

    return [...new Set(keywords)]; // Remove duplicates
  }

  /**
   * Extract context clues from content
   * Why this matters: Identifies contextual indicators that suggest this solution is needed.
   */
  private extractContextClues(title: string, description: string): string[] {
    const content = `${title} ${description}`.toLowerCase();
    const clues: string[] = [];

    // Context patterns
    if (content.includes('automat')) clues.push('automation needs');
    if (content.includes('scale') || content.includes('scaling')) clues.push('scaling challenges');
    if (content.includes('time') && content.includes('save')) clues.push('time efficiency');
    if (content.includes('accurate') || content.includes('quality')) clues.push('accuracy requirements');
    if (content.includes('insight') || content.includes('analytics')) clues.push('data insights needed');

    return clues;
  }

  /**
   * Calculate priority for solution matching
   * Why this matters: Determines which solutions should be prioritized for contextual matching.
   */
  private calculatePriority(url: string, title: string): number {
    let priority = 5; // Base priority

    // High priority solutions
    if (url.includes('data-enrichment') || title.toLowerCase().includes('data')) priority += 3;
    if (url.includes('sales-engagement') || title.toLowerCase().includes('engagement')) priority += 2;
    if (url.includes('prospecting') || title.toLowerCase().includes('prospect')) priority += 2;

    // Medium priority
    if (url.includes('pipeline') || url.includes('revenue')) priority += 1;

    return Math.min(priority, 10); // Cap at 10
  }

  /**
   * Enhance pain point keywords based on category
   * Why this matters: Adds category-specific pain point keywords for better matching.
   */
  private enhancePainPointKeywords(solution: ApolloSolution): string[] {
    const enhanced = [...solution.painPointKeywords];

    switch (solution.category) {
      case 'data_quality_enrichment':
        enhanced.push('data issues', 'contact accuracy', 'email deliverability');
        break;
      case 'sales_prospecting':
        enhanced.push('lead shortage', 'prospecting challenges', 'finding contacts');
        break;
      case 'sales_engagement':
        enhanced.push('low open rates', 'poor response rates', 'manual outreach');
        break;
      case 'pipeline_management':
        enhanced.push('deal tracking', 'pipeline visibility', 'forecasting accuracy');
        break;
      case 'revenue_operations':
        enhanced.push('process inefficiency', 'lack of insights', 'workflow problems');
        break;
    }

    return [...new Set(enhanced)];
  }

  /**
   * Enhance solution keywords based on category
   * Why this matters: Adds category-specific solution keywords for better matching.
   */
  private enhanceSolutionKeywords(solution: ApolloSolution): string[] {
    const enhanced = [...solution.solutionKeywords];

    switch (solution.category) {
      case 'data_quality_enrichment':
        enhanced.push('data verification', 'contact enrichment', 'data cleansing');
        break;
      case 'sales_prospecting':
        enhanced.push('lead discovery', 'contact database', 'prospect research');
        break;
      case 'sales_engagement':
        enhanced.push('email automation', 'sequence management', 'outreach optimization');
        break;
    }

    return [...new Set(enhanced)];
  }

  /**
   * Enhance context clues based on category
   * Why this matters: Adds category-specific context clues for better matching.
   */
  private enhanceContextClues(solution: ApolloSolution): string[] {
    const enhanced = [...solution.contextClues];

    switch (solution.category) {
      case 'data_quality_enrichment':
        enhanced.push('data maintenance needs', 'contact verification required');
        break;
      case 'sales_prospecting':
        enhanced.push('need more leads', 'prospecting difficulties');
        break;
    }

    return [...new Set(enhanced)];
  }

  /**
   * Normalize URL for comparison
   * Why this matters: Ensures consistent URL comparison when merging solutions.
   */
  private normalizeUrl(url: string): string {
    return url.toLowerCase().replace(/\/$/, '').replace(/^https?:\/\//, '');
  }

  /**
   * Calculate category counts
   * Why this matters: Provides metadata about solution distribution across categories.
   */
  private calculateCategoryCounts(): Record<ApolloSolutionCategory, number> {
    const counts: Record<ApolloSolutionCategory, number> = {
      data_quality_enrichment: 0,
      sales_prospecting: 0,
      sales_engagement: 0,
      pipeline_management: 0,
      sales_intelligence: 0,
      revenue_operations: 0,
      call_assistant: 0,
      integrations: 0,
      general: 0
    };

    this.solutions.forEach(solution => {
      counts[solution.category]++;
    });

    return counts;
  }

  /**
   * Get category count
   * Why this matters: Provides count of unique categories for logging.
   */
  private getCategoryCount(): number {
    const categories = new Set(this.solutions.map(s => s.category));
    return categories.size;
  }

  /**
   * Get solutions by category
   * Why this matters: Allows filtering solutions by specific categories for targeted matching.
   */
  getSolutionsByCategory(category: ApolloSolutionCategory): ApolloSolution[] {
    return this.solutions.filter(solution => solution.category === category);
  }

  /**
   * Search solutions by keywords
   * Why this matters: Enables keyword-based solution lookup for contextual matching.
   */
  searchSolutions(keywords: string[]): ApolloSolution[] {
    const keywordSet = new Set(keywords.map(k => k.toLowerCase()));
    
    return this.solutions
      .map(solution => ({
        solution,
        score: this.calculateMatchScore(solution, keywordSet)
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ solution }) => solution);
  }

  /**
   * Calculate match score for solution
   * Why this matters: Provides scoring mechanism for ranking solution relevance.
   */
  private calculateMatchScore(solution: ApolloSolution, keywords: Set<string>): number {
    let score = 0;

    // Check pain point keywords (highest weight)
    solution.painPointKeywords.forEach(keyword => {
      if (keywords.has(keyword.toLowerCase())) {
        score += 3;
      }
    });

    // Check solution keywords (medium weight)
    solution.solutionKeywords.forEach(keyword => {
      if (keywords.has(keyword.toLowerCase())) {
        score += 2;
      }
    });

    // Check context clues (lower weight)
    solution.contextClues.forEach(clue => {
      if (keywords.has(clue.toLowerCase())) {
        score += 1;
      }
    });

    return score * solution.priority; // Multiply by priority
  }

  /**
   * Get all solutions
   * Why this matters: Provides access to the complete solutions database.
   */
  getAllSolutions(): ApolloSolution[] {
    return this.solutions;
  }
}

export default ApolloSolutionsDatabase;
