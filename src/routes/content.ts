import { Router, Request, Response } from 'express';
import claudeService from '../services/claudeService';
import { openaiService } from '../services/openaiService';
import OpenAI from 'openai';

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

    // Add internal linking requirements to user prompt if sitemap data is available
    let enhancedUserPrompt = user_prompt;
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
      
      // Insert internal linking section before the content requirements
      enhancedUserPrompt = enhancedUserPrompt.replace(
        '**Content Requirements',
        `${internalLinksSection}**Content Requirements`
      );
    } else {
      console.log('⚠️ No sitemap data available for internal linking');
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

    // Try gpt-5-nano first, then gpt-4.1-nano
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
      console.warn('⚠️ gpt-5-nano meta failed, retrying with gpt-4.1-nano...', err5);
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4.1-nano-2025-04-14',
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

export default router; 