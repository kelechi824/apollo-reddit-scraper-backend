import { Router, Request, Response } from 'express';
import FirecrawlService from '../services/firecrawlService';
import ContentAnalysisService, { ArticleContentAnalysisResult } from '../services/contentAnalysisService';

const router = Router();

/**
 * Content Analysis Routes
 * Why this matters: Provides API endpoints for the complete article analysis pipeline,
 * combining Firecrawl extraction with OpenAI persona detection and theme analysis.
 */

/**
 * POST /api/content-analysis/analyze-url
 * Complete pipeline: Extract article content and analyze for personas/themes
 */
router.post('/analyze-url', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    console.log(`🔍 Starting complete analysis pipeline for: ${url}`);

    // Step 1: Extract article content with Firecrawl
    const firecrawlService = new FirecrawlService();
    const extractionResult = await firecrawlService.extractArticleContent(url);

    if (!extractionResult.success || !extractionResult.data) {
      console.error(`❌ Article extraction failed: ${extractionResult.error}`);
      return res.status(400).json({
        success: false,
        error: `Article extraction failed: ${extractionResult.error}`,
        stage: 'extraction'
      });
    }

    console.log(`✅ Article extracted: ${extractionResult.data.wordCount} words`);

    // Step 2: Analyze content for personas and themes
    const contentAnalysisService = new ContentAnalysisService();
    const analysisResult = await contentAnalysisService.analyzeArticleContent(extractionResult.data);

    console.log(`✅ Content analysis complete - Persona: ${analysisResult.persona} (${analysisResult.confidence_score}% confidence)`);

    // Return combined results
    return res.json({
      success: true,
      data: {
        article: extractionResult.data,
        analysis: analysisResult,
        pipeline_completed_at: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ Content analysis pipeline error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during content analysis pipeline',
      stage: 'analysis'
    });
  }
});

/**
 * POST /api/content-analysis/analyze-content
 * Analyze already extracted content (skip Firecrawl step)
 */
router.post('/analyze-content', async (req: Request, res: Response): Promise<any> => {
  try {
    const { article } = req.body;

    if (!article || !article.content || !article.title) {
      return res.status(400).json({
        success: false,
        error: 'Article object with content and title is required'
      });
    }

    console.log(`🧠 Analyzing pre-extracted content: "${article.title}"`);

    const contentAnalysisService = new ContentAnalysisService();
    const analysisResult = await contentAnalysisService.analyzeArticleContent(article);

    console.log(`✅ Content analysis complete - Persona: ${analysisResult.persona} (${analysisResult.confidence_score}% confidence)`);

    return res.json({
      success: true,
      data: {
        analysis: analysisResult,
        analyzed_at: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ Content analysis error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during content analysis'
    });
  }
});

/**
 * POST /api/content-analysis/batch-analyze-urls
 * Batch process multiple URLs through complete pipeline
 */
router.post('/batch-analyze-urls', async (req: Request, res: Response): Promise<any> => {
  try {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'URLs array is required and must not be empty'
      });
    }

    if (urls.length > 5) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 5 URLs allowed per batch analysis request'
      });
    }

    console.log(`🔍 Starting batch analysis pipeline for ${urls.length} URLs`);

    // Step 1: Extract all articles with Firecrawl
    const firecrawlService = new FirecrawlService();
    const extractionResults = await firecrawlService.extractMultipleArticles(urls);

    if (!extractionResults.success || !extractionResults.data) {
      console.error(`❌ Batch extraction failed: ${extractionResults.error}`);
      return res.status(400).json({
        success: false,
        error: `Batch extraction failed: ${extractionResults.error}`,
        stage: 'extraction'
      });
    }

    console.log(`✅ Batch extraction complete: ${extractionResults.data.length} articles extracted`);

    // Step 2: Analyze all extracted content
    const contentAnalysisService = new ContentAnalysisService();
    const analysisResults = await contentAnalysisService.analyzeMultipleArticles(extractionResults.data);

    if (!analysisResults.success || !analysisResults.results) {
      console.error(`❌ Batch analysis failed: ${analysisResults.error}`);
      return res.status(400).json({
        success: false,
        error: `Batch analysis failed: ${analysisResults.error}`,
        stage: 'analysis'
      });
    }

    console.log(`✅ Batch analysis complete: ${analysisResults.results.length} articles analyzed`);

    // Combine articles with their analysis results
    const combinedResults = extractionResults.data.map((article, index) => {
      const analysis = analysisResults.results!.find((_, i) => i === index);
      return {
        article,
        analysis,
        processed_at: new Date().toISOString()
      };
    });

    return res.json({
      success: true,
      data: {
        results: combinedResults,
        extraction_failed: extractionResults.failed,
        analysis_failed: analysisResults.failed,
        pipeline_completed_at: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ Batch analysis pipeline error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during batch analysis pipeline'
    });
  }
});

/**
 * GET /api/content-analysis/health
 * Health check for content analysis service
 */
router.get('/health', async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('🏥 Checking content analysis service health');

    const contentAnalysisService = new ContentAnalysisService();
    const serviceStatus = contentAnalysisService.getServiceStatus();
    
    // Test analysis functionality
    const testResult = await contentAnalysisService.testAnalysis();

    if (testResult.success && serviceStatus.available) {
      console.log('✅ Content analysis service health check passed');
      return res.json({
        success: true,
        message: 'Content analysis service is operational',
        service_status: serviceStatus,
        test_result: testResult.message,
        timestamp: new Date().toISOString()
      });
    } else {
      console.error(`❌ Content analysis service health check failed: ${testResult.message}`);
      return res.status(503).json({
        success: false,
        error: 'Content analysis service not operational',
        service_status: serviceStatus,
        test_result: testResult.message,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error: any) {
    console.error('❌ Content analysis health check error:', error);
    return res.status(500).json({
      success: false,
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/content-analysis/personas
 * Get list of supported persona categories
 */
router.get('/personas', (req: Request, res: Response) => {
  const supportedPersonas = [
    {
      category: 'C-Suite',
      personas: ['CEO', 'CRO', 'CMO', 'CFO', 'CTO']
    },
    {
      category: 'VP-Level',
      personas: ['VP Sales', 'VP Marketing', 'VP Customer Success', 'VP Operations']
    },
    {
      category: 'Director-Level', 
      personas: ['Sales Director', 'Marketing Director', 'Customer Success Director']
    },
    {
      category: 'Manager-Level',
      personas: ['Sales Manager', 'Marketing Manager', 'RevOps Manager', 'Sales Operations Manager']
    },
    {
      category: 'Individual Contributor',
      personas: ['Sales Development Rep (SDR)', 'Account Executive (AE)', 'Customer Success Manager', 'Business Development']
    },
    {
      category: 'Specialized',
      personas: ['Founder/Entrepreneur', 'RevOps', 'Marketing Operations']
    }
  ];

  res.json({
    success: true,
    data: {
      supported_personas: supportedPersonas,
      total_count: supportedPersonas.reduce((sum, category) => sum + category.personas.length, 0)
    }
  });
});

export default router;
