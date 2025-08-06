import { Router, Request, Response } from 'express';
import FirecrawlService from '../services/firecrawlService';

const router = Router();

/**
 * Article Extraction Routes
 * Why this matters: Provides API endpoints for extracting article content using Firecrawl.
 */

/**
 * POST /api/article-extraction/single
 * Extract content from a single article URL
 */
router.post('/single', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    console.log(`📄 Extracting article content from: ${url}`);

    const firecrawlService = new FirecrawlService();
    const result = await firecrawlService.extractArticleContent(url);

    if (result.success) {
      console.log(`✅ Article extraction successful: ${result.data?.wordCount} words`);
      return res.json(result);
    } else {
      console.error(`❌ Article extraction failed: ${result.error}`);
      return res.status(400).json(result);
    }

  } catch (error: any) {
    console.error('❌ Article extraction route error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during article extraction'
    });
  }
});

/**
 * POST /api/article-extraction/batch
 * Extract content from multiple article URLs
 */
router.post('/batch', async (req: Request, res: Response): Promise<any> => {
  try {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'URLs array is required and must not be empty'
      });
    }

    if (urls.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10 URLs allowed per batch request'
      });
    }

    console.log(`📄 Batch extracting content from ${urls.length} URLs`);

    const firecrawlService = new FirecrawlService();
    const result = await firecrawlService.extractMultipleArticles(urls);

    if (result.success) {
      console.log(`✅ Batch extraction complete: ${result.data?.length} successful extractions`);
      return res.json(result);
    } else {
      console.error(`❌ Batch extraction failed: ${result.error}`);
      return res.status(400).json(result);
    }

  } catch (error: any) {
    console.error('❌ Batch extraction route error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during batch extraction'
    });
  }
});

/**
 * GET /api/article-extraction/health
 * Health check for Firecrawl service
 */
router.get('/health', async (req, res) => {
  try {
    console.log('🏥 Checking Firecrawl service health');

    const firecrawlService = new FirecrawlService();
    const result = await firecrawlService.healthCheck();

    if (result.success) {
      console.log('✅ Firecrawl service health check passed');
      res.json({
        success: true,
        message: result.message,
        timestamp: new Date().toISOString()
      });
    } else {
      console.error(`❌ Firecrawl service health check failed: ${result.message}`);
      res.status(503).json({
        success: false,
        error: result.message,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error: any) {
    console.error('❌ Health check route error:', error);
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/article-extraction/validate-url
 * Validate if URL is accessible and scrapeable
 */
router.post('/validate-url', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    console.log(`🔍 Validating URL accessibility: ${url}`);

    // Basic URL validation
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return res.json({
          success: false,
          error: 'URL must use HTTP or HTTPS protocol'
        });
      }
    } catch {
      return res.json({
        success: false,
        error: 'Invalid URL format'
      });
    }

    // Quick accessibility check with AbortController for timeout
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(url, { 
        method: 'HEAD',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (response.ok) {
        console.log(`✅ URL is accessible: ${response.status}`);
        return res.json({
          success: true,
          message: 'URL is accessible and ready for extraction',
          statusCode: response.status,
          contentType: response.headers.get('content-type')
        });
      } else {
        console.log(`⚠️ URL returned non-ok status: ${response.status}`);
        return res.json({
          success: false,
          error: `URL returned status ${response.status}`,
          statusCode: response.status
        });
      }
    } catch (error: any) {
      console.error(`❌ URL accessibility check failed: ${error.message}`);
      return res.json({
        success: false,
        error: `URL is not accessible: ${error.message}`
      });
    }

  } catch (error: any) {
    console.error('❌ URL validation route error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during URL validation'
    });
  }
});

export default router;