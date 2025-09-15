import { Router, Request, Response } from 'express';
import { EmailNewsletterService } from '../services/emailNewsletterService';

const router = Router();

/**
 * Email Newsletter Generation API Routes
 * 
 * Provides endpoints for generating targeted email newsletters using Apollo's
 * email performance data via MCP integration. Designed for Senior Lifecycle
 * Marketing Managers to create high-quality email sequences for salespeople.
 */

/**
 * POST /api/email-newsletter/generate
 * 
 * Generate 5 targeted email newsletters for a specific job title.
 * Uses MCP to query Apollo email performance data and creates compelling
 * newsletters with strategic Apollo CTAs.
 * 
 * Request Body:
 * - jobTitle: string (required) - Target job title for newsletters
 * - options?: { count?: number, ctaPreference?: string[] }
 * 
 * Response:
 * - newsletters: string[] - Array of 5 generated newsletters
 * - mcpData?: object - Apollo email performance data used
 * - metadata: object - Generation metadata (processing time, MCP usage, etc.)
 */
router.post('/generate', async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('📧 Email Newsletter Generation Request:', {
      jobTitle: req.body.jobTitle,
      timestamp: new Date().toISOString(),
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });

    // Validate request
    const { jobTitle, options } = req.body;
    
    if (!jobTitle || typeof jobTitle !== 'string') {
      return res.status(400).json({
        error: 'Job title is required and must be a string',
        code: 'INVALID_JOB_TITLE'
      });
    }

    if (jobTitle.trim().length === 0) {
      return res.status(400).json({
        error: 'Job title cannot be empty',
        code: 'EMPTY_JOB_TITLE'
      });
    }

    // Initialize service
    const emailNewsletterService = new EmailNewsletterService();
    
    // Generate newsletters
    const startTime = Date.now();
    const result = await emailNewsletterService.generateNewsletters({
      jobTitle: jobTitle.trim(),
      count: options?.count || 5,
      ctaPreference: options?.ctaPreference || []
    });
    
    const processingTime = Date.now() - startTime;

    // Add processing metadata
    const response = {
      ...result,
      metadata: {
        ...result.metadata,
        processingTime,
        requestTimestamp: new Date().toISOString(),
        jobTitle: jobTitle.trim()
      }
    };

    console.log('✅ Email Newsletter Generation Successful:', {
      jobTitle: jobTitle.trim(),
      newslettersGenerated: result.newsletters.length,
      mcpUsed: result.metadata.mcpUsed,
      processingTime: `${processingTime}ms`
    });

    return res.json(response);

  } catch (error) {
    console.error('❌ Email Newsletter Generation Error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      jobTitle: req.body.jobTitle,
      timestamp: new Date().toISOString()
    });

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('MCP')) {
        return res.status(503).json({
          error: 'MCP service temporarily unavailable. Using fallback data.',
          code: 'MCP_UNAVAILABLE',
          fallback: true
        });
      }
      
      if (error.message.includes('rate limit')) {
        return res.status(429).json({
          error: 'Rate limit exceeded. Please try again later.',
          code: 'RATE_LIMIT_EXCEEDED'
        });
      }
      
      if (error.message.includes('timeout')) {
        return res.status(408).json({
          error: 'Request timeout. Please try again.',
          code: 'REQUEST_TIMEOUT'
        });
      }
    }

    // Generic error response
    return res.status(500).json({
      error: 'Failed to generate newsletters. Please try again.',
      code: 'GENERATION_FAILED'
    });
  }
});

/**
 * POST /api/email-newsletter/regenerate
 * 
 * Regenerate a specific newsletter from an existing set.
 * Uses the same MCP data and context to create an alternative version
 * of a single newsletter while maintaining consistency with Apollo data.
 * 
 * Request Body:
 * - jobTitle: string - Original job title
 * - newsletterIndex: number - Index of newsletter to regenerate (0-4)
 * - mcpData?: object - Previously retrieved MCP data to reuse
 * - currentNewsletter?: string - Current newsletter content for context
 * 
 * Response:
 * - newsletter: string - Newly generated newsletter
 * - metadata: object - Generation metadata
 */
router.post('/regenerate', async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('🔄 Newsletter Regeneration Request:', {
      jobTitle: req.body.jobTitle,
      newsletterIndex: req.body.newsletterIndex,
      timestamp: new Date().toISOString()
    });

    // Validate request
    const { jobTitle, newsletterIndex, mcpData, currentNewsletter } = req.body;
    
    if (!jobTitle || typeof jobTitle !== 'string') {
      return res.status(400).json({
        error: 'Job title is required and must be a string',
        code: 'INVALID_JOB_TITLE'
      });
    }

    if (newsletterIndex === undefined || typeof newsletterIndex !== 'number' || 
        newsletterIndex < 0 || newsletterIndex > 4) {
      return res.status(400).json({
        error: 'Newsletter index must be a number between 0 and 4',
        code: 'INVALID_NEWSLETTER_INDEX'
      });
    }

    // Initialize service
    const emailNewsletterService = new EmailNewsletterService();
    
    // Regenerate specific newsletter
    const startTime = Date.now();
    const result = await emailNewsletterService.regenerateNewsletter({
      jobTitle: jobTitle.trim(),
      newsletterIndex,
      mcpData,
      currentNewsletter
    });
    
    const processingTime = Date.now() - startTime;

    // Add processing metadata
    const response = {
      ...result,
      metadata: {
        ...result.metadata,
        processingTime,
        regeneratedIndex: newsletterIndex,
        requestTimestamp: new Date().toISOString()
      }
    };

    console.log('✅ Newsletter Regeneration Successful:', {
      jobTitle: jobTitle.trim(),
      newsletterIndex,
      processingTime: `${processingTime}ms`
    });

    return res.json(response);

  } catch (error) {
    console.error('❌ Newsletter Regeneration Error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      jobTitle: req.body.jobTitle,
      newsletterIndex: req.body.newsletterIndex,
      timestamp: new Date().toISOString()
    });

    return res.status(500).json({
      error: 'Failed to regenerate newsletter. Please try again.',
      code: 'REGENERATION_FAILED'
    });
  }
});

/**
 * GET /api/email-newsletter/job-titles
 * 
 * Get the list of available job titles for newsletter generation.
 * Returns the comprehensive list of job titles that can be used
 * with the newsletter generation system.
 * 
 * Response:
 * - jobTitles: string[] - Array of available job titles
 * - count: number - Total number of job titles
 */
router.get('/job-titles', async (req: Request, res: Response): Promise<any> => {
  try {
    const emailNewsletterService = new EmailNewsletterService();
    const jobTitles = emailNewsletterService.getAvailableJobTitles();
    
    return res.json({
      jobTitles,
      count: jobTitles.length,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Job Titles Request Error:', error);
    
    return res.status(500).json({
      error: 'Failed to retrieve job titles',
      code: 'JOB_TITLES_ERROR'
    });
  }
});

/**
 * GET /api/email-newsletter/cta-options
 * 
 * Get available Apollo CTA options for newsletters.
 * Returns the list of pre-approved Apollo call-to-action options
 * that can be used in newsletter generation.
 * 
 * Response:
 * - ctaOptions: string[] - Array of available CTA options
 * - count: number - Total number of CTA options
 */
router.get('/cta-options', async (req: Request, res: Response): Promise<any> => {
  try {
    const emailNewsletterService = new EmailNewsletterService();
    const ctaOptions = emailNewsletterService.getAvailableCtaOptions();
    
    return res.json({
      ctaOptions,
      count: ctaOptions.length,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ CTA Options Request Error:', error);
    
    return res.status(500).json({
      error: 'Failed to retrieve CTA options',
      code: 'CTA_OPTIONS_ERROR'
    });
  }
});

/**
 * POST /api/email-newsletter/validate
 * 
 * Validate newsletter content and provide suggestions.
 * Analyzes newsletter content for best practices, Apollo branding,
 * CTA effectiveness, and overall quality.
 * 
 * Request Body:
 * - newsletter: string - Newsletter content to validate
 * - jobTitle: string - Target job title for context
 * 
 * Response:
 * - isValid: boolean - Whether newsletter meets quality standards
 * - suggestions: string[] - Array of improvement suggestions
 * - score: number - Quality score (0-100)
 * - metrics: object - Content metrics (word count, readability, etc.)
 */
router.post('/validate', async (req: Request, res: Response): Promise<any> => {
  try {
    const { newsletter, jobTitle } = req.body;
    
    if (!newsletter || typeof newsletter !== 'string') {
      return res.status(400).json({
        error: 'Newsletter content is required and must be a string',
        code: 'INVALID_NEWSLETTER_CONTENT'
      });
    }

    const emailNewsletterService = new EmailNewsletterService();
    const validationResult = await emailNewsletterService.validateNewsletter({
      newsletter: newsletter.trim(),
      jobTitle: jobTitle?.trim()
    });

    return res.json(validationResult);

  } catch (error) {
    console.error('❌ Newsletter Validation Error:', error);
    
    return res.status(500).json({
      error: 'Failed to validate newsletter',
      code: 'VALIDATION_ERROR'
    });
  }
});

export default router;