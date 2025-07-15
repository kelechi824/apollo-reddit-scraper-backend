import { Router, Request, Response } from 'express';
import openaiService from '../services/openaiService';
import claudeService from '../services/claudeService';

const router = Router();

interface MarkdownConversionRequest {
  raw_data: string;
  job_title: string;
}

interface PlaybookGenerationRequest {
  job_title: string;
  markdown_data: string;
  system_prompt: string;
  user_prompt: string;
}

/**
 * POST /api/playbooks/convert-to-markdown
 * Convert raw text data to markdown format using OpenAI GPT-4.1-nano
 * Why this matters: Transforms unstructured raw data into clean, processable markdown
 * format that can be used as context for playbook generation.
 */
router.post('/convert-to-markdown', async (req: Request, res: Response): Promise<any> => {
  try {
    const { raw_data, job_title }: MarkdownConversionRequest = req.body;

    if (!raw_data || !job_title) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'raw_data and job_title are required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`📝 Converting raw data to markdown for job title: ${job_title}`);

    // Convert raw data to markdown using OpenAI
    const markdownResult = await openaiService.convertToMarkdown({
      raw_data,
      job_title
    });

    return res.json({
      success: true,
      markdown_content: markdownResult,
      job_title,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Markdown conversion failed:', error);
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to convert raw data to markdown',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/playbooks/generate-content
 * Generate comprehensive playbook content using Claude API
 * Why this matters: Creates high-quality, structured playbook content using
 * the processed markdown data as context for targeted job title strategies.
 */
router.post('/generate-content', async (req: Request, res: Response): Promise<any> => {
  try {
    const { job_title, markdown_data, system_prompt, user_prompt }: PlaybookGenerationRequest = req.body;

    if (!job_title || !markdown_data || !system_prompt || !user_prompt) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'job_title, markdown_data, system_prompt, and user_prompt are required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`📚 Generating playbook content for job title: ${job_title}`);

    // Generate playbook content using Claude
    const response = await claudeService.generatePlaybookContent({
      system_prompt,
      user_prompt,
      job_title,
      markdown_data
    });

    return res.json({
      success: true,
      content: response.content,
      job_title,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Playbook generation failed:', error);
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate playbook content',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

export default router; 