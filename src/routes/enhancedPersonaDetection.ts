import { Router, Request, Response } from 'express';
import EnhancedPersonaDetector, { EnhancedPersonaResult } from '../services/enhancedPersonaDetector';
import ContentAnalysisService, { ArticleContentAnalysisResult } from '../services/contentAnalysisService';
import PersonaPainPointMatcher, { PersonaPainPointMatch } from '../services/personaPainPointMatcher';
import FirecrawlService from '../services/firecrawlService';

const router = Router();

/**
 * Enhanced Persona Detection Routes
 * Why this matters: Provides API endpoints for sophisticated persona analysis that goes beyond
 * basic role identification to extract buying context, urgency, and audience sophistication.
 */

/**
 * POST /api/enhanced-persona-detection/analyze-url
 * Complete enhanced pipeline: Extract article → basic analysis → enhanced detection → pain point matching
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

    console.log(`🔍 Starting enhanced persona analysis pipeline for: ${url}`);

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

    // Step 2: Basic content analysis
    const contentAnalysisService = new ContentAnalysisService();
    const basicAnalysis = await contentAnalysisService.analyzeArticleContent(extractionResult.data);

    console.log(`✅ Basic analysis complete - Persona: ${basicAnalysis.persona} (${basicAnalysis.confidence_score}% confidence)`);

    // Step 3: Enhanced persona detection
    const enhancedPersonaDetector = new EnhancedPersonaDetector();
    const enhancedAnalysis = await enhancedPersonaDetector.enhancePersonaDetection(
      extractionResult.data, 
      basicAnalysis
    );

    console.log(`✅ Enhanced analysis complete - Primary: ${enhancedAnalysis.primary_persona.title} (${enhancedAnalysis.primary_persona.confidence}% confidence)`);

    // Step 4: Pain point matching with enhanced context
    const personaPainPointMatcher = new PersonaPainPointMatcher();
    const painPointMatching = await personaPainPointMatcher.matchPersonaToPainPoints(basicAnalysis);

    console.log(`✅ Pain point matching complete: ${painPointMatching.matched_pain_points.length} matches`);

    // Return comprehensive analysis results
    return res.json({
      success: true,
      data: {
        article: extractionResult.data,
        basic_analysis: basicAnalysis,
        enhanced_persona: enhancedAnalysis,
        pain_point_matching: painPointMatching,
        analysis_summary: {
          primary_persona: enhancedAnalysis.primary_persona.title,
          confidence_score: enhancedAnalysis.primary_persona.confidence,
          growth_stage: enhancedAnalysis.company_context.growth_stage,
          solution_readiness: enhancedAnalysis.content_insights.solution_readiness,
          urgency_level: enhancedAnalysis.buying_signals.urgency_indicators.length > 0 ? 'high' : 'medium',
          matched_pain_points: painPointMatching.matched_pain_points.length
        },
        pipeline_completed_at: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ Enhanced persona analysis pipeline error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during enhanced persona analysis pipeline',
      stage: 'enhanced_analysis'
    });
  }
});

/**
 * POST /api/enhanced-persona-detection/enhance-existing
 * Enhance an existing basic analysis with deep persona insights
 */
router.post('/enhance-existing', async (req: Request, res: Response): Promise<any> => {
  try {
    const { basic_analysis } = req.body;

    if (!basic_analysis || !basic_analysis.persona) {
      return res.status(400).json({
        success: false,
        error: 'Basic analysis object with persona is required'
      });
    }

    console.log(`🔍 Enhancing existing analysis for persona: ${basic_analysis.persona}`);

    const enhancedPersonaDetector = new EnhancedPersonaDetector();
    const enhancedResult = await enhancedPersonaDetector.enhanceExistingAnalysis(basic_analysis);

    console.log(`✅ Enhancement complete - Quality: ${enhancedResult.merged.analysis_quality} (${enhancedResult.merged.confidence_score}% confidence)`);

    return res.json({
      success: true,
      data: {
        enhanced_result: enhancedResult,
        enhancement_summary: {
          quality_improvement: enhancedResult.merged.analysis_quality,
          confidence_delta: enhancedResult.enhanced.primary_persona.confidence - basic_analysis.confidence_score,
          buying_signals_detected: enhancedResult.enhanced.buying_signals.urgency_indicators.length + 
                                  enhancedResult.enhanced.buying_signals.budget_signals.length,
          company_context_depth: enhancedResult.enhanced.company_context.size_indicators.length + 
                               enhancedResult.enhanced.company_context.industry_signals.length
        },
        enhanced_at: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ Enhanced persona analysis error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during enhanced persona analysis'
    });
  }
});

/**
 * POST /api/enhanced-persona-detection/batch-enhance-urls
 * Batch process multiple URLs through enhanced analysis pipeline
 */
router.post('/batch-enhance-urls', async (req: Request, res: Response): Promise<any> => {
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
        error: 'Maximum 3 URLs allowed per batch enhanced analysis (processing intensive)'
      });
    }

    console.log(`🔍 Starting batch enhanced analysis for ${urls.length} URLs`);

    const results = [];
    const failed = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        console.log(`📊 Processing URL ${i + 1}/${urls.length}: ${url}`);

        // Extract and analyze
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

        // Basic analysis
        const contentAnalysisService = new ContentAnalysisService();
        const basicAnalysis = await contentAnalysisService.analyzeArticleContent(extractionResult.data);

        // Enhanced analysis
        const enhancedPersonaDetector = new EnhancedPersonaDetector();
        const enhancedAnalysis = await enhancedPersonaDetector.enhancePersonaDetection(
          extractionResult.data,
          basicAnalysis
        );

        // Pain point matching
        const personaPainPointMatcher = new PersonaPainPointMatcher();
        const painPointMatching = await personaPainPointMatcher.matchPersonaToPainPoints(basicAnalysis);

        results.push({
          url,
          article: extractionResult.data,
          basic_analysis: basicAnalysis,
          enhanced_persona: enhancedAnalysis,
          pain_point_matching: painPointMatching,
          analysis_summary: {
            primary_persona: enhancedAnalysis.primary_persona.title,
            confidence_score: enhancedAnalysis.primary_persona.confidence,
            growth_stage: enhancedAnalysis.company_context.growth_stage,
            solution_readiness: enhancedAnalysis.content_insights.solution_readiness,
            quality_score: enhancedAnalysis.persona_validation.consistency_score
          },
          processed_at: new Date().toISOString()
        });

        // Rate limiting: significant delay between enhanced analyses
        if (i < urls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

      } catch (error: any) {
        console.error(`❌ Failed to process URL: ${url}`, error);
        failed.push({
          url,
          error: error.message || 'Enhanced analysis failed',
          stage: 'enhanced_analysis'
        });
      }
    }

    console.log(`✅ Batch enhanced analysis complete: ${results.length} successful, ${failed.length} failed`);

    return res.json({
      success: true,
      data: {
        results,
        failed: failed.length > 0 ? failed : undefined,
        batch_summary: {
          total_processed: results.length,
          average_confidence: results.length > 0 ? 
            Math.round(results.reduce((sum, r) => sum + r.enhanced_persona.primary_persona.confidence, 0) / results.length) : 0,
          personas_detected: [...new Set(results.map(r => r.enhanced_persona.primary_persona.title))],
          growth_stages: [...new Set(results.map(r => r.enhanced_persona.company_context.growth_stage))]
        },
        pipeline_completed_at: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ Batch enhanced analysis error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during batch enhanced analysis'
    });
  }
});

/**
 * GET /api/enhanced-persona-detection/health
 * Health check for enhanced persona detection service
 */
router.get('/health', async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('🏥 Checking enhanced persona detection service health');

    const enhancedPersonaDetector = new EnhancedPersonaDetector();
    const serviceStatus = enhancedPersonaDetector.getServiceStatus();
    
    // Test enhanced detection functionality
    const testResult = await enhancedPersonaDetector.testEnhancedDetection();

    if (testResult.success && serviceStatus.available) {
      console.log('✅ Enhanced persona detection service health check passed');
      return res.json({
        success: true,
        message: 'Enhanced persona detection service is operational',
        service_status: serviceStatus,
        test_result: testResult.message,
        capabilities: {
          persona_depth: 'Deep persona insights with buying context',
          company_analysis: 'Growth stage and technology maturity detection',
          buying_signals: 'Urgency, budget, timing, and competitive analysis',
          validation: 'Consistency scoring and contradiction detection'
        },
        timestamp: new Date().toISOString()
      });
    } else {
      console.error(`❌ Enhanced persona detection service health check failed: ${testResult.message}`);
      return res.status(503).json({
        success: false,
        error: 'Enhanced persona detection service not operational',
        service_status: serviceStatus,
        test_result: testResult.message,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error: any) {
    console.error('❌ Enhanced persona detection health check error:', error);
    return res.status(500).json({
      success: false,
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/enhanced-persona-detection/analysis-framework
 * Get information about the enhanced analysis framework and capabilities
 */
router.get('/analysis-framework', (req: Request, res: Response) => {
  const analysisFramework = {
    persona_detection: {
      depth_levels: [
        'Basic role identification (VP Sales, CEO, etc.)',
        'Seniority and decision authority mapping',
        'Department and functional responsibility analysis',
        'Secondary persona and influence network detection'
      ],
      confidence_factors: [
        'Explicit role mentions in content',
        'Decision-making language patterns',
        'Authority and responsibility indicators',
        'Cross-validation across multiple signals'
      ]
    },
    company_context: {
      growth_stage_detection: {
        startup: 'Early stage, funding mentions, scaling challenges',
        'scale-up': 'Rapid growth, hiring sprees, process optimization',
        mature: 'Established processes, efficiency focus, market expansion',
        enterprise: 'Complex hierarchies, compliance, legacy system mentions'
      },
      size_indicators: [
        'Team size references',
        'Department structure mentions',
        'Process complexity signals',
        'Technology stack sophistication'
      ],
      technology_maturity: {
        'early-adopter': 'Cutting-edge tools, beta testing, innovation focus',
        mainstream: 'Proven solutions, ROI-focused, best practices',
        conservative: 'Established vendors, security-first, gradual adoption'
      }
    },
    buying_signals: {
      urgency_detection: [
        'Time-sensitive language ("need now", "urgent", "ASAP")',
        'Deadline mentions (quarter end, fiscal year)',
        'Competitive pressure indicators',
        'Problem severity escalation'
      ],
      budget_analysis: [
        'Investment capacity signals',
        'Cost justification language',
        'ROI and value emphasis',
        'Budget cycle timing'
      ],
      readiness_assessment: {
        'ready-to-buy': 'Evaluation complete, vendor selection phase',
        evaluating: 'Active solution comparison, RFP process',
        'problem-aware': 'Issue identified, solution research phase',
        unaware: 'Educational content, problem discovery'
      }
    },
    validation_framework: {
      consistency_scoring: 'Cross-signal validation across content',
      contradiction_detection: 'Conflicting persona or context indicators',
      confidence_building: 'Factors that increase analysis reliability'
    }
  };

  res.json({
    success: true,
    data: {
      analysis_framework: analysisFramework,
      supported_personas: [
        'C-Suite (CEO, CRO, CMO, CFO, CTO, CPO)',
        'VP-Level (VP Sales, VP Marketing, VP Customer Success)',
        'Director-Level (Sales Director, Marketing Director)',
        'Manager-Level (Sales Manager, Marketing Manager, RevOps)',
        'Individual Contributors (SDR, AE, CSM, BDR)'
      ],
      output_quality_levels: {
        high: 'Confidence ≥75%, consistent signals, clear buying context',
        medium: 'Confidence 50-74%, some signals, moderate context',
        low: 'Confidence <50%, weak signals, limited context'
      }
    }
  });
});

export default router;
