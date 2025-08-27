import SitemapUrlMatcher from './sitemapUrlMatcher';

/**
 * Simple Contextual CTA Service
 * Why this matters: Provides reliable, fast contextual CTA insertion without complex AI analysis
 * that can fail or timeout. Uses keyword-based pattern matching for consistent results.
 * Now includes sitemap-aware URL selection for more relevant CTAs.
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

export interface SimpleCtaRequest {
  content: string;
  contentFormat: 'html' | 'markdown';
  targetKeyword: string;
  campaignType: 'blog_creator' | 'competitor_conquesting' | 'reddit_content';
  competitorName?: string;
  maxCtasPerArticle?: number;
  sitemapData?: SitemapData[];
}

export interface SimpleCtaResult {
  success: boolean;
  enhancedContent: string;
  insertionAnalytics: {
    totalCtasInserted: number;
    insertionPoints: Array<{
      paragraphIndex: number;
      ctaText: string;
      reasoning: string;
      confidence: number;
    }>;
  };
  processingTimeMs: number;
}

/**
 * Simple Contextual CTA Service
 * Why this matters: Reliable CTA insertion based on content patterns and keywords
 */
class SimpleContextualCtaService {
  private sitemapUrlMatcher: SitemapUrlMatcher;
  
  constructor() {
    this.sitemapUrlMatcher = new SitemapUrlMatcher();
  }
  
  /**
   * Insert contextual CTAs into content
   * Why this matters: Uses reliable pattern matching to insert relevant CTAs
   */
  async insertContextualCtas(request: SimpleCtaRequest): Promise<SimpleCtaResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🎯 Simple CTA insertion for keyword: "${request.targetKeyword}"`);
      
      // Generate sitemap-aware UTM-tracked URL
      const ctaUrl = this.generateCtaUrl(
        request.targetKeyword, 
        request.campaignType, 
        request.competitorName,
        request.sitemapData
      );
      
      // Define pain point patterns that indicate CTA opportunities
      const painPointPatterns = [
        /challeng(e|es|ing)/i,
        /difficult(y|ies)/i,
        /struggle|struggling/i,
        /problem(s)?/i,
        /issue(s)?/i,
        /manual(ly)?/i,
        /time[- ]consuming/i,
        /inefficient(cy|cies)?/i,
        /waste|wasting/i,
        /slow(ly)?/i,
        /error(s)?/i,
        /mistake(s)?/i,
        /fail(s|ed|ing|ure)?/i,
        /poor(ly)?/i,
        /lack(s|ing)?/i,
        /without/i,
        /need(s|ed|ing)?/i,
        /require(s|d|ment)?/i
      ];
      
      // Generate natural CTA sentence and extract anchor text
      const naturalSentence = this.generateNaturalCtaSentence(request.targetKeyword, request.campaignType);
      const anchorText = this.extractAnchorText(naturalSentence, request.targetKeyword);
      
      // Split content into paragraphs
      const paragraphs = this.extractParagraphs(request.content, request.contentFormat);
      console.log(`📄 Found ${paragraphs.length} paragraphs to analyze`);
      
      let enhancedContent = request.content;
      let ctaCount = 0;
      const maxCtas = request.maxCtasPerArticle || 3;
      const insertionPoints: Array<{
        paragraphIndex: number;
        ctaText: string;
        reasoning: string;
        confidence: number;
      }> = [];
      
      // Calculate optimal distribution for even spacing
      const totalParagraphs = paragraphs.filter(p => p.content.length >= 100).length;
      const targetSpacing = Math.max(2, Math.floor(totalParagraphs / maxCtas));
      let lastInsertionIndex = -targetSpacing;
      
      // Analyze each paragraph for CTA opportunities with even distribution
      for (let i = 0; i < paragraphs.length && ctaCount < maxCtas; i++) {
        const paragraph = paragraphs[i];
        
        // Skip if paragraph is too short
        if (paragraph.content.length < 100) continue;
        
        // Check spacing requirement for even distribution
        const spacingOk = (i - lastInsertionIndex) >= targetSpacing;
        if (!spacingOk && ctaCount > 0) continue;
        
        // Check for pain point patterns
        const matchedPatterns = painPointPatterns.filter(pattern => 
          pattern.test(paragraph.content)
        );
        
        if (matchedPatterns.length > 0) {
          // Create shorter, more natural CTA with embedded link
          let ctaHtml;
          if (request.contentFormat === 'html') {
            const anchorLink = `<a href="${ctaUrl}" target="_blank">${anchorText}</a>`;
            // Create a shorter, more natural integration
            ctaHtml = ` ${anchorLink}`;
          } else {
            // Markdown format
            const anchorLink = `[${anchorText}](${ctaUrl})`;
            ctaHtml = ` ${anchorLink}`;
          }
          
          // Insert at the end of the paragraph, before closing tag
          let insertionPoint = paragraph.endIndex;
          if (request.contentFormat === 'html' && paragraph.content.includes('</p>')) {
            // Insert before closing </p> tag for better flow
            insertionPoint = paragraph.endIndex - 4; // Before </p>
          }
          
          enhancedContent = enhancedContent.substring(0, insertionPoint) + 
                           ctaHtml + 
                           enhancedContent.substring(insertionPoint);
          
          lastInsertionIndex = i;
          
          insertionPoints.push({
            paragraphIndex: i,
            ctaText: ctaHtml,
            reasoning: `Pain point detected: ${matchedPatterns[0].source}`,
            confidence: 85 // High confidence for pattern matching
          });
          
          ctaCount++;
          console.log(`✅ Inserted natural CTA ${ctaCount} after paragraph ${i + 1}: "${naturalSentence.substring(0, 50)}..."`);
        }
      }
      
      console.log(`🎯 Simple CTA insertion completed: ${ctaCount} CTAs inserted`);
      
      return {
        success: true,
        enhancedContent,
        insertionAnalytics: {
          totalCtasInserted: ctaCount,
          insertionPoints
        },
        processingTimeMs: Date.now() - startTime
      };
      
    } catch (error) {
      console.error('❌ Simple CTA insertion failed:', error);
      return {
        success: false,
        enhancedContent: request.content,
        insertionAnalytics: {
          totalCtasInserted: 0,
          insertionPoints: []
        },
        processingTimeMs: Date.now() - startTime
      };
    }
  }
  
  /**
   * Extract paragraphs from content
   * Why this matters: Identifies paragraph boundaries for CTA insertion
   */
  private extractParagraphs(content: string, format: 'html' | 'markdown'): Array<{
    content: string;
    startIndex: number;
    endIndex: number;
  }> {
    const paragraphs: Array<{
      content: string;
      startIndex: number;
      endIndex: number;
    }> = [];
    
    if (format === 'html') {
      // Extract HTML paragraphs
      const paragraphRegex = /<p[^>]*>(.*?)<\/p>/gs;
      let match;
      
      while ((match = paragraphRegex.exec(content)) !== null) {
        paragraphs.push({
          content: match[1].replace(/<[^>]*>/g, ''), // Strip HTML tags for analysis
          startIndex: match.index,
          endIndex: match.index + match[0].length - 4 // Before </p>
        });
      }
    } else {
      // Extract markdown paragraphs (split by double newlines)
      const parts = content.split(/\n\s*\n/);
      let currentIndex = 0;
      
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.length > 0) {
          paragraphs.push({
            content: trimmed,
            startIndex: currentIndex,
            endIndex: currentIndex + part.length
          });
        }
        currentIndex += part.length + 2; // Account for newlines
      }
    }
    
    return paragraphs;
  }
  
  /**
   * Apollo solution categories with matching keywords
   * Why this matters: Maps keywords to specific Apollo solutions for targeted, relevant CTAs
   */
  private readonly solutionKeywords = {
    data_quality_enrichment: ['data', 'quality', 'enrichment', 'accuracy', 'verification', 'cleansing'],
    sales_prospecting: ['prospecting', 'leads', 'contacts', 'discovery', 'targeting', 'research', 'lead generation', 'b2b leads', 'generation'],
    sales_engagement: ['engagement', 'outreach', 'email', 'sequences', 'automation', 'communication'],
    pipeline_management: ['pipeline', 'deals', 'management', 'tracking', 'forecasting', 'process'],
    sales_intelligence: ['intelligence', 'insights', 'analytics', 'competitive', 'market', 'signals', 'alternative', 'competitor', 'salesforce', 'hubspot'],
    revenue_operations: ['revenue', 'operations', 'optimization', 'workflow', 'efficiency', 'performance'],
    call_assistant: ['calls', 'meetings', 'conversations', 'scheduling', 'recording', 'insights'],
    integrations: ['integration', 'api', 'connectivity', 'systems', 'workflow', 'automation'],
    general: ['sales', 'marketing', 'business', 'growth', 'efficiency', 'productivity']
  };

  /**
   * Detect the most relevant Apollo solution based on keyword matching
   * Why this matters: Identifies which Apollo solution area best matches the content context
   */
  private detectSolutionCategory(keyword: string): string {
    const keywordLower = keyword.toLowerCase();
    const keywordWords = keywordLower.split(/\s+/);
    
    let bestMatch = 'general';
    let highestScore = 0;
    
    for (const [category, keywords] of Object.entries(this.solutionKeywords)) {
      let score = 0;
      
      // Check for exact keyword matches
      for (const solutionKeyword of keywords) {
        if (keywordLower.includes(solutionKeyword)) {
          score += 2; // Higher weight for exact matches
        }
        
        // Check individual words
        for (const word of keywordWords) {
          if (word === solutionKeyword) {
            score += 3; // Highest weight for exact word matches
          }
        }
      }
      
      if (score > highestScore) {
        highestScore = score;
        bestMatch = category;
      }
    }
    
    console.log(`🎯 Detected solution category: ${bestMatch} (score: ${highestScore}) for keyword: "${keyword}"`);
    return bestMatch;
  }

  /**
   * Generate natural, flowing CTA sentences based on Apollo solution categories
   * Why this matters: Creates contextual sentences that seamlessly integrate Apollo's specific value propositions
   */
  private generateNaturalCtaSentence(keyword: string, campaignType: string): string {
    const solutionCategory = this.detectSolutionCategory(keyword);
    
    const ctaSentences = {
      data_quality_enrichment: [
        'Apollo maintains the industry\'s most accurate B2B database with real-time email verification, mobile numbers, and data enrichment capabilities that ensure your outreach reaches the right decision-makers every time.',
        'Apollo\'s data enrichment platform automatically verifies and updates contact information, providing you with accurate email addresses, phone numbers, and company details that boost your outreach success rates.',
        'With Apollo\'s advanced data quality tools, you can eliminate bounced emails and wrong numbers by accessing verified contact information for over 275 million professionals worldwide.',
        'Apollo\'s real-time data verification ensures your sales team always has the most current and accurate contact information, reducing wasted outreach efforts and improving conversion rates.',
        'Transform your data quality with Apollo\'s comprehensive enrichment suite that validates emails, finds direct phone numbers, and provides detailed company insights to power more effective sales campaigns.'
      ],
      
      sales_prospecting: [
        'Tools like Apollo help sales teams find and connect with qualified prospects more efficiently.',
        'Modern prospecting platforms like Apollo streamline the lead generation process significantly.',
        'Apollo\'s database provides access to millions of verified contacts for better prospecting results.',
        'Advanced prospecting tools can dramatically improve your team\'s lead generation efficiency.',
        'Platforms like Apollo combine data accuracy with intelligent filtering for smarter prospecting.'
      ],
      
      sales_engagement: [
        'Multi-channel engagement platforms like Apollo help teams coordinate outreach more effectively.',
        'Apollo\'s engagement tools enable personalized communication at scale across multiple channels.',
        'Modern sales engagement platforms streamline email, LinkedIn, and phone outreach workflows.',
        'Tools like Apollo help sales teams maintain consistent prospect communication across touchpoints.',
        'Engagement automation platforms can significantly improve response rates and conversion efficiency.'
      ],
      
      pipeline_management: [
        'Apollo provides complete pipeline visibility with deal tracking, forecasting tools, and automated workflow management that helps sales teams stay organized and hit their revenue targets consistently.',
        'Transform your sales pipeline with Apollo\'s comprehensive management tools that provide real-time visibility into deal progression, accurate forecasting, and automated task management.',
        'Apollo\'s pipeline management features help you track every opportunity from first contact to closed deal, with customizable stages, automated follow-ups, and detailed analytics to optimize your sales process.',
        'Gain complete control over your sales pipeline with Apollo\'s advanced tracking and forecasting capabilities that help you identify bottlenecks, prioritize opportunities, and predict revenue with confidence.',
        'Apollo\'s intelligent pipeline management system automatically tracks deal progression, sends timely reminders, and provides actionable insights to help your team close more deals faster.'
      ],
      
      sales_intelligence: [
        'Apollo delivers actionable sales intelligence through advanced analytics, competitive insights, and buyer intent signals that help sales teams understand their market and make data-driven decisions.',
        'Unlock powerful market insights with Apollo\'s sales intelligence platform that provides competitive analysis, industry trends, and buyer behavior data to inform your strategic sales decisions.',
        'Apollo\'s comprehensive sales intelligence tools give you deep visibility into prospect behavior, market dynamics, and competitive positioning to help you win more deals.',
        'Make smarter sales decisions with Apollo\'s advanced analytics that reveal prospect engagement patterns, market opportunities, and competitive threats in real-time.',
        'Apollo\'s sales intelligence platform combines data analytics, market research, and buyer intent signals to provide the insights you need to outperform your competition.'
      ],
      
      revenue_operations: [
        'Apollo streamlines revenue operations with workflow automation, performance analytics, and optimization tools that help sales teams eliminate inefficiencies and scale their processes effectively.',
        'Optimize your revenue operations with Apollo\'s comprehensive suite of automation tools, performance dashboards, and process optimization features that drive consistent growth.',
        'Apollo\'s revenue operations platform helps you standardize sales processes, automate routine tasks, and gain visibility into performance metrics that matter most to your business.',
        'Transform your revenue operations with Apollo\'s integrated platform that combines workflow automation, team performance tracking, and process optimization to maximize efficiency.',
        'Apollo\'s RevOps tools provide the automation, analytics, and optimization capabilities you need to scale your sales operations and drive predictable revenue growth.'
      ],
      
      call_assistant: [
        'Apollo\'s conversation intelligence features help sales teams improve their call performance through meeting insights, call recording analysis, and scheduling automation that drives better outcomes.',
        'Enhance your sales calls with Apollo\'s intelligent conversation tools that provide real-time coaching, automatic note-taking, and performance analytics to help you close more deals.',
        'Apollo\'s call assistant technology analyzes your sales conversations to identify successful patterns, suggest improvements, and automate follow-up tasks for maximum efficiency.',
        'Improve your sales call effectiveness with Apollo\'s conversation intelligence that captures key insights, tracks talk time ratios, and provides actionable feedback to enhance your performance.',
        'Apollo\'s advanced call features include automatic transcription, sentiment analysis, and coaching recommendations that help sales professionals have more productive conversations.'
      ],
      
      integrations: [
        'Apollo integrates seamlessly with your existing tech stack, including CRM systems, marketing automation platforms, and sales tools, creating a unified workflow that eliminates data silos and improves team efficiency.',
        'Connect Apollo with your favorite tools through native integrations with Salesforce, HubSpot, Pipedrive, and dozens of other platforms to create a seamless sales workflow.',
        'Apollo\'s extensive integration ecosystem allows you to sync data across your entire tech stack, ensuring consistent information flow and eliminating manual data entry.',
        'Maximize your existing tool investments with Apollo\'s robust integration capabilities that connect your CRM, marketing automation, and sales enablement platforms.',
        'Apollo\'s API and native integrations make it easy to connect with your current systems, creating a unified sales platform that enhances rather than replaces your existing workflow.'
      ],
      
      general: [
        'Apollo\'s all-in-one sales intelligence platform combines prospecting, engagement, and analytics capabilities that help modern sales teams find, engage, and convert prospects more effectively than traditional point solutions.',
        'Transform your sales process with Apollo\'s comprehensive platform that unifies prospecting, outreach, and analytics in one powerful solution designed for modern sales teams.',
        'Apollo\'s integrated sales platform eliminates the need for multiple tools by combining lead generation, engagement automation, and performance analytics in a single, powerful solution.',
        'Streamline your entire sales operation with Apollo\'s unified platform that brings together prospecting, engagement, and intelligence tools to accelerate your revenue growth.',
        'Apollo\'s complete sales solution provides everything you need to find, engage, and convert prospects, from the world\'s largest B2B database to advanced automation and analytics.'
      ]
    };
    
    // Get the appropriate sentence array or fall back to general
    const sentenceArray = ctaSentences[solutionCategory as keyof typeof ctaSentences] || ctaSentences.general;
    
    // Randomly select a sentence from the array for variety
    const randomIndex = Math.floor(Math.random() * sentenceArray.length);
    const sentence = sentenceArray[randomIndex];
    
    // Add campaign-specific context if needed
    if (campaignType === 'competitor_conquesting') {
      return sentence.replace('Apollo\'s', 'Unlike other platforms, Apollo\'s').replace('Apollo provides', 'Apollo provides superior').replace('Apollo delivers', 'Apollo delivers more comprehensive').replace('Apollo streamlines', 'Apollo more effectively streamlines');
    }
    
    return sentence;
  }
  
  /**
   * Extract anchor text based on solution category with multiple variations
   * Why this matters: Creates compelling, contextual anchor text that matches the detected solution area
   */
  private extractAnchorText(naturalSentence: string, keyword: string): string {
    const solutionCategory = this.detectSolutionCategory(keyword);
    
    const anchorTexts = {
      data_quality_enrichment: [
        'Apollo',
        'data enrichment tools',
        'Apollo\'s platform'
      ],
      sales_prospecting: [
        'Apollo',
        'prospecting tools',
        'Apollo\'s database'
      ],
      sales_engagement: [
        'Apollo',
        'engagement platforms',
        'Apollo\'s tools'
      ],
      pipeline_management: [
        'Apollo',
        'pipeline tools',
        'Apollo\'s platform'
      ],
      sales_intelligence: [
        'Apollo',
        'sales intelligence tools',
        'Apollo\'s analytics'
      ],
      revenue_operations: [
        'Apollo',
        'RevOps tools',
        'Apollo\'s platform'
      ],
      call_assistant: [
        'Apollo',
        'conversation intelligence',
        'Apollo\'s tools'
      ],
      integrations: [
        'Apollo',
        'integration tools',
        'Apollo\'s platform'
      ],
      general: [
        'Apollo',
        'sales platforms',
        'Apollo\'s solution'
      ]
    };
    
    // Get the appropriate anchor text array or fall back to general
    const anchorArray = anchorTexts[solutionCategory as keyof typeof anchorTexts] || anchorTexts.general;
    
    // Try to find an anchor text that exists in the natural sentence
    for (const anchorText of anchorArray) {
      if (naturalSentence.includes(anchorText)) {
        return anchorText;
      }
    }
    
    // If no exact match found, return the first option
    return anchorArray[0];
  }
  
  /**
   * Generate sitemap-aware UTM-tracked CTA URL
   * Why this matters: Creates trackable URLs using relevant Apollo pages from sitemap data
   * instead of always defaulting to the generic signup page
   */
  private generateCtaUrl(
    keyword: string, 
    campaignType: string, 
    competitorName?: string,
    sitemapData?: SitemapData[]
  ): string {
    const sanitizedKeyword = keyword.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .trim();
    
    let baseUrl = 'https://www.apollo.io/sign-up'; // Default fallback
    
    // Use sitemap data to find a more relevant URL if available (apollo.io only)
    if (sitemapData && sitemapData.length > 0) {
      console.log(`🗺️ Using sitemap data to find relevant apollo.io URL for keyword: "${keyword}"`);
      
      // Filter to only apollo.io URLs
      const apolloSitemapData = sitemapData.map(sitemap => ({
        ...sitemap,
        urls: sitemap.urls.filter(url => 
          url.url.includes('apollo.io') && 
          !url.url.includes('apollo.io/blog') && // Exclude blog posts
          !url.url.includes('apollo.io/careers') // Exclude career pages
        )
      })).filter(sitemap => sitemap.urls.length > 0);
      
      if (apolloSitemapData.length === 0) {
        console.log(`📭 No apollo.io URLs found in sitemap data, using default signup URL`);
      } else {
        const solutionCategory = this.detectSolutionCategory(keyword);
      
        if (campaignType === 'competitor_conquesting' && competitorName) {
          // For competitor conquesting, try to find competitor-specific pages
          baseUrl = this.sitemapUrlMatcher.findCompetitorConquestingUrl(
            competitorName,
            apolloSitemapData,
            baseUrl
          );
        } else {
          // For other campaigns, find solution-specific pages
          baseUrl = this.sitemapUrlMatcher.findBestUrlForSolution(
            solutionCategory,
            apolloSitemapData,
            baseUrl
          );
        }
      }
    } else {
      console.log(`📭 No sitemap data available, using default signup URL`);
    }
    
    // Add UTM parameters
    const utmParams = new URLSearchParams({
      utm_campaign: campaignType,
      utm_medium: 'contextual_cta',
      utm_term: sanitizedKeyword
    });
    
    // Handle URLs that already have query parameters
    const separator = baseUrl.includes('?') ? '&' : '?';
    const finalUrl = `${baseUrl}${separator}${utmParams.toString()}`;
    
    console.log(`🔗 Generated CTA URL: ${finalUrl}`);
    return finalUrl;
  }
}

export default SimpleContextualCtaService;
