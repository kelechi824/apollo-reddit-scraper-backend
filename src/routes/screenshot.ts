import { Router, Request, Response } from 'express';
import { firecrawlService } from '../services/firecrawlService';
import { playwrightService } from '../services/playwrightService';

const router = Router();

/**
 * POST /screenshot
 * Take a screenshot of any webpage using Playwright (preferred for full-page capture)
 * Why this matters: Playwright provides better control for full-page screenshots,
 * especially for complex pages like Figma prototypes.
 */
router.post('/screenshot', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url, options = {} } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    console.log(`🎭 Playwright screenshot request received for: ${url}`);

    // Use Playwright service for better full-page capture
    const result = await playwrightService.takeScreenshot(url, {
      fullPage: options.fullPage !== false, // Default to true for full page
      width: options.width || 1920,
      height: options.height || 1080,
      waitTime: options.waitTime || 8000, // Extra wait for complex pages
      quality: options.quality || 90,
      format: options.format || 'png'
    });

    if (result.success) {
      return res.json({
        success: true,
        screenshotUrl: result.screenshotBase64 ? `data:image/png;base64,${result.screenshotBase64}` : result.screenshotPath,
        screenshotPath: result.screenshotPath,
        metadata: result.metadata,
        timestamp: new Date().toISOString()
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error || 'Screenshot failed'
      });
    }

  } catch (error) {
    console.error('❌ Playwright screenshot endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /screenshot/test
 * Test endpoint to verify screenshot functionality
 * Why this matters: Allows quick testing of the screenshot service without requiring a POST body.
 */
router.get('/screenshot/test', async (req: Request, res: Response): Promise<any> => {
  try {
    const testUrl = req.query.url as string || 'https://example.com';
    
    console.log(`🧪 Testing screenshot functionality with: ${testUrl}`);

    const result = await firecrawlService.takeScreenshot(testUrl, {
      fullPage: true,
      mobileEmulation: false
    });

    return res.json({
      success: result.success,
      screenshotUrl: result.screenshotUrl,
      error: result.error,
      testUrl: testUrl,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Screenshot test endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /screenshot/playwright
 * Take a screenshot using Playwright for complex interactive pages
 * Why this matters: Playwright provides better support for complex pages like Figma
 * prototypes that require full browser automation and JavaScript execution.
 */
router.post('/screenshot/playwright', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url, options = {} } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    console.log(`🎭 Playwright screenshot request received for: ${url}`);

    // Take screenshot using Playwright service
    const result = await playwrightService.takeScreenshot(url, {
      fullPage: options.fullPage !== false, // Default to true
      width: options.width || 1920,
      height: options.height || 1080,
      waitTime: options.waitTime || 5000,
      quality: options.quality || 90,
      format: options.format || 'png'
    });

    if (result.success) {
      return res.json({
        success: true,
        screenshotPath: result.screenshotPath,
        screenshotBase64: result.screenshotBase64,
        originalUrl: url,
        metadata: result.metadata,
        timestamp: new Date().toISOString()
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to capture screenshot'
      });
    }

  } catch (error) {
    console.error('❌ Playwright screenshot endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /screenshot/figma
 * Take a screenshot optimized specifically for Figma prototypes
 * Why this matters: Figma prototypes have special requirements for loading and
 * interaction that this endpoint handles specifically.
 */
router.post('/screenshot/figma', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    console.log(`🎨 Figma screenshot request received for: ${url}`);

    // Take screenshot using Figma-optimized settings
    const result = await playwrightService.takeFigmaScreenshot(url);

    if (result.success) {
      return res.json({
        success: true,
        screenshotPath: result.screenshotPath,
        screenshotBase64: result.screenshotBase64,
        originalUrl: url,
        metadata: result.metadata,
        timestamp: new Date().toISOString()
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to capture Figma screenshot'
      });
    }

  } catch (error) {
    console.error('❌ Figma screenshot endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /screenshot/save
 * Take a screenshot and save it to a file.
 * Why this matters: Allows users to save screenshots directly to their local filesystem.
 */
router.post('/screenshot/save', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url, filename, options = {} } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    console.log(`💾 Screenshot + Save request received for: ${url}`);

    // Take screenshot using Firecrawl service
    const result = await firecrawlService.takeScreenshot(url, {
      fullPage: options.fullPage !== false,
      mobileEmulation: options.mobileEmulation || false,
      quality: options.quality || 80,
      format: options.format || 'png'
    });

    if (result.success && result.screenshotUrl) {
      // Save to file if it's base64 data
      if (result.screenshotUrl.startsWith('data:image')) {
        const fs = require('fs');
        const path = require('path');
        
        const base64Data = result.screenshotUrl.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        
        const savedFilename = filename || `screenshot-${Date.now()}.png`;
        const filePath = path.join(__dirname, '../../screenshots', savedFilename);
        
        // Ensure screenshots directory exists
        const screenshotsDir = path.join(__dirname, '../../screenshots');
        if (!fs.existsSync(screenshotsDir)) {
          fs.mkdirSync(screenshotsDir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, imageBuffer);
        
        console.log(`✅ Screenshot saved to: ${filePath}`);
        
        return res.json({
          success: true,
          screenshotUrl: result.screenshotUrl,
          savedPath: filePath,
          filename: savedFilename,
          size: `${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB`,
          timestamp: new Date().toISOString()
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: result.error || 'Failed to capture or save screenshot'
    });

  } catch (error) {
    console.error('❌ Screenshot + Save endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /screenshot/status
 * Get status of both screenshot services
 * Why this matters: Provides monitoring information about service health and capabilities.
 */
router.get('/screenshot/status', async (req: Request, res: Response): Promise<any> => {
  try {
    const firecrawlStatus = firecrawlService.getServiceStatus();
    const playwrightStatus = playwrightService.getStatus();

    return res.json({
      success: true,
      services: {
        firecrawl: {
          initialized: firecrawlStatus.initialized,
          hasApiKey: firecrawlStatus.hasApiKey,
          circuitBreakerState: firecrawlStatus.circuitBreakerState,
          rateLimitActive: firecrawlStatus.rateLimitActive
        },
        playwright: {
          browserActive: playwrightStatus.browserActive,
          screenshotsDirectory: playwrightStatus.screenshotsDirectory
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Screenshot status endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

export default router; 