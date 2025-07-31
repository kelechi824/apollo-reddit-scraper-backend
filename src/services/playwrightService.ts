import { Browser, Page } from 'puppeteer-core';
import path from 'path';
import fs from 'fs/promises';

export interface PlaywrightScreenshotOptions {
  fullPage?: boolean;
  width?: number;
  height?: number;
  waitTime?: number;
  quality?: number;
  format?: 'png' | 'jpeg';
}

export interface PlaywrightScreenshotResult {
  success: boolean;
  screenshotPath?: string;
  screenshotBase64?: string;
  error?: string;
  metadata?: {
    url: string;
    timestamp: string;
    dimensions: { width: number; height: number };
    loadTime: number;
  };
}

class PlaywrightService {
  private browser: Browser | null = null;

  /**
   * Initialize browser instance
   * Why this matters: Creates a reusable browser instance for better performance
   * and resource management when taking multiple screenshots.
   */
  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      console.log('🚀 Launching Puppeteer browser for screenshots...');
      const isVercel = !!process.env.VERCEL_ENV;
      let puppeteer: any;
      let launchOptions: any = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-features=VizDisplayCompositor'
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
      console.log('✅ Puppeteer browser launched successfully');
    }
    
    if (!this.browser) {
      throw new Error('Failed to initialize browser');
    }
    return this.browser;
  }

  /**
   * Take a screenshot of a webpage using Playwright
   * Why this matters: Playwright provides full browser automation capabilities,
   * making it perfect for complex interactive pages like Figma prototypes that
   * require JavaScript rendering and user interaction simulation.
   */
  async takeScreenshot(
    url: string, 
    options: PlaywrightScreenshotOptions = {}
  ): Promise<PlaywrightScreenshotResult> {
    const startTime = Date.now();
    
    // Default options optimized for complex pages like Figma
    const {
      fullPage = true,
      width = 1920,
      height = 1080,
      waitTime = 5000, // Wait for interactive content to load
      quality = 90,
      format = 'png'
    } = options;

    let page: Page | null = null;
    
    try {
      if (!url || !url.trim()) {
        throw new Error('URL is required for screenshot');
      }

      console.log(`📸 Taking Playwright screenshot of: ${url}`);

      // Get browser and create new page
      const browser = await this.getBrowser();
      page = await browser.newPage();

      // Set viewport for consistent screenshots
      await page.setViewport({ width, height });

      // Configure page for better compatibility with complex apps
      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      console.log(`🌐 Navigating to URL: ${url}`);
      
      // Navigate to the page with flexible loading strategy
      try {
        await page.goto(url, { 
          waitUntil: 'domcontentloaded', // More flexible than networkidle
          timeout: 30000 // 30 second timeout
        });
      } catch (error) {
        // If navigation times out, try with just load event
        console.log('⚠️ Navigation timeout, trying with simpler wait strategy...');
        await page.goto(url, { 
          waitUntil: 'load',
          timeout: 20000
        });
      }

      console.log(`⏰ Waiting ${waitTime}ms for page to fully load...`);
      
      // Wait for the page to be fully interactive
      await new Promise(resolve => setTimeout(resolve, waitTime));

      // Additional wait for any animations or dynamic content
      try {
        await page.waitForFunction(
          () => document.readyState === 'complete',
          { timeout: 10000 }
        );
      } catch (error) {
        console.log('⚠️ Page readyState timeout, proceeding with screenshot...');
      }

      // For full-page screenshots, implement aggressive full-page capture for Figma
      if (fullPage) {
        console.log('📜 Implementing aggressive full-page capture for Figma...');
        
        try {
          // Disable viewport size restrictions for true full page
          await page.setViewport({ width: 1920, height: 1080 });
          
          // Aggressive scrolling to find true page height for Figma prototypes
          let previousHeight = 0;
          let currentHeight = 0;
          let maxScrollAttempts = 15; // More attempts for complex pages
          let scrollAttempt = 0;
          
          while (scrollAttempt < maxScrollAttempts) {
            // Get current document dimensions
            const dimensions = await page.evaluate(() => {
              // Scroll to bottom first to trigger any dynamic content
              window.scrollTo(0, document.body.scrollHeight);
              
              // Wait a bit for content to load
              return new Promise((resolve) => {
                setTimeout(() => {
                  const height = Math.max(
                    document.body.scrollHeight,
                    document.body.offsetHeight,
                    document.documentElement.clientHeight,
                    document.documentElement.scrollHeight,
                    document.documentElement.offsetHeight,
                    window.innerHeight,
                    // Additional checks for Figma
                    document.querySelector('body')?.scrollHeight || 0
                  );
                  resolve(height);
                }, 500);
              });
            });
            
            currentHeight = dimensions as number;
            console.log(`📏 Scroll attempt ${scrollAttempt + 1}: Height = ${currentHeight}px`);
            
            // If height stopped changing, we found the true height
            if (currentHeight === previousHeight && scrollAttempt > 2) {
              console.log('📐 Stable height detected, proceeding with capture');
              break;
            }
            
            previousHeight = currentHeight;
            scrollAttempt++;
            
            // Progressive scroll to trigger all lazy loading
            await page.evaluate((maxHeight) => {
              return new Promise<void>((resolve) => {
                let position = 0;
                const step = 200; // Small steps
                const delay = 150; // Fast but allows loading
                
                const scroll = () => {
                  if (position < maxHeight) {
                    window.scrollTo(0, position);
                    position += step;
                    setTimeout(scroll, delay);
                  } else {
                    // Final scroll to absolute bottom
                    window.scrollTo(0, document.body.scrollHeight);
                    setTimeout(() => resolve(), 500);
                  }
                };
                scroll();
              });
            }, currentHeight);
            
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          console.log(`✅ Final detected height: ${currentHeight}px`);
          
          // Scroll back to top and wait for everything to settle
          await page.evaluate(() => {
            window.scrollTo(0, 0);
          });
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          console.log('✅ Aggressive full page scroll completed, ready for screenshot');
        } catch (error) {
          console.log('⚠️ Aggressive scroll operation failed:', error);
        }
        
        // Final wait for stability
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      console.log(`📷 Capturing screenshot...`);
      
      // Take the screenshot
      const screenshotBuffer = await page.screenshot({
        fullPage,
        quality: format === 'jpeg' ? quality : undefined,
        type: format
      });

      // Create screenshots directory if it doesn't exist
      const screenshotsDir = path.join(process.cwd(), 'screenshots');
      try {
        await fs.access(screenshotsDir);
      } catch {
        await fs.mkdir(screenshotsDir, { recursive: true });
      }

      // Save screenshot to file with playwright identifier
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const filename = `playwright-screenshot-${timestamp}.${format}`;
      const screenshotPath = path.join(screenshotsDir, filename);
      
      await fs.writeFile(screenshotPath, screenshotBuffer);

      // Convert to base64 for API response
      const screenshotBase64 = `data:image/${format};base64,${screenshotBuffer.toString('base64')}`;

      const loadTime = Date.now() - startTime;
      
      console.log(`✅ Screenshot saved: ${screenshotPath} (${loadTime}ms)`);

      return {
        success: true,
        screenshotPath,
        screenshotBase64,
        metadata: {
          url,
          timestamp: new Date().toISOString(),
          dimensions: { width, height },
          loadTime
        }
      };

    } catch (error) {
      const loadTime = Date.now() - startTime;
      console.error(`❌ Playwright screenshot failed after ${loadTime}ms:`, error);
      
      return {
        success: false,
        error: `Screenshot failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: {
          url,
          timestamp: new Date().toISOString(),
          dimensions: { width: 0, height: 0 },
          loadTime
        }
      };
    } finally {
      // Always close the page to free resources
      if (page) {
        try {
          await page.close();
        } catch (error) {
          console.error('Error closing page:', error);
        }
      }
    }
  }

  /**
   * Take a screenshot with special handling for Figma prototypes
   * Why this matters: Figma prototypes have special loading behavior and interactive
   * elements that need specific handling for successful screenshot capture.
   */
  async takeFigmaScreenshot(url: string): Promise<PlaywrightScreenshotResult> {
    console.log('🎨 Taking Figma-optimized screenshot...');
    
    return await this.takeScreenshot(url, {
      fullPage: false, // Figma prototypes work better with viewport screenshots
      width: 1920,
      height: 1080,
      waitTime: 10000, // Longer wait for Figma to load all assets
      format: 'png',
      quality: 95
    });
  }

  /**
   * Close browser instance and cleanup
   * Why this matters: Proper resource cleanup prevents memory leaks and ensures
   * clean shutdown of browser processes.
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      console.log('🧹 Closing Playwright browser...');
      await this.browser.close();
      this.browser = null;
      console.log('✅ Playwright browser closed');
    }
  }

  /**
   * Get service status for monitoring
   */
  getStatus(): { 
    browserActive: boolean;
    screenshotsDirectory: string;
  } {
    return {
      browserActive: !!this.browser,
      screenshotsDirectory: path.join(process.cwd(), 'screenshots')
    };
  }
}

// Export singleton instance
export const playwrightService = new PlaywrightService();

// Cleanup on process exit
process.on('exit', async () => {
  await playwrightService.cleanup();
});

process.on('SIGINT', async () => {
  await playwrightService.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await playwrightService.cleanup();
  process.exit(0);
});

export default playwrightService; 