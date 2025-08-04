import { Router, Request, Response } from 'express';
import claudeService from '../services/claudeService';

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
    const { post_context, system_prompt, user_prompt, brand_kit }: ContentCreationRequest = req.body;

    if (!post_context || !system_prompt || !user_prompt) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'post_context, system_prompt, and user_prompt are required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`📝 Generating content for: "${post_context.title.substring(0, 50)}..."`);

    // Generate content using Claude
    const response = await claudeService.generateContent({
      system_prompt,
      user_prompt,
      post_context,
      brand_kit
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

    console.log(`🎯 Generating AI meta fields for keyword: "${keyword}"`);

    // Generate meta fields using Claude
    const response = await claudeService.generateMetaFields({
      keyword,
      content_preview: content_preview || '',
      prompt
    });

    console.log('✅ Meta fields generated successfully');

    res.json({
      metaSeoTitle: response.metaSeoTitle || '',
      metaDescription: response.metaDescription || '',
      timestamp: new Date().toISOString()
    });

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