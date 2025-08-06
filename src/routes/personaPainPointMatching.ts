import { Router, Request, Response } from 'express';
import PersonaPainPointMatcher, { PersonaPainPointMatch } from '../services/personaPainPointMatcher';
import ContentAnalysisService, { ArticleContentAnalysisResult } from '../services/contentAnalysisService';
import FirecrawlService from '../services/firecrawlService';

const router = Router();

/**
 * Persona-Pain Point Matching Routes
 * Why this matters: Provides API endpoints for matching detected personas to relevant VoC Kit pain points,
 * creating the bridge between article analysis and hyper-relevant CTA generation.
 */

/**
 * POST /api/persona-pain-point-matching/match-from-url
 * Complete pipeline: Extract article → analyze persona → match to pain points
 */
router.post('/match-from-url', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    console.log(`🎯 Starting complete persona-pain point matching pipeline for: ${url}`);

    // Step 1: Extract article content
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

    // Step 2: Analyze content for personas
    const contentAnalysisService = new ContentAnalysisService();
    const analysisResult = await contentAnalysisService.analyzeArticleContent(extractionResult.data);

    console.log(`✅ Persona detected: ${analysisResult.persona} (${analysisResult.confidence_score}% confidence)`);

    // Step 3: Match persona to pain points
    const personaPainPointMatcher = new PersonaPainPointMatcher();
    const matchingResult = await personaPainPointMatcher.matchPersonaToPainPoints(analysisResult);

    console.log(`✅ Pain point matching complete: ${matchingResult.matched_pain_points.length} matches with ${matchingResult.matching_confidence}% confidence`);

    // Return complete pipeline results
    return res.json({
      success: true,
      data: {
        article: extractionResult.data,
        content_analysis: analysisResult,
        persona_pain_point_matching: matchingResult,
        pipeline_completed_at: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ Persona-pain point matching pipeline error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during persona-pain point matching pipeline',
      stage: 'matching'
    });
  }
});

/**
 * POST /api/persona-pain-point-matching/match-from-analysis
 * Match persona to pain points using existing content analysis
 */
router.post('/match-from-analysis', async (req: Request, res: Response): Promise<any> => {
  try {
    const { content_analysis } = req.body;

    if (!content_analysis || !content_analysis.persona) {
      return res.status(400).json({
        success: false,
        error: 'Content analysis object with persona is required'
      });
    }

    console.log(`🎯 Matching persona "${content_analysis.persona}" to pain points`);

    const personaPainPointMatcher = new PersonaPainPointMatcher();
    const matchingResult = await personaPainPointMatcher.matchPersonaToPainPoints(content_analysis);

    console.log(`✅ Pain point matching complete: ${matchingResult.matched_pain_points.length} matches with ${matchingResult.matching_confidence}% confidence`);

    return res.json({
      success: true,
      data: {
        persona_pain_point_matching: matchingResult,
        matched_at: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ Persona-pain point matching error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during persona-pain point matching'
    });
  }
});

/**
 * POST /api/persona-pain-point-matching/batch-match-urls
 * Batch process multiple URLs through complete pipeline
 */
router.post('/batch-match-urls', async (req: Request, res: Response): Promise<any> => {
  try {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'URLs array is required and must not be empty'
      });
    }

    if (urls.length > 3) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 3 URLs allowed per batch matching request (processing intensive)'
      });
    }

    console.log(`🎯 Starting batch persona-pain point matching for ${urls.length} URLs`);

    const results = [];
    const failed = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        console.log(`📊 Processing URL ${i + 1}/${urls.length}: ${url}`);

        // Step 1: Extract article content
        const firecrawlService = new FirecrawlService();
        const extractionResult = await firecrawlService.extractArticleContent(url);

        if (!extractionResult.success || !extractionResult.data) {
          failed.push({
            url,
            error: `Extraction failed: ${extractionResult.error}`,
            stage: 'extraction'
          });
          continue;
        }

        // Step 2: Analyze content for personas
        const contentAnalysisService = new ContentAnalysisService();
        const analysisResult = await contentAnalysisService.analyzeArticleContent(extractionResult.data);

        // Step 3: Match persona to pain points
        const personaPainPointMatcher = new PersonaPainPointMatcher();
        const matchingResult = await personaPainPointMatcher.matchPersonaToPainPoints(analysisResult);

        results.push({
          url,
          article: extractionResult.data,
          content_analysis: analysisResult,
          persona_pain_point_matching: matchingResult,
          processed_at: new Date().toISOString()
        });

        // Rate limiting: delay between requests
        if (i < urls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error: any) {
        console.error(`❌ Failed to process URL: ${url}`, error);
        failed.push({
          url,
          error: error.message || 'Processing failed',
          stage: 'matching'
        });
      }
    }

    console.log(`✅ Batch processing complete: ${results.length} successful, ${failed.length} failed`);

    return res.json({
      success: true,
      data: {
        results,
        failed: failed.length > 0 ? failed : undefined,
        pipeline_completed_at: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ Batch persona-pain point matching error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during batch matching'
    });
  }
});

/**
 * GET /api/persona-pain-point-matching/health
 * Health check for persona-pain point matching service
 */
router.get('/health', async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('🏥 Checking persona-pain point matching service health');

    const personaPainPointMatcher = new PersonaPainPointMatcher();
    const serviceStatus = personaPainPointMatcher.getServiceStatus();
    
    // Test matching functionality
    const testResult = await personaPainPointMatcher.testMatching();

    if (testResult.success && serviceStatus.available) {
      console.log('✅ Persona-pain point matching service health check passed');
      return res.json({
        success: true,
        message: 'Persona-pain point matching service is operational',
        service_status: serviceStatus,
        test_result: testResult.message,
        timestamp: new Date().toISOString()
      });
    } else {
      console.error(`❌ Persona-pain point matching service health check failed: ${testResult.message}`);
      return res.status(503).json({
        success: false,
        error: 'Persona-pain point matching service not operational',
        service_status: serviceStatus,
        test_result: testResult.message,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error: any) {
    console.error('❌ Persona-pain point matching health check error:', error);
    return res.status(500).json({
      success: false,
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/persona-pain-point-matching/supported-personas
 * Get list of supported personas and their typical pain point mappings
 */
router.get('/supported-personas', (req: Request, res: Response) => {
  const supportedPersonas = [
    {
      category: 'C-Suite',
      personas: [
        {
          title: 'CEO (Chief Executive Officer)',
          typical_pain_points: ['budget_roi', 'revenue_growth', 'competitive_advantage', 'scalability_concerns'],
          priorities: 'Strategic focus, ROI, growth, competitive positioning'
        },
        {
          title: 'CRO (Chief Revenue Officer)',
          typical_pain_points: ['revenue_growth', 'pipeline_visibility', 'quota_achievement', 'forecasting_accuracy'],
          priorities: 'Revenue optimization, sales efficiency, predictable growth'
        },
        {
          title: 'CFO (Chief Financial Officer)',
          typical_pain_points: ['budget_roi', 'cost_optimization', 'financial_reporting', 'compliance_security'],
          priorities: 'Cost control, ROI measurement, financial compliance'
        },
        {
          title: 'CPO (Chief Product Officer)',
          typical_pain_points: ['product_development', 'user_feedback', 'feature_prioritization', 'integration_challenges'],
          priorities: 'Product strategy, user satisfaction, development efficiency'
        }
      ]
    },
    {
      category: 'VP-Level',
      personas: [
        {
          title: 'VP Sales',
          typical_pain_points: ['quota_achievement', 'pipeline_visibility', 'sales_efficiency', 'team_productivity'],
          priorities: 'Sales performance, team management, quota attainment'
        },
        {
          title: 'VP Marketing',
          typical_pain_points: ['lead_generation', 'campaign_performance', 'attribution_tracking', 'budget_roi'],
          priorities: 'Lead quality, campaign ROI, marketing attribution'
        }
      ]
    },
    {
      category: 'Manager-Level',
      personas: [
        {
          title: 'Sales Manager',
          typical_pain_points: ['quota_achievement', 'team_productivity', 'pipeline_management', 'lead_quality_issues'],
          priorities: 'Team performance, deal management, coaching'
        },
        {
          title: 'Marketing Manager',
          typical_pain_points: ['campaign_performance', 'lead_generation', 'attribution_tracking', 'manual_processes'],
          priorities: 'Campaign execution, lead nurturing, efficiency'
        }
      ]
    },
    {
      category: 'Individual Contributors',
      personas: [
        {
          title: 'SDR (Sales Development Rep)',
          typical_pain_points: ['lead_quality_issues', 'prospecting_efficiency', 'quota_pressure', 'manual_processes'],
          priorities: 'Lead quality, prospecting tools, quota achievement'
        },
        {
          title: 'AE (Account Executive)',
          typical_pain_points: ['deal_closing', 'pipeline_management', 'quota_achievement', 'customer_relationships'],
          priorities: 'Deal closure, relationship building, quota attainment'
        }
      ]
    }
  ];

  res.json({
    success: true,
    data: {
      supported_personas: supportedPersonas,
      total_personas: supportedPersonas.reduce((sum, category) => sum + category.personas.length, 0),
      matching_algorithm: 'Multi-factor relevance scoring based on persona priorities, content themes, and contextual relevance'
    }
  });
});

export default router;
