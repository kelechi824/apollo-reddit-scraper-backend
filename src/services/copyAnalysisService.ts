import { Browser, Page } from 'puppeteer-core';
import OpenAI from 'openai';
import insightsDatabase from './insightsDatabase';
import { ExtractedPainPoint, CustomerPhrase } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface PageTextContent {
  title: string;
  headings: string[];
  bodyText: string;
  buttonTexts: string[];
  links: string[];
  metaDescription?: string;
}

interface CopyAnalysisResult {
  id: string;
  url: string;
  pageContent: PageTextContent;
  painPointAlignment: {
    painPoint: ExtractedPainPoint;
    relevanceScore: number;
    recommendations: string[];
  }[];
  customerLanguageGaps: {
    missingPhrase: CustomerPhrase;
    suggestedPlacement: string;
    impact: 'high' | 'medium' | 'low';
  }[];
  overallScore: number;
  keyRecommendations: string[];
  timestamp: Date;
}

interface OpenAICopyAnalysisResponse {
  painPointAlignment: Array<{
    painPointId: string;
    relevanceScore: number;
    recommendations: string[];
  }>;
  customerLanguageGaps: Array<{
    phraseId: string;
    suggestedPlacement: string;
    impact: 'high' | 'medium' | 'low';
  }>;
  overallScore: number;
  keyRecommendations: string[];
}

/**
 * Service for analyzing landing page copy against live customer pain points from Gong
 * Why this matters: Combines visual page screenshots with live customer insights to generate
 * data-driven copy improvements that resonate with real prospect pain points.
 */
class CopyAnalysisService {
  private browser: Browser | null = null;
  private client: OpenAI | null = null;
  private model = 'gpt-5-nano'; // Use latest GPT-5 nano model

  constructor() {
    setTimeout(() => {
      this.initializeClients();
    }, 100);
  }

  /**
   * Initialize both Playwright and OpenAI clients
   * Why this matters: We need both browser automation for text extraction and AI for analysis.
   */
  private async initializeClients(): Promise<void> {
    // Initialize OpenAI
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
      console.log('✅ OpenAI client initialized for copy analysis');
    }

    // Browser will be initialized on demand
  }

  /**
   * Initialize Puppeteer browser on demand
   * Why this matters: Browser initialization is expensive, so we only do it when needed.
   */
  private async initializeBrowser(): Promise<void> {
    if (!this.browser) {
      const isVercel = !!process.env.VERCEL_ENV;
      let puppeteer: any;
      let launchOptions: any = {
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
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
      console.log('✅ Puppeteer browser initialized for text extraction');
    }
  }

  /**
   * Extract structured text content from a landing page
   * Why this matters: Gets all the copy elements (headlines, body text, buttons) that 
   * prospects see, so we can analyze them against their actual pain points.
   */
  async extractPageText(url: string): Promise<PageTextContent> {
    await this.initializeBrowser();
    
    if (!this.browser) {
      throw new Error('Browser not available');
    }

    const page: Page = await this.browser.newPage();
    
    try {
      console.log(`📝 Extracting text content from: ${url}`);
      
      // Navigate to the page with more lenient loading strategy
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', // Don't wait for all network requests
        timeout: 60000 // Increase timeout to 60 seconds
      });
      
      // Wait a bit more for dynamic content to load
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Extract structured content
      const content = await page.evaluate(() => {
        // Get main headline from first H1, fallback to page title
        const firstH1 = document.querySelector('h1') as HTMLElement | null;
        const title = firstH1?.textContent?.trim() || document.title || '';

        // Get all headings (h1, h2, h3, h4, h5, h6) - excluding the main title
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6') as NodeListOf<HTMLElement>)
          .map(el => el.textContent?.trim() || '')
          .filter(text => text.length > 0)
          .slice(1); // Skip the first H1 since we're using it as title

        // Get main body text (paragraphs, divs with substantial text)
        const bodyElements = Array.from(document.querySelectorAll('p, div') as NodeListOf<HTMLElement>)
          .map(el => el.textContent?.trim() || '')
          .filter(text => text.length > 20) // Filter out short snippets
          .slice(0, 50); // Limit to prevent overwhelming analysis

        const bodyText = bodyElements.join(' ').substring(0, 5000); // Limit total length

        // Get button texts - focus on actual CTAs, not navigation
        const buttonTexts = Array.from(document.querySelectorAll('button, a[role="button"], .btn, .cta, [class*="sign-up"], [class*="get-started"], [class*="try-"], [class*="book-"], [class*="request-"]') as NodeListOf<HTMLElement>)
          .map(el => el.textContent?.trim() || '')
          .filter(text => text.length > 0 && text.length < 100)
          // Remove duplicates and filter out navigation-like text
          .filter((text, index, arr) => {
            const lowerText = text.toLowerCase();
            
            // Skip basic UI elements
            if (lowerText.includes('menu') || lowerText.includes('close') || lowerText.includes('open') || 
                lowerText.includes('toggle') || lowerText.includes('skip') || text.length < 3) {
              return false;
            }
            
            // Skip common navigation terms
            const navigationTerms = [
              'about', 'contact', 'privacy', 'terms', 'policy', 'careers', 'blog', 'support',
              'help', 'faq', 'documentation', 'docs', 'resources', 'company', 'team',
              'legal', 'security', 'compliance', 'partners', 'integration', 'api',
              'pricing', 'plans', 'features', 'product', 'solution', 'platform',
              'learn more', 'read more', 'view all', 'see all', 'browse', 'explore',
              'home', 'back', 'previous', 'next', 'continue reading', 'download',
              'white paper', 'case study', 'webinar', 'guide', 'ebook'
            ];
            
            // Check if text contains navigation terms
            const isNavigation = navigationTerms.some(term => 
              lowerText.includes(term) || lowerText === term
            );
            
            if (isNavigation) {
              return false;
            }
            
            // Focus on action-oriented button text
            const actionTerms = [
              'sign up', 'get started', 'start free', 'try', 'demo', 'book', 'schedule',
              'request', 'contact sales', 'get demo', 'start trial', 'free trial',
              'join', 'register', 'subscribe', 'buy', 'purchase', 'upgrade',
              'unlock', 'access', 'activate', 'enable', 'create account'
            ];
            
            const isActionButton = actionTerms.some(term => lowerText.includes(term));
            
            // Only include if it's an action button OR if it's short and looks like a CTA
            if (!isActionButton && text.length > 20) {
              return false;
            }
            
            return arr.indexOf(text) === index; // Remove duplicates
          });

        // Get important links
        const links = Array.from(document.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>)
          .map(el => el.textContent?.trim() || '')
          .filter(text => text.length > 0 && text.length < 100)
          .slice(0, 20); // Limit number of links

        // Get meta description
        const metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
        const metaDescription = metaDesc ? metaDesc.getAttribute('content') || undefined : undefined;

        return {
          title,
          headings,
          bodyText,
          buttonTexts,
          links,
          metaDescription
        };
      });

      console.log(`✅ Extracted content: ${content.headings.length} headings, ${content.buttonTexts.length} buttons`);
      return content;

    } finally {
      await page.close();
    }
  }

  /**
   * Analyze page copy against live customer pain points using OpenAI
   * Why this matters: Uses real customer language from Gong calls to identify copy gaps
   * and recommend improvements that will resonate with actual prospects.
   */
  async analyzeCopyVsPainPoints(url: string, pageContent: PageTextContent): Promise<CopyAnalysisResult> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    console.log(`🔍 Analyzing copy against live customer pain points for: ${url}`);

    // Get relevant pain points from the insights database
    const painPoints = insightsDatabase.queryPainPoints({
      minConfidence: 0.6,
      limit: 20,
      sortBy: 'frequency'
    });

    // Get high-frequency customer phrases
    const customerPhrases = insightsDatabase.queryCustomerPhrases({
      minFrequency: 2,
      limit: 30,
      sortBy: 'frequency'
    });

    if (painPoints.length === 0 || customerPhrases.length === 0) {
      console.warn('⚠️ No pain points or customer phrases available for analysis');
      return this.createEmptyAnalysis(url, pageContent);
    }

    console.log(`📊 Analyzing against ${painPoints.length} pain points and ${customerPhrases.length} customer phrases`);

    // Create analysis prompt
    const prompt = this.buildAnalysisPrompt(pageContent, painPoints, customerPhrases);

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are a conversion rate optimization expert analyzing landing page copy against real customer pain points extracted from sales calls. Provide actionable recommendations based on actual customer language and pain points.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        // Using default temperature (1) as GPT-5-nano doesn't support custom temperature values
      });

      const analysis: OpenAICopyAnalysisResponse = JSON.parse(completion.choices[0].message.content || '{}');
      
      // Convert to structured result
      return this.formatAnalysisResult(url, pageContent, analysis, painPoints, customerPhrases);

    } catch (error) {
      console.error('OpenAI analysis failed:', error);
      throw new Error('Failed to analyze copy with OpenAI');
    }
  }

  /**
   * Build comprehensive analysis prompt
   * Why this matters: Provides context about the page content and real customer insights
   * so OpenAI can make specific, data-driven recommendations.
   */
  private buildAnalysisPrompt(content: PageTextContent, painPoints: ExtractedPainPoint[], phrases: CustomerPhrase[]): string {
    return `
Analyze this landing page copy against real customer pain points and language from sales calls.

LANDING PAGE CONTENT:
Title: "${content.title}"
Meta Description: "${content.metaDescription || 'None'}"

Headings:
${content.headings.map(h => `- "${h}"`).join('\n')}

Button Texts:
${content.buttonTexts.map(b => `- "${b}"`).join('\n')}

Body Content (excerpt):
"${content.bodyText.substring(0, 1000)}..."

REAL CUSTOMER PAIN POINTS (from Gong calls):
${painPoints.map(pp => `
- ID: ${pp.id}
- Pain: "${pp.text}"
- Category: ${pp.category}
- Emotional Trigger: ${pp.emotionalTrigger}
- Frequency: ${pp.frequency} mentions
- Confidence: ${Math.round(pp.confidence * 100)}%
`).join('\n')}

ACTUAL CUSTOMER LANGUAGE (high-frequency phrases):
${phrases.map(cp => `
- Phrase: "${cp.phrase}"
- Used ${cp.frequency} times
- Context: ${cp.context}
- Category: ${cp.category}
`).join('\n')}

ANALYSIS TASK:
Return a JSON object with:
{
  "painPointAlignment": [
    {
      "painPointId": "string (pain point ID)",
      "relevanceScore": number (0-100, how well the page addresses this pain point),
      "recommendations": ["specific copy suggestions to better address this pain point"]
    }
  ],
  "customerLanguageGaps": [
    {
      "phraseId": "string (customer phrase ID)",
      "suggestedPlacement": "specific section where this customer language should be added",
      "impact": "high|medium|low (potential conversion impact)"
    }
  ],
  "overallScore": number (0-100, overall page effectiveness based on customer insights),
  "keyRecommendations": ["top 3-5 highest-impact changes to make"]
}

Focus on specific, actionable recommendations using the exact customer language and addressing the most frequent pain points.
`;
  }

  /**
   * Format OpenAI analysis into structured result
   * Why this matters: Combines AI analysis with original pain point and phrase data
   * to provide complete context for CRO recommendations.
   */
  private formatAnalysisResult(
    url: string,
    pageContent: PageTextContent,
    analysis: OpenAICopyAnalysisResponse,
    painPoints: ExtractedPainPoint[],
    phrases: CustomerPhrase[]
  ): CopyAnalysisResult {
    // Map pain point alignments
    const painPointAlignment = analysis.painPointAlignment.map(pa => {
      const painPoint = painPoints.find(pp => pp.id === pa.painPointId);
      return {
        painPoint: painPoint!,
        relevanceScore: pa.relevanceScore,
        recommendations: pa.recommendations
      };
    }).filter(pa => pa.painPoint); // Remove any that couldn't be matched

    // Map customer language gaps
    const customerLanguageGaps = analysis.customerLanguageGaps.map(clg => {
      const phrase = phrases.find(cp => cp.id === clg.phraseId);
      return {
        missingPhrase: phrase!,
        suggestedPlacement: clg.suggestedPlacement,
        impact: clg.impact
      };
    }).filter(clg => clg.missingPhrase); // Remove any that couldn't be matched

    return {
      id: uuidv4(),
      url,
      pageContent,
      painPointAlignment,
      customerLanguageGaps,
      overallScore: analysis.overallScore,
      keyRecommendations: analysis.keyRecommendations,
      timestamp: new Date()
    };
  }

  /**
   * Create empty analysis when no insights are available
   * Why this matters: Provides graceful fallback when Gong data isn't available yet.
   */
  private createEmptyAnalysis(url: string, pageContent: PageTextContent): CopyAnalysisResult {
    return {
      id: uuidv4(),
      url,
      pageContent,
      painPointAlignment: [],
      customerLanguageGaps: [],
      overallScore: 0,
      keyRecommendations: ['No customer insights available yet. Run Gong sync to get pain point data.'],
      timestamp: new Date()
    };
  }

  /**
   * Complete page analysis workflow
   * Why this matters: Single method that handles the full pipeline from URL to recommendations.
   */
  async analyzePageCopy(url: string): Promise<CopyAnalysisResult> {
    console.log(`🎯 Starting complete copy analysis for: ${url}`);
    
    // Extract page text content
    const pageContent = await this.extractPageText(url);
    
    // Analyze against pain points
    const analysis = await this.analyzeCopyVsPainPoints(url, pageContent);
    
    console.log(`✅ Copy analysis complete - Overall score: ${analysis.overallScore}/100`);
    console.log(`📝 Generated ${analysis.keyRecommendations.length} key recommendations`);
    
    return analysis;
  }

  /**
   * Cleanup resources
   * Why this matters: Proper cleanup prevents memory leaks when shutting down.
   */
  async shutdown(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('🔌 Copy analysis browser closed');
    }
  }
}

// Export singleton instance
export const copyAnalysisService = new CopyAnalysisService();
export { CopyAnalysisResult, PageTextContent }; 