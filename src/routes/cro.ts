import { Router, Request, Response } from 'express';
import { screenshotService, ScreenshotResult } from '../services/screenshotService';
import { copyAnalysisService, CopyAnalysisResult } from '../services/copyAnalysisService';
import fs from 'fs/promises';

const router = Router();

/**
 * POST /api/cro/screenshot
 * Capture screenshot of a landing page URL
 * Why this matters: Screenshots provide visual context for analyzing landing page copy
 * and allow us to show before/after recommendations visually to users.
 */
router.post('/screenshot', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url, viewport, waitForSelector, timeout } = req.body;

    // Validate URL is provided
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'url is required and must be a valid string',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'url must be a valid URL',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`📸 CRO Screenshot request for: ${url}`);

    // Capture screenshot with options
    const result: ScreenshotResult = await screenshotService.captureScreenshot(url, {
      viewport: viewport || { width: 1920, height: 1080 },
      waitForSelector,
      timeout: timeout || 30000
    });

    // Check if screenshot was successful
    if (result.error) {
      return res.status(500).json({
        error: 'Screenshot Failed',
        message: result.error,
        status: 500,
        timestamp: new Date().toISOString()
      });
    }

    // Return screenshot info (not the image data directly)
    res.json({
      success: true,
      screenshot: {
        id: result.id,
        url: result.url,
        pageTitle: result.pageTitle,
        viewport: result.viewport,
        timestamp: result.timestamp
      },
      message: 'Screenshot captured successfully'
    });

  } catch (error) {
    console.error('Screenshot endpoint error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to capture screenshot',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/cro/screenshot/:id
 * Retrieve a screenshot by ID
 * Why this matters: Serves the actual screenshot images for display in the CRO interface
 */
router.get('/screenshot/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Screenshot ID is required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`📷 Serving screenshot: ${id}`);

    // Get screenshot file path
    const screenshotPath = `screenshots/screenshot_${id}.png`;

    try {
      // Check if file exists
      await fs.access(screenshotPath);
      
      // Serve the image
      res.sendFile(screenshotPath, { root: process.cwd() });
      
    } catch (fileError) {
      return res.status(404).json({
        error: 'Screenshot Not Found',
        message: `Screenshot with ID ${id} not found`,
        status: 404,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Screenshot retrieval error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to retrieve screenshot',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/cro/analyze
 * Analyze landing page and provide CRO recommendations
 * Why this matters: This is the core CRO functionality that combines page screenshots
 * with live customer pain points from Gong to generate actionable copy improvements.
 */
router.post('/analyze', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url, includeScreenshot = true } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'url is required and must be a valid string',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'url must be a valid URL',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`🔍 CRO Analysis request for: ${url}`);

    // Capture screenshot and analyze copy in parallel for efficiency
    const promises: Promise<any>[] = [
      copyAnalysisService.analyzePageCopy(url)
    ];

    if (includeScreenshot) {
      promises.push(screenshotService.captureScreenshot(url));
    }

    const results = await Promise.all(promises);
    const copyAnalysis: CopyAnalysisResult = results[0];
    const screenshot: ScreenshotResult | undefined = includeScreenshot ? results[1] : undefined;

    // Build response
    const response: any = {
      success: true,
      analysis: {
        id: copyAnalysis.id,
        url: copyAnalysis.url,
        overallScore: copyAnalysis.overallScore,
        keyRecommendations: copyAnalysis.keyRecommendations,
        painPointAlignment: copyAnalysis.painPointAlignment.map(ppa => ({
          painPoint: {
            text: ppa.painPoint.text,
            category: ppa.painPoint.category,
            emotionalTrigger: ppa.painPoint.emotionalTrigger,
            frequency: ppa.painPoint.frequency
          },
          relevanceScore: ppa.relevanceScore,
          recommendations: ppa.recommendations
        })),
        customerLanguageGaps: copyAnalysis.customerLanguageGaps.map(clg => ({
          missingPhrase: {
            phrase: clg.missingPhrase.phrase,
            frequency: clg.missingPhrase.frequency,
            category: clg.missingPhrase.category,
            context: clg.missingPhrase.context
          },
          suggestedPlacement: clg.suggestedPlacement,
          impact: clg.impact
        })),
        pageContent: copyAnalysis.pageContent,
        timestamp: copyAnalysis.timestamp
      },
      message: 'CRO analysis completed successfully'
    };

    // Add screenshot info if captured
    if (screenshot && !screenshot.error) {
      response.screenshot = {
        id: screenshot.id,
        pageTitle: screenshot.pageTitle,
        viewport: screenshot.viewport,
        timestamp: screenshot.timestamp
      };
    }

    res.json(response);

  } catch (error) {
    console.error('CRO analysis error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Request body was:', req.body);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to analyze page',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

export default router; 