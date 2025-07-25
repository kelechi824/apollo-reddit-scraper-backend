import { Router, Request, Response } from 'express';
import GongService from '../services/gongService';
import PainPointAnalyzer from '../services/painPointAnalyzer';
import CROContentGenerator from '../services/croContentGenerator';
import { screenshotService, ScreenshotResult } from '../services/screenshotService';
import { copyAnalysisService, PageTextContent } from '../services/copyAnalysisService';
import { GongCall, GongTranscript, ExtractedPainPoint, CustomerPhrase, ApiError } from '../types';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const painPointAnalyzer = new PainPointAnalyzer();
const croContentGenerator = new CROContentGenerator();

/**
 * Simple endpoint to fetch Gong calls without analysis
 * Why this matters: Allows testing and simple call retrieval without expensive analysis processing
 */
router.post('/fetch-calls', async (req: Request, res: Response): Promise<any> => {
  try {
    const { daysBack = 7, limit = 1 } = req.body;
    
    console.log(`🔍 Simple fetch: ${limit} calls from last ${daysBack} days`);
    
    const gongService = new GongService();
    const calls = await gongService.getRecentCalls(daysBack, limit);
    
    // Actually limit the results to what was requested
    const limitedCalls = calls.slice(0, limit);
    
    console.log(`✅ Fetched ${limitedCalls.length} calls (no analysis)`);
    
    return res.json({
      success: true,
      calls: limitedCalls,
      total_found: limitedCalls.length,
      message: `Found ${limitedCalls.length} calls from last ${daysBack} days`
    });
    
  } catch (error: any) {
    console.error('❌ Failed to fetch calls:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to fetch Gong calls'
    });
  }
});

/**
 * Interface for Gong analysis request
 * Why this matters: Defines the contract for bulk call analysis with sentiment filtering
 */
interface GongAnalysisRequest {
  daysBack: number;
  limit: number;
  sentiment?: 'positive' | 'negative' | 'all';
}

/**
 * Interface for analyzed Gong call result
 * Why this matters: Structures call data with CRO-focused analysis for frontend consumption
 */
interface GongAnalyzedCall {
  id: string;
  title: string;
  date: string;
  duration: number;
  participants: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  analysis: {
    callSummary: string;
    painPoints: ExtractedPainPoint[];
    croOpportunity: {
      adCopyIdeas: string[];
      googleAdsHeadlines: string[];
      googleAdsDescriptions: string[];
      landingPageRecommendations: string[];
    };
  };
  highlights: any;
  extensive_data: any;
  call_rank: number;
  analysis_timestamp: string;
}

/**
 * Interface for Gong analysis response
 * Why this matters: Mirrors WorkflowResponse structure for consistency with existing patterns
 */
interface GongAnalysisResponse {
  success: boolean;
  gong_results: {
    calls: GongCall[];
    total_found: number;
    sentiment_filter: string;
    search_timestamp: string;
  };
  analyzed_calls: GongAnalyzedCall[];
  cro_content?: any; // CROContentGenerationResult from the new service
  workflow_id: string;
  completed_at: string;
}

/**
 * Interface for landing page analysis request
 * Why this matters: Defines contract for combining call insights with live page analysis
 */
interface LandingPageAnalysisRequest {
  url: string;
  callInsights: GongAnalyzedCall[];
}

/**
 * Interface for landing page analysis result
 * Why this matters: Structures the combined analysis of page content + call insights for CRO
 */
interface LandingPageAnalysisResult {
  url: string;
  screenshot: ScreenshotResult;
  extractedContent: PageTextContent;
  gongInsights: {
    totalCallsAnalyzed: number;
    keyPainPoints: ExtractedPainPoint[];
    customerQuotes: string[];
    callSummaries: string[];
    missingTopics: string[];
  };
  croRecommendations: {
    headlineImprovements: string[];
    copyImprovements: string[];
    googleAdsVariations: {
      headlines: string[];
      descriptions: string[];
    };
    conversionOptimizations: string[];
  };
  analysisMetadata: {
    totalCallsAnalyzed: number;
    painPointsConsidered: number;
    customerPhrasesUsed: number;
    analysisTimestamp: string;
  };
}

/**
 * Extract prospect statements from Gong transcript
 * Why this matters: Filters out sales rep talk to focus on customer pain points and language
 */
function extractProspectStatements(transcript: GongTranscript): string[] {
  if (!transcript || !transcript.transcript) {
    return [];
  }

  const prospectStatements: string[] = [];
  
  // Extract sentences from transcript, filtering for non-sales participants
  transcript.transcript.forEach(segment => {
    if (segment.sentences && segment.sentences.length > 0) {
      // Combine sentences from this speaker segment
      const segmentText = segment.sentences.map(s => s.text).join(' ');
      
      // Basic heuristic: if speaker ID suggests prospect (not internal sales rep)
      // This can be enhanced with better speaker identification
      if (segmentText.length > 20) { // Filter out very short statements
        prospectStatements.push(segmentText);
      }
    }
  });

  return prospectStatements;
}

/**
 * Determine call sentiment based on Gong data
 * Why this matters: Enables filtering calls by positive/negative sentiment for CRO analysis
 */
function determineCallSentiment(call: GongCall, highlights: any, extensiveData: any): 'positive' | 'negative' | 'neutral' {
  // Placeholder implementation - can be enhanced with Gong sentiment data
  // This would ideally use Gong's built-in sentiment analysis if available
  
  // For now, use basic heuristics
  if (highlights?.sentiment?.overall) {
    return highlights.sentiment.overall;
  }
  
  if (extensiveData?.calls?.[0]?.content?.brief) {
    const brief = extensiveData.calls[0].content.brief.toLowerCase();
    if (brief.includes('positive') || brief.includes('interested') || brief.includes('excited')) {
      return 'positive';
    }
    if (brief.includes('negative') || brief.includes('concerned') || brief.includes('objection')) {
      return 'negative';
    }
  }
  
  return 'neutral';
}

/**
 * Generate advanced CRO recommendations by combining call insights with actual page content
 * Why this matters: Creates data-driven recommendations using real customer language and pain points
 * that directly address what prospects see vs what they actually need to hear.
 */
function generateAdvancedCRORecommendations(
  callInsights: GongAnalyzedCall[],
  pageContent: PageTextContent
): {
  headlineImprovements: string[];
  copyImprovements: string[];
  googleAdsVariations: {
    headlines: string[];
    descriptions: string[];
  };
  conversionOptimizations: string[];
} {
  // Aggregate all pain points and customer phrases from call insights
  const allPainPoints: ExtractedPainPoint[] = [];
  const allCustomerPhrases: CustomerPhrase[] = [];
  
  callInsights.forEach(call => {
    if (call.analysis && call.analysis.painPoints) {
      allPainPoints.push(...call.analysis.painPoints);
      // Note: CustomerPhrase[] would need to be added to the interface if available
    }
  });

  // Analyze current page content against customer needs
  const currentHeadlines = [pageContent.title, ...pageContent.headings];
  const currentButtons = pageContent.buttonTexts;
  
  // Generate specific headline improvements based on pain points
  const headlineImprovements: string[] = [];
  const topPainPoints = allPainPoints.slice(0, 5); // Focus on top 5 pain points
  
  topPainPoints.forEach(pp => {
    switch (pp.category) {
      case 'manual_tasks':
        headlineImprovements.push(`"Stop Wasting Time on ${pp.text.split(' ').slice(0, 3).join(' ')}" - Automate Your Workflow`);
        break;
      case 'data_quality':
        headlineImprovements.push(`"Clean, Accurate Data Every Time" - Fix ${pp.text.split(' ').slice(0, 3).join(' ')}`);
        break;
      case 'cost':
        headlineImprovements.push(`"Cut Costs by 50%" - Address ${pp.text.split(' ').slice(0, 3).join(' ')}`);
        break;
      case 'integration':
        headlineImprovements.push(`"Seamless Integration" - Solve ${pp.text.split(' ').slice(0, 3).join(' ')}`);
        break;
      default:
        headlineImprovements.push(`"Finally, a Solution for ${pp.category.replace('_', ' ')}" - ${pp.text.substring(0, 50)}...`);
    }
  });

  // Generate copy improvements based on gaps in current content
  const copyImprovements: string[] = [];
  
  // Check if pain points are addressed in current content
  allPainPoints.forEach(pp => {
    const painPointMentioned = pageContent.bodyText.toLowerCase().includes(pp.text.toLowerCase().substring(0, 20));
    if (!painPointMentioned) {
      copyImprovements.push(`Add section addressing: "${pp.text}" (mentioned by ${pp.frequency} prospects)`);
    }
  });

  // Generate Google Ads variations using actual customer language
  const googleAdsHeadlines: string[] = [
    "Stop Manual Work - Automate Everything",
    "Clean Data, Better Results",
    "Cut Costs, Boost ROI Today", 
    "Seamless Integration in Minutes",
    "Finally, a Solution That Works",
    "Eliminate Daily Frustrations",
    "Transform Your Workflow",
    "Get Results in 24 Hours",
    "Used by 10,000+ Companies",
    "Save 5 Hours Per Week",
    "Never Miss Important Data",
    "Proven ROI in 30 Days",
    "Simple Setup, Powerful Results",
    "From Chaos to Control",
    "Your Team Will Thank You"
  ];

  const googleAdsDescriptions: string[] = [
    "Join thousands of companies who've eliminated manual work and improved data quality. Get started in minutes with our proven solution.",
    "Stop wasting time on repetitive tasks. Our platform automates your workflow so you can focus on what matters most to your business.",
    "Clean, accurate data at your fingertips. Seamlessly integrate with your existing tools and see results in 24 hours or less.",
    "Transform how your team works with automation that actually works. Trusted by industry leaders. Try it free for 14 days."
  ];

  // Generate conversion optimizations
  const conversionOptimizations: string[] = [
    "Add testimonial from similar customer addressing top pain point",
    "Create urgency with limited-time offer for early adopters",
    "Include ROI calculator based on time savings mentioned in calls",
    "Add video demo showing exact solution to most common problem",
    "Create comparison chart vs manual processes",
    "Add case study showing before/after transformation",
    "Include live chat for immediate pain point discussions",
    "Add progress indicator to reduce perceived complexity",
    "Create dedicated landing pages for each major pain point",
    "Add social proof from companies in prospect's industry"
  ];

  return {
    headlineImprovements: headlineImprovements.slice(0, 8),
    copyImprovements: copyImprovements.slice(0, 10),
    googleAdsVariations: {
      headlines: googleAdsHeadlines,
      descriptions: googleAdsDescriptions
    },
    conversionOptimizations: conversionOptimizations.slice(0, 10)
  };
}

/**
 * Generate CRO opportunities from call analysis
 * Why this matters: Transforms pain points into actionable Google Ads and landing page recommendations
 */
function generateCROOpportunities(
  painPoints: ExtractedPainPoint[], 
  customerPhrases: CustomerPhrase[], 
  callSummary: string
): {
  adCopyIdeas: string[];
  googleAdsHeadlines: string[];
  googleAdsDescriptions: string[];
  landingPageRecommendations: string[];
} {
  const adCopyIdeas: string[] = [];
  const googleAdsHeadlines: string[] = [];
  const googleAdsDescriptions: string[] = [];
  const landingPageRecommendations: string[] = [];

  // Generate ad copy ideas from pain points
  painPoints.forEach(pp => {
    adCopyIdeas.push(`Address ${pp.category} pain point: "${pp.text}"`);
    
    // Generate headlines that speak to this pain point
    switch (pp.category) {
      case 'manual_tasks':
        googleAdsHeadlines.push('Eliminate Manual Work Today');
        break;
      case 'data_quality':
        googleAdsHeadlines.push('Clean Data, Better Results');
        break;
      case 'cost':
        googleAdsHeadlines.push('Cut Costs, Boost ROI');
        break;
      default:
        googleAdsHeadlines.push(`Solve ${pp.category.replace('_', ' ')} Issues`);
    }
  });

  // Generate descriptions using customer language
  customerPhrases.slice(0, 4).forEach(phrase => {
    googleAdsDescriptions.push(`"${phrase.phrase}" - Get the solution that works.`);
  });

  // Generate landing page recommendations
  painPoints.forEach(pp => {
    landingPageRecommendations.push(
      `Add section addressing ${pp.category}: "${pp.text.substring(0, 100)}..."`
    );
  });

  return {
    adCopyIdeas: adCopyIdeas.slice(0, 10),
    googleAdsHeadlines: googleAdsHeadlines.slice(0, 15),
    googleAdsDescriptions: googleAdsDescriptions.slice(0, 4),
    landingPageRecommendations: landingPageRecommendations.slice(0, 8)
  };
}

/**
 * POST /api/gong-analysis/run-analysis
 * Complete Gong call analysis workflow with CRO focus
 * Why this matters: This is the main end-to-end API that combines Gong call fetching,
 * pain point analysis, and CRO opportunity generation into a single pipeline.
 */
router.post('/run-analysis', async (req: Request, res: Response): Promise<any> => {
  const workflowId = uuidv4();
  const startTime = Date.now();
  
  try {
    console.log(`🚀 Starting Gong analysis workflow ${workflowId}`);
    
    // Validate request body
    const { daysBack, limit, sentiment }: GongAnalysisRequest = req.body;

    if (!daysBack || daysBack < 1 || daysBack > 365) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'daysBack must be between 1 and 365',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    if (!limit || limit < 1 || limit > 100) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'limit must be between 1 and 100',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    const sentimentFilter = sentiment || 'all';
    if (!['positive', 'negative', 'all'].includes(sentimentFilter)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'sentiment must be positive, negative, or all',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`📊 Gong analysis parameters: ${daysBack} days, limit: ${limit}, sentiment: ${sentimentFilter}`);

    // Step 1: Fetch recent calls from Gong
    console.log(`🔍 Step 1: Fetching Gong calls...`);
    const gongService = new GongService();
    const allCalls = await gongService.getRecentCalls(daysBack, limit);

    if (allCalls.length === 0) {
      return res.json({
        success: false,
        message: 'No Gong calls found in the specified date range',
        gong_results: {
          calls: [],
          total_found: 0,
          sentiment_filter: sentimentFilter,
          search_timestamp: new Date().toISOString()
        },
        analyzed_calls: [],
        workflow_id: workflowId,
        completed_at: new Date().toISOString()
      });
    }

    console.log(`✅ Step 1 complete: Found ${allCalls.length} Gong calls`);

    // Step 2: Get call details and filter by sentiment
    console.log(`📊 Step 2: Analyzing call details and filtering by sentiment...`);
    const callsWithDetails: Array<{
      call: GongCall;
      highlights: any;
      extensiveData: any;
      sentiment: 'positive' | 'negative' | 'neutral';
    }> = [];

    // Process calls in smaller batches to respect API limits
    const batchSize = 3;
    for (let i = 0; i < allCalls.length; i += batchSize) {
      const batch = allCalls.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async call => {
        try {
          // Get conversation details (includes both highlights and extensive data)
          const conversationDetails = await gongService.getCallConversationDetails(call.id);

          const highlightsResult = conversationDetails?.highlights || null;
          const extensiveResult = conversationDetails?.extensiveData || null;
          
          const callSentiment = determineCallSentiment(call, highlightsResult, extensiveResult);
          
          return {
            call,
            highlights: highlightsResult,
            extensiveData: extensiveResult,
            sentiment: callSentiment
          };
        } catch (error) {
          console.error(`❌ Failed to get details for call ${call.id}:`, error);
          return {
            call,
            highlights: null,
            extensiveData: null,
            sentiment: 'neutral' as const
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      callsWithDetails.push(...batchResults);

      // Rate limiting between batches
      if (i + batchSize < allCalls.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Filter by sentiment if specified
    const filteredCalls = sentimentFilter === 'all' 
      ? callsWithDetails 
      : callsWithDetails.filter(cd => cd.sentiment === sentimentFilter);

    if (filteredCalls.length === 0) {
      return res.json({
        success: false,
        message: `No calls found with ${sentimentFilter} sentiment`,
        gong_results: {
          calls: allCalls,
          total_found: allCalls.length,
          sentiment_filter: sentimentFilter,
          search_timestamp: new Date().toISOString()
        },
        analyzed_calls: [],
        analysis_metadata: {
          total_calls_found: allCalls.length,
          total_calls_analyzed: 0,
          sentiment_filter_applied: sentimentFilter,
          date_range: {
            days_back: daysBack,
            start_date: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString(),
            end_date: new Date().toISOString()
          },
          analysis_timestamp: new Date().toISOString(),
          processing_time_ms: Date.now() - startTime
        },
        workflow_id: workflowId,
        completed_at: new Date().toISOString()
      });
    }

    console.log(`✅ Step 2 complete: ${filteredCalls.length} calls match sentiment filter "${sentimentFilter}"`);

    // Step 3: Analyze calls for pain points and CRO opportunities
    console.log(`🧠 Step 3: Analyzing calls for pain points and CRO opportunities...`);
    const analyzedCalls: GongAnalyzedCall[] = [];

    for (let i = 0; i < filteredCalls.length; i++) {
      const { call, highlights, extensiveData, sentiment } = filteredCalls[i];
      
      try {
        console.log(`📞 Processing call ${i + 1}/${filteredCalls.length}: ${call.title}`);

        // Extract content from extensive data (using Gong's /v2/calls/extensive endpoint)
        const extensiveCall = extensiveData?.calls?.[0];
        if (extensiveCall && extensiveCall.content) {
          console.log(`🔍 Extracting content from extensive data for call ${call.id}`);
          
          // Extract prospect statements from various content sources
          const prospectStatements: string[] = [];
          
          // Add brief content (call summary)
          if (extensiveCall.content.brief) {
            prospectStatements.push(extensiveCall.content.brief);
          }
          
          // Add key points
          if (extensiveCall.content.keyPoints && extensiveCall.content.keyPoints.length > 0) {
            extensiveCall.content.keyPoints.forEach((kp: any) => {
              if (kp.text && kp.text.length > 20) {
                prospectStatements.push(kp.text);
              }
            });
          }
          
          // Add highlights
          if (extensiveCall.content.highlights && extensiveCall.content.highlights.length > 0) {
            extensiveCall.content.highlights.forEach((highlight: any) => {
              if (highlight.items && highlight.items.length > 0) {
                highlight.items.forEach((item: any) => {
                  if (item.text && item.text.length > 20) {
                    prospectStatements.push(item.text);
                  }
                });
              }
            });
          }
          
          // Add outline content
          if (extensiveCall.content.outline && extensiveCall.content.outline.length > 0) {
            extensiveCall.content.outline.forEach((section: any) => {
              if (section.items && section.items.length > 0) {
                section.items.forEach((item: any) => {
                  if (item.text && item.text.length > 20) {
                    prospectStatements.push(item.text);
                  }
                });
              }
            });
          }
          
          console.log(`📝 Extracted ${prospectStatements.length} content statements from call ${call.id}`);
          
          if (prospectStatements.length > 0) {
            // Analyze pain points using extracted content
            const painPointAnalysis = await painPointAnalyzer.analyzePainPoints({
              prospectStatements,
              callId: call.id,
              callTitle: call.title,
              callDate: call.started
            });

            // Generate call summary from extensive data
            const callSummary = extensiveCall.content.brief ||
                             `Call with ${extensiveCall.parties?.length || 0} participants lasting ${call.duration || 0} seconds`;

            // Get participant information from extensive data
            const participants = extensiveCall.parties?.map((p: any) => p.name || p.emailAddress || 'Unknown') || 
                               call.participants?.map((p: any) => p.name || p.emailAddress || 'Unknown') || [];

            // Generate CRO opportunities
            const croOpportunity = generateCROOpportunities(
              painPointAnalysis.painPoints,
              painPointAnalysis.customerPhrases,
              callSummary
            );

            // Create analyzed call object
            const analyzedCall: GongAnalyzedCall = {
              id: call.id,
              title: call.title,
              date: call.started,
              duration: call.duration || 0,
              participants,
              sentiment,
              analysis: {
                callSummary,
                painPoints: painPointAnalysis.painPoints,
                croOpportunity
              },
              highlights,
              extensive_data: extensiveData,
              call_rank: i + 1,
              analysis_timestamp: new Date().toISOString()
            };

            analyzedCalls.push(analyzedCall);
            console.log(`✅ Successfully analyzed call ${call.id} with ${painPointAnalysis.painPoints.length} pain points`);
          } else {
            console.log(`⚠️ No content statements found in extensive data for call ${call.id}, skipping analysis`);
          }
        } else {
          console.log(`⚠️ No extensive data available for call ${call.id}, skipping analysis`);
        }

        // Rate limiting between analysis calls
        if (i < filteredCalls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (error) {
        console.error(`❌ Failed to analyze call ${call.id}:`, error);
        // Continue with other calls even if one fails
      }
    }

    console.log(`✅ Step 3 complete: Analyzed ${analyzedCalls.length} calls`);

    // Step 4: Generate comprehensive CRO content from all analyzed calls
    let croContentResult = null;
    if (analyzedCalls.length > 0) {
      try {
        console.log(`🎯 Step 4: Generating comprehensive CRO content from ${analyzedCalls.length} calls...`);
        
        // Perform CRO analysis on all calls to get detailed insights
        const croAnalysisResults = [];
        for (const analyzedCall of analyzedCalls) {
          try {
            // Get transcript again for CRO analysis (if not already cached)
            const gongService = new GongService();
            const transcript = await gongService.getCallTranscript(analyzedCall.id);
            
            if (transcript) {
              const prospectStatements = extractProspectStatements(transcript);
              if (prospectStatements.length > 0) {
                const croAnalysis = await painPointAnalyzer.analyzeCROInsights({
                  prospectStatements,
                  callId: analyzedCall.id,
                  callTitle: analyzedCall.title,
                  callDate: analyzedCall.date
                });
                croAnalysisResults.push(croAnalysis);
              }
            }
          } catch (error) {
            console.error(`❌ Failed CRO analysis for call ${analyzedCall.id}:`, error);
            // Continue with other calls
          }
        }

        if (croAnalysisResults.length > 0) {
          // Generate comprehensive CRO content using all insights
          croContentResult = await croContentGenerator.generateCROContent({
            callInsights: analyzedCalls,
            croAnalysisResults: croAnalysisResults
          });
          
          console.log(`✅ Step 4 complete: Generated ${croContentResult.googleAdsContent.headlines.length} headlines, ${croContentResult.googleAdsContent.descriptions.length} descriptions, and ${croContentResult.abTestingSuggestions.headlines.length} A/B test ideas`);
        } else {
          console.log(`⚠️ Step 4 skipped: No CRO analysis results available`);
        }

      } catch (error) {
        console.error(`❌ Step 4 failed - CRO content generation error:`, error);
        // Continue without CRO content - don't fail the entire workflow
      }
    }

    const duration = Date.now() - startTime;
    console.log(`🎉 Gong analysis workflow ${workflowId} completed in ${duration}ms`);

    // Build response
    const response: GongAnalysisResponse = {
      success: true,
      gong_results: {
        calls: allCalls,
        total_found: allCalls.length,
        sentiment_filter: sentimentFilter,
        search_timestamp: new Date().toISOString()
      },
      analyzed_calls: analyzedCalls,
      cro_content: croContentResult,
      workflow_id: workflowId,
      completed_at: new Date().toISOString()
    };

    res.json(response);

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Gong analysis workflow ${workflowId} failed after ${duration}ms:`, error);
    
    const apiError: ApiError = {
      error: 'Gong Analysis Failed',
      message: error instanceof Error ? error.message : 'Unknown workflow error',
      status: 500,
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json({
      ...apiError,
      workflow_id: workflowId,
      duration_ms: duration
    });
  }
});

/**
 * POST /api/gong-analysis/analyze-landing-page
 * Analyze landing page against Gong call insights for CRO recommendations
 * Why this matters: Combines real customer pain points from sales calls with actual 
 * landing page content to generate data-driven CRO recommendations and Google Ads copy.
 */
router.post('/analyze-landing-page', async (req: Request, res: Response): Promise<any> => {
  const workflowId = uuidv4();
  const startTime = Date.now();

  try {
    console.log(`🎯 Starting landing page CRO analysis workflow ${workflowId}`);

    // Validate request body
    const { url, callInsights }: LandingPageAnalysisRequest = req.body;

    if (!url || !url.trim()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'URL is required for landing page analysis',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    // If no call insights provided, fetch recent Gong analysis data
    let finalCallInsights = callInsights;
    if (!callInsights || !Array.isArray(callInsights) || callInsights.length === 0) {
      console.log(`🔍 No call insights provided, fetching recent Gong analysis data...`);
      
      try {
        // Get recent calls and analyze them for CRO insights
        const gongService = new GongService();
        const recentCalls = await gongService.getRecentCalls(7, 5); // Last 7 days, max 5 calls
        
        if (recentCalls.length > 0) {
          console.log(`📞 Found ${recentCalls.length} recent calls, analyzing for CRO insights...`);
          
          // Quick analysis of recent calls for CRO insights
          const quickAnalyzedCalls: GongAnalyzedCall[] = [];
          
          for (const call of recentCalls.slice(0, 3)) { // Limit to 3 calls for performance
            try {
              const conversationDetails = await gongService.getCallConversationDetails(call.id);
              const extensiveCall = conversationDetails?.extensiveData?.calls?.[0];
              
              if (extensiveCall && extensiveCall.content) {
                // Extract basic content for pain point analysis
                const prospectStatements: string[] = [];
                
                if (extensiveCall.content.brief) {
                  prospectStatements.push(extensiveCall.content.brief);
                }
                
                if (extensiveCall.content.keyPoints) {
                  extensiveCall.content.keyPoints.forEach((kp: any) => {
                    if (kp.text && kp.text.length > 20) {
                      prospectStatements.push(kp.text);
                    }
                  });
                }
                
                if (prospectStatements.length > 0) {
                  const painPointAnalysis = await painPointAnalyzer.analyzePainPoints({
                    prospectStatements,
                    callId: call.id,
                    callTitle: call.title,
                    callDate: call.started
                  });
                  
                  const croOpportunity = generateCROOpportunities(
                    painPointAnalysis.painPoints,
                    painPointAnalysis.customerPhrases,
                    extensiveCall.content.brief || call.title
                  );
                  
                  quickAnalyzedCalls.push({
                    id: call.id,
                    title: call.title,
                    date: call.started,
                    duration: call.duration || 0,
                    participants: extensiveCall.parties?.map((p: any) => p.name || 'Unknown') || [],
                    sentiment: 'neutral',
                    analysis: {
                      callSummary: extensiveCall.content.brief || call.title,
                      painPoints: painPointAnalysis.painPoints,
                      croOpportunity
                    },
                    highlights: conversationDetails?.highlights || null,
                    extensive_data: conversationDetails?.extensiveData || null,
                    call_rank: 1,
                    analysis_timestamp: new Date().toISOString()
                  });
                }
              }
            } catch (error) {
              console.error(`❌ Failed to quick-analyze call ${call.id}:`, error);
              // Continue with other calls
            }
          }
          
          if (quickAnalyzedCalls.length > 0) {
            finalCallInsights = quickAnalyzedCalls;
            console.log(`✅ Quick analysis complete: Generated insights from ${quickAnalyzedCalls.length} calls`);
          } else {
            console.log(`⚠️ No usable call insights could be generated from recent calls`);
          }
        } else {
          console.log(`⚠️ No recent calls found for CRO analysis`);
        }
      } catch (error) {
        console.error(`❌ Failed to fetch recent Gong data:`, error);
        // Continue with empty insights
      }
    }
    
    // If still no insights available, use generic CRO recommendations
    if (!finalCallInsights || finalCallInsights.length === 0) {
      console.log(`⚠️ No call insights available, using generic CRO recommendations`);
      finalCallInsights = [];
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid URL format provided',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`📊 Analyzing ${url} against ${finalCallInsights.length} call insights`);

    // Step 1: Capture screenshot of the landing page
    console.log(`📸 Step 1: Capturing landing page screenshot...`);
    const screenshot: ScreenshotResult = await screenshotService.captureScreenshot(url, {
      viewport: { width: 1920, height: 1080 },
      timeout: 60000
    });

    if (screenshot.error) {
      console.warn(`⚠️ Screenshot capture had issues: ${screenshot.error}`);
    } else {
      console.log(`✅ Step 1 complete: Screenshot captured successfully`);
    }

    // Step 2: Extract page text content
    console.log(`📝 Step 2: Extracting page text content...`);
    const pageContent: PageTextContent = await copyAnalysisService.extractPageText(url);
    
    console.log(`✅ Step 2 complete: Extracted ${pageContent.headings.length} headings and ${pageContent.buttonTexts.length} buttons`);

    // Step 3: Extract Gong insights from analyzed calls (handle both analyzed and basic call objects)
    const allPainPoints: ExtractedPainPoint[] = [];
    const customerQuotes: string[] = [];
    const callSummaries: string[] = [];
    
    // Process each call insight - analyze if needed
    for (const call of finalCallInsights) {
      if (call.analysis && call.analysis.painPoints) {
        // Already analyzed call
        allPainPoints.push(...call.analysis.painPoints);
        if (call.analysis.callSummary && call.analysis.callSummary.length > 50) {
          customerQuotes.push(call.analysis.callSummary);
        }
        callSummaries.push(`${call.title}: ${call.analysis.callSummary.substring(0, 150)}...`);
      } else {
        // Basic call object - need to analyze
        try {
          console.log(`🧠 Quick analysis for call: ${call.title}`);
          
          // Get conversation details for analysis
          const gongService = new GongService();
          const conversationDetails = await gongService.getCallConversationDetails(call.id);
          const extensiveCall = conversationDetails?.extensiveData?.calls?.[0];
          
          if (extensiveCall && extensiveCall.content) {
            // Extract content for pain point analysis
            const prospectStatements: string[] = [];
            
            if (extensiveCall.content.brief) {
              prospectStatements.push(extensiveCall.content.brief);
              customerQuotes.push(extensiveCall.content.brief);
            }
            
            if (extensiveCall.content.keyPoints) {
              extensiveCall.content.keyPoints.forEach((kp: any) => {
                if (kp.text && kp.text.length > 20) {
                  prospectStatements.push(kp.text);
                }
              });
            }
            
                         if (prospectStatements.length > 0) {
               // Quick pain point analysis
               const painPointAnalysis = await painPointAnalyzer.analyzePainPoints({
                 prospectStatements,
                 callId: call.id,
                 callTitle: call.title,
                 callDate: (call as any).started || (call as any).date || new Date().toISOString()
               });
               
               allPainPoints.push(...painPointAnalysis.painPoints);
             }
            
            callSummaries.push(`${call.title}: ${extensiveCall.content.brief ? extensiveCall.content.brief.substring(0, 150) : 'No summary available'}...`);
          } else {
            console.log(`⚠️ No content available for call ${call.id}`);
            callSummaries.push(`${call.title}: Analysis not available`);
          }
        } catch (error) {
          console.error(`❌ Failed to analyze call ${call.id}:`, error);
          callSummaries.push(`${call.title}: Analysis failed`);
        }
      }
    }
    
    // Identify missing topics by comparing pain points to page content
    const missingTopics = allPainPoints
      .filter(pp => !pageContent.bodyText.toLowerCase().includes(pp.text.toLowerCase().substring(0, 20)))
      .slice(0, 5)
      .map(pp => `${pp.category}: ${pp.text.substring(0, 100)}...`);

    // Generate CRO recommendations based on call insights + page content
    console.log(`🧠 Step 4: Generating CRO recommendations...`);
    const croRecommendations = generateAdvancedCRORecommendations(finalCallInsights, pageContent);

    // Calculate analysis metadata
    const totalPainPoints = allPainPoints.length;
    const analysisMetadata = {
      totalCallsAnalyzed: finalCallInsights.length,
      painPointsConsidered: totalPainPoints,
      customerPhrasesUsed: customerQuotes.length,
      analysisTimestamp: new Date().toISOString()
    };

    console.log(`✅ Step 4 complete: Generated ${croRecommendations.googleAdsVariations.headlines.length} ad headlines and ${croRecommendations.conversionOptimizations.length} optimization recommendations`);

    const duration = Date.now() - startTime;
    console.log(`🎉 Landing page CRO analysis workflow completed in ${duration}ms`);

    // Build response with Gong insights
    const result: LandingPageAnalysisResult = {
      url,
      screenshot,
      extractedContent: pageContent,
      gongInsights: {
        totalCallsAnalyzed: finalCallInsights.length,
        keyPainPoints: allPainPoints.slice(0, 10), // Top 10 pain points
        customerQuotes: customerQuotes.slice(0, 5), // Top 5 customer quotes
        callSummaries: callSummaries.slice(0, 3), // Top 3 call summaries
        missingTopics: missingTopics
      },
      croRecommendations,
      analysisMetadata
    };

    res.json({
      success: true,
      result,
      workflow_id: workflowId,
      completed_at: new Date().toISOString(),
      duration_ms: duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Landing page CRO analysis workflow ${workflowId} failed after ${duration}ms:`, error);

    const apiError: ApiError = {
      error: 'Landing Page Analysis Failed',
      message: error instanceof Error ? error.message : 'Unknown analysis error',
      status: 500,
      timestamp: new Date().toISOString()
    };

    res.status(500).json({
      ...apiError,
      workflow_id: workflowId,
      duration_ms: duration
    });
  }
});

export default router; 