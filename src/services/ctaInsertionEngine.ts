import { CTAStructure, PositionSpecificCTA, CTAGenerationResult } from './ctaGenerationService';

/**
 * Article Content with Enhanced CTA Support
 * Why this matters: Extends the existing ArticleContent interface to support CTA insertion operations
 * while maintaining compatibility with existing code.
 */
export interface ArticleWithCTAs {
  originalArticle: ArticleContent;
  enhancedHtml: string; // HTML with CTAs inserted
  enhancedMarkdown?: string; // Markdown with CTAs inserted (if source was markdown)
  ctaPositions: {
    beginning: { htmlIndex: number; markdownIndex?: number; paragraphId: string };
    middle: { htmlIndex: number; markdownIndex?: number; paragraphId: string };
    end: { htmlIndex: number; markdownIndex?: number; paragraphId: string };
  };
  insertionMetadata: {
    totalCTAsInserted: number;
    insertionTimestamp: string;
    preservedStructure: boolean;
    originalWordCount: number;
    enhancedWordCount: number;
  };
}

/**
 * CTA Insertion Options
 * Why this matters: Provides flexibility in how CTAs are rendered and inserted
 * to meet different use cases (preview vs export, email vs web, etc.).
 */
export interface CTAInsertionOptions {
  format: 'html' | 'markdown' | 'both';
  style: 'full' | 'minimal' | 'email-optimized';
  includeContainer: boolean; // Whether to wrap CTAs in container divs
  responsiveDesign: boolean; // Whether to include responsive CSS
  apolloBranding: boolean; // Whether to include Apollo's brand colors
  customCSS?: string; // Optional custom CSS to inject
}

/**
 * CTA Insertion Engine Service
 * Why this matters: This is the core service that takes generated CTAs and article content,
 * then creates the actual HTML/markdown with CTAs inserted at optimal positions.
 * This enables preview functionality and copy-ready exports.
 */
class CTAInsertionEngine {
  
  constructor() {
    console.log('✅ CTA Insertion Engine initialized');
  }

  /**
   * Insert CTAs into article content
   * Why this matters: This is the main function that combines article content with generated CTAs
   * to create a preview-ready and export-ready version with CTAs at optimal positions.
   */
  async insertCTAsIntoArticle(
    articleContent: ArticleContent,
    ctaResult: CTAGenerationResult,
    options: CTAInsertionOptions = this.getDefaultOptions()
  ): Promise<ArticleWithCTAs> {
    
    console.log(`🎯 Inserting CTAs into article: "${articleContent.title}"`);
    console.log(`📍 Insertion points available: ${articleContent.ctaInsertionPoints ? 'Yes' : 'No'}`);
    
    if (!articleContent.ctaInsertionPoints) {
      throw new Error('Article content must have pre-calculated CTA insertion points');
    }

    if (!articleContent.structure) {
      throw new Error('Article content must have structural analysis data');
    }

    // Determine source format and process accordingly
    let enhancedHtml = '';
    let enhancedMarkdown: string | undefined;
    let ctaPositions: any = {};

    if (articleContent.rawHtml) {
      // Process HTML content
      const htmlResult = await this.insertCTAsIntoHTML(
        articleContent.rawHtml,
        articleContent,
        ctaResult,
        options
      );
      enhancedHtml = htmlResult.enhancedContent;
      ctaPositions = htmlResult.positions;
      
    } else if (articleContent.rawMarkdown) {
      // Process Markdown content
      const markdownResult = await this.insertCTAsIntoMarkdown(
        articleContent.rawMarkdown,
        articleContent,
        ctaResult,
        options
      );
      enhancedMarkdown = markdownResult.enhancedContent;
      enhancedHtml = this.convertMarkdownToHTML(markdownResult.enhancedContent, options);
      ctaPositions = markdownResult.positions;
      
    } else {
      // Process plain text content
      const textResult = await this.insertCTAsIntoText(
        articleContent.content,
        articleContent,
        ctaResult,
        options
      );
      enhancedHtml = textResult.enhancedContent;
      ctaPositions = textResult.positions;
    }

    // Calculate metadata
    const originalWordCount = this.countWords(articleContent.content);
    const enhancedWordCount = this.countWords(enhancedHtml.replace(/<[^>]*>/g, ''));

    const result: ArticleWithCTAs = {
      originalArticle: articleContent,
      enhancedHtml,
      enhancedMarkdown,
      ctaPositions,
      insertionMetadata: {
        totalCTAsInserted: 3, // beginning, middle, end
        insertionTimestamp: new Date().toISOString(),
        preservedStructure: true,
        originalWordCount,
        enhancedWordCount
      }
    };

    console.log(`✅ CTAs inserted successfully - ${result.insertionMetadata.totalCTAsInserted} CTAs added`);
    return result;
  }

  /**
   * Insert CTAs into HTML content
   * Why this matters: Handles HTML content by parsing the DOM structure and inserting
   * CTAs at paragraph boundaries without breaking the existing HTML structure.
   */
  private async insertCTAsIntoHTML(
    htmlContent: string,
    articleContent: ArticleContent,
    ctaResult: CTAGenerationResult,
    options: CTAInsertionOptions
  ): Promise<{ enhancedContent: string; positions: any }> {
    
    const insertionPoints = articleContent.ctaInsertionPoints!;
    const structure = articleContent.structure!;
    
    // Parse HTML and identify paragraph positions
    const paragraphPositions = this.findHTMLParagraphPositions(htmlContent, structure);
    
    // Generate CTA HTML for each position
    const beginningCTA = this.renderCTAAsHTML(ctaResult.cta_variants.beginning, 'beginning', options);
    const middleCTA = this.renderCTAAsHTML(ctaResult.cta_variants.middle, 'middle', options);
    const endCTA = this.renderCTAAsHTML(ctaResult.cta_variants.end, 'end', options);

    // Insert CTAs at calculated positions (in reverse order to maintain indices)
    let enhancedHTML = htmlContent;
    const positions: any = {};

    // Insert END CTA
    const endPosition = this.findInsertionPosition(
      enhancedHTML, 
      paragraphPositions, 
      insertionPoints.end.afterParagraphIndex,
      'end'
    );
    enhancedHTML = this.insertAtPosition(enhancedHTML, endPosition, endCTA);
    positions.end = { 
      htmlIndex: endPosition, 
      paragraphId: insertionPoints.end.afterParagraphId 
    };

    // Insert MIDDLE CTA (adjust position due to end CTA insertion)
    const middlePosition = this.findInsertionPosition(
      enhancedHTML.substring(0, endPosition), // Only search before end CTA
      paragraphPositions, 
      insertionPoints.middle.afterParagraphIndex,
      'middle'
    );
    enhancedHTML = this.insertAtPosition(enhancedHTML, middlePosition, middleCTA);
    positions.middle = { 
      htmlIndex: middlePosition, 
      paragraphId: insertionPoints.middle.afterParagraphId 
    };

    // Insert BEGINNING CTA (adjust position due to previous insertions)
    const beginningPosition = this.findInsertionPosition(
      enhancedHTML.substring(0, middlePosition), // Only search before middle CTA
      paragraphPositions, 
      insertionPoints.beginning.afterParagraphIndex,
      'beginning'
    );
    enhancedHTML = this.insertAtPosition(enhancedHTML, beginningPosition, beginningCTA);
    positions.beginning = { 
      htmlIndex: beginningPosition, 
      paragraphId: insertionPoints.beginning.afterParagraphId 
    };

    return {
      enhancedContent: enhancedHTML,
      positions
    };
  }

  /**
   * Insert CTAs into Markdown content
   * Why this matters: Handles markdown content by preserving markdown syntax while inserting
   * CTA blocks at appropriate positions between paragraphs.
   */
  private async insertCTAsIntoMarkdown(
    markdownContent: string,
    articleContent: ArticleContent,
    ctaResult: CTAGenerationResult,
    options: CTAInsertionOptions
  ): Promise<{ enhancedContent: string; positions: any }> {
    
    const insertionPoints = articleContent.ctaInsertionPoints!;
    const structure = articleContent.structure!;
    
    // Find paragraph boundaries in markdown
    const paragraphPositions = this.findMarkdownParagraphPositions(markdownContent, structure);
    
    // Generate CTA markdown for each position
    const beginningCTA = this.renderCTAAsMarkdown(ctaResult.cta_variants.beginning, 'beginning', options);
    const middleCTA = this.renderCTAAsMarkdown(ctaResult.cta_variants.middle, 'middle', options);
    const endCTA = this.renderCTAAsMarkdown(ctaResult.cta_variants.end, 'end', options);

    // Insert CTAs at calculated positions (in reverse order to maintain indices)
    let enhancedMarkdown = markdownContent;
    const positions: any = {};

    // Insert END CTA
    const endPosition = this.findInsertionPosition(
      enhancedMarkdown, 
      paragraphPositions, 
      insertionPoints.end.afterParagraphIndex,
      'end'
    );
    enhancedMarkdown = this.insertAtPosition(enhancedMarkdown, endPosition, endCTA);
    positions.end = { 
      markdownIndex: endPosition, 
      paragraphId: insertionPoints.end.afterParagraphId 
    };

    // Insert MIDDLE CTA
    const middlePosition = this.findInsertionPosition(
      enhancedMarkdown.substring(0, endPosition),
      paragraphPositions, 
      insertionPoints.middle.afterParagraphIndex,
      'middle'
    );
    enhancedMarkdown = this.insertAtPosition(enhancedMarkdown, middlePosition, middleCTA);
    positions.middle = { 
      markdownIndex: middlePosition, 
      paragraphId: insertionPoints.middle.afterParagraphId 
    };

    // Insert BEGINNING CTA
    const beginningPosition = this.findInsertionPosition(
      enhancedMarkdown.substring(0, middlePosition),
      paragraphPositions, 
      insertionPoints.beginning.afterParagraphIndex,
      'beginning'
    );
    enhancedMarkdown = this.insertAtPosition(enhancedMarkdown, beginningPosition, beginningCTA);
    positions.beginning = { 
      markdownIndex: beginningPosition, 
      paragraphId: insertionPoints.beginning.afterParagraphId 
    };

    return {
      enhancedContent: enhancedMarkdown,
      positions
    };
  }

  /**
   * Insert CTAs into plain text content
   * Why this matters: Handles plain text by converting it to HTML structure and inserting
   * CTAs at logical paragraph breaks.
   */
  private async insertCTAsIntoText(
    textContent: string,
    articleContent: ArticleContent,
    ctaResult: CTAGenerationResult,
    options: CTAInsertionOptions
  ): Promise<{ enhancedContent: string; positions: any }> {
    
    // Convert text to HTML paragraphs
    const htmlContent = this.convertTextToHTML(textContent);
    
    // Use HTML insertion logic
    return this.insertCTAsIntoHTML(htmlContent, articleContent, ctaResult, options);
  }

  /**
   * Render CTA as HTML
   * Why this matters: Creates the actual HTML representation of a CTA with Apollo branding
   * and responsive design for optimal display across devices and contexts.
   */
  private renderCTAAsHTML(
    ctaVariant: PositionSpecificCTA,
    position: string,
    options: CTAInsertionOptions
  ): string {
    
    const cta = ctaVariant.cta;
    const containerId = `apollo-cta-${position}-${Date.now()}`;
    
    // Base CTA HTML structure
    const ctaHTML = `
    <!-- Apollo CTA - ${position.toUpperCase()} -->
    <div class="apollo-cta-container apollo-cta-${position}" id="${containerId}" style="${this.getCTAContainerStyles(options)}">
      <div class="apollo-cta-content" style="${this.getCTAContentStyles(options)}">
        <div class="apollo-cta-category" style="${this.getCTACategoryStyles(options)}">
          ${cta.category_header}
        </div>
        <h3 class="apollo-cta-headline" style="${this.getCTAHeadlineStyles(options)}">
          ${cta.headline}
        </h3>
        <p class="apollo-cta-description" style="${this.getCTADescriptionStyles(options)}">
          ${cta.description}
        </p>
        <div class="apollo-cta-action" style="${this.getCTAActionStyles(options)}">
          <a href="https://www.apollo.io/sign-up" class="apollo-cta-button" style="${this.getCTAButtonStyles(options)}" target="_blank">
            ${cta.action_button}
          </a>
        </div>
      </div>
    </div>
    <!-- End Apollo CTA -->
    `;

    return options.includeContainer ? ctaHTML : ctaHTML;
  }

  // Simple CTA rendering for export functionality
  private renderSimpleCTAAsHTML(ctaVariant: any): string {
    const { cta } = ctaVariant;
    
    return `
<div class="apollo-cta" style="margin: 2rem 0; padding: 2rem; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 2px solid #e2e8f0; border-radius: 1rem; text-align: center; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
  <div class="apollo-cta-category" style="font-size: 0.875rem; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem;">
    ${cta.category_header}
  </div>
  <h3 class="apollo-cta-headline" style="font-size: 1.5rem; font-weight: 700; color: #1e293b; margin-bottom: 1rem; line-height: 1.2;">
    ${cta.headline}
  </h3>
  <p class="apollo-cta-description" style="font-size: 1.125rem; color: #475569; margin-bottom: 1.5rem; line-height: 1.6; max-width: 600px; margin-left: auto; margin-right: auto;">
    ${cta.description}
  </p>
  <a href="https://www.apollo.io/sign-up" class="apollo-cta-button" style="display: inline-flex; align-items: center; gap: 0.5rem; background-color: #EBF212; color: #000000; font-weight: 600; padding: 0.875rem 2rem; border-radius: 0.5rem; text-decoration: none; transition: all 0.2s ease; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);" target="_blank">
    ${cta.action_button}
    <span style="font-size: 1rem;">→</span>
  </a>
</div>`;
  }

  /**
   * Render CTA as Markdown
   * Why this matters: Creates markdown-compatible CTA representation that can be processed
   * by markdown renderers while maintaining visual appeal.
   */
  private renderCTAAsMarkdown(
    ctaVariant: PositionSpecificCTA,
    position: string,
    options: CTAInsertionOptions
  ): string {
    
    const cta = ctaVariant.cta;
    
    return `

---

**${cta.category_header}**

## ${cta.headline}

${cta.description}

[${cta.action_button}](#)

---

`;
  }

  // Simple Markdown rendering for export functionality
  private renderSimpleCTAAsMarkdown(ctaVariant: any): string {
    const { cta } = ctaVariant;
    
    return `
---

**${cta.category_header.toUpperCase()}**

# ${cta.headline}

${cta.description}

[${cta.action_button}](#)

---
`;
  }

  /**
   * Find HTML paragraph positions
   * Why this matters: Locates the exact character positions where paragraphs end in HTML
   * so CTAs can be inserted at natural break points.
   */
  private findHTMLParagraphPositions(htmlContent: string, structure: ArticleStructure): number[] {
    const positions: number[] = [];
    
    // Find all paragraph closing tags or double line breaks
    const paragraphPattern = /<\/p>|<\/div>|\n\s*\n/gi;
    let match;
    
    while ((match = paragraphPattern.exec(htmlContent)) !== null) {
      positions.push(match.index + match[0].length);
    }
    
    return positions;
  }

  /**
   * Find Markdown paragraph positions
   * Why this matters: Locates natural break points in markdown content where CTAs can be inserted
   * without disrupting the markdown syntax.
   */
  private findMarkdownParagraphPositions(markdownContent: string, structure: ArticleStructure): number[] {
    const positions: number[] = [];
    
    // Find double line breaks (paragraph separators in markdown)
    const paragraphPattern = /\n\s*\n/g;
    let match;
    
    while ((match = paragraphPattern.exec(markdownContent)) !== null) {
      positions.push(match.index + match[0].length);
    }
    
    return positions;
  }

  /**
   * Find insertion position for CTA
   * Why this matters: Determines the exact character position where a CTA should be inserted
   * based on the pre-calculated optimal placement algorithm.
   */
  private findInsertionPosition(
    content: string,
    paragraphPositions: number[],
    targetParagraphIndex: number,
    position: string
  ): number {
    
    // Safety check - ensure we have valid paragraph positions
    if (paragraphPositions.length === 0) {
      console.warn(`⚠️ No paragraph positions found for ${position} CTA, using fallback`);
      return this.getFallbackPosition(content, position);
    }

    // Ensure target index is within bounds
    const safeIndex = Math.min(targetParagraphIndex, paragraphPositions.length - 1);
    const insertionPoint = paragraphPositions[safeIndex];
    
    console.log(`📍 ${position.toUpperCase()} CTA will be inserted at position ${insertionPoint} (after paragraph ${safeIndex})`);
    
    return insertionPoint;
  }

  /**
   * Get fallback position for CTA insertion
   * Why this matters: Provides safe fallback positions when paragraph detection fails
   * to ensure CTAs are still inserted in reasonable locations.
   */
  private getFallbackPosition(content: string, position: string): number {
    const contentLength = content.length;
    
    switch (position) {
      case 'beginning':
        // Insert after first 2 paragraphs (approximately 10% of content)
        return Math.min(Math.floor(contentLength * 0.1), contentLength);
      case 'middle':
        // Insert at middle of content
        return Math.floor(contentLength * 0.5);
      case 'end':
        // Insert near end but not at the very end
        return Math.max(Math.floor(contentLength * 0.9), contentLength - 100);
      default:
        return Math.floor(contentLength * 0.5);
    }
  }

  /**
   * Insert content at specific position
   * Why this matters: Performs the actual string insertion while maintaining content integrity.
   */
  private insertAtPosition(content: string, position: number, insertion: string): string {
    const before = content.substring(0, position);
    const after = content.substring(position);
    return before + insertion + after;
  }

  /**
   * Convert text to HTML paragraphs
   * Why this matters: Transforms plain text into HTML structure so CTA insertion logic can work uniformly.
   */
  private convertTextToHTML(textContent: string): string {
    return textContent
      .split('\n\n')
      .map(paragraph => paragraph.trim())
      .filter(paragraph => paragraph.length > 0)
      .map(paragraph => `<p>${paragraph}</p>`)
      .join('\n\n');
  }

  /**
   * Convert Markdown to HTML
   * Why this matters: Provides basic markdown-to-HTML conversion for preview purposes.
   */
  private convertMarkdownToHTML(markdownContent: string, options: CTAInsertionOptions): string {
    // Simple markdown to HTML conversion
    return markdownContent
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2">$1</a>')
      .replace(/\n\n/gim, '</p><p>')
      .replace(/^(.*)$/gim, '<p>$1</p>');
  }

  /**
   * Count words in text content
   * Why this matters: Provides accurate word count for metadata tracking.
   */
  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  // CSS Styling Methods
  private getCTAContainerStyles(options: CTAInsertionOptions): string {
    const baseStyles = `
      margin: 2rem 0;
      padding: 1.5rem;
      background: #ffffff;
      border: 2px solid #e5e7eb;
      border-radius: 0.75rem;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      text-align: center;
      max-width: 600px;
      margin-left: auto;
      margin-right: auto;
    `;

    if (options.apolloBranding) {
      return baseStyles + `
        border-color: #EBF212;
        background: linear-gradient(135deg, #ffffff 0%, #fefce8 100%);
      `;
    }

    return baseStyles;
  }

  private getCTAContentStyles(options: CTAInsertionOptions): string {
    return `
      max-width: 100%;
      margin: 0 auto;
    `;
  }

  private getCTACategoryStyles(options: CTAInsertionOptions): string {
    return `
      font-size: 0.75rem;
      font-weight: 700;
      color: #6b7280;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
      text-transform: uppercase;
    `;
  }

  private getCTAHeadlineStyles(options: CTAInsertionOptions): string {
    return `
      font-size: 1.5rem;
      font-weight: 700;
      color: #111827;
      margin: 0 0 1rem 0;
      line-height: 1.3;
    `;
  }

  private getCTADescriptionStyles(options: CTAInsertionOptions): string {
    return `
      font-size: 1rem;
      color: #4b5563;
      line-height: 1.6;
      margin: 0 0 1.5rem 0;
    `;
  }

  private getCTAActionStyles(options: CTAInsertionOptions): string {
    return `
      margin-top: 1.5rem;
    `;
  }

  private getCTAButtonStyles(options: CTAInsertionOptions): string {
    const baseStyles = `
      display: inline-block;
      padding: 0.875rem 2rem;
      background-color: #3b82f6;
      color: white;
      text-decoration: none;
      font-weight: 700;
      font-size: 1rem;
      border-radius: 0.5rem;
      border: none;
      cursor: pointer;
      transition: all 0.2s ease;
    `;

    if (options.apolloBranding) {
      return baseStyles + `
        background-color: #EBF212;
        color: black;
      `;
    }

    return baseStyles;
  }

  /**
   * Get default insertion options
   * Why this matters: Provides sensible defaults for CTA insertion that work well for most use cases.
   */
  private getDefaultOptions(): CTAInsertionOptions {
    return {
      format: 'html',
      style: 'full',
      includeContainer: true,
      responsiveDesign: true,
      apolloBranding: true
    };
  }

  /**
   * Get service status
   * Why this matters: Provides health check information for monitoring.
   */
  getServiceStatus(): { available: boolean; message: string } {
    return {
      available: true,
      message: 'CTA Insertion Engine ready'
    };
  }

  /**
   * Generate final HTML with CTAs inserted at selected positions
   * Why this matters: Creates clean, production-ready HTML that can be directly
   * used in content management systems without any additional processing.
   */
  async generateFinalHTML({
    originalContent,
    articleStructure,
    selectedPlacements,
    inputMethod
  }: {
    originalContent: string;
    articleStructure: any;
    selectedPlacements: { [key: string]: any };
    inputMethod: 'url' | 'text' | 'markdown';
  }): Promise<string> {
    try {
      // Enhanced input validation
      if (!originalContent || originalContent.trim() === '') {
        throw new Error('Original content is required for HTML generation');
      }

      if (!selectedPlacements || Object.keys(selectedPlacements).length === 0) {
        console.warn('No CTA placements selected, generating HTML without CTAs');
        // Still generate HTML but without CTAs
        return this.generateHTMLWithoutCTAs(originalContent, inputMethod);
      }

      // Validate content length to prevent memory issues
      if (originalContent.length > 100000) {
        throw new Error('Content too large for processing (max 100,000 characters)');
      }

      // Split content into paragraphs with enhanced parsing
      let paragraphs: string[];
      
      try {
        paragraphs = this.parseContentIntoParagraphs(originalContent, inputMethod);
      } catch (parseError) {
        console.error('Error parsing content into paragraphs:', parseError);
        throw new Error('Failed to parse article content structure');
      }

      if (paragraphs.length === 0) {
        throw new Error('No valid paragraphs found in content');
      }

      // Create array to hold final content pieces
      const finalContent: string[] = [];
      let ctasInserted = 0;
      
      // Process each paragraph and insert CTAs where selected
      paragraphs.forEach((paragraph, index) => {
        try {
          // Add the original paragraph
          if (paragraph.trim()) {
            const cleanParagraph = this.cleanParagraphHTML(paragraph.trim());
            finalContent.push(`<p>${cleanParagraph}</p>`);
          }
          
          // Check if there's a CTA to insert after this paragraph
          const ctaToInsert = this.findCTAForPosition(selectedPlacements, index);
          if (ctaToInsert) {
            try {
              const ctaHTML = this.renderSimpleCTAAsHTML(ctaToInsert);
              if (ctaHTML && ctaHTML.trim()) {
                finalContent.push(ctaHTML);
                ctasInserted++;
              } else {
                console.warn(`Failed to render CTA at position ${index}`);
              }
            } catch (ctaRenderError) {
              console.error(`Error rendering CTA at position ${index}:`, ctaRenderError);
              // Continue processing other CTAs instead of failing completely
            }
          }
        } catch (paragraphError) {
          console.error(`Error processing paragraph ${index}:`, paragraphError);
          // Continue with next paragraph instead of failing completely
        }
      });

      console.log(`✅ Generated HTML with ${ctasInserted} CTAs inserted`);
      
      // Wrap in article container with proper styling
      const articleHTML = this.wrapInArticleContainer(finalContent.join('\n\n'));
      
      // Validate generated HTML
      if (!articleHTML || articleHTML.trim() === '') {
        throw new Error('Generated HTML is empty');
      }
      
      return articleHTML;
      
    } catch (error: any) {
      console.error('Error generating final HTML:', error);
      
      // Provide specific error messages for different failure modes
      if (error.message.includes('Content too large')) {
        throw new Error('Article content is too large to process. Please try with smaller content.');
      } else if (error.message.includes('No valid paragraphs')) {
        throw new Error('Unable to parse article structure. Please check content formatting.');
      } else if (error.message.includes('required')) {
        throw new Error(error.message);
      } else {
        throw new Error('Failed to generate final HTML. Please try again.');
      }
    }
  }

  /**
   * Find CTA variant for specific paragraph position
   * Why this matters: Maps user selections to specific paragraph positions
   * for accurate CTA insertion.
   */
  private findCTAForPosition(selectedPlacements: { [key: string]: any }, paragraphIndex: number): any | null {
    for (const [key, ctaVariant] of Object.entries(selectedPlacements)) {
      const [type, indexStr] = key.split('_');
      if (parseInt(indexStr) === paragraphIndex) {
        return ctaVariant;
      }
    }
    return null;
  }



  /**
   * Clean paragraph HTML for production use
   * Why this matters: Removes any unwanted markup while preserving essential
   * formatting for clean, CMS-compatible output.
   */
  private cleanParagraphHTML(paragraph: string): string {
    // Remove script tags and other potentially harmful elements
    let cleaned = paragraph
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/on\w+="[^"]*"/gi, ''); // Remove event handlers
    
    // Preserve basic formatting tags
    const allowedTags = ['strong', 'em', 'b', 'i', 'u', 'a', 'br', 'span'];
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
    
    cleaned = cleaned.replace(tagRegex, (match, tagName) => {
      if (allowedTags.includes(tagName.toLowerCase())) {
        return match;
      }
      return '';
    });
    
    return cleaned.trim();
  }

  /**
   * Wrap content in proper article container
   * Why this matters: Provides semantic HTML structure and responsive styling
   * that works well across different platforms and devices.
   */
  private wrapInArticleContainer(content: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Article with Apollo CTAs</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #374151;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem 1rem;
      background-color: #ffffff;
    }
    
    p {
      margin-bottom: 1.5rem;
      font-size: 1.125rem;
      line-height: 1.7;
    }
    
    .apollo-cta:hover .apollo-cta-button {
      background-color: #d4e157;
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    }
    
    @media (max-width: 768px) {
      body {
        padding: 1rem 0.5rem;
      }
      
      .apollo-cta {
        margin: 1.5rem 0 !important;
        padding: 1.5rem !important;
      }
      
      .apollo-cta-headline {
        font-size: 1.25rem !important;
      }
      
      .apollo-cta-description {
        font-size: 1rem !important;
      }
    }
  </style>
</head>
<body>
  <article>
    ${content}
  </article>
</body>
</html>`;
  }

  /**
   * Parse content into paragraphs based on input method
   * Why this matters: Handles different content formats (HTML, Markdown, plain text)
   * with appropriate parsing logic for each type.
   */
  private parseContentIntoParagraphs(content: string, inputMethod: 'url' | 'text' | 'markdown'): string[] {
    if (!content || content.trim() === '') {
      return [];
    }

    let paragraphs: string[];

    try {
      if (inputMethod === 'markdown') {
        // Parse markdown content - split on double newlines but handle markdown-specific formatting
        paragraphs = content
          .split(/\n\s*\n/)
          .map(p => p.trim())
          .filter(p => p.length > 0 && !p.match(/^#{1,6}\s/)) // Filter out markdown headers
          .filter(p => p.length > 10); // Filter out very short lines that aren't real paragraphs
      } else {
        // For HTML and plain text, use standard paragraph splitting
        paragraphs = content
          .split(/\n\s*\n|\r\n\s*\r\n/)
          .map(p => p.trim())
          .filter(p => p.length > 0)
          .filter(p => p.length > 10); // Filter out very short lines
      }

      // Additional validation
      if (paragraphs.length === 0) {
        // Try alternative splitting methods
        paragraphs = content
          .split(/\.\s+/)
          .map(p => p.trim())
          .filter(p => p.length > 20) // Longer threshold for sentence-based splitting
          .slice(0, 50); // Limit to prevent excessive paragraphs
      }

      return paragraphs;
    } catch (error) {
      console.error('Error in parseContentIntoParagraphs:', error);
      throw new Error('Failed to parse content structure');
    }
  }

  /**
   * Generate HTML without CTAs for fallback scenarios
   * Why this matters: Provides a clean HTML output even when CTA insertion fails,
   * ensuring users still get usable content.
   */
  private generateHTMLWithoutCTAs(content: string, inputMethod: 'url' | 'text' | 'markdown'): string {
    try {
      const paragraphs = this.parseContentIntoParagraphs(content, inputMethod);
      const htmlParagraphs = paragraphs.map(p => `<p>${this.cleanParagraphHTML(p)}</p>`);
      return this.wrapInArticleContainer(htmlParagraphs.join('\n\n'));
    } catch (error) {
      console.error('Error generating HTML without CTAs:', error);
      // Ultimate fallback - just wrap the original content
      return this.wrapInArticleContainer(`<p>${this.cleanParagraphHTML(content)}</p>`);
    }
  }

  /**
   * Generate alternative export formats
   * Why this matters: Provides flexibility for different use cases - some users
   * may need Markdown, plain text, or HTML snippets for different platforms.
   */
  async generateAlternativeFormats({
    originalContent,
    selectedPlacements,
    inputMethod
  }: {
    originalContent: string;
    selectedPlacements: { [key: string]: any };
    inputMethod: 'url' | 'text' | 'markdown';
  }): Promise<{
    markdown: string;
    plain_text: string;
    html_snippet: string;
  }> {
    try {
      const paragraphs = originalContent.split('\n\n').filter(p => p.trim());
      
      // Generate Markdown format
      const markdownContent: string[] = [];
      paragraphs.forEach((paragraph, index) => {
        markdownContent.push(paragraph.trim());
        
        const ctaToInsert = this.findCTAForPosition(selectedPlacements, index);
        if (ctaToInsert) {
          const ctaMarkdown = this.renderSimpleCTAAsMarkdown(ctaToInsert);
          markdownContent.push(ctaMarkdown);
        }
      });
      
      // Generate plain text format
      const plainTextContent: string[] = [];
      paragraphs.forEach((paragraph, index) => {
        plainTextContent.push(this.stripHTML(paragraph.trim()));
        
        const ctaToInsert = this.findCTAForPosition(selectedPlacements, index);
        if (ctaToInsert) {
          const ctaPlainText = this.renderCTAAsPlainText(ctaToInsert);
          plainTextContent.push(ctaPlainText);
        }
      });
      
      // Generate HTML snippet (without full page wrapper)
      const htmlSnippetContent: string[] = [];
      paragraphs.forEach((paragraph, index) => {
        const cleanParagraph = this.cleanParagraphHTML(paragraph.trim());
        htmlSnippetContent.push(`<p>${cleanParagraph}</p>`);
        
        const ctaToInsert = this.findCTAForPosition(selectedPlacements, index);
        if (ctaToInsert) {
          const ctaHTML = this.renderSimpleCTAAsHTML(ctaToInsert);
          htmlSnippetContent.push(ctaHTML);
        }
      });
      
      return {
        markdown: markdownContent.join('\n\n'),
        plain_text: plainTextContent.join('\n\n'),
        html_snippet: htmlSnippetContent.join('\n\n')
      };
      
    } catch (error) {
      console.error('Error generating alternative formats:', error);
      throw new Error('Failed to generate alternative formats');
    }
  }



  /**
   * Render CTA as plain text
   * Why this matters: Provides clean text format for email, social media,
   * or platforms that don't support rich formatting.
   */
  private renderCTAAsPlainText(ctaVariant: any): string {
    const { cta } = ctaVariant;
    
    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${cta.category_header.toUpperCase()}

${cta.headline}

${cta.description}

👉 ${cta.action_button}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
  }

  /**
   * Strip HTML tags from text
   * Why this matters: Converts HTML content to clean plain text while
   * preserving readability and structure.
   */
  private stripHTML(html: string): string {
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Convert non-breaking spaces
      .replace(/&amp;/g, '&') // Convert HTML entities
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  /**
   * Generate preview HTML for real-time preview
   * Why this matters: Allows users to see how individual CTAs will look
   * without generating the complete final document.
   */
  async renderCTAPreview({
    contentSnippet,
    ctaVariant,
    position
  }: {
    contentSnippet: string;
    ctaVariant: any;
    position: string;
  }): Promise<string> {
    try {
      const ctaHTML = this.renderSimpleCTAAsHTML(ctaVariant);
      
      const previewHTML = `
<div style="max-width: 600px; margin: 0 auto; padding: 2rem; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="background-color: #f8fafc; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem; border-left: 4px solid #3b82f6;">
    <small style="color: #6b7280; font-weight: 500;">Preview Context</small>
    <p style="margin: 0.5rem 0 0 0; color: #374151; font-size: 0.875rem;">${contentSnippet}</p>
  </div>
  
  ${ctaHTML}
  
  <div style="background-color: #f0f9ff; padding: 1rem; border-radius: 0.5rem; margin-top: 1rem; border-left: 4px solid #0ea5e9;">
    <small style="color: #0369a1; font-weight: 500;">Placement: ${position} of article</small>
  </div>
</div>`;
      
      return previewHTML;
      
    } catch (error) {
      console.error('Error rendering CTA preview:', error);
      throw new Error('Failed to render CTA preview');
    }
  }
}

// Import the ArticleContent interface from firecrawlService
interface ArticleContent {
  url: string;
  title: string;
  content: string;
  wordCount: number;
  extractedAt: string;
  metadata: {
    description?: string;
    author?: string;
    publishDate?: string;
    tags?: string[];
  };
  structure?: ArticleStructure;
  rawHtml?: string;
  rawMarkdown?: string;
  ctaInsertionPoints?: CTAInsertionPoints;
  top_results?: any[];
}

interface ArticleStructure {
  paragraphs: {
    id: string;
    content: string;
    wordCount: number;
    position: number;
    type: 'introduction' | 'body' | 'conclusion' | 'heading';
  }[];
  headings: {
    id: string;
    level: number;
    text: string;
    position: number;
  }[];
  totalParagraphs: number;
  estimatedReadingTime: number;
}

interface CTAInsertionPoints {
  beginning: {
    afterParagraphId: string;
    afterParagraphIndex: number;
    confidence: number;
  };
  middle: {
    afterParagraphId: string;
    afterParagraphIndex: number;
    confidence: number;
  };
  end: {
    afterParagraphId: string;
    afterParagraphIndex: number;
    confidence: number;
  };
}

export default CTAInsertionEngine;
