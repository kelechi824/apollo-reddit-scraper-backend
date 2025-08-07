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
 * Why this matters: Prepares clean, structured text for gpt-4.1-nano pain point analysis.
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
 * Analyze thematic pain points using gpt-4.1-nano
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

// Simple in-memory job storage (in production, use Redis or database)
const analysisJobs = new Map();

/**
 * Start async VoC analysis job
 * Why this matters: Allows analysis to continue server-side while user navigates away.
 */
router.post('/start-analysis', async (req, res) => {
  try {
    const { daysBack = 180, maxCalls = 250 } = req.body;
    const jobId = `voc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`🚀 Starting async VoC analysis job ${jobId} (${daysBack} days, max ${maxCalls} calls)`);
    
    // Store job as processing
    analysisJobs.set(jobId, {
      status: 'processing',
      startTime: new Date().toISOString(),
      daysBack,
      maxCalls
    });
    
    // Start analysis in background
    (async () => {
      try {
        const vocAnalyzer = new VoCThematicAnalyzer();
        const liquidResult = await vocAnalyzer.getLiquidVariables(daysBack, maxCalls);
        
        // Update job with results
        analysisJobs.set(jobId, {
          status: 'completed',
          startTime: analysisJobs.get(jobId).startTime,
          completedTime: new Date().toISOString(),
          data: liquidResult
        });
        
        console.log(`✅ VoC analysis job ${jobId} completed successfully`);
        
      } catch (error: any) {
        console.error(`❌ VoC analysis job ${jobId} failed:`, error.message);
        analysisJobs.set(jobId, {
          status: 'failed',
          startTime: analysisJobs.get(jobId).startTime,
          failedTime: new Date().toISOString(),
          error: error.message
        });
      }
    })();
    
    res.json({
      success: true,
      jobId,
      message: 'VoC analysis job started',
      estimatedTime: '3-5 minutes',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error starting VoC analysis job:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to start VoC analysis job',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Check VoC analysis job status
 * Why this matters: Allows frontend to poll for job completion.
 */
router.get('/job-status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = analysisJobs.get(jobId);
    
    if (!job) {
      res.status(404).json({
        success: false,
        error: 'Job not found',
        message: `Analysis job ${jobId} not found`,
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    res.json({
      success: true,
      jobId,
      status: job.status,
      startTime: job.startTime,
      completedTime: job.completedTime,
      failedTime: job.failedTime,
      data: job.data,
      error: job.error,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error checking job status:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to check job status',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;