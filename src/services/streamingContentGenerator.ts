/**
 * Streaming Content Generator with Contextual CTAs
 * Why this matters: Generates content paragraph by paragraph, analyzes each paragraph's context,
 * and inserts truly contextual CTAs based on actual content, not just keywords
 */

import StreamingCtaAnalyzer from './streamingCtaAnalyzer';
import { workflowOrchestrator } from './workflowOrchestrator';

export interface StreamingGenerationRequest {
  keyword: string;
  systemPrompt: string;
  userPrompt: string;
  campaignType: 'blog_creator' | 'competitor_conquesting';
  competitorName?: string;
  maxCtasPerArticle?: number;
  brand_kit?: any;
  sitemap_data?: any;
}

export interface StreamingGenerationResult {
  success: boolean;
  content: string;
  metaSeoTitle: string;
  metaDescription: string;
  ctaInsertions: {
    totalInserted: number;
    insertionPoints: Array<{
      paragraphIndex: number;
      cta: string;
      reasoning: string;
      confidence: number;
    }>;
  };
  processingTimeMs: number;
  error?: string;
}

/**
 * Streaming Content Generator
 * Why this matters: Implements the streaming approach where content is generated
 * and contextual CTAs are inserted based on actual paragraph content
 */
class StreamingContentGenerator {
  private ctaAnalyzer: StreamingCtaAnalyzer;

  constructor() {
    this.ctaAnalyzer = new StreamingCtaAnalyzer();
    console.log('✅ Streaming Content Generator initialized');
  }

  /**
   * Generate content with streaming contextual CTA insertion
   * Why this matters: Creates content and CTAs together based on actual context
   */
  async generateContentWithContextualCtas(request: StreamingGenerationRequest): Promise<StreamingGenerationResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🚀 Starting streaming content generation for: "${request.keyword}"`);

      // Step 1: Generate the base content first
      console.log(`📝 Step 1: Generating base content...`);
      const baseContent = await this.generateBaseContent(request);
      
      if (!baseContent.success) {
        throw new Error(baseContent.error || 'Base content generation failed');
      }

      console.log(`✅ Base content generated (${baseContent.content.length} chars)`);

      // Step 2: Parse content into paragraphs
      const paragraphs = this.parseContentIntoParagraphs(baseContent.content);
      console.log(`📄 Parsed content into ${paragraphs.length} paragraphs`);

      // Step 3: Analyze each paragraph and insert contextual CTAs
      console.log(`🔍 Step 3: Analyzing paragraphs for contextual CTA opportunities...`);
      const enhancedContent = await this.insertContextualCtasIntoContent(
        paragraphs,
        request
      );

      console.log(`✅ Content enhancement completed`);

      return {
        success: true,
        content: enhancedContent.content,
        metaSeoTitle: baseContent.metaSeoTitle,
        metaDescription: baseContent.metaDescription,
        ctaInsertions: enhancedContent.ctaInsertions,
        processingTimeMs: Date.now() - startTime
      };

    } catch (error) {
      console.error('❌ Streaming content generation failed:', error);
      return {
        success: false,
        content: '',
        metaSeoTitle: '',
        metaDescription: '',
        ctaInsertions: { totalInserted: 0, insertionPoints: [] },
        processingTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate base content without CTAs
   * Why this matters: Creates the foundation content that we'll enhance with contextual CTAs
   */
  private async generateBaseContent(request: StreamingGenerationRequest): Promise<{
    success: boolean;
    content: string;
    metaSeoTitle: string;
    metaDescription: string;
    error?: string;
  }> {
    try {
      // Use the proper workflow orchestrator like the regular blog creator
      const response = await workflowOrchestrator.executeContentPipeline({
        keyword: request.keyword.trim(),
        target_audience: request.campaignType === 'blog_creator' ? 'B2B sales teams' : 'Sales professionals',
        content_length: 'medium',
        focus_areas: [],
        brand_kit: request.brand_kit,
        sitemap_data: request.sitemap_data,
        system_prompt: request.systemPrompt,
        user_prompt: request.userPrompt
      });

      return {
        success: true,
        content: response.content || '',
        metaSeoTitle: response.metadata?.metaSeoTitle || '',
        metaDescription: response.metadata?.metaDescription || ''
      };

    } catch (error) {
      console.error('❌ Base content generation failed:', error);
      return {
        success: false,
        content: '',
        metaSeoTitle: '',
        metaDescription: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Parse HTML content into individual paragraphs
   * Why this matters: Breaks content into analyzable chunks for contextual CTA insertion
   */
  private parseContentIntoParagraphs(htmlContent: string): Array<{
    content: string;
    isHeading: boolean;
    tagType: string;
    index: number;
  }> {
    const paragraphs: Array<{
      content: string;
      isHeading: boolean;
      tagType: string;
      index: number;
    }> = [];

    // Extract paragraphs and headings while preserving structure
    const paragraphRegex = /<(h[1-6]|p)([^>]*)>(.*?)<\/\1>/gs;
    let match;
    let index = 0;

    while ((match = paragraphRegex.exec(htmlContent)) !== null) {
      const [fullMatch, tagType, attributes, content] = match;
      
      // Clean content but preserve basic formatting
      const cleanContent = content
        .replace(/<[^>]*>/g, ' ') // Remove HTML tags
        .replace(/\s+/g, ' ')     // Normalize whitespace
        .trim();

      if (cleanContent.length > 20) { // Only include substantial content
        paragraphs.push({
          content: cleanContent,
          isHeading: tagType.startsWith('h'),
          tagType,
          index: index++
        });
      }
    }

    return paragraphs;
  }

  /**
   * Analyze paragraphs and insert contextual CTAs
   * Why this matters: The core streaming logic that inserts CTAs based on actual paragraph context
   */
  private async insertContextualCtasIntoContent(
    paragraphs: Array<{ content: string; isHeading: boolean; tagType: string; index: number }>,
    request: StreamingGenerationRequest
  ): Promise<{
    content: string;
    ctaInsertions: {
      totalInserted: number;
      insertionPoints: Array<{
        paragraphIndex: number;
        cta: string;
        reasoning: string;
        confidence: number;
      }>;
    };
  }> {
    const maxCtas = request.maxCtasPerArticle || 3;
    let ctaInsertionCount = 0;
    const insertionPoints: Array<{
      paragraphIndex: number;
      cta: string;
      reasoning: string;
      confidence: number;
    }> = [];

    // Process each paragraph for potential CTA insertion
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i];

      // Skip headings and short paragraphs
      if (paragraph.isHeading || paragraph.content.length < 100) {
        continue;
      }

      // Skip if we've already inserted enough CTAs
      if (ctaInsertionCount >= maxCtas) {
        break;
      }

      console.log(`🔍 Analyzing paragraph ${i + 1}/${paragraphs.length} for CTA opportunity...`);

      // Analyze paragraph for CTA insertion
      const ctaAnalysis = await this.ctaAnalyzer.analyzeParagraphForCta({
        paragraphContent: paragraph.content,
        targetKeyword: request.keyword,
        campaignType: request.campaignType,
        competitorName: request.competitorName,
        articleContext: {
          title: `${request.keyword} Guide`,
          previousParagraphs: paragraphs.slice(0, i).map(p => p.content),
          overallTheme: request.keyword
        },
        ctaInsertionCount,
        maxCtasPerArticle: maxCtas
      });

      if (ctaAnalysis.shouldInsertCta && ctaAnalysis.cta) {
        console.log(`✅ Inserting CTA after paragraph ${i + 1}: "${ctaAnalysis.cta.anchorText}"`);
        
        // Add CTA to the paragraph
        paragraph.content += ` ${ctaAnalysis.cta.fullCta}`;
        
        insertionPoints.push({
          paragraphIndex: i,
          cta: ctaAnalysis.cta.fullCta,
          reasoning: ctaAnalysis.cta.reasoning,
          confidence: ctaAnalysis.cta.confidence
        });

        ctaInsertionCount++;
      }
    }

    // Reconstruct the HTML content with inserted CTAs
    const enhancedContent = this.reconstructHtmlContent(paragraphs);

    return {
      content: enhancedContent,
      ctaInsertions: {
        totalInserted: ctaInsertionCount,
        insertionPoints
      }
    };
  }

  /**
   * Reconstruct HTML content from processed paragraphs
   * Why this matters: Rebuilds the HTML structure with inserted CTAs
   */
  private reconstructHtmlContent(paragraphs: Array<{
    content: string;
    isHeading: boolean;
    tagType: string;
    index: number;
  }>): string {
    return paragraphs
      .map(paragraph => {
        if (paragraph.isHeading) {
          return `<${paragraph.tagType}>${paragraph.content}</${paragraph.tagType}>`;
        } else {
          return `<p>${paragraph.content}</p>`;
        }
      })
      .join('\n\n');
  }
}

export default StreamingContentGenerator;
