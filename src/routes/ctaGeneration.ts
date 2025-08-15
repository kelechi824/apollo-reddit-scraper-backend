import { Router, Request, Response } from 'express';
import CTAGenerationService, { CTAGenerationResult } from '../services/ctaGenerationService';
import PersonaPainPointMatcher, { PersonaPainPointMatch } from '../services/personaPainPointMatcher';
import EnhancedPersonaDetector, { EnhancedPersonaResult } from '../services/enhancedPersonaDetector';
import ContentAnalysisService from '../services/contentAnalysisService';
import FirecrawlService from '../services/firecrawlService';
import CTAInsertionEngine, { CTAInsertionOptions } from '../services/ctaInsertionEngine';

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

    // Step 4: Use VoC Kit data for position-specific pain point matching
    console.log('🎯 Step 4: Using enhanced position-specific pain point matching...');
    
    // Use VoC Kit data if provided, otherwise fall back to fresh analysis
    let vocPainPoints = undefined;
    if (voc_kit_data && voc_kit_data.extractedPainPoints) {
      console.log(`📊 Using provided VoC Kit data with ${voc_kit_data.extractedPainPoints.length} pain points for enhanced variety`);
      vocPainPoints = voc_kit_data.extractedPainPoints;
    }

    // Step 5: Generate hyper-relevant CTAs with position-specific matching
    console.log('✨ Step 5: Generating diverse position-specific CTAs...');
    const ctaService = new CTAGenerationService();
    
    // Use the new position-specific matching method for enhanced variety
    const ctaResult = vocPainPoints && vocPainPoints.length > 0 
      ? await ctaService.generateCTAsWithPositionMatching(basicAnalysis, vocPainPoints, enhancedPersona, url)
      : await ctaService.generateCTAs(await new PersonaPainPointMatcher().matchPersonaToPainPoints(basicAnalysis, vocPainPoints), enhancedPersona, url);

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
      },
      article_content: {
        content: extractionResult.data.content,
        structure: extractionResult.data.structure,
        insertion_points: extractionResult.data.ctaInsertionPoints || []
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

    // Process text content with structure analysis
    const firecrawlService = new FirecrawlService();
    const articleData = firecrawlService.processTextContent(text);

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

    // Step 4: Use VoC Kit data for position-specific pain point matching
    console.log('🎯 Step 4: Using enhanced position-specific pain point matching...');
    
    // Use VoC Kit data if provided, otherwise fall back to fresh analysis
    let vocPainPoints = undefined;
    if (voc_kit_data && voc_kit_data.extractedPainPoints) {
      console.log(`📊 Using provided VoC Kit data with ${voc_kit_data.extractedPainPoints.length} pain points for enhanced variety`);
      vocPainPoints = voc_kit_data.extractedPainPoints;
    }

    // Step 5: Generate hyper-relevant CTAs with position-specific matching
    console.log('✨ Step 5: Generating diverse position-specific CTAs...');
    const ctaService = new CTAGenerationService();
    
    // Use the new position-specific matching method for enhanced variety
    const ctaResult = vocPainPoints && vocPainPoints.length > 0 
      ? await ctaService.generateCTAsWithPositionMatching(basicAnalysis, vocPainPoints, enhancedPersona, 'text-input')
      : await ctaService.generateCTAs(await new PersonaPainPointMatcher().matchPersonaToPainPoints(basicAnalysis, vocPainPoints), enhancedPersona, 'text-input');

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
      },
      article_content: {
        content: articleData.content,
        structure: articleData.structure,
        insertion_points: articleData.ctaInsertionPoints || []
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

    // Process markdown content with structure analysis
    const firecrawlService = new FirecrawlService();
    const articleData = firecrawlService.processMarkdownContent(markdown);

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

    // Step 4: Use VoC Kit data for position-specific pain point matching
    console.log('🎯 Step 4: Using enhanced position-specific pain point matching...');
    
    // Use VoC Kit data if provided, otherwise fall back to fresh analysis
    let vocPainPoints = undefined;
    if (voc_kit_data && voc_kit_data.extractedPainPoints) {
      console.log(`📊 Using provided VoC Kit data with ${voc_kit_data.extractedPainPoints.length} pain points for enhanced variety`);
      vocPainPoints = voc_kit_data.extractedPainPoints;
    }

    // Step 5: Generate hyper-relevant CTAs with position-specific matching
    console.log('✨ Step 5: Generating diverse position-specific CTAs...');
    const ctaService = new CTAGenerationService();
    
    // Use the new position-specific matching method for enhanced variety
    const ctaResult = vocPainPoints && vocPainPoints.length > 0 
      ? await ctaService.generateCTAsWithPositionMatching(basicAnalysis, vocPainPoints, enhancedPersona, 'markdown-input')
      : await ctaService.generateCTAs(await new PersonaPainPointMatcher().matchPersonaToPainPoints(basicAnalysis, vocPainPoints), enhancedPersona, 'markdown-input');

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
      },
      article_content: {
        content: articleData.content,
        structure: articleData.structure,
        insertion_points: articleData.ctaInsertionPoints || []
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

/**
 * POST /api/cta-generation/insert-ctas
 * Insert generated CTAs into article content for preview and export
 * Why this matters: Creates preview-ready HTML with CTAs inserted at optimal positions.
 */
router.post('/insert-ctas', async (req: Request, res: Response): Promise<any> => {
  try {
    const { 
      article_content, 
      cta_generation_result, 
      options 
    } = req.body;

    if (!article_content || !cta_generation_result) {
      return res.status(400).json({
        success: false,
        error: 'article_content and cta_generation_result are required'
      });
    }

    console.log(`🎯 Inserting CTAs into article: "${article_content.title}"`);
    const startTime = Date.now();

    const insertionEngine = new CTAInsertionEngine();
    const insertionOptions: CTAInsertionOptions = {
      format: 'html',
      style: 'full',
      includeContainer: true,
      responsiveDesign: true,
      apolloBranding: true,
      ...options
    };

    const result = await insertionEngine.insertCTAsIntoArticle(
      article_content,
      cta_generation_result,
      insertionOptions
    );

    const processingTime = Date.now() - startTime;
    console.log(`✅ CTA insertion complete in ${processingTime}ms`);

    return res.json({
      success: true,
      data: {
        ...result,
        processing_metadata: {
          processing_time_ms: processingTime,
          insertion_options: insertionOptions
        }
      }
    });

  } catch (error: any) {
    console.error('❌ CTA insertion failed:', error);
    return res.status(500).json({
      success: false,
      error: 'CTA insertion failed',
      details: error.message
    });
  }
});

/**
 * POST /api/cta-generation/generate-and-insert
 * Complete pipeline: Generate CTAs and insert them into article for immediate preview
 * Why this matters: One-step process to get preview-ready article with CTAs inserted.
 */
router.post('/generate-and-insert', async (req: Request, res: Response): Promise<any> => {
  try {
    const { 
      url, 
      text, 
      markdown, 
      enhanced_analysis = true, 
      voc_kit_data,
      insertion_options 
    } = req.body;

    // Determine input method
    let inputMethod = 'url';
    let inputContent = url;
    
    if (text) {
      inputMethod = 'text';
      inputContent = text;
    } else if (markdown) {
      inputMethod = 'markdown';
      inputContent = markdown;
    }

    if (!inputContent) {
      return res.status(400).json({
        success: false,
        error: 'One of url, text, or markdown is required'
      });
    }

    console.log(`🎯 Starting complete CTA generation and insertion pipeline (${inputMethod})`);
    const startTime = Date.now();

    // Step 1: Extract/Process article content
    const firecrawlService = new FirecrawlService();
    let articleData;

    if (inputMethod === 'url') {
      const extractionResult = await firecrawlService.extractArticleContent(inputContent);
      if (!extractionResult.success || !extractionResult.data) {
        return res.status(400).json({
          success: false,
          error: `Article extraction failed: ${extractionResult.error}`,
          stage: 'extraction'
        });
      }
      articleData = extractionResult.data;
    } else if (inputMethod === 'text') {
      articleData = firecrawlService.processTextContent(inputContent);
    } else {
      articleData = firecrawlService.processMarkdownContent(inputContent);
    }

    console.log(`✅ Content processed: ${articleData.wordCount} words`);

    // Step 2: Analyze content for persona detection
    const contentAnalysisService = new ContentAnalysisService();
    const basicAnalysis = await contentAnalysisService.analyzeArticleContent(articleData);

    // Step 3: Enhanced persona detection (optional)
    let enhancedPersona: EnhancedPersonaResult | undefined;
    if (enhanced_analysis) {
      const enhancedDetector = new EnhancedPersonaDetector();
      enhancedPersona = await enhancedDetector.enhancePersonaDetection(
        articleData,
        basicAnalysis
      );
    }

    // Step 4: Match persona to pain points
    const painPointMatcher = new PersonaPainPointMatcher();
    let vocPainPoints = undefined;
    if (voc_kit_data && voc_kit_data.extractedPainPoints) {
      vocPainPoints = voc_kit_data.extractedPainPoints;
    }
    const painPointMatch = await painPointMatcher.matchPersonaToPainPoints(basicAnalysis, vocPainPoints);

    // Step 5: Generate CTAs
    const ctaService = new CTAGenerationService();
    const ctaResult = await ctaService.generateCTAs(painPointMatch, enhancedPersona, inputContent);

    // Step 6: Insert CTAs into article
    const insertionEngine = new CTAInsertionEngine();
    const insertionOptionsConfig: CTAInsertionOptions = {
      format: 'html',
      style: 'full',
      includeContainer: true,
      responsiveDesign: true,
      apolloBranding: true,
      ...insertion_options
    };

    const insertionResult = await insertionEngine.insertCTAsIntoArticle(
      articleData,
      ctaResult,
      insertionOptionsConfig
    );

    const totalProcessingTime = Date.now() - startTime;
    console.log(`✅ Complete CTA generation and insertion pipeline complete in ${totalProcessingTime}ms`);

    return res.json({
      success: true,
      data: {
        original_article: articleData,
        generated_ctas: ctaResult,
        enhanced_article: insertionResult,
        pipeline_metadata: {
          input_method: inputMethod,
          total_processing_time_ms: totalProcessingTime,
          stages_completed: enhanced_analysis ? 6 : 5,
          article_word_count: articleData.wordCount,
          enhanced_analysis_used: enhanced_analysis,
          insertion_options: insertionOptionsConfig
        }
      }
    });

  } catch (error: any) {
    console.error('❌ Complete CTA generation and insertion pipeline failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Complete pipeline failed',
      details: error.message
    });
  }
});

/**
 * POST /api/cta-generation/export-html
 * Export article with CTAs as clean HTML for copy-paste
 * Why this matters: Provides production-ready HTML for immediate use in websites, emails, etc.
 */
router.post('/export-html', async (req: Request, res: Response): Promise<any> => {
  try {
    const { 
      enhanced_article, 
      export_options 
    } = req.body;

    if (!enhanced_article) {
      return res.status(400).json({
        success: false,
        error: 'enhanced_article with inserted CTAs is required'
      });
    }

    console.log(`📤 Exporting HTML for article: "${enhanced_article.originalArticle.title}"`);

    // Apply export-specific formatting
    const exportOptions = {
      includeInlineStyles: true,
      emailOptimized: false,
      includeApolloMeta: true,
      ...export_options
    };

    let exportHTML = enhanced_article.enhancedHtml;

    // Add export-specific metadata and styling
    if (exportOptions.includeApolloMeta) {
      const apolloMeta = `
<!-- Generated by Apollo CTA Creator -->
<!-- Article: ${enhanced_article.originalArticle.title} -->
<!-- Generated: ${new Date().toISOString()} -->
<!-- CTAs Inserted: ${enhanced_article.insertionMetadata.totalCTAsInserted} -->
`;
      exportHTML = apolloMeta + exportHTML;
    }

    // Email optimization
    if (exportOptions.emailOptimized) {
      // Convert responsive styles to fixed widths for email clients
      exportHTML = exportHTML.replace(/max-width:\s*600px/g, 'width: 600px');
      exportHTML = exportHTML.replace(/border-radius:\s*[^;]+;/g, ''); // Remove border-radius for Outlook
    }

    const exportResult = {
      html: exportHTML,
      metadata: {
        original_title: enhanced_article.originalArticle.title,
        word_count: enhanced_article.insertionMetadata.enhancedWordCount,
        ctas_count: enhanced_article.insertionMetadata.totalCTAsInserted,
        export_timestamp: new Date().toISOString(),
        export_options: exportOptions
      }
    };

    return res.json({
      success: true,
      data: exportResult
    });

  } catch (error: any) {
    console.error('❌ HTML export failed:', error);
    return res.status(500).json({
      success: false,
      error: 'HTML export failed',
      details: error.message
    });
  }
});

/**
 * GET /api/cta-generation/insertion-engine/status
 * Get CTA insertion engine status
 * Why this matters: Health check for the insertion engine service.
 */
router.get('/insertion-engine/status', async (req: Request, res: Response): Promise<any> => {
  try {
    const insertionEngine = new CTAInsertionEngine();
    const serviceStatus = insertionEngine.getServiceStatus();

    return res.json({
      success: true,
      status: serviceStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ CTA insertion engine status check failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Status check failed',
      details: error.message
    });
  }
});

/**
 * POST /api/cta-generation/apply-placements
 * Apply CTA placements and generate final HTML
 * Why this matters: Processes user's final CTA placement selections and generates
 * clean, production-ready HTML that can be directly used in CMS platforms.
 */
router.post('/apply-placements', async (req: Request, res: Response): Promise<any> => {
  try {
    const { 
      original_content, 
      article_structure, 
      selected_placements, 
      input_method 
    } = req.body;

    // Validate required fields
    if (!original_content || !article_structure || !selected_placements) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: original_content, article_structure, selected_placements'
      });
    }

    console.log('Applying CTA placements:', {
      content_length: original_content.length,
      placement_count: Object.keys(selected_placements).length,
      input_method
    });

    // Initialize CTA insertion engine
    const ctaEngine = new CTAInsertionEngine();

    // Generate final HTML with selected CTAs
    const finalHtml = await ctaEngine.generateFinalHTML({
      originalContent: original_content,
      articleStructure: article_structure,
      selectedPlacements: selected_placements,
      inputMethod: input_method
    });

    // Generate alternative formats
    const alternativeFormats = await ctaEngine.generateAlternativeFormats({
      originalContent: original_content,
      selectedPlacements: selected_placements,
      inputMethod: input_method
    });

    return res.json({
      success: true,
      data: {
        final_html: finalHtml,
        formats: alternativeFormats,
        placement_summary: {
          total_ctas: Object.keys(selected_placements).length,
          positions: Object.keys(selected_placements).map(key => {
            const [type, index] = key.split('_');
            return { type, paragraph_index: parseInt(index) };
          })
        },
        generation_metadata: {
          timestamp: new Date().toISOString(),
          input_method,
          content_length: original_content.length
        }
      }
    });

  } catch (error: any) {
    console.error('Error applying CTA placements:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to apply CTA placements',
      details: error.message
    });
  }
});

/**
 * POST /api/cta-generation/preview-placement
 * Generate preview HTML for specific CTA placement
 * Why this matters: Allows real-time preview of individual CTA placements
 * without generating the complete final HTML.
 */
router.post('/preview-placement', async (req: Request, res: Response): Promise<any> => {
  try {
    const { 
      content_snippet, 
      cta_variant, 
      placement_position 
    } = req.body;

    if (!content_snippet || !cta_variant) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: content_snippet, cta_variant'
      });
    }

    const ctaEngine = new CTAInsertionEngine();
    const previewHtml = await ctaEngine.renderCTAPreview({
      contentSnippet: content_snippet,
      ctaVariant: cta_variant,
      position: placement_position || 'middle'
    });

    return res.json({
      success: true,
      data: {
        preview_html: previewHtml
      }
    });

  } catch (error: any) {
    console.error('Error generating CTA preview:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate CTA preview',
      details: error.message
    });
  }
});

export default router;
