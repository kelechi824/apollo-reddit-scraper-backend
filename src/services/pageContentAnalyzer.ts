import OpenAI from 'openai';
import FirecrawlService from './firecrawlService';

interface VoCPainPoint {
  id: string;
  theme: string;
  description: string;
  customerQuotes: string[];
  emotionalTriggers?: string[];
  sourceExcerpts?: Array<{
    quote: string;
    callTitle: string;
    callDate: string;
    excerpt: string;
    callId: string;
  }>;
}

interface PageSection {
  type: 'headline' | 'subheading' | 'paragraph' | 'cta' | 'feature' | 'benefit';
  content: string;
  position: number;
  relevantPainPoints: string[];
  optimizationSuggestions: string[];
}

interface BeforeAfterComparison {
  before: string;
  after: string;
  reason: string;
}

interface ContentAnalysisResult {
  pageUrl: string;
  pageTitle: string;
  contentStructure: {
    h1: BeforeAfterComparison;
    h2s: BeforeAfterComparison[];
    h3s: BeforeAfterComparison[];
    keyParagraphs: BeforeAfterComparison[];
  };
  painPointMappings: Array<{
    painPointTheme: string;
    relevantSections: string[];
    optimizationOpportunity: string;
    customerQuoteContext: string;
  }>;
}

/**
 * Page Content Analyzer Service
 * Why this matters: Analyzes crawled page content against Gong customer pain points
 * to generate specific optimization recommendations using GPT-5.
 */
class PageContentAnalyzer {
  private openai: OpenAI;
  private firecrawlService: FirecrawlService;
  private model = 'gpt-5-mini'; // Use GPT-5 mini for content analysis

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.firecrawlService = new FirecrawlService();
    console.log('✅ Page Content Analyzer (OpenAI GPT-5-mini) initialized successfully');
  }

  /**
   * Analyze page content against customer pain points
   * Why this matters: Maps actual page content to customer pain points for targeted optimization
   */
  async analyzePageContent(
    url: string,
    painPoints: VoCPainPoint[]
  ): Promise<ContentAnalysisResult> {
    try {
      console.log(`🔍 Starting comprehensive page analysis for: ${url}`);

      // Step 1: Extract page content using Firecrawl
      const pageContent = await this.firecrawlService.extractArticleContent(url);

      if (!pageContent.success || !pageContent.data) {
        throw new Error(`Failed to extract content from ${url}: ${pageContent.error}`);
      }

      const content = pageContent.data;
      console.log(`📄 Extracted ${content.wordCount} words from page: ${content.title}`);

      // Step 2: Analyze content against pain points using GPT-5
      const analysis = await this.performGPT5Analysis(url, content, painPoints);

      console.log(`✅ Content analysis completed for ${url}`);
      return analysis;

    } catch (error: any) {
      console.error(`❌ Page content analysis failed for ${url}:`, error);
      throw new Error(`Page analysis failed: ${error.message}`);
    }
  }

  /**
   * Perform GPT-5 powered content analysis
   * Why this matters: Uses advanced AI to map content sections to customer pain points
   */
  private async performGPT5Analysis(
    url: string,
    content: any,
    painPoints: VoCPainPoint[]
  ): Promise<ContentAnalysisResult> {

    // Use enhanced structure from Firecrawl service
    console.log(`🔍 Analyzing content for ${url} - Content length: ${content.content?.length || 0} chars`);
    console.log(`🔍 Content preview: ${content.content?.substring(0, 500)}...`);
    const extractedElements = this.useEnhancedStructure(content);

    // Debug the extractedElements before building the prompt
    console.log('🔍 DEBUG: extractedElements result:');
    console.log('  H1:', extractedElements.h1);
    console.log('  H1 type:', typeof extractedElements.h1);
    console.log('  H1 truthy:', !!extractedElements.h1);
    console.log('  H2s:', extractedElements.h2s);
    console.log('  H3s:', extractedElements.h3s);

    // Prepare comprehensive pain points summary for AI analysis - use more pain points
    const painPointsSummary = painPoints.slice(0, 15).map((pp, index) => {
      const quotes = pp.customerQuotes?.slice(0, 2) || [];
      const sourceContext = pp.sourceExcerpts?.slice(0, 1).map(se => se.excerpt) || [];

      return `${index + 1}. **${pp.theme}**
   Description: ${pp.description}
   Customer Quotes: ${quotes.join(' | ')}
   Context: ${sourceContext.join(' ')}`;
    }).join('\n\n');

    // Create comprehensive before/after analysis prompt
    const analysisPrompt = `You are an expert conversion optimization analyst. Analyze this Apollo page content against real customer pain points from Gong sales calls to provide structured before/after content comparisons.

PAGE TO ANALYZE:
URL: ${url}
Title: ${content.title}
Description: ${content.metadata?.description || 'No description'}

EXTRACTED CONTENT STRUCTURE:
H1 Headline: ${extractedElements.h1 || 'No H1 found'}
H2 Subheadlines: ${extractedElements.h2s.join(', ') || 'No H2s found'}
H3 Subheadlines: ${extractedElements.h3s.join(', ') || 'No H3s found'}
Key Paragraphs: ${extractedElements.keyParagraphs.join(' | ') || 'No paragraphs found'}

CUSTOMER PAIN POINTS FROM GONG CALLS:
${painPointsSummary}

ANALYSIS REQUIREMENTS:
1. Create before/after comparisons for each content element (H1, H2s, H3s, paragraphs)
2. Map improvements to specific customer pain points
3. Provide clear reasoning for each optimization
4. Focus on actionable, customer-centric improvements

Return your analysis in this exact JSON format:
{
  "pageUrl": "${url}",
  "pageTitle": "${content.title}",
  "contentStructure": {
    "h1": {
      "before": "${extractedElements.h1 || 'No H1 found'}",
      "after": "Optimized H1 that addresses customer pain points",
      "reason": "Why this change addresses specific customer struggles"
    },
    "h2s": [
      {
        "before": "Current H2 text",
        "after": "Optimized H2 text",
        "reason": "Explanation of improvement"
      }
    ],
    "h3s": [
      {
        "before": "Current H3 text",
        "after": "Optimized H3 text",
        "reason": "Explanation of improvement"
      }
    ],
    "keyParagraphs": [
      {
        "before": "Current paragraph text",
        "after": "Optimized paragraph text",
        "reason": "Explanation of improvement"
      }
    ]
  },
  "painPointMappings": [
    {
      "painPointTheme": "Theme from the pain point list",
      "relevantSections": ["H1", "H2", "paragraphs"],
      "optimizationOpportunity": "How content can better address this pain point",
      "customerQuoteContext": "Relevant customer quote that supports this mapping"
    }
  ]
}

Requirements:
- For each content element found, provide before/after comparison
- If no content found for a section, use "No content found" for before
- Keep "after" suggestions concise and customer-focused
- Make "reason" explanations clear and specific to pain points
- Ensure all before/after comparisons are actionable`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert conversion optimization analyst specializing in mapping customer pain points to page optimization opportunities. Always return valid JSON.'
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        max_completion_tokens: 2000
        // Note: GPT-5 models only support default temperature (1)
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No response from GPT-5 analysis');
      }

      // Parse the JSON response
      let analysisResult: ContentAnalysisResult;
      try {
        // Clean up the response to ensure valid JSON
        const cleanedResponse = responseContent
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();

        analysisResult = JSON.parse(cleanedResponse);

        // Validate required fields
        if (!analysisResult.pageUrl || !analysisResult.contentStructure || !analysisResult.painPointMappings) {
          throw new Error('Invalid analysis result structure');
        }

        console.log(`📊 GPT-5 analysis completed: ${analysisResult.painPointMappings.length} pain point mappings, before/after structure created`);

        return analysisResult;

      } catch (parseError) {
        console.error('❌ Failed to parse GPT-5 response as JSON:', parseError);
        // Fallback to structured response
        return this.createFallbackAnalysis(url, content, painPoints);
      }

    } catch (error: any) {
      console.error('❌ GPT-5 analysis failed:', error);
      return this.createFallbackAnalysis(url, content, painPoints);
    }
  }

  /**
   * Use enhanced structure from FirecrawlService instead of basic extraction
   * Why this matters: Leverages our enhanced visual header detection and structure analysis
   */
  private useEnhancedStructure(content: any): {
    h1: string | null;
    h2s: string[];
    h3s: string[];
    keyParagraphs: string[];
  } {
    console.log('🔍 Using enhanced structure from FirecrawlService');
    console.log('🔍 DEBUG: content object keys:', Object.keys(content || {}));
    console.log('🔍 DEBUG: content.structure exists:', !!content.structure);
    if (content.structure) {
      console.log('🔍 DEBUG: content.structure keys:', Object.keys(content.structure || {}));
      console.log('🔍 DEBUG: content.structure.headings exists:', !!content.structure.headings);
      console.log('🔍 DEBUG: content.structure.headings length:', content.structure.headings?.length || 0);
      if (content.structure.headings?.length > 0) {
        console.log('🔍 DEBUG: First few headings:', content.structure.headings.slice(0, 5));
      }
    }

    // Use the enhanced structure from our FirecrawlService if available
    if (content.structure && content.structure.headings) {
      const h1s = content.structure.headings.filter((h: any) => h.level === 1);
      const h2s = content.structure.headings.filter((h: any) => h.level === 2);
      const h3s = content.structure.headings.filter((h: any) => h.level === 3);

      console.log('🔍 DEBUG: Filtered H1s:', h1s);
      console.log('🔍 DEBUG: H1s count:', h1s.length);

      const result = {
        h1: h1s.length > 0 ? h1s[0].text : null,
        h2s: h2s.map((h: any) => h.text),
        h3s: h3s.map((h: any) => h.text),
        keyParagraphs: content.structure.paragraphs?.slice(0, 5).map((p: any) => p.content) || []
      };

      console.log(`✅ Enhanced structure found: H1="${result.h1}", H2s=${result.h2s.length}, H3s=${result.h3s.length}`);
      return result;
    }

    // Fallback to basic extraction if enhanced structure not available
    console.log('⚠️ Enhanced structure not available, falling back to basic extraction');
    console.log('🔍 DEBUG: content.content preview:', (content.content || '').substring(0, 200));
    return this.extractPageElements(content.content || '');
  }

  /**
   * Extract H1 and subheadlines from page content
   * Why this matters: Provides specific page elements for targeted optimization
   */
  private extractPageElements(content: string): {
    h1: string | null;
    h2s: string[];
    h3s: string[];
    keyParagraphs: string[];
  } {
    const result = {
      h1: null as string | null,
      h2s: [] as string[],
      h3s: [] as string[],
      keyParagraphs: [] as string[]
    };

    if (!content) return result;

    console.log(`🔍 Starting enhanced content extraction from ${content.length} chars`);
    console.log(`🔍 Content sample: ${content.substring(0, 800)}`);

    // Enhanced H1 extraction with Apollo-specific patterns
    const h1ExtractionStrategies = [
      // Strategy 1: Standard HTML h1 tags (enhanced with more patterns)
      {
        name: 'HTML h1 tags',
        patterns: [
          /<h1[^>]*>(.*?)<\/h1>/gis,
          /<h1[^>]*class="[^"]*"[^>]*>(.*?)<\/h1>/gis,
          /<h1[^>]*id="[^"]*"[^>]*>(.*?)<\/h1>/gis,
          /<h1[^>]*>([^<]+)</gi,
          /<h1>(.*?)<\/h1>/gi
        ]
      },
      // Strategy 2: Markdown headers
      {
        name: 'Markdown H1',
        patterns: [
          /^# (.+)$/gm,
          /^#\s+(.+)$/gm
        ]
      },
      // Strategy 3: Apollo-specific patterns (common in Apollo pages)
      {
        name: 'Apollo page patterns',
        patterns: [
          /<div[^>]*class="[^"]*hero[^"]*"[^>]*>[\s\S]*?<h\d[^>]*>(.*?)<\/h\d>/gi,
          /<div[^>]*class="[^"]*banner[^"]*"[^>]*>[\s\S]*?<h\d[^>]*>(.*?)<\/h\d>/gi,
          /<section[^>]*class="[^"]*hero[^"]*"[^>]*>[\s\S]*?<h\d[^>]*>(.*?)<\/h\d>/gi,
          /<header[^>]*>[\s\S]*?<h\d[^>]*>(.*?)<\/h\d>/gi
        ]
      },
      // Strategy 4: Role-based headers (accessibility)
      {
        name: 'Role-based headers',
        patterns: [
          /role="heading"[^>]*aria-level="1"[^>]*>([^<]+)</gi,
          /aria-level="1"[^>]*role="heading"[^>]*>([^<]+)</gi,
          /class="[^"]*heading[^"]*"[^>]*>([^<]+)</gi,
          /class="[^"]*h1[^"]*"[^>]*>([^<]+)</gi
        ]
      },
      // Strategy 5: Large text elements and titles
      {
        name: 'Large text elements',
        patterns: [
          /<div[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)</gi,
          /<span[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)</gi,
          /<p[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)</gi,
          /<div[^>]*class="[^"]*headline[^"]*"[^>]*>([^<]+)</gi
        ]
      },
      // Strategy 6: Structured data and meta
      {
        name: 'Structured data',
        patterns: [
          /"headline":\s*"([^"]+)"/gi,
          /"name":\s*"([^"]+)"/gi,
          /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/gi,
          /<meta[^>]*name="title"[^>]*content="([^"]+)"/gi
        ]
      },
      // Strategy 7: Title elements as final fallback
      {
        name: 'Title elements',
        patterns: [
          /<title[^>]*>(.*?)<\/title>/gis,
          /<title>(.*?)<\/title>/gi
        ]
      }
    ];

    // Try each extraction strategy until we find a valid H1
    for (const strategy of h1ExtractionStrategies) {
      console.log(`🔍 Trying H1 extraction strategy: ${strategy.name}`);

      for (const pattern of strategy.patterns) {
        pattern.lastIndex = 0;  // Reset regex
        let match;

        // Try all matches for this pattern
        while ((match = pattern.exec(content)) !== null) {
          if (match[1] && match[1].trim()) {
            const candidateH1 = this.cleanText(match[1]);

            // Validate the H1 candidate
            if (this.isValidH1Candidate(candidateH1)) {
              result.h1 = candidateH1;
              console.log(`✅ Found valid H1 using ${strategy.name}: "${result.h1}"`);
              break;
            } else {
              console.log(`❌ Invalid H1 candidate: "${candidateH1}" (reason: ${this.getH1InvalidReason(candidateH1)})`);
            }
          }

          // Prevent infinite loops
          if (!pattern.global) break;
        }

        if (result.h1) break;
      }

      if (result.h1) break;
    }

    // Final fallback: extract from content structure
    if (!result.h1) {
      console.log(`🔄 No H1 found with standard patterns, trying content structure analysis`);
      result.h1 = this.extractH1FromContentStructure(content);
      if (result.h1) {
        console.log(`✅ Found H1 from content structure: "${result.h1}"`);
      }
    }

    // Enhanced H2 extraction with Apollo-specific patterns
    const h2Patterns = [
      /<h2[^>]*>(.*?)<\/h2>/gis,  // HTML h2 tags with multiline support
      /<h2[^>]*class="[^"]*"[^>]*>(.*?)<\/h2>/gis,  // H2s with classes
      /^## (.+)$/gm,  // Markdown H2
      /<div[^>]*class="[^"]*subtitle[^"]*"[^>]*>([^<]+)</gi,  // Apollo subtitle patterns
      /<h2[^>]*id="[^"]*"[^>]*>(.*?)<\/h2>/gis  // H2s with IDs
    ];

    for (const pattern of h2Patterns) {
      pattern.lastIndex = 0;  // Reset regex
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1] && match[1].trim()) {
          const cleanH2 = this.cleanText(match[1]);
          if (this.isValidHeading(cleanH2) && !result.h2s.includes(cleanH2)) {
            result.h2s.push(cleanH2);
          }
        }
      }
    }

    // Enhanced H3 extraction with Apollo-specific patterns
    const h3Patterns = [
      /<h3[^>]*>(.*?)<\/h3>/gis,  // HTML h3 tags with multiline support
      /<h3[^>]*class="[^"]*"[^>]*>(.*?)<\/h3>/gis,  // H3s with classes
      /^### (.+)$/gm,  // Markdown H3
      /<div[^>]*class="[^"]*section-title[^"]*"[^>]*>([^<]+)</gi,  // Apollo section titles
      /<h3[^>]*id="[^"]*"[^>]*>(.*?)<\/h3>/gis  // H3s with IDs
    ];

    for (const pattern of h3Patterns) {
      pattern.lastIndex = 0;  // Reset regex
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1] && match[1].trim()) {
          const cleanH3 = this.cleanText(match[1]);
          if (this.isValidHeading(cleanH3) && !result.h3s.includes(cleanH3)) {
            result.h3s.push(cleanH3);
          }
        }
      }
    }

    // Extract key paragraphs (first few substantial paragraphs)
    const paragraphPatterns = [
      /<p[^>]*>(.*?)<\/p>/gis,  // Standard paragraphs
      /<div[^>]*class="[^"]*content[^"]*"[^>]*><p[^>]*>(.*?)<\/p>/gis,  // Content paragraphs
      /<div[^>]*class="[^"]*description[^"]*"[^>]*>([^<]+)</gi,  // Description divs
      /<div[^>]*class="[^"]*lead[^"]*"[^>]*>([^<]+)</gi  // Lead text
    ];

    const foundParagraphs = new Set<string>();
    for (const pattern of paragraphPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null && result.keyParagraphs.length < 3) {
        if (match[1] && match[1].trim()) {
          const cleanParagraph = this.cleanText(match[1]);
          if (this.isValidParagraph(cleanParagraph) && !foundParagraphs.has(cleanParagraph)) {
            foundParagraphs.add(cleanParagraph);
            result.keyParagraphs.push(cleanParagraph);
          }
        }
      }
    }

    console.log(`📄 Extracted content: H1="${result.h1}", ${result.h2s.length} H2s, ${result.h3s.length} H3s, ${result.keyParagraphs.length} paragraphs`);
    return result;
  }

  /**
   * Clean extracted text by removing HTML tags and normalizing whitespace
   */
  private cleanText(text: string): string {
    return text
      .replace(/<[^>]*>/g, '')  // Remove HTML tags
      .replace(/&[a-zA-Z0-9#]+;/g, ' ')  // Remove HTML entities
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .trim();
  }

  /**
   * Validate if text is a valid heading (H2/H3)
   * Why this matters: Filters out noise and navigation elements
   */
  private isValidHeading(heading: string): boolean {
    if (!heading || typeof heading !== 'string') return false;

    const trimmed = heading.trim();

    // Basic length validation
    if (trimmed.length < 3 || trimmed.length > 200) return false;

    // Must contain some letters
    if (!/[a-zA-Z]/.test(trimmed)) return false;

    // Should not be mostly numbers
    const alphaRatio = (trimmed.match(/[a-zA-Z]/g) || []).length / trimmed.length;
    if (alphaRatio < 0.3) return false;

    // Common exclusions for headings
    const exclusions = [
      'menu', 'navigation', 'nav', 'skip', 'cookie', 'privacy', 'terms',
      'loading', 'error', 'javascript', 'css', 'function', 'var ', 'let ',
      'search', 'login', 'signup', 'subscribe', 'follow us'
    ];

    const lowerHeading = trimmed.toLowerCase();
    for (const exclusion of exclusions) {
      if (lowerHeading.includes(exclusion)) return false;
    }

    // Should not be a URL or email
    if (/^https?:\/\//.test(trimmed) || /@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(trimmed)) return false;

    return true;
  }

  /**
   * Validate if text is a meaningful paragraph
   * Why this matters: Filters out short snippets and navigation text
   */
  private isValidParagraph(paragraph: string): boolean {
    if (!paragraph || typeof paragraph !== 'string') return false;

    const trimmed = paragraph.trim();

    // Must be substantial content (at least 50 characters and 8 words)
    if (trimmed.length < 50) return false;

    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount < 8) return false;

    // Must contain letters
    if (!/[a-zA-Z]/.test(trimmed)) return false;

    // Should not be mostly punctuation or numbers
    const alphaRatio = (trimmed.match(/[a-zA-Z]/g) || []).length / trimmed.length;
    if (alphaRatio < 0.5) return false;

    // Common exclusions for paragraphs
    const exclusions = [
      'cookie policy', 'privacy policy', 'terms of service', 'all rights reserved',
      'copyright', '© 2024', '© 2023', 'subscribe', 'newsletter', 'follow us',
      'social media', 'loading', 'error', 'javascript disabled'
    ];

    const lowerParagraph = trimmed.toLowerCase();
    for (const exclusion of exclusions) {
      if (lowerParagraph.includes(exclusion)) return false;
    }

    return true;
  }

  /**
   * Validate if a candidate text is a valid H1
   * Why this matters: Filters out noise and ensures we get meaningful headlines
   */
  private isValidH1Candidate(candidate: string): boolean {
    if (!candidate || typeof candidate !== 'string') return false;

    const trimmed = candidate.trim();

    // Basic length validation
    if (trimmed.length < 3 || trimmed.length > 300) return false;

    // Must contain some letters
    if (!/[a-zA-Z]/.test(trimmed)) return false;

    // Should not be mostly numbers or special characters
    const alphaRatio = (trimmed.match(/[a-zA-Z]/g) || []).length / trimmed.length;
    if (alphaRatio < 0.3) return false;

    // Common exclusions
    const exclusions = [
      'menu', 'navigation', 'nav', 'skip to content', 'cookie', 'privacy policy',
      'terms of service', 'loading', 'error', '404', '403', '500', 'not found',
      'javascript', 'css', 'style', 'script', 'document', 'window', 'function',
      'var ', 'let ', 'const ', 'import ', 'export ', 'return', 'if (', 'for (',
      'while (', '{', '}', '[', ']', 'undefined', 'null', 'true', 'false'
    ];

    const lowerCandidate = trimmed.toLowerCase();
    for (const exclusion of exclusions) {
      if (lowerCandidate.includes(exclusion)) return false;
    }

    // Should not be a URL
    if (/^https?:\/\//.test(trimmed)) return false;

    // Should not be email
    if (/@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(trimmed)) return false;

    return true;
  }

  /**
   * Get reason why H1 candidate is invalid (for debugging)
   */
  private getH1InvalidReason(candidate: string): string {
    if (!candidate) return 'empty/null';

    const trimmed = candidate.trim();
    if (trimmed.length < 3) return 'too short';
    if (trimmed.length > 300) return 'too long';
    if (!/[a-zA-Z]/.test(trimmed)) return 'no letters';

    const alphaRatio = (trimmed.match(/[a-zA-Z]/g) || []).length / trimmed.length;
    if (alphaRatio < 0.3) return 'mostly non-alphabetic';

    if (/^https?:\/\//.test(trimmed)) return 'is URL';
    if (/@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(trimmed)) return 'is email';

    const lowerCandidate = trimmed.toLowerCase();
    if (lowerCandidate.includes('menu')) return 'contains menu';
    if (lowerCandidate.includes('javascript')) return 'contains javascript';
    if (lowerCandidate.includes('loading')) return 'contains loading';

    return 'unknown reason';
  }

  /**
   * Extract H1 from content structure analysis
   * Why this matters: Fallback method when standard patterns fail
   */
  private extractH1FromContentStructure(content: string): string | null {
    console.log(`🔍 Analyzing content structure for H1 extraction`);

    // Strategy 1: Look for the largest/most prominent text at the beginning
    const lines = content.split('\n').filter(line => line.trim()).slice(0, 10);

    for (const line of lines) {
      const cleaned = this.cleanText(line);
      if (this.isValidH1Candidate(cleaned)) {
        // Check if this line looks like a title (not too much punctuation, reasonable length)
        const punctuationRatio = (cleaned.match(/[.,;:!?]/g) || []).length / cleaned.length;
        if (punctuationRatio < 0.1 && cleaned.length > 10 && cleaned.length < 150) {
          return cleaned;
        }
      }
    }

    // Strategy 2: Look for text patterns that suggest headers
    const headerPatterns = [
      /([A-Z][^.!?]*[^.!?])\s*\n/g,  // Capitalized lines without ending punctuation
      /^([A-Z][^.!?]{10,100})\s*$/gm,  // Capitalized standalone lines
      /(^|\n)([A-Z][A-Za-z\s]{10,100})(?=\n|$)/g  // Title case lines
    ];

    for (const pattern of headerPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const candidate = this.cleanText(match[match.length - 1]);  // Get last capture group
        if (this.isValidH1Candidate(candidate)) {
          return candidate;
        }
        if (!pattern.global) break;
      }
    }

    // Strategy 3: Use first substantial line as fallback
    for (const line of lines) {
      const cleaned = this.cleanText(line);
      if (cleaned.length > 15 && cleaned.length < 200 && /^[A-Z]/.test(cleaned)) {
        return cleaned;
      }
    }

    console.log(`❌ Could not extract H1 from content structure`);
    return null;
  }

  /**
   * Create fallback analysis when GPT-5 fails
   * Why this matters: Ensures the service always returns useful results
   */
  private createFallbackAnalysis(
    url: string,
    content: any,
    painPoints: VoCPainPoint[]
  ): ContentAnalysisResult {
    console.log('🔄 Creating fallback analysis...');

    // Use enhanced structure from Firecrawl service for fallback too
    const extractedElements = this.useEnhancedStructure(content);
    const topPainPoints = painPoints.slice(0, 3);

    console.log('🔍 DEBUG FALLBACK: extractedElements.h1:', extractedElements.h1);

    return {
      pageUrl: url,
      pageTitle: content.title,
      contentStructure: {
        h1: {
          before: extractedElements.h1 || 'No H1 found',
          after: `Stop Wasting Time on Manual ${topPainPoints[0]?.theme || 'Sales Tasks'} - Automate with Apollo`,
          reason: `Directly addresses the customer pain point of ${topPainPoints[0]?.theme || 'inefficient processes'} with action-oriented language`
        },
        h2s: extractedElements.h2s.slice(0, 3).map((h2, index) => ({
          before: h2,
          after: `Solve ${topPainPoints[index % topPainPoints.length]?.theme || 'Sales Challenges'} in Minutes, Not Hours`,
          reason: `Positions solution as time-saving and directly addresses customer pain around ${topPainPoints[index % topPainPoints.length]?.theme || 'efficiency'}`
        })),
        h3s: extractedElements.h3s.slice(0, 2).map((h3, index) => ({
          before: h3,
          after: `Eliminate ${topPainPoints[index % topPainPoints.length]?.theme || 'Manual Work'} with Smart Automation`,
          reason: `Focuses on eliminating specific customer struggles mentioned in Gong calls`
        })),
        keyParagraphs: extractedElements.keyParagraphs.slice(0, 2).map((paragraph, index) => ({
          before: paragraph.length > 100 ? paragraph.substring(0, 100) + '...' : paragraph,
          after: `Apollo solves the exact problem your customers face: ${topPainPoints[index % topPainPoints.length]?.theme || 'inefficient sales processes'}. Our platform eliminates manual work so your team can focus on closing deals.`,
          reason: `Reframes content to directly address customer pain points identified in Gong call analysis`
        }))
      },
      painPointMappings: topPainPoints.map(pp => ({
        painPointTheme: pp.theme,
        relevantSections: ['H1', 'H2 Subheadlines', 'Key Paragraphs'],
        optimizationOpportunity: `Optimize content to better address ${pp.theme.toLowerCase()} concerns with customer-focused messaging`,
        customerQuoteContext: pp.customerQuotes?.[0] || 'Customer feedback indicates this is a key concern'
      }))
    };
  }

  /**
   * Analyze multiple pages in batch
   * Why this matters: Efficiently processes multiple pages for sitemap analysis
   */
  async analyzeMultiplePages(
    urls: string[],
    painPoints: VoCPainPoint[],
    maxConcurrency: number = 3
  ): Promise<ContentAnalysisResult[]> {
    console.log(`🔄 Starting batch analysis of ${urls.length} pages with max concurrency: ${maxConcurrency}`);

    const results: ContentAnalysisResult[] = [];

    // Process URLs in batches to avoid overwhelming the services
    for (let i = 0; i < urls.length; i += maxConcurrency) {
      const batch = urls.slice(i, i + maxConcurrency);
      console.log(`📦 Processing batch ${Math.floor(i / maxConcurrency) + 1}: ${batch.length} URLs`);

      const batchPromises = batch.map(async (url) => {
        try {
          return await this.analyzePageContent(url, painPoints);
        } catch (error) {
          console.warn(`⚠️ Failed to analyze ${url}:`, error);
          return null;
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        } else {
          console.warn(`❌ Batch analysis failed for URL: ${batch[index]}`);
        }
      });

      // Add small delay between batches to be respectful to services
      if (i + maxConcurrency < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`✅ Batch analysis completed: ${results.length}/${urls.length} successful`);
    return results;
  }

  /**
   * Health check for the service
   * Why this matters: Validates that all dependencies are working
   */
  async healthCheck(): Promise<{ success: boolean; message: string }> {
    try {
      // Test Firecrawl service
      const firecrawlHealth = await this.firecrawlService.healthCheck();
      if (!firecrawlHealth.success) {
        return {
          success: false,
          message: `Firecrawl service unavailable: ${firecrawlHealth.message}`
        };
      }

      // Test OpenAI connection with a minimal request
      const testCompletion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'Test connection' }],
        max_completion_tokens: 10
      });

      if (!testCompletion.choices[0]?.message?.content) {
        return {
          success: false,
          message: 'OpenAI GPT-5 service not responding properly'
        };
      }

      return {
        success: true,
        message: 'Page Content Analyzer service is operational'
      };

    } catch (error: any) {
      return {
        success: false,
        message: `Service health check failed: ${error.message}`
      };
    }
  }
}

export default PageContentAnalyzer;
export type { ContentAnalysisResult, VoCPainPoint, PageSection };