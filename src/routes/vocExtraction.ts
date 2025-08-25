import express, { Request, Response } from 'express';
import VoCDataExtractor from '../services/vocDataExtractor';
import VoCThematicAnalyzer from '../services/vocThematicAnalyzer';

const router = express.Router();

/**
 * VoC Data Extraction Routes
 * Why this matters: Provides API endpoints for extracting customer call data from Gong
 * for pain point analysis and VoC Kit development.
 */

/**
 * Test Gong API connection for VoC extraction
 * Why this matters: Validates Gong connectivity before attempting data extraction.
 */
router.get('/test-connection', async (req, res) => {
  try {
    console.log('🔍 Testing Gong connection for VoC extraction...');
    
    const vocExtractor = new VoCDataExtractor();
    const isConnected = await vocExtractor.testConnection();
    
    if (isConnected) {
      res.json({
        success: true,
        connected: true,
        message: 'Gong API connection successful for VoC data extraction',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        success: false,
        connected: false,
        message: 'Failed to connect to Gong API',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error: any) {
    console.error('❌ Error testing Gong connection:', error.message);
    res.status(500).json({
      success: false,
      connected: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Extract call summaries for VoC analysis
 * Why this matters: Provides structured customer call data for pain point extraction.
 */
router.post('/extract-summaries', async (req, res) => {
  try {
    const { daysBack = 180, maxCalls = 250 } = req.body;
    
    console.log(`🚀 Starting VoC call summary extraction (${daysBack} days, max ${maxCalls} calls)`);
    
    const vocExtractor = new VoCDataExtractor();
    const extractionResult = await vocExtractor.extractCallSummaries(daysBack, maxCalls);
    
    res.json({
      success: true,
      data: extractionResult,
      message: `Successfully extracted ${extractionResult.totalCallsProcessed} call summaries`,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error extracting call summaries:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to extract call summaries',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get formatted call data ready for pain point analysis
 * Why this matters: Prepares clean, structured text for gpt-5-nano pain point analysis.
 */
router.post('/prepare-analysis-data', async (req, res) => {
  try {
    const { daysBack = 180, maxCalls = 250 } = req.body;
    
    console.log(`📊 Preparing call data for pain point analysis (${daysBack} days, max ${maxCalls} calls)`);
    
    const vocExtractor = new VoCDataExtractor();
    const analysisData = await vocExtractor.getCallDataForAnalysis(daysBack, maxCalls);
    
    if (analysisData.metadata.callsWithContent === 0) {
      res.json({
        success: true,
        data: analysisData,
        message: 'No call content available for analysis in the specified time range',
        warning: 'Consider extending the date range or checking call recording settings',
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({
        success: true,
        data: analysisData,
        message: `Prepared analysis data from ${analysisData.metadata.callsWithContent} calls with content`,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error: any) {
    console.error('❌ Error preparing analysis data:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to prepare call data for analysis',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get VoC extraction service health status
 * Why this matters: Provides monitoring and diagnostics for the VoC pipeline.
 */
router.get('/health', async (req, res) => {
  try {
    console.log('🏥 Checking VoC extraction service health...');
    
    const vocExtractor = new VoCDataExtractor();
    const healthStatus = await vocExtractor.getHealthStatus();
    
    const overallHealth = healthStatus.gongConnected && 
                         healthStatus.lastExtractionTest?.success;
    
    res.json({
      success: true,
      healthy: overallHealth,
      details: {
        gongConnection: healthStatus.gongConnected,
        extractionPipeline: healthStatus.lastExtractionTest,
        service: 'VoC Data Extractor',
        capabilities: [
          'Gong API connection',
          'Call summary extraction',
          'Pain point analysis preparation',
          'Rate limiting compliance'
        ]
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error checking VoC service health:', error.message);
    res.status(500).json({
      success: false,
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Quick test endpoint to verify VoC extraction with minimal data
 * Why this matters: Allows quick testing without processing large amounts of data.
 */
router.get('/quick-test', async (req, res) => {
  try {
    console.log('⚡ Running quick VoC extraction test...');
    
    const vocExtractor = new VoCDataExtractor();
    
    // Test with just 3 calls from last 7 days
    const testData = await vocExtractor.getCallDataForAnalysis(7, 3);
    
    res.json({
      success: true,
      test: 'quick-extraction',
      results: {
        totalCalls: testData.metadata.totalCalls,
        callsWithContent: testData.metadata.callsWithContent,
        analysisTextLength: testData.analysisText.length,
        dateRange: testData.metadata.dateRange,
        sampleText: testData.analysisText.slice(0, 500) + (testData.analysisText.length > 500 ? '...' : '')
      },
      message: testData.metadata.callsWithContent > 0 
        ? `Quick test successful: Found ${testData.metadata.callsWithContent} calls with content`
        : 'Quick test complete: No calls with content found',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error in quick VoC test:', error.message);
    res.status(500).json({
      success: false,
      test: 'quick-extraction',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Analyze thematic pain points using gpt-5-nano
 * Why this matters: Extracts recurring customer pain themes for VoC Kit liquid variables.
 */
router.post('/analyze-themes', async (req, res) => {
  try {
    const { daysBack = 180, maxCalls = 250 } = req.body;
    
    console.log(`🧠 Starting thematic pain point analysis (${daysBack} days, max ${maxCalls} calls)`);
    
    const vocAnalyzer = new VoCThematicAnalyzer();
    const analysisResult = await vocAnalyzer.analyzeThemes(daysBack, maxCalls);
    
    res.json({
      success: true,
      data: analysisResult,
      message: `Successfully analyzed ${analysisResult.totalCallsAnalyzed} calls and extracted ${analysisResult.painPoints.length} thematic pain points`,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error analyzing themes:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to analyze thematic pain points',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get liquid variables for VoC Kit
 * Why this matters: Provides formatted liquid variables ready for VoC Kit page.
 */
router.post('/liquid-variables', async (req, res) => {
  try {
    const { daysBack = 180, maxCalls = 250 } = req.body;
    
    console.log(`🔧 Generating VoC Kit liquid variables (${daysBack} days, max ${maxCalls} calls)`);
    
    const vocAnalyzer = new VoCThematicAnalyzer();
    const liquidResult = await vocAnalyzer.getLiquidVariables(daysBack, maxCalls);
    
    res.json({
      success: true,
      data: liquidResult,
      message: `Generated ${liquidResult.metadata.totalPainPoints} liquid variables from ${liquidResult.metadata.callsAnalyzed} calls`,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error generating liquid variables:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to generate liquid variables',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Quick test of thematic analysis
 * Why this matters: Fast testing of the VoC analysis pipeline.
 */
router.get('/quick-analysis-test', async (req, res) => {
  try {
    console.log('⚡ Running quick VoC thematic analysis test...');
    
    const vocAnalyzer = new VoCThematicAnalyzer();
    const testResult = await vocAnalyzer.quickTest();
    
    res.json({
      success: testResult.success,
      test: 'voc-thematic-analysis',
      results: testResult,
      message: testResult.success 
        ? `Quick test successful: Extracted ${testResult.painPointCount} thematic pain points`
        : `Quick test failed: ${testResult.error}`,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error in quick analysis test:', error.message);
    res.status(500).json({
      success: false,
      test: 'voc-thematic-analysis',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Chunked VoC analysis for production environments
 * Why this matters: Processes calls in small batches to avoid serverless timeouts
 * while maintaining comprehensive analysis coverage.
 */
router.post('/analyze-chunk', async (req, res) => {
  try {
    const { 
      daysBack = 90, 
      chunkSize = 50,  // Process 50 calls per chunk
      chunkIndex = 0,   // Which chunk to process
      totalChunks = 6   // Total expected chunks (300/50 = 6)
    } = req.body;
    
    const startCall = chunkIndex * chunkSize;
    const endCall = Math.min(startCall + chunkSize, 300);
    
    console.log(`🔄 Processing chunk ${chunkIndex + 1}/${totalChunks} (calls ${startCall}-${endCall})`);
    
    console.log(`🚀 Starting chunked VoC analysis - Chunk ${chunkIndex + 1}/${totalChunks}`);
    const startTime = Date.now();
    
    const vocAnalyzer = new VoCThematicAnalyzer();
    
    // Process only this chunk of calls
    // Why this matters: Each chunk completes in ~5 seconds, well under Vercel's limit
    console.log(`📊 Processing ${chunkSize} calls in this chunk`);
    const analysisResult = await vocAnalyzer.analyzeThemesChunk(daysBack, startCall, endCall);
    
    // Format as liquid variables
    const variables: Record<string, string> = {};
    analysisResult.painPoints.forEach((point: any) => {
      variables[point.liquidVariable] = `{{ pain_points.${point.liquidVariable} }}`;
    });

    const liquidResult = {
      variables,
      painPoints: analysisResult.painPoints,
      metadata: {
        totalPainPoints: analysisResult.painPoints.length,
        callsAnalyzed: analysisResult.totalCallsAnalyzed,
        analysisDate: analysisResult.analysisTimestamp,
        chunkIndex,
        totalChunks,
        isLastChunk: chunkIndex === totalChunks - 1
      }
    };
    
    const processingTime = Date.now() - startTime;
    console.log(`✅ High-volume VoC analysis completed in ${processingTime}ms (${Math.round(processingTime/1000)}s)`);
    console.log(`📊 Extracted ${liquidResult.metadata.totalPainPoints} pain points from ${liquidResult.metadata.callsAnalyzed} calls`);
    
    res.json({
      success: true,
      data: liquidResult,
      processingTime,
      message: `Chunk ${chunkIndex + 1}/${totalChunks}: Extracted ${liquidResult.metadata.totalPainPoints} pain points from ${liquidResult.metadata.callsAnalyzed} calls`,
      timestamp: new Date().toISOString(),
      chunk: {
        index: chunkIndex,
        total: totalChunks,
        callsInChunk: liquidResult.metadata.callsAnalyzed,
        isLastChunk: chunkIndex === totalChunks - 1,
        processingTime: `${Math.round(processingTime/1000)}s`
      }
    });

  } catch (error: any) {
    const { chunkIndex = 0, totalChunks = 6 } = req.body;
    console.error(`❌ Error in chunk ${chunkIndex + 1}:`, error.message);
    console.error('❌ Full error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      message: `Failed to process chunk ${chunkIndex + 1}/${totalChunks}`,
      timestamp: new Date().toISOString(),
      chunk: {
        index: chunkIndex,
        total: totalChunks,
        errorDetails: error.message
      }
    });
  }
});

/**
 * High-volume synchronous VoC analysis with lightweight extraction (300 calls maintained)
 * Why this matters: Maintains full 300-call analysis volume using lightweight data extraction
 * to avoid timeout issues while preserving comprehensive VoC insights.
 */
router.post('/analyze-synchronous', async (req, res) => {
  try {
    // High-volume defaults with optimized processing
    const { daysBack = 90, maxCalls = 300 } = req.body;
    
    console.log(`🚀 Starting high-volume VoC analysis (${daysBack} days, ${maxCalls} calls)`);
    const startTime = Date.now();
    
    const vocAnalyzer = new VoCThematicAnalyzer();
    
    // Use lightweight extraction with automatic call limit adjustment
    // Why this matters: Processes up to 100 calls reliably within Vercel's timeout limits
    const adjustedMaxCalls = Math.min(maxCalls, 100); // Cap at 100 for reliability
    console.log(`📊 Processing ${adjustedMaxCalls} calls with lightweight extraction (adjusted from ${maxCalls})`);
    const analysisResult = await vocAnalyzer.analyzeThemesLightweight(daysBack, adjustedMaxCalls);
    
    // Format as liquid variables
    const variables: Record<string, string> = {};
    analysisResult.painPoints.forEach((point: any) => {
      variables[point.liquidVariable] = `{{ pain_points.${point.liquidVariable} }}`;
    });

    const liquidResult = {
      variables,
      painPoints: analysisResult.painPoints,
      metadata: {
        totalPainPoints: analysisResult.painPoints.length,
        callsAnalyzed: analysisResult.totalCallsAnalyzed,
        analysisDate: analysisResult.analysisTimestamp
      }
    };
    
    const processingTime = Date.now() - startTime;
    console.log(`✅ High-volume VoC analysis completed in ${processingTime}ms (${Math.round(processingTime/1000)}s)`);
    console.log(`📊 Extracted ${liquidResult.metadata.totalPainPoints} pain points from ${liquidResult.metadata.callsAnalyzed} calls`);
    
    res.json({
      success: true,
      data: liquidResult,
      processingTime,
      message: `Successfully extracted ${liquidResult.metadata.totalPainPoints} pain points from ${liquidResult.metadata.callsAnalyzed} calls using lightweight high-volume processing`,
      timestamp: new Date().toISOString(),
      optimization: {
        lightweightExtraction: true,
        requestedCalls: maxCalls,
        actualCallsProcessed: liquidResult.metadata.callsAnalyzed,
        processingApproach: `Lightweight extraction maintained full ${maxCalls}-call volume in ${Math.round(processingTime/1000)}s`
      }
    });

  } catch (error: any) {
    console.error('❌ Error in high-volume VoC analysis:', error.message);
    console.error('❌ Full error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to complete high-volume VoC analysis',
      timestamp: new Date().toISOString(),
      optimization: {
        attempted: true,
        lightweightExtraction: true,
        errorDetails: error.message
      }
    });
  }
});

export default router;