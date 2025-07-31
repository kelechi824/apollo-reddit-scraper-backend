import { Browser, Page } from 'puppeteer-core';
import { v4 as uuidv4 } from 'uuid';

interface ScreenshotResult {
  id: string;
  url: string;
  imageData: string; // Base64 encoded image data - always present in serverless
  timestamp: Date;
  viewport: {
    width: number;
    height: number;
  };
  pageTitle?: string;
  error?: string;
}

/**
 * Serverless-Compatible Screenshot Service using Puppeteer + Chromium
 * Why this matters: Captures visual snapshots of landing pages entirely in memory,
 * returning base64 data directly to frontend for AI-powered CRO analysis.
 * Uses @sparticuz/chromium for Vercel serverless compatibility.
 */
class ScreenshotService {
  private browser: Browser | null = null;

  constructor() {
    // No filesystem setup needed in serverless environment
  }

  /**
   * Initialize Puppeteer browser with serverless-compatible Chromium
   * Why this matters: Browser initialization is expensive, so we reuse the same
   * browser instance across multiple screenshot requests for efficiency.
   */
  private async initializeBrowser(): Promise<void> {
    if (!this.browser) {
      try {
        const isVercel = !!process.env.VERCEL_ENV;
        let puppeteer: any;
        let launchOptions: any = {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--single-process', // Better for serverless
            '--no-zygote', // Better for serverless
          ]
        };

        if (isVercel) {
          // Use @sparticuz/chromium for Vercel serverless
          const chromium = (await import('@sparticuz/chromium')).default;
          puppeteer = await import('puppeteer-core');
          launchOptions = {
            ...launchOptions,
            args: chromium.args,
            executablePath: await chromium.executablePath(),
          };
        } else {
          // Use regular puppeteer for local development
          puppeteer = await import('puppeteer-core');
        }

        this.browser = await puppeteer.launch(launchOptions);
        console.log('✅ Browser initialized for serverless screenshots');
      } catch (error) {
        console.error('❌ Failed to initialize browser:', error);
        throw new Error('Browser initialization failed');
      }
    }
  }

  /**
   * Capture full-page screenshot of a URL (serverless-compatible)
   * Why this matters: Captures screenshots entirely in memory and returns base64 data
   * directly to frontend, no local storage required.
   */
  async captureScreenshot(url: string, options: {
    viewport?: { width: number; height: number };
    waitForSelector?: string;
    timeout?: number;
  } = {}): Promise<ScreenshotResult> {
    const {
      viewport = { width: 1920, height: 1080 },
      waitForSelector,
      timeout = 60000
    } = options;

    const screenshotId = uuidv4();
    const timestamp = new Date();
    
    try {
      // Initialize browser if needed
      await this.initializeBrowser();
      
      if (!this.browser) {
        throw new Error('Browser not available');
      }

      // Create new page - Puppeteer's newPage() accepts no arguments
      const page: Page = await this.browser.newPage();
      
      // Set viewport after page creation - this is how Puppeteer API works
      await page.setViewport(viewport);

      // Set timeout for page operations
      page.setDefaultTimeout(timeout);

      try {
        console.log(`📸 Capturing serverless screenshot for: ${url}`);
        
        // Navigate to the URL with optimized loading strategy
        await page.goto(url, { 
          waitUntil: 'domcontentloaded',
          timeout: 60000
        });

        // Wait for dynamic content to load
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Wait for specific selector if provided
        if (waitForSelector) {
          await page.waitForSelector(waitForSelector, { timeout: 10000 });
        }

        // Get page title for metadata
        const pageTitle = await page.title();

        // Capture screenshot directly to memory buffer (no filesystem)
        const screenshotBuffer = await page.screenshot({
          fullPage: true,
          type: 'png'
          // No 'path' parameter - keep in memory only
        });

        // Convert buffer directly to base64
        const imageData = screenshotBuffer.toString('base64');
        
        console.log(`✅ Serverless screenshot captured: ${screenshotId} (${Math.round(imageData.length / 1024)}KB)`);

        return {
          id: screenshotId,
          url,
          imageData,
          timestamp,
          viewport,
          pageTitle
        };

      } finally {
        // Always close the page to prevent memory leaks
        await page.close();
      }

    } catch (error) {
      console.error(`❌ Serverless screenshot capture failed for ${url}:`, error);
      
      return {
        id: screenshotId,
        url,
        imageData: '', // Empty string for failed captures
        timestamp,
        viewport,
        error: error instanceof Error ? error.message : 'Unknown screenshot error'
      };
    }
  }

  /**
   * Capture screenshots of multiple URLs in parallel (serverless-compatible)
   * Why this matters: For bulk analysis tasks, parallel processing is faster.
   * All screenshots are returned as base64 data in memory.
   */
  async captureMultipleScreenshots(urls: string[], options: {
    viewport?: { width: number; height: number };
    concurrency?: number;
    timeout?: number;
  } = {}): Promise<ScreenshotResult[]> {
    const {
      viewport = { width: 1920, height: 1080 },
      concurrency = 2, // Lower concurrency for serverless memory limits
      timeout = 30000
    } = options;

    console.log(`📸 Capturing ${urls.length} serverless screenshots with concurrency: ${concurrency}`);

    // Process URLs in batches
    const results: ScreenshotResult[] = [];
    
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      console.log(`📸 Processing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(urls.length / concurrency)}`);
      
      const batchPromises = batch.map(url => 
        this.captureScreenshot(url, { viewport, timeout })
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Small delay between batches
      if (i + concurrency < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`✅ Completed ${results.length} serverless screenshots`);
    return results;
  }

  /**
   * Get current session statistics (serverless-compatible)
   * Why this matters: Monitoring for operational insights in serverless environment.
   */
  async getSessionStats(): Promise<{
    browserActive: boolean;
    timestamp: Date;
  }> {
    return {
      browserActive: this.browser !== null,
      timestamp: new Date()
    };
  }

  /**
   * Shutdown the service and cleanup resources
   * Why this matters: Proper cleanup prevents memory leaks in serverless functions.
   */
  async shutdown(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('🔌 Serverless screenshot service browser closed');
    }
  }
}

// Export singleton instance
export const screenshotService = new ScreenshotService();
export { ScreenshotResult }; 