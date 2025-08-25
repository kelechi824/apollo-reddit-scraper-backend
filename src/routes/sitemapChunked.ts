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

interface ParseSitemapRequest {
  sitemapUrl: string;
}

interface ParseSitemapResponse {
  success: boolean;
  data?: {
    sitemapUrl: string;
    urls: string[];
    totalUrls: number;
    sessionId: string;
  };
  error?: string;
}

interface ScrapeChunkRequest {
  urls: string[];
  sessionId: string;
}

interface ScrapeChunkResponse {
  success: boolean;
  data?: {
    urls: SitemapUrl[];
    processed: number;
    failed: number;
  };
  error?: string;
}

// In-memory session storage (use Redis/Database in production)
const sitemapSessions = new Map<string, {
  sitemapUrl: string;
  totalUrls: number;
  processedUrls: number;
  createdAt: Date;
}>();

/**
 * POST /api/sitemap/parse
 * Parse sitemap and return URLs without scraping
 * Why this matters: Quickly returns all URLs for progressive processing
 */
router.post('/parse', async (req: Request, res: Response): Promise<any> => {
  try {
    const { sitemapUrl } = req.body as ParseSitemapRequest;

    if (!sitemapUrl || !sitemapUrl.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Sitemap URL is required'
      });
    }

    console.log(`🗺️ Parsing sitemap: ${sitemapUrl}`);

    // Validate URL format
    if (!isValidUrl(sitemapUrl)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sitemap URL format'
      });
    }

    // Parse sitemap XML to extract URLs
    const urls = await parseSitemapXML(sitemapUrl);
    
    if (urls.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No URLs found in sitemap'
      });
    }

    // Create session for this sitemap
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sitemapSessions.set(sessionId, {
      sitemapUrl,
      totalUrls: urls.length,
      processedUrls: 0,
      createdAt: new Date()
    });

    // Clean up old sessions (older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [id, session] of sitemapSessions.entries()) {
      if (session.createdAt < oneHourAgo) {
        sitemapSessions.delete(id);
      }
    }

    console.log(`✅ Parsed ${urls.length} URLs from sitemap`);

    const response: ParseSitemapResponse = {
      success: true,
      data: {
        sitemapUrl,
        urls,
        totalUrls: urls.length,
        sessionId
      }
    };

    res.json(response);

  } catch (error) {
    console.error('❌ Sitemap parse failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Sitemap parse failed'
    });
  }
});

/**
 * POST /api/sitemap/scrape-chunk
 * Scrape a chunk of URLs
 * Why this matters: Processes small batches to avoid timeouts
 */
router.post('/scrape-chunk', async (req: Request, res: Response): Promise<any> => {
  try {
    const { urls, sessionId } = req.body as ScrapeChunkRequest;

    if (!urls || urls.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'URLs are required'
      });
    }

    // Limit chunk size to prevent timeouts
    const maxChunkSize = 20;
    const urlsToProcess = urls.slice(0, maxChunkSize);

    console.log(`🔍 Processing chunk of ${urlsToProcess.length} URLs`);

    const firecrawlService = new FirecrawlService();
    const sitemapUrls: SitemapUrl[] = [];
    let failed = 0;

    // Process URLs with limited concurrency
    const batchSize = 5; // Conservative for reliability
    
    for (let i = 0; i < urlsToProcess.length; i += batchSize) {
      const batch = urlsToProcess.slice(i, i + batchSize);
      
      const batchResults = await Promise.allSettled(
        batch.map(async (url) => {
          try {
            // Use lightweight metadata-only extraction
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
            // Return fallback data
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

      // Collect results
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          sitemapUrls.push(result.value);
        } else {
          failed++;
        }
      });

      // Small delay between batches
      if (i + batchSize < urlsToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Update session if provided
    if (sessionId && sitemapSessions.has(sessionId)) {
      const session = sitemapSessions.get(sessionId)!;
      session.processedUrls += sitemapUrls.length;
    }

    console.log(`✅ Chunk processed: ${sitemapUrls.length}/${urlsToProcess.length} URLs`);

    const response: ScrapeChunkResponse = {
      success: true,
      data: {
        urls: sitemapUrls,
        processed: sitemapUrls.length,
        failed
      }
    };

    res.json(response);

  } catch (error) {
    console.error('❌ Chunk scrape failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Chunk scrape failed'
    });
  }
});

/**
 * GET /api/sitemap/session/:sessionId
 * Get session status
 * Why this matters: Tracks progress of sitemap processing
 */
router.get('/session/:sessionId', async (req: Request, res: Response): Promise<any> => {
  try {
    const { sessionId } = req.params;

    const session = sitemapSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      data: {
        ...session,
        progress: (session.processedUrls / session.totalUrls * 100).toFixed(1)
      }
    });

  } catch (error) {
    console.error('❌ Session fetch failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session'
    });
  }
});

/**
 * Parse sitemap XML to extract URLs
 * Why this matters: Extracts all URLs from XML sitemap format
 */
async function parseSitemapXML(sitemapUrl: string): Promise<string[]> {
  try {
    console.log(`📄 Parsing sitemap XML: ${sitemapUrl}`);
    
    // Fetch sitemap content with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    const response = await fetch(sitemapUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ApolloBot/1.0)'
      }
    });
    
    clearTimeout(timeout);
    
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
 * Why this matters: Ensures valid HTTP/HTTPS URLs
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
 * Why this matters: Creates consistent IDs
 */
function generateUrlId(url: string): string {
  return `url-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Extract title from URL as fallback
 * Why this matters: Provides readable title when extraction fails
 */
function extractTitleFromUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    
    const segments = pathname.split('/').filter(s => s);
    if (segments.length === 0) {
      return parsedUrl.hostname;
    }
    
    const lastSegment = segments[segments.length - 1];
    
    return lastSegment
      .replace(/\.[^.]*$/, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .trim();
  } catch {
    return 'Untitled Page';
  }
}

export default router;
