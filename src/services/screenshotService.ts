import { chromium, Browser, Page } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';

interface ScreenshotResult {
  id: string;
  url: string;
  screenshotPath: string;
  imageData?: string; // Base64 encoded image data for frontend display
  timestamp: Date;
  viewport: {
    width: number;
    height: number;
  };
  pageTitle?: string;
  error?: string;
}

/**
 * Screenshot Service using Playwright
 * Why this matters: Captures visual snapshots of landing pages so we can analyze 
 * copy layout and provide visual context for our AI-powered CRO recommendations.
 */
class ScreenshotService {
  private browser: Browser | null = null;
  private screenshotsDir: string;

  constructor() {
    // Create screenshots directory for storing captured images
    this.screenshotsDir = path.join(process.cwd(), 'screenshots');
    this.ensureScreenshotsDirectory();
  }

  /**
   * Ensure screenshots directory exists
   * Why this matters: We need a dedicated folder to store page screenshots
   * for later retrieval and analysis.
   */
  private async ensureScreenshotsDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.screenshotsDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create screenshots directory:', error);
    }
  }

  /**
   * Initialize Playwright browser
   * Why this matters: Browser initialization is expensive, so we reuse the same
   * browser instance across multiple screenshot requests for efficiency.
   */
  private async initializeBrowser(): Promise<void> {
    if (!this.browser) {
      try {
        // Launch headless Chrome with optimized settings for screenshots
        this.browser = await chromium.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
          ]
        });
        console.log('✅ Playwright browser initialized for screenshots');
      } catch (error) {
        console.error('❌ Failed to initialize Playwright browser:', error);
        throw new Error('Browser initialization failed');
      }
    }
  }

  /**
   * Capture full-page screenshot of a URL
   * Why this matters: Full-page screenshots show the complete landing page layout,
   * allowing our AI to analyze all visible copy and recommend improvements.
   */
  async captureScreenshot(url: string, options: {
    viewport?: { width: number; height: number };
    waitForSelector?: string;
    timeout?: number;
  } = {}): Promise<ScreenshotResult> {
    const {
      viewport = { width: 1920, height: 1080 },
      waitForSelector,
      timeout = 60000 // Increase default timeout to 60 seconds
    } = options;

    const screenshotId = uuidv4();
    const timestamp = new Date();
    
    try {
      // Initialize browser if needed
      await this.initializeBrowser();
      
      if (!this.browser) {
        throw new Error('Browser not available');
      }

      // Create new page with specified viewport
      const page: Page = await this.browser.newPage({
        viewport: viewport
      });

      // Set timeout for page operations
      page.setDefaultTimeout(timeout);

      try {
        console.log(`📸 Capturing screenshot for: ${url}`);
        
        // Navigate to the URL with more lenient loading strategy
        await page.goto(url, { 
          waitUntil: 'domcontentloaded', // Don't wait for all network requests
          timeout: 60000 // Increase timeout to 60 seconds
        });

        // Wait a bit for dynamic content to load
        await page.waitForTimeout(3000);

        // Wait for specific selector if provided
        if (waitForSelector) {
          await page.waitForSelector(waitForSelector, { timeout: 10000 });
        }

        // Get page title for metadata
        const pageTitle = await page.title();

        // Generate screenshot filename
        const filename = `screenshot_${screenshotId}.png`;
        const screenshotPath = path.join(this.screenshotsDir, filename);

        // Capture full-page screenshot
        await page.screenshot({
          path: screenshotPath,
          fullPage: true,
          type: 'png'
        });

        console.log(`✅ Screenshot captured: ${filename}`);

        // Read screenshot file and convert to base64 for frontend display
        let imageData: string | undefined;
        try {
          const fileBuffer = await fs.readFile(screenshotPath);
          imageData = fileBuffer.toString('base64');
          console.log(`✅ Screenshot converted to base64 (${Math.round(imageData.length / 1024)}KB)`);
        } catch (error) {
          console.error(`⚠️ Failed to read screenshot file for base64 conversion:`, error);
        }

        return {
          id: screenshotId,
          url,
          screenshotPath,
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
      console.error(`❌ Screenshot capture failed for ${url}:`, error);
      
      return {
        id: screenshotId,
        url,
        screenshotPath: '',
        timestamp,
        viewport,
        error: error instanceof Error ? error.message : 'Unknown screenshot error'
      };
    }
  }

  /**
   * Capture screenshots of multiple URLs in parallel
   * Why this matters: For bulk analysis tasks, parallel processing is much faster
   * than sequential screenshot capture.
   */
  async captureMultipleScreenshots(urls: string[], options: {
    viewport?: { width: number; height: number };
    concurrency?: number;
    timeout?: number;
  } = {}): Promise<ScreenshotResult[]> {
    const {
      viewport = { width: 1920, height: 1080 },
      concurrency = 3, // Limit concurrent screenshots to avoid memory issues
      timeout = 30000
    } = options;

    console.log(`📸 Capturing ${urls.length} screenshots with concurrency: ${concurrency}`);

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
      
      // Small delay between batches to prevent overwhelming the system
      if (i + concurrency < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`✅ Completed ${results.length} screenshots`);
    return results;
  }

  /**
   * Clean up old screenshots to save disk space
   * Why this matters: Screenshots can accumulate over time and use significant disk space.
   */
  async cleanupOldScreenshots(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const files = await fs.readdir(this.screenshotsDir);
      const now = Date.now();
      
      let deletedCount = 0;
      
      for (const file of files) {
        if (file.startsWith('screenshot_') && file.endsWith('.png')) {
          const filePath = path.join(this.screenshotsDir, file);
          const stats = await fs.stat(filePath);
          
          if (now - stats.mtime.getTime() > maxAge) {
            await fs.unlink(filePath);
            deletedCount++;
          }
        }
      }
      
      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} old screenshots`);
      }
      
    } catch (error) {
      console.error('Failed to cleanup old screenshots:', error);
    }
  }

  /**
   * Get screenshot statistics
   * Why this matters: Monitoring for operational insights and disk usage management.
   */
  async getStats(): Promise<{
    totalScreenshots: number;
    totalSizeBytes: number;
    oldestScreenshot: Date | null;
    newestScreenshot: Date | null;
  }> {
    try {
      const files = await fs.readdir(this.screenshotsDir);
      let totalSizeBytes = 0;
      let oldestDate: Date | null = null;
      let newestDate: Date | null = null;
      let screenshotCount = 0;

      for (const file of files) {
        if (file.startsWith('screenshot_') && file.endsWith('.png')) {
          const filePath = path.join(this.screenshotsDir, file);
          const stats = await fs.stat(filePath);
          
          totalSizeBytes += stats.size;
          screenshotCount++;
          
          if (!oldestDate || stats.mtime < oldestDate) {
            oldestDate = stats.mtime;
          }
          
          if (!newestDate || stats.mtime > newestDate) {
            newestDate = stats.mtime;
          }
        }
      }

      return {
        totalScreenshots: screenshotCount,
        totalSizeBytes,
        oldestScreenshot: oldestDate,
        newestScreenshot: newestDate
      };

    } catch (error) {
      console.error('Failed to get screenshot stats:', error);
      return {
        totalScreenshots: 0,
        totalSizeBytes: 0,
        oldestScreenshot: null,
        newestScreenshot: null
      };
    }
  }

  /**
   * Shutdown the service and cleanup resources
   * Why this matters: Proper cleanup prevents memory leaks and hanging processes.
   */
  async shutdown(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('🔌 Screenshot service browser closed');
    }
  }
}

// Export singleton instance
export const screenshotService = new ScreenshotService();
export { ScreenshotResult }; 