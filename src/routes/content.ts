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
  brand_kit: any;
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
    const { post_context, brand_kit, system_prompt, user_prompt }: ContentCreationRequest = req.body;

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

    res.json({
      success: true,
      content: response.content,
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

export default router; 