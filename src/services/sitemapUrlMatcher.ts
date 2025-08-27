/**
 * Sitemap URL Matcher Service
 * Why this matters: Intelligently selects the most relevant Apollo URLs from sitemap data
 * based on content context and solution categories, instead of always using generic signup URLs
 */

interface SitemapUrl {
  id: string;
  title: string;
  description: string;
  url: string;
  scrapedAt: Date;
  contentPreview?: string;
}

interface SitemapData {
  id: string;
  sitemapUrl: string;
  urls: SitemapUrl[];
  totalUrls: number;
  scrapedAt: Date;
}

export class SitemapUrlMatcher {
  
  /**
   * Solution-specific URL patterns to match against Apollo sitemap URLs
   * Why this matters: Maps solution categories to URL patterns that indicate relevant pages
   */
  private readonly solutionUrlPatterns = {
    data_quality_enrichment: [
      /data.*enrich/i,
      /contact.*data/i,
      /email.*verif/i,
      /data.*quality/i,
      /database/i,
      /accurate.*data/i,
      /clean.*data/i
    ],
    
    sales_prospecting: [
      /prospect/i,
      /lead.*generation/i,
      /find.*leads/i,
      /contact.*search/i,
      /b2b.*leads/i,
      /sales.*leads/i,
      /lead.*discovery/i
    ],
    
    sales_engagement: [
      /engagement/i,
      /outreach/i,
      /email.*sequence/i,
      /sales.*automation/i,
      /communication/i,
      /multichannel/i,
      /cadence/i
    ],
    
    pipeline_management: [
      /pipeline/i,
      /deal.*management/i,
      /forecast/i,
      /sales.*process/i,
      /opportunity/i,
      /revenue.*tracking/i,
      /sales.*workflow/i
    ],
    
    sales_intelligence: [
      /intelligence/i,
      /analytics/i,
      /insights/i,
      /competitive/i,
      /market.*research/i,
      /buyer.*intent/i,
      /sales.*analytics/i
    ],
    
    revenue_operations: [
      /revenue.*ops/i,
      /revops/i,
      /sales.*ops/i,
      /optimization/i,
      /performance/i,
      /efficiency/i,
      /workflow.*automation/i
    ],
    
    call_assistant: [
      /call.*assistant/i,
      /conversation.*intelligence/i,
      /meeting.*insights/i,
      /call.*recording/i,
      /call.*analysis/i,
      /phone.*dialer/i,
      /conversation.*analytics/i
    ],
    
    integrations: [
      /integration/i,
      /api/i,
      /connect/i,
      /sync/i,
      /crm.*integration/i,
      /salesforce.*integration/i,
      /hubspot.*integration/i
    ]
  };

  /**
   * Find the best matching URL for a given solution category
   * Why this matters: Returns the most relevant Apollo page instead of generic signup
   */
  findBestUrlForSolution(
    solutionCategory: string, 
    sitemapData: SitemapData[], 
    fallbackUrl: string = 'https://www.apollo.io/sign-up'
  ): string {
    
    console.log(`🔍 Finding best URL for solution category: ${solutionCategory}`);
    
    // Get all URLs from all sitemaps
    const allUrls: SitemapUrl[] = [];
    sitemapData.forEach(sitemap => {
      allUrls.push(...sitemap.urls);
    });
    
    if (allUrls.length === 0) {
      console.log('📭 No sitemap URLs available, using fallback');
      return fallbackUrl;
    }
    
    // Get patterns for this solution category
    const patterns = this.solutionUrlPatterns[solutionCategory as keyof typeof this.solutionUrlPatterns];
    if (!patterns) {
      console.log(`❓ No patterns defined for solution category: ${solutionCategory}, using fallback`);
      return fallbackUrl;
    }
    
    // Score each URL based on how well it matches the solution category
    const scoredUrls = allUrls.map(url => {
      let score = 0;
      const searchText = `${url.title} ${url.description} ${url.url}`.toLowerCase();
      
      // Check each pattern
      patterns.forEach(pattern => {
        if (pattern.test(searchText)) {
          score += 10; // Base score for pattern match
          
          // Bonus points for matches in title (more important)
          if (pattern.test(url.title.toLowerCase())) {
            score += 5;
          }
          
          // Bonus points for matches in URL path (indicates dedicated page)
          if (pattern.test(url.url.toLowerCase())) {
            score += 3;
          }
        }
      });
      
      // Penalty for very generic pages
      if (url.url.includes('/sign-up') || url.url.includes('/pricing') || url.url.includes('/contact')) {
        score -= 5;
      }
      
      // Bonus for pages that seem like feature/solution pages
      if (url.url.includes('/features/') || url.url.includes('/solutions/') || url.url.includes('/products/')) {
        score += 2;
      }
      
      return { url, score };
    });
    
    // Sort by score (highest first)
    scoredUrls.sort((a, b) => b.score - a.score);
    
    // Log top matches for debugging
    console.log(`🏆 Top URL matches for ${solutionCategory}:`);
    scoredUrls.slice(0, 3).forEach((item, index) => {
      console.log(`  ${index + 1}. Score: ${item.score} - ${item.url.title} (${item.url.url})`);
    });
    
    // Return the best match if it has a decent score, otherwise fallback
    const bestMatch = scoredUrls[0];
    if (bestMatch && bestMatch.score > 0) {
      console.log(`✅ Selected URL: ${bestMatch.url.url} (score: ${bestMatch.score})`);
      return bestMatch.url.url;
    }
    
    console.log(`📭 No good matches found, using fallback: ${fallbackUrl}`);
    return fallbackUrl;
  }

  /**
   * Find URLs that might be good for competitor conquesting
   * Why this matters: Selects comparison or alternative pages for competitor campaigns
   */
  findCompetitorConquestingUrl(
    competitorName: string,
    sitemapData: SitemapData[],
    fallbackUrl: string = 'https://www.apollo.io/sign-up'
  ): string {
    
    console.log(`🥊 Finding competitor conquesting URL for: ${competitorName}`);
    
    const allUrls: SitemapUrl[] = [];
    sitemapData.forEach(sitemap => {
      allUrls.push(...sitemap.urls);
    });
    
    if (allUrls.length === 0) {
      return fallbackUrl;
    }
    
    const competitorLower = competitorName.toLowerCase();
    
    // Look for comparison or alternative pages
    const competitorPatterns = [
      new RegExp(`${competitorLower}.*alternative`, 'i'),
      new RegExp(`vs.*${competitorLower}`, 'i'),
      new RegExp(`${competitorLower}.*comparison`, 'i'),
      new RegExp(`compare.*${competitorLower}`, 'i'),
      /alternatives?/i,
      /comparison/i,
      /vs\./i,
      /versus/i
    ];
    
    const scoredUrls = allUrls.map(url => {
      let score = 0;
      const searchText = `${url.title} ${url.description} ${url.url}`.toLowerCase();
      
      competitorPatterns.forEach(pattern => {
        if (pattern.test(searchText)) {
          score += 15; // High score for competitor-related content
          
          if (pattern.test(url.title.toLowerCase())) {
            score += 10; // Extra bonus for title matches
          }
        }
      });
      
      return { url, score };
    });
    
    scoredUrls.sort((a, b) => b.score - a.score);
    
    const bestMatch = scoredUrls[0];
    if (bestMatch && bestMatch.score > 0) {
      console.log(`✅ Selected competitor URL: ${bestMatch.url.url} (score: ${bestMatch.score})`);
      return bestMatch.url.url;
    }
    
    // If no competitor-specific page found, try to find a general solution page
    return this.findBestUrlForSolution('sales_intelligence', sitemapData, fallbackUrl);
  }

  /**
   * Get a random high-value Apollo page for general use
   * Why this matters: Provides variety in CTAs when no specific match is found
   */
  getRandomHighValueUrl(
    sitemapData: SitemapData[],
    fallbackUrl: string = 'https://www.apollo.io/sign-up'
  ): string {
    
    const allUrls: SitemapUrl[] = [];
    sitemapData.forEach(sitemap => {
      allUrls.push(...sitemap.urls);
    });
    
    if (allUrls.length === 0) {
      return fallbackUrl;
    }
    
    // Filter for high-value pages (features, solutions, products)
    const highValueUrls = allUrls.filter(url => {
      const urlLower = url.url.toLowerCase();
      return (
        urlLower.includes('/features/') ||
        urlLower.includes('/solutions/') ||
        urlLower.includes('/products/') ||
        urlLower.includes('/platform/') ||
        (url.title.toLowerCase().includes('apollo') && !urlLower.includes('/sign-up'))
      );
    });
    
    if (highValueUrls.length > 0) {
      const randomUrl = highValueUrls[Math.floor(Math.random() * highValueUrls.length)];
      console.log(`🎲 Selected random high-value URL: ${randomUrl.url}`);
      return randomUrl.url;
    }
    
    return fallbackUrl;
  }
}

export default SitemapUrlMatcher;
