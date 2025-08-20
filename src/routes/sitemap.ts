import { Router, Request, Response } from 'express';
import FirecrawlService from '../services/firecrawlService';

const router = Router();

interface SitemapUrl {
  id: string;
  title: string;
  description: string;
  url: string;
  scrapedAt: Date;
  contentPreview?: string;
}

interface SitemapScrapeRequest {
  sitemapUrl: string;
}

interface SitemapScrapeResult {
  success: boolean;
  data?: {
    sitemapUrl: string;
    urls: SitemapUrl[];
    totalUrls: number;
    scrapedAt: Date;
  };
  error?: string;
}

/**
 * POST /api/sitemap/scrape
 * Scrape a sitemap URL and extract content from all found URLs
 * Why this matters: Enables users to build knowledge bases from existing sitemaps for internal linking
 */
router.post('/scrape', async (req: Request, res: Response): Promise<any> => {
  try {
    const { sitemapUrl } = req.body as SitemapScrapeRequest;

    if (!sitemapUrl || !sitemapUrl.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Sitemap URL is required'
      });
    }

    console.log(`🗺️ Starting sitemap scrape for: ${sitemapUrl}`);

    // Step 1: Validate sitemap URL format
    if (!isValidUrl(sitemapUrl)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sitemap URL format'
      });
    }

    // Step 2: Parse sitemap XML to extract URLs
    const urls = await parseSitemapXML(sitemapUrl);
    
    if (urls.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No URLs found in sitemap'
      });
    }

    console.log(`📋 Found ${urls.length} URLs in sitemap`);

    // Step 3: Use Firecrawl to extract lightweight metadata only
    const firecrawlService = new FirecrawlService();
    const sitemapUrls: SitemapUrl[] = [];
    
    // Process URLs with configurable concurrent workers for speed
    // Why this matters: Higher concurrency = faster processing, but limited by Firecrawl plan
    let batchSize = process.env.SITEMAP_WORKERS ? parseInt(process.env.SITEMAP_WORKERS) : 15; // Conservative default
    let rateLimitHits = 0;
    
    console.log(`🚀 Starting sitemap processing with ${batchSize} concurrent workers`);
    console.log(`📊 Performance estimate: ~${Math.ceil(urls.length / batchSize * 1.5)} seconds with ${batchSize} workers`);
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      
      console.log(`🔍 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(urls.length / batchSize)} (${batch.length} URLs)`);
      
      const batchResults = await Promise.allSettled(
        batch.map(async (url) => {
          try {
            // Use lightweight metadata-only extraction for speed
            const result = await firecrawlService.extractMetadataOnly(url);
            
            const title = result.title || extractTitleFromUrl(url);
            const description = result.description || 'No description available';
            
            return {
              id: generateUrlId(url),
              title: title,
              description: description.length > 200 ? description.substring(0, 200) + '...' : description,
              url: url,
              scrapedAt: new Date(),
              contentPreview: title + '...'
            };
            
          } catch (error) {
            console.warn(`⚠️ Failed to scrape ${url}:`, error);
            // Fallback to URL-based title if scraping fails
            return {
              id: generateUrlId(url),
              title: extractTitleFromUrl(url),
              description: 'No description available',
              url: url,
              scrapedAt: new Date(),
              contentPreview: extractTitleFromUrl(url) + '...'
            };
          }
        })
      );

      // Add successful results and track failures for auto-scaling
      let batchFailures = 0;
      let batchRateLimits = 0;
      
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          sitemapUrls.push(result.value);
        } else {
          batchFailures++;
          
          // Better rate limit detection
          if (result.status === 'rejected') {
            const errorMsg = result.reason?.message || '';
            if (errorMsg.includes('429') || 
                errorMsg.includes('Too Many Requests') || 
                errorMsg.includes('rate limit') ||
                errorMsg.includes('rate')) {
              rateLimitHits++;
              batchRateLimits++;
            }
          } else if (result.status === 'fulfilled' && result.value && 'isRateLimit' in result.value && (result.value as any).isRateLimit) {
            rateLimitHits++;
            batchRateLimits++;
          }
        }
      });

      // More aggressive auto-scaling for rate limits
      // Why this matters: Prevents cascading rate limit failures
      if (batchRateLimits > batch.length * 0.3 && batchSize > 5) { // If >30% rate limited
        const oldBatchSize = batchSize;
        batchSize = Math.max(5, Math.floor(batchSize * 0.5)); // Cut in half
        console.log(`🚨 Aggressive auto-scaling: ${oldBatchSize} → ${batchSize} workers (${batchRateLimits}/${batch.length} rate limited)`);
      } else if (batchRateLimits > 0 && batchSize > 10) { // Any rate limits
        const oldBatchSize = batchSize;
        batchSize = Math.max(10, Math.floor(batchSize * 0.8)); // Reduce by 20%
        console.log(`⚖️ Auto-scaling down: ${oldBatchSize} → ${batchSize} workers (${batchRateLimits} rate limits this batch)`);
      }

      const successRate = ((batch.length - batchFailures) / batch.length * 100).toFixed(1);
      console.log(`📊 Batch complete: ${successRate}% success rate (${batch.length - batchFailures}/${batch.length})`);

      // Dynamic delay with exponential backoff for rate limits
      // Why this matters: Gives servers time to recover from rate limiting
      if (i + batchSize < urls.length) {
        let delay = batchSize > 30 ? 1000 : (batchSize > 20 ? 750 : 500);
        
        // Exponential backoff for rate limits
        if (batchRateLimits > 0) {
          delay *= Math.pow(2, Math.min(rateLimitHits, 4)); // Max 16x delay
          console.log(`🕐 Rate limit backoff: ${delay}ms (${batchRateLimits} rate limits, total: ${rateLimitHits})`);
        } else {
          console.log(`⏳ Normal delay: ${delay}ms (batch size: ${batchSize})`);
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    console.log(`✅ Sitemap scrape completed: ${sitemapUrls.length}/${urls.length} URLs successfully processed`);

    const result: SitemapScrapeResult = {
      success: true,
      data: {
        sitemapUrl,
        urls: sitemapUrls,
        totalUrls: sitemapUrls.length,
        scrapedAt: new Date()
      }
    };

    res.json(result);

  } catch (error) {
    console.error('❌ Sitemap scrape failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Sitemap scrape failed'
    });
  }
});

/**
 * Parse sitemap XML to extract URLs
 * Why this matters: Extracts all URLs from XML sitemap format for processing
 */
async function parseSitemapXML(sitemapUrl: string): Promise<string[]> {
  try {
    console.log(`📄 Parsing sitemap XML: ${sitemapUrl}`);
    
    // Fetch sitemap content
    const response = await fetch(sitemapUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch sitemap: ${response.status} ${response.statusText}`);
    }

    const xmlContent = await response.text();
    
    // Parse XML to extract URLs
    const urls: string[] = [];
    
    // Match <loc> tags in sitemap XML
    const locMatches = xmlContent.match(/<loc>(.*?)<\/loc>/g);
    if (locMatches) {
      locMatches.forEach(match => {
        const url = match.replace(/<\/?loc>/g, '').trim();
        if (url && isValidUrl(url)) {
          urls.push(url);
        }
      });
    }

    // If no <loc> tags found, try <url> tags with nested <loc>
    if (urls.length === 0) {
      const urlMatches = xmlContent.match(/<url>[\s\S]*?<\/url>/g);
      if (urlMatches) {
        urlMatches.forEach(urlBlock => {
          const locMatch = urlBlock.match(/<loc>(.*?)<\/loc>/);
          if (locMatch) {
            const url = locMatch[1].trim();
            if (url && isValidUrl(url)) {
              urls.push(url);
            }
          }
        });
      }
    }

    // Remove duplicates
    const uniqueUrls = [...new Set(urls)];
    
    console.log(`📊 Extracted ${uniqueUrls.length} unique URLs from sitemap`);
    return uniqueUrls;

  } catch (error) {
    console.error('❌ Sitemap XML parsing failed:', error);
    throw new Error(`Failed to parse sitemap: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate URL format
 * Why this matters: Ensures we only process valid HTTP/HTTPS URLs
 */
function isValidUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Generate unique ID for URL
 * Why this matters: Creates consistent IDs for sitemap URLs
 */
function generateUrlId(url: string): string {
  return `url-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Extract title from URL as fallback
 * Why this matters: Provides a readable title when page title extraction fails
 */
function extractTitleFromUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    
    // Extract last segment of path and clean it up
    const segments = pathname.split('/').filter(s => s);
    if (segments.length === 0) {
      return parsedUrl.hostname;
    }
    
    const lastSegment = segments[segments.length - 1];
    
    // Clean up the segment to make it readable
    return lastSegment
      .replace(/\.[^.]*$/, '') // Remove file extension
      .replace(/[-_]/g, ' ') // Replace hyphens and underscores with spaces
      .replace(/\b\w/g, l => l.toUpperCase()) // Capitalize first letter of each word
      .trim();
  } catch {
    return 'Untitled Page';
  }
}

/**
 * GET /api/sitemap/health
 * Health check for sitemap service
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Test Firecrawl service availability
    const firecrawlService = new FirecrawlService();
    const healthCheck = await firecrawlService.healthCheck();
    
    res.json({
      success: true,
      service: 'sitemap',
      firecrawl: healthCheck,
      message: 'Sitemap service is operational',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Sitemap health check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Sitemap service health check failed'
    });
  }
});

export default router;
export type { SitemapUrl, SitemapScrapeResult };
