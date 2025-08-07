import { Router, Request, Response } from 'express';
import CTAGenerationService, { CTAGenerationResult } from '../services/ctaGenerationService';
import PersonaPainPointMatcher, { PersonaPainPointMatch } from '../services/personaPainPointMatcher';
import EnhancedPersonaDetector, { EnhancedPersonaResult } from '../services/enhancedPersonaDetector';
import ContentAnalysisService from '../services/contentAnalysisService';
import FirecrawlService from '../services/firecrawlService';

const router = Router();

/**
 * CTA Generation Routes
 * Why this matters: Provides API endpoints for generating hyper-relevant CTAs using
 * persona-pain point matching and Voice of Customer insights for maximum conversion impact.
 */

/**
 * POST /api/cta-generation/generate-from-url
 * Complete pipeline: Extract article → detect persona → match pain points → generate CTAs
 * Why this matters: End-to-end CTA generation from article URL using all analysis layers.
 */
router.post('/generate-from-url', async (req: Request, res: Response): Promise<any> => {
  try {
    const { url, enhanced_analysis = true, voc_kit_data } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    console.log(`🎯 Starting complete CTA generation pipeline for: ${url}`);
    const startTime = Date.now();

    // Step 1: Extract article content
    console.log('📄 Step 1: Extracting article content...');
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

    // Step 2: Analyze content for basic persona detection
    console.log('🧠 Step 2: Analyzing content for persona detection...');
    const contentAnalysisService = new ContentAnalysisService();
    const basicAnalysis = await contentAnalysisService.analyzeArticleContent(extractionResult.data);

    console.log(`✅ Basic persona detected: ${basicAnalysis.persona} (${basicAnalysis.confidence_score}% confidence)`);

    // Step 3: Enhanced persona detection (optional)
    let enhancedPersona: EnhancedPersonaResult | undefined;
    if (enhanced_analysis) {
      console.log('🔍 Step 3: Running enhanced persona detection...');
      const enhancedDetector = new EnhancedPersonaDetector();
      enhancedPersona = await enhancedDetector.enhancePersonaDetection(
        extractionResult.data,
        basicAnalysis
      );
      console.log(`✅ Enhanced persona analysis complete: ${enhancedPersona?.primary_persona.confidence}% confidence`);
    }

    // Step 4: Match persona to pain points
    console.log('🎯 Step 4: Matching persona to VoC pain points...');
    const painPointMatcher = new PersonaPainPointMatcher();
    
    // Use VoC Kit data if provided, otherwise fall back to fresh analysis
    let vocPainPoints = undefined;
    if (voc_kit_data && voc_kit_data.extractedPainPoints) {
      console.log(`📊 Using provided VoC Kit data with ${voc_kit_data.extractedPainPoints.length} pain points`);
      vocPainPoints = voc_kit_data.extractedPainPoints;
    }
    
    const painPointMatch = await painPointMatcher.matchPersonaToPainPoints(basicAnalysis, vocPainPoints);

    console.log(`✅ Matched ${painPointMatch.matched_pain_points.length} pain points (${painPointMatch.matching_confidence}% confidence)`);

    // Step 5: Generate hyper-relevant CTAs
    console.log('✨ Step 5: Generating hyper-relevant CTAs...');
    const ctaService = new CTAGenerationService();
    const ctaResult = await ctaService.generateCTAs(painPointMatch, enhancedPersona, url);

    const processingTime = Date.now() - startTime;
    console.log(`✅ CTA generation complete in ${processingTime}ms`);

    return res.json({
      success: true,
      data: {
        ...ctaResult,
        pipeline_metadata: {
          processing_time_ms: processingTime,
          stages_completed: enhanced_analysis ? 5 : 4,
          article_word_count: extractionResult.data.wordCount,
          enhanced_analysis_used: enhanced_analysis
        }
      }
    });

  } catch (error: any) {
    console.error('❌ CTA generation pipeline failed:', error);
    return res.status(500).json({
      success: false,
      error: 'CTA generation pipeline failed',
      details: error.message
    });
  }
});

/**
 * POST /api/cta-generation/generate-from-text
 * Complete pipeline: Analyze text → detect persona → match pain points → generate CTAs
 * Why this matters: End-to-end CTA generation from direct text/HTML input using all analysis layers.
 */
router.post('/generate-from-text', async (req: Request, res: Response): Promise<any> => {
  try {
    const { text, enhanced_analysis = true, voc_kit_data } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text content is required'
      });
    }

    console.log(`🎯 Starting CTA generation pipeline for text content (${text.length} chars)`);
    const startTime = Date.now();

    // Create article data structure from text
    const articleData = {
      title: 'Direct Text Input',
      content: text,
      wordCount: text.split(/\s+/).length,
      url: 'text-input',
      extractedAt: new Date().toISOString(),
      metadata: {
        description: 'Direct text/HTML input for CTA generation',
        author: 'User Input',
        publishDate: new Date().toISOString(),
        tags: ['direct-input', 'text-content']
      }
    };

    console.log(`✅ Text processed: ${articleData.wordCount} words`);

    // Step 2: Analyze content for basic persona detection
    console.log('🧠 Step 2: Analyzing content for persona detection...');
    const contentAnalysisService = new ContentAnalysisService();
    const basicAnalysis = await contentAnalysisService.analyzeArticleContent(articleData);

    console.log(`✅ Basic persona detected: ${basicAnalysis.persona} (${basicAnalysis.confidence_score}% confidence)`);

    // Step 3: Enhanced persona detection (optional)
    let enhancedPersona: EnhancedPersonaResult | undefined;
    if (enhanced_analysis) {
      console.log('🔍 Step 3: Running enhanced persona detection...');
      const enhancedDetector = new EnhancedPersonaDetector();
      enhancedPersona = await enhancedDetector.enhancePersonaDetection(
        articleData,
        basicAnalysis
      );
      console.log(`✅ Enhanced persona analysis complete: ${enhancedPersona?.primary_persona.confidence}% confidence`);
    }

    // Step 4: Match persona to pain points
    console.log('🎯 Step 4: Matching persona to VoC pain points...');
    const painPointMatcher = new PersonaPainPointMatcher();
    
    // Use VoC Kit data if provided, otherwise fall back to fresh analysis
    let vocPainPoints = undefined;
    if (voc_kit_data && voc_kit_data.extractedPainPoints) {
      console.log(`📊 Using provided VoC Kit data with ${voc_kit_data.extractedPainPoints.length} pain points`);
      vocPainPoints = voc_kit_data.extractedPainPoints;
    }
    
    const painPointMatch = await painPointMatcher.matchPersonaToPainPoints(basicAnalysis, vocPainPoints);

    console.log(`✅ Matched ${painPointMatch.matched_pain_points.length} pain points (${painPointMatch.matching_confidence}% confidence)`);

    // Step 5: Generate hyper-relevant CTAs
    console.log('✨ Step 5: Generating hyper-relevant CTAs...');
    const ctaService = new CTAGenerationService();
    const ctaResult = await ctaService.generateCTAs(painPointMatch, enhancedPersona, 'text-input');

    const processingTime = Date.now() - startTime;
    console.log(`✅ CTA generation complete in ${processingTime}ms`);

    return res.json({
      success: true,
      data: {
        ...ctaResult,
        pipeline_metadata: {
          processing_time_ms: processingTime,
          stages_completed: enhanced_analysis ? 5 : 4,
          article_word_count: articleData.wordCount,
          enhanced_analysis_used: enhanced_analysis
        }
      }
    });

  } catch (error: any) {
    console.error('❌ CTA generation pipeline failed:', error);
    return res.status(500).json({
      success: false,
      error: 'CTA generation pipeline failed',
      details: error.message
    });
  }
});

/**
 * POST /api/cta-generation/generate-from-markdown
 * Complete pipeline: Parse markdown → detect persona → match pain points → generate CTAs
 * Why this matters: End-to-end CTA generation from markdown content with proper parsing.
 */
router.post('/generate-from-markdown', async (req: Request, res: Response): Promise<any> => {
  try {
    const { markdown, enhanced_analysis = true, voc_kit_data } = req.body;

    if (!markdown) {
      return res.status(400).json({
        success: false,
        error: 'Markdown content is required'
      });
    }

    console.log(`🎯 Starting CTA generation pipeline for markdown content (${markdown.length} chars)`);
    const startTime = Date.now();

    // Simple markdown to text conversion for analysis
    // This removes markdown syntax but preserves the structure
    const textContent = markdown
      .replace(/#{1,6}\s+/g, '') // Remove headers
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
      .replace(/\*(.*?)\*/g, '$1') // Remove italic
      .replace(/`(.*?)`/g, '$1') // Remove inline code
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to just text
      .replace(/[-*+]\s+/g, '') // Remove list markers
      .replace(/\n{3,}/g, '\n\n') // Normalize line breaks
      .trim();

    // Create article data structure from markdown
    const articleData = {
      title: 'Markdown Content Input',
      content: textContent,
      wordCount: textContent.split(/\s+/).length,
      url: 'markdown-input',
      extractedAt: new Date().toISOString(),
      metadata: {
        description: 'Markdown content input for CTA generation',
        author: 'User Input',
        publishDate: new Date().toISOString(),
        tags: ['direct-input', 'markdown-content']
      }
    };

    console.log(`✅ Markdown processed: ${articleData.wordCount} words`);

    // Step 2: Analyze content for basic persona detection
    console.log('🧠 Step 2: Analyzing content for persona detection...');
    const contentAnalysisService = new ContentAnalysisService();
    const basicAnalysis = await contentAnalysisService.analyzeArticleContent(articleData);

    console.log(`✅ Basic persona detected: ${basicAnalysis.persona} (${basicAnalysis.confidence_score}% confidence)`);

    // Step 3: Enhanced persona detection (optional)
    let enhancedPersona: EnhancedPersonaResult | undefined;
    if (enhanced_analysis) {
      console.log('🔍 Step 3: Running enhanced persona detection...');
      const enhancedDetector = new EnhancedPersonaDetector();
      enhancedPersona = await enhancedDetector.enhancePersonaDetection(
        articleData,
        basicAnalysis
      );
      console.log(`✅ Enhanced persona analysis complete: ${enhancedPersona?.primary_persona.confidence}% confidence`);
    }

    // Step 4: Match persona to pain points
    console.log('🎯 Step 4: Matching persona to VoC pain points...');
    const painPointMatcher = new PersonaPainPointMatcher();
    
    // Use VoC Kit data if provided, otherwise fall back to fresh analysis
    let vocPainPoints = undefined;
    if (voc_kit_data && voc_kit_data.extractedPainPoints) {
      console.log(`📊 Using provided VoC Kit data with ${voc_kit_data.extractedPainPoints.length} pain points`);
      vocPainPoints = voc_kit_data.extractedPainPoints;
    }
    
    const painPointMatch = await painPointMatcher.matchPersonaToPainPoints(basicAnalysis, vocPainPoints);

    console.log(`✅ Matched ${painPointMatch.matched_pain_points.length} pain points (${painPointMatch.matching_confidence}% confidence)`);

    // Step 5: Generate hyper-relevant CTAs
    console.log('✨ Step 5: Generating hyper-relevant CTAs...');
    const ctaService = new CTAGenerationService();
    const ctaResult = await ctaService.generateCTAs(painPointMatch, enhancedPersona, 'markdown-input');

    const processingTime = Date.now() - startTime;
    console.log(`✅ CTA generation complete in ${processingTime}ms`);

    return res.json({
      success: true,
      data: {
        ...ctaResult,
        pipeline_metadata: {
          processing_time_ms: processingTime,
          stages_completed: enhanced_analysis ? 5 : 4,
          article_word_count: articleData.wordCount,
          enhanced_analysis_used: enhanced_analysis
        }
      }
    });

  } catch (error: any) {
    console.error('❌ CTA generation pipeline failed:', error);
    return res.status(500).json({
      success: false,
      error: 'CTA generation pipeline failed',
      details: error.message
    });
  }
});

/**
 * POST /api/cta-generation/generate-from-match
 * Generate CTAs from existing persona-pain point match
 * Why this matters: Allows CTA generation when you already have persona-pain point matching results.
 */
router.post('/generate-from-match', async (req: Request, res: Response): Promise<any> => {
  try {
    const { persona_pain_point_match, enhanced_persona, article_url } = req.body;

    if (!persona_pain_point_match) {
      return res.status(400).json({
        success: false,
        error: 'persona_pain_point_match is required'
      });
    }

    console.log(`🎯 Generating CTAs from existing match for persona: ${persona_pain_point_match.persona}`);

    const ctaService = new CTAGenerationService();
    const ctaResult = await ctaService.generateCTAs(
      persona_pain_point_match,
      enhanced_persona,
      article_url
    );

    return res.json({
      success: true,
      data: ctaResult
    });

  } catch (error: any) {
    console.error('❌ CTA generation from match failed:', error);
    return res.status(500).json({
      success: false,
      error: 'CTA generation from match failed',
      details: error.message
    });
  }
});

/**
 * POST /api/cta-generation/generate-single-position
 * Generate CTA for specific article position only
 * Why this matters: Allows generating individual CTAs for testing or specific position needs.
 */
router.post('/generate-single-position', async (req: Request, res: Response): Promise<any> => {
  try {
    const { 
      persona_pain_point_match, 
      position, 
      enhanced_persona, 
      article_url 
    } = req.body;

    if (!persona_pain_point_match || !position) {
      return res.status(400).json({
        success: false,
        error: 'persona_pain_point_match and position are required'
      });
    }

    if (!['beginning', 'middle', 'end'].includes(position)) {
      return res.status(400).json({
        success: false,
        error: 'position must be one of: beginning, middle, end'
      });
    }

    console.log(`🎯 Generating ${position} CTA for persona: ${persona_pain_point_match.persona}`);

    const ctaService = new CTAGenerationService();
    
    // Generate full CTAs and extract the requested position
    const fullResult = await ctaService.generateCTAs(
      persona_pain_point_match,
      enhanced_persona,
      article_url
    );

    const singlePositionResult = {
      article_url: fullResult.article_url,
      persona: fullResult.persona,
      position: position,
      cta: fullResult.cta_variants[position as keyof typeof fullResult.cta_variants],
      pain_point_context: fullResult.pain_point_context,
      generation_metadata: {
        ...fullResult.generation_metadata,
        total_variants: 1,
        requested_position: position
      }
    };

    return res.json({
      success: true,
      data: singlePositionResult
    });

  } catch (error: any) {
    console.error('❌ Single position CTA generation failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Single position CTA generation failed',
      details: error.message
    });
  }
});

/**
 * GET /api/cta-generation/test
 * Test CTA generation service functionality
 * Why this matters: Validates that the CTA generation service is working correctly.
 */
router.get('/test', async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('🧪 Testing CTA generation service...');

    const ctaService = new CTAGenerationService();
    const testResult = await ctaService.testCTAGeneration();

    return res.json({
      success: testResult.success,
      message: testResult.message,
      service_status: ctaService.getServiceStatus(),
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ CTA generation test failed:', error);
    return res.status(500).json({
      success: false,
      error: 'CTA generation test failed',
      details: error.message
    });
  }
});

/**
 * GET /api/cta-generation/status
 * Get CTA generation service status
 * Why this matters: Provides health check information for monitoring and debugging.
 */
router.get('/status', async (req: Request, res: Response): Promise<any> => {
  try {
    const ctaService = new CTAGenerationService();
    const serviceStatus = ctaService.getServiceStatus();

    return res.json({
      success: true,
      status: serviceStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ CTA generation status check failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Status check failed',
      details: error.message
    });
  }
});

/**
 * POST /api/cta-generation/preview
 * Preview CTAs without full generation (for testing prompts and pain point matching)
 * Why this matters: Allows previewing CTA concepts and pain point relevance before full generation.
 */
router.post('/preview', async (req: Request, res: Response): Promise<any> => {
  try {
    const { persona_pain_point_match, enhanced_persona } = req.body;

    if (!persona_pain_point_match) {
      return res.status(400).json({
        success: false,
        error: 'persona_pain_point_match is required'
      });
    }

    console.log(`👀 Previewing CTA concepts for persona: ${persona_pain_point_match.persona}`);

    // Extract pain point context for preview
    const topPainPoints = persona_pain_point_match.matched_pain_points.slice(0, 3);
    const customerQuotes = topPainPoints.flatMap((pp: any) => pp.customer_quotes).slice(0, 5);
    
    const preview = {
      persona: persona_pain_point_match.persona,
      pain_points_preview: topPainPoints.map((pp: any) => ({
        theme: pp.pain_point.theme,
        description: pp.pain_point.description,
        relevance_score: Math.round(pp.relevance_score * 100),
        severity: pp.pain_point.severity,
        sample_quotes: pp.customer_quotes.slice(0, 2)
      })),
      customer_language_sample: customerQuotes,
      content_context: persona_pain_point_match.content_context,
      cta_strategy_preview: {
        beginning: "Awareness-focused: Problem recognition and empathy",
        middle: "Consideration-focused: Solution differentiation and value",
        end: "Conversion-focused: Action and immediate value"
      },
      estimated_relevance: `${persona_pain_point_match.matching_confidence}% confidence`,
      enhanced_persona_available: !!enhanced_persona
    };

    return res.json({
      success: true,
      data: preview
    });

  } catch (error: any) {
    console.error('❌ CTA preview failed:', error);
    return res.status(500).json({
      success: false,
      error: 'CTA preview failed',
      details: error.message
    });
  }
});

export default router;
