import { Router, Request, Response } from 'express';
import claudeService from '../services/claudeService';
import { openaiService } from '../services/openaiService';
import OpenAI from 'openai';
import EndOfParagraphCtaInserter, { CtaInsertionRequest } from '../services/endOfParagraphCtaInserter';
import SimpleContextualCtaService from '../services/simpleContextualCtaService';
import UTMUrlGenerator from '../services/utmUrlGenerator';

const router = Router();

interface ContentCreationRequest {
  post_context: {
    title: string;
    content: string;
    pain_point: string;
    content_opportunity: string;
    audience_summary: string;
  };
  brand_kit?: any; // Optional since variables are processed on frontend
  sitemap_data?: Array<{
    title: string;
    description: string;
    url: string;
  }>;
  system_prompt: string;
  user_prompt: string;
}

/**
 * POST /api/content/generate
 * Generate SEO-optimized content using Reddit insights and brand kit
 * Why this matters: Creates high-quality content by combining Reddit analysis
 * with brand context for consistent, targeted content marketing.
 */
router.post('/generate', async (req: Request, res: Response): Promise<any> => {
  try {
    const { post_context, system_prompt, user_prompt, brand_kit, sitemap_data }: ContentCreationRequest = req.body;

    if (!post_context || !system_prompt || !user_prompt) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'post_context, system_prompt, and user_prompt are required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`📝 Generating content for: "${post_context.title.substring(0, 50)}..."`);

    // Add internal linking and contextual Apollo CTA requirements to user prompt
    let enhancedUserPrompt = user_prompt;
    
    // Initialize UTM URL generator for contextual CTAs
    const utmGenerator = new UTMUrlGenerator();
    
    // Generate UTM-tracked URLs for all Apollo product pages (using Reddit content creator campaign type)
    const generateUTMUrl = (apolloUrl: string): string => {
      if (!post_context?.title) return apolloUrl;
      
      try {
        // Use reddit_content_creator campaign type for Reddit content
        const utmResult = utmGenerator.generateRedditContentUTMUrl(apolloUrl, post_context.title);
        return utmResult.utmUrl;
      } catch (error) {
        console.warn(`Failed to generate UTM URL for ${apolloUrl}:`, error);
        return apolloUrl; // Fallback to original URL
      }
    };
    
    // Add contextual Apollo integration instructions
    const apolloCtaSection = `**CONTEXTUAL APOLLO INTEGRATION (CRITICAL):**
- Weave Apollo naturally into content with contextually relevant anchor phrases linking to specific product pages
- Match Apollo URLs to content context and pain points:

**PROSPECTING & LEAD GENERATION:**
- Use ${generateUTMUrl('https://www.apollo.io/product/search')} for: "advanced prospecting tools", "lead generation platforms", "contact discovery solutions"
- Use ${generateUTMUrl('https://www.apollo.io/sales-pipeline')} for: "pipeline building tools", "sales pipeline platforms", "lead qualification systems"

**SALES ENGAGEMENT & OUTREACH:**
- Use ${generateUTMUrl('https://www.apollo.io/product/sales-engagement')} for: "sales engagement platforms", "outreach automation tools", "multi-channel communication systems"
- Use ${generateUTMUrl('https://www.apollo.io/product/ai-sales-automation')} for: "AI-powered sales automation", "automated outreach systems", "intelligent sales workflows"

**DATA & ENRICHMENT:**
- Use ${generateUTMUrl('https://www.apollo.io/data-enrichment')} for: "B2B contact databases", "data enrichment services", "verified contact information"
- Use ${generateUTMUrl('https://www.apollo.io/product/enrich')} for: "contact enrichment tools", "data verification platforms", "lead intelligence systems"
- Use ${generateUTMUrl('https://www.apollo.io/product/waterfall')} for: "waterfall enrichment", "multi-source data verification", "comprehensive contact discovery"

**MEETINGS & CONVERSATIONS:**
- Use ${generateUTMUrl('https://www.apollo.io/product/meetings')} for: "meeting scheduling platforms", "calendar coordination tools", "appointment booking systems"
- Use ${generateUTMUrl('https://www.apollo.io/ai-call-assistant')} for: "AI call assistants", "conversation intelligence platforms", "call recording and analysis tools"
- Use ${generateUTMUrl('https://www.apollo.io/product/conversations')} for: "conversation tracking systems", "call management platforms", "communication analytics"

**PIPELINE & DEAL MANAGEMENT:**
- Use ${generateUTMUrl('https://www.apollo.io/product/deal-management')} for: "deal management platforms", "sales pipeline tracking", "opportunity management systems"
- Use ${generateUTMUrl('https://www.apollo.io/go-to-market')} for: "go-to-market platforms", "revenue operations tools", "sales strategy systems"

**AI & AUTOMATION:**
- Use ${generateUTMUrl('https://www.apollo.io/ai')} for: "AI sales platforms", "artificial intelligence tools", "machine learning systems"
- Use ${generateUTMUrl('https://www.apollo.io/product/workflow-engine')} for: "workflow automation", "sales process automation", "task management systems"

**INTEGRATIONS & TOOLS:**
- Use ${generateUTMUrl('https://www.apollo.io/product/integrations')} for: "CRM integrations", "sales tool connections", "platform integrations"
- Use ${generateUTMUrl('https://www.apollo.io/product/chrome-extension')} for: "browser extensions", "prospecting browser tools", "LinkedIn integration tools"

- Examples of inline pain-point CTAs:
  * After discussing data quality issues: "Tired of dirty data? <a href='${generateUTMUrl('https://www.apollo.io/data-enrichment')}' target='_blank'>Start free with Apollo's 210M+ verified contacts</a>."
  * After mentioning prospecting challenges: "Struggling to find qualified leads? <a href='${generateUTMUrl('https://www.apollo.io/product/search')}' target='_blank'>Search Apollo's 275M+ contacts with 65+ filters</a>."
  * After discussing manual outreach problems: "Spending hours on manual outreach? <a href='${generateUTMUrl('https://www.apollo.io/product/sales-engagement')}' target='_blank'>Automate your sequences with Apollo's multi-channel platform</a>."
  * After mentioning call management issues: "Tired of taking notes during calls? <a href='${generateUTMUrl('https://www.apollo.io/ai-call-assistant')}' target='_blank'>Let Apollo's AI handle call summaries and next steps</a>."
  * After discussing pipeline visibility problems: "Can't track your deals effectively? <a href='${generateUTMUrl('https://www.apollo.io/product/deal-management')}' target='_blank'>Get complete pipeline visibility with Apollo's deal management</a>."

**CTA FORMULA:** [Pain Point Question] + [Solution Benefit] + [Specific Apollo URL]
- Start with a direct question addressing the pain point just mentioned
- Follow with a clear benefit statement
- Link to the most relevant Apollo product page
- Keep it conversational and helpful, not salesy

- Distribute 2-3 inline pain-point CTAs throughout: early context, middle examples, solution discussion
- Always match the URL to the specific pain point or solution being discussed
- Use conversational, problem-solving language that feels helpful, not promotional
- Address the reader directly with questions like "Tired of...", "Struggling with...", "Spending too much time on..."

`;

    if (sitemap_data && sitemap_data.length > 0) {
      console.log(`🗺️ Adding internal linking requirements for ${sitemap_data.length} URLs`);
      
      const internalLinksSection = `**AVAILABLE INTERNAL LINKS (MANDATORY - MUST USE 3-5 OF THESE):**
${sitemap_data.slice(0, 20).map((url: any) => `• ${url.title}: ${url.description} [${url.url}]`).join('\n')}
${sitemap_data.length > 20 ? `... and ${sitemap_data.length - 20} more URLs available for linking` : ''}

🚨 CRITICAL INTERNAL LINKING REQUIREMENTS:
- You MUST include exactly 3-5 internal links from the above list in your content
- Each internal link URL must be used ONLY ONCE per article (no duplicate links)
- MANDATORY: Include at least ONE internal link in the introduction or within the first 2-3 paragraphs after defining the main topic/keyword
- Distribute the remaining 2-4 internal links naturally throughout the rest of the content
- Choose the most relevant URLs for your topic and context
- Articles without internal links will be rejected

`;
      
      // Insert both sections before the content requirements
      enhancedUserPrompt = enhancedUserPrompt.replace(
        '**Content Requirements',
        `${apolloCtaSection}${internalLinksSection}**Content Requirements`
      );
    } else {
      console.log('⚠️ No sitemap data available for internal linking');
      // Still add Apollo CTA instructions even without sitemap data
      enhancedUserPrompt = enhancedUserPrompt.replace(
        '**Content Requirements',
        `${apolloCtaSection}**Content Requirements`
      );
    }

    // Generate content using Claude
    const response = await claudeService.generateContent({
      system_prompt,
      user_prompt: enhancedUserPrompt,
      post_context,
      brand_kit,
      sitemap_data
    });

    // Handle LinkedIn post variations
    let contentResult;
    if (typeof response.content === 'string') {
      // If single content, create variations or return as single item array
      contentResult = [response.content];
    } else if (Array.isArray(response.content)) {
      // If already array, use as is
      contentResult = response.content;
    } else {
      // Fallback
      contentResult = [response.content];
    }

    res.json({
      success: true,
      content: contentResult,
      variations: contentResult, // Support both formats
      title: response.title || post_context.title,
      description: response.description || '',
      metaSeoTitle: response.metaSeoTitle || '',
      metaDescription: response.metaDescription || '',
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Content generation error:', error);
    
    res.status(500).json({
      error: 'Content Generation Failed',
      message: error instanceof Error ? error.message : 'Unknown content generation error',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/content/publish-to-cms
 * Simple prototype for publishing content to external CMS (demo)
 * Why this matters: Demonstrates how content can be published to any CMS via API
 */
router.post('/publish-to-cms', async (req: Request, res: Response): Promise<any> => {
  try {
    const { 
      title, 
      content, 
      meta_title, 
      meta_description,
      api_endpoint,
      api_key,
      cms_type = 'custom',
      status = 'draft'
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'title and content are required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`📰 [DEMO] Publishing to ${cms_type}: "${title.substring(0, 50)}..."`);

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Generate demo response (simulating successful publish)
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    const demoResponse = {
      success: true,
      post_id: `demo-${Date.now()}`,
      slug: slug,
      url: api_endpoint ? 
        `${api_endpoint.replace('/api/', '/blog/')}/${slug}` : 
        `https://demo-apollo-blog.com/blog/${slug}`,
      status: status,
      published_date: new Date().toISOString(),
      cms_type: cms_type,
      message: `Demo: Content would be published to ${cms_type} CMS`
    };

    console.log('✅ [DEMO] Simulated publish result:', demoResponse);

    res.json({
      success: true,
      publication: demoResponse,
      demo_mode: true,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Demo publish endpoint error:', error);
    
    res.status(500).json({
      error: 'Publication Failed',
      message: error instanceof Error ? error.message : 'Unknown publication error',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/content/generate-meta
 * Generate dynamic AI-powered meta title and description
 * Why this matters: Creates unique, contextually relevant meta fields instead of formulaic templates
 */
router.post('/generate-meta', async (req: Request, res: Response): Promise<any> => {
  try {
    const { keyword, content_preview, prompt } = req.body;

    if (!keyword || !prompt) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'keyword and prompt are required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`🎯 Generating AI meta fields for keyword: "${keyword}" (gpt-5-nano primary)`);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'Meta Generation Failed',
        message: 'OPENAI_API_KEY is not configured',
        status: 500,
        timestamp: new Date().toISOString()
      });
    }

    const openai = new OpenAI({ apiKey });

    let metaSeoTitle = '';
    let metaDescription = '';

    // Helper to normalize any JSON shape
    const normalize = (raw: string) => {
      try {
        const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
        const parsed: any = JSON.parse(cleaned);
        return {
          title: parsed.metaSeoTitle || parsed.meta_title || '',
          description: parsed.metaDescription || parsed.meta_description || ''
        };
      } catch {
        return { title: '', description: '' };
      }
    };

    // Try gpt-5-nano first, then fallback to gpt-5-nano
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-5-nano',
        messages: [
          { role: 'system', content: 'You generate concise, high-quality SEO meta titles and descriptions as strict JSON.' },
          { role: 'user', content: `${prompt}\n\nKeyword: ${keyword}\nContent Preview: ${content_preview || ''}\n\nRespond ONLY as JSON with keys: metaSeoTitle, metaDescription.` }
        ],
        max_completion_tokens: 200,
        response_format: { type: 'json_object' }
      });
      const content = completion.choices?.[0]?.message?.content || '';
      const { title, description } = normalize(content);
      metaSeoTitle = title; metaDescription = description;
    } catch (err5) {
      console.warn('⚠️ gpt-5-nano meta failed, retrying with gpt-5-nano fallback...', err5);
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-5-nano',
          messages: [
            { role: 'system', content: 'You generate concise, high-quality SEO meta titles and descriptions as strict JSON.' },
            { role: 'user', content: `${prompt}\n\nKeyword: ${keyword}\nContent Preview: ${content_preview || ''}\n\nRespond ONLY as JSON with keys: metaSeoTitle, metaDescription.` }
          ],
          max_completion_tokens: 200,
          response_format: { type: 'json_object' }
        });
        const content = completion.choices?.[0]?.message?.content || '';
        const { title, description } = normalize(content);
        metaSeoTitle = title; metaDescription = description;
      } catch (err41) {
        console.error('❌ OpenAI meta generation failed:', err41);
      }
    }

    // As final fallback, try Claude once and attempt to strip code fences
    if (!metaSeoTitle && !metaDescription) {
      try {
        const response = await claudeService.generateMetaFields({ keyword, content_preview: content_preview || '', prompt });
        // Normalize potential snake_case keys from Claude to our camelCase response
        const fallbackTitle: string = (response as any).metaSeoTitle || (response as any).meta_title || '';
        const fallbackDesc: string = (response as any).metaDescription || (response as any).meta_description || '';
        metaSeoTitle = fallbackTitle;
        metaDescription = fallbackDesc;
      } catch (claudeErr) {
        console.error('❌ Claude fallback for meta failed:', claudeErr);
      }
    }

    // Guarantee non-empty by returning empty strings instead of error
    return res.json({ metaSeoTitle: metaSeoTitle || '', metaDescription: metaDescription || '', timestamp: new Date().toISOString() });

  } catch (error) {
    console.error('Meta generation endpoint error:', error);
    
    res.status(500).json({
      error: 'Meta Generation Failed',
      message: error instanceof Error ? error.message : 'Unknown meta generation error',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/content/enhance-with-ctas
 * Enhance existing content with contextual CTAs
 * Why this matters: Transforms regular content into engagement-driving content with contextual CTAs
 */
router.post('/enhance-with-ctas', async (req: Request, res: Response): Promise<any> => {
  try {
    const { 
      content, 
      contentFormat = 'html',
      targetKeyword,
      campaignType = 'blog_creator',
      competitorName,
      maxCtasPerArticle = 3,
      ctaConfidenceThreshold = 60,
      insertionStrategy = 'moderate'
    } = req.body;

    if (!content || !targetKeyword) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'content and targetKeyword are required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`🎯 Enhancing content with contextual CTAs for keyword: "${targetKeyword}"`);
    console.log(`📊 Content format: ${contentFormat}, Campaign: ${campaignType}`);
    console.log(`⚙️ Settings: maxCTAs=${maxCtasPerArticle}, threshold=${ctaConfidenceThreshold}, strategy=${insertionStrategy}`);
    console.log(`📝 Content preview (first 200 chars): ${content.substring(0, 200)}...`);

    // Create CTA insertion request
    const insertionRequest: CtaInsertionRequest = {
      content,
      contentFormat: contentFormat as 'html' | 'markdown' | 'text',
      targetKeyword,
      campaignType: campaignType as 'blog_creator' | 'competitor_conquesting',
      competitorName,
      maxCtasPerArticle,
      ctaConfidenceThreshold,
      insertionStrategy: insertionStrategy as 'conservative' | 'moderate' | 'aggressive'
    };

    // Initialize CTA inserter
    const ctaInserter = new EndOfParagraphCtaInserter();

    // Enhance content with contextual CTAs
    const enhancedResult = await ctaInserter.insertContextualCTAs(insertionRequest);

    // Get insertion statistics
    const statistics = ctaInserter.getInsertionStatistics(enhancedResult);

    console.log(`✅ CTA enhancement completed:`);
    console.log(`   - Total insertions: ${enhancedResult.totalInsertions}`);
    console.log(`   - Processing time: ${enhancedResult.processingTimeMs}ms`);
    console.log(`   - Average confidence: ${enhancedResult.metadata.averageCtaConfidence}%`);
    console.log(`   - Enhanced content preview (first 300 chars): ${enhancedResult.enhancedContent.substring(0, 300)}...`);

    res.json({
      success: true,
      originalContent: enhancedResult.originalContent,
      enhancedContent: enhancedResult.enhancedContent,
      insertionAnalytics: {
        totalCtasInserted: enhancedResult.totalInsertions,
        averageConfidenceScore: enhancedResult.metadata.averageCtaConfidence,
        insertionPoints: enhancedResult.insertedCtas.map((cta, index) => ({
          paragraphIndex: index,
          confidenceScore: cta.contextualCta.confidence,
          ctaType: cta.contextualCta.solutionCategory,
          apolloSolutionUrl: cta.contextualCta.apolloUrl
        }))
      },
      // Additional debug info
      insertedCtas: enhancedResult.insertedCtas,
      statistics,
      metadata: enhancedResult.metadata,
      processingTimeMs: enhancedResult.processingTimeMs,
      timestamp: enhancedResult.enhancementTimestamp
    });

  } catch (error) {
    console.error('CTA enhancement error:', error);
    
    res.status(500).json({
      error: 'CTA Enhancement Failed',
      message: error instanceof Error ? error.message : 'Unknown CTA enhancement error',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/content/preview-cta-insertions
 * Preview where CTAs would be inserted without modifying content
 * Why this matters: Allows users to preview CTA placement before applying changes
 */
router.post('/preview-cta-insertions', async (req: Request, res: Response): Promise<any> => {
  try {
    const { 
      content, 
      contentFormat = 'html',
      targetKeyword,
      campaignType = 'blog_creator',
      maxCtasPerArticle = 3
    } = req.body;

    if (!content || !targetKeyword) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'content and targetKeyword are required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`👀 Previewing CTA insertions for keyword: "${targetKeyword}"`);

    // Create preview request
    const previewRequest: CtaInsertionRequest = {
      content,
      contentFormat: contentFormat as 'html' | 'markdown' | 'text',
      targetKeyword,
      campaignType: campaignType as 'blog_creator' | 'competitor_conquesting',
      maxCtasPerArticle
    };

    // Initialize CTA inserter
    const ctaInserter = new EndOfParagraphCtaInserter();

    // Generate preview
    const preview = await ctaInserter.previewCtaInsertions(previewRequest);

    res.json({
      success: true,
      insertionPoints: preview.insertionPoints,
      potentialCtas: preview.potentialCtas,
      previewParagraphs: preview.previewParagraphs,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('CTA preview error:', error);
    
    res.status(500).json({
      error: 'CTA Preview Failed',
      message: error instanceof Error ? error.message : 'Unknown CTA preview error',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/content/enhance-with-simple-ctas
 * Simple, reliable contextual CTA insertion with sitemap-aware URL selection
 */
router.post('/enhance-with-simple-ctas', async (req: Request, res: Response): Promise<any> => {
  try {
    const { content, contentFormat = 'html', targetKeyword, campaignType, competitorName, maxCtasPerArticle = 3, sitemapData } = req.body;

    if (!content || !targetKeyword || !campaignType) {
      return res.status(400).json({
        success: false,
        error: 'content, targetKeyword, and campaignType are required'
      });
    }

    console.log(`🎯 Simple CTA enhancement request for keyword: "${targetKeyword}"`);

    const simpleCtaService = new SimpleContextualCtaService();
    const result = await simpleCtaService.insertContextualCtas({
      content,
      contentFormat,
      targetKeyword,
      campaignType,
      competitorName,
      maxCtasPerArticle,
      sitemapData
    });

    res.json({
      success: result.success,
      enhancedContent: result.enhancedContent,
      insertionAnalytics: result.insertionAnalytics,
      processingTimeMs: result.processingTimeMs
    });

  } catch (error) {
    console.error('❌ Simple CTA enhancement failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Simple CTA enhancement failed'
    });
  }
});

export default router; 