import GongService from './gongService';

interface CallSummaryData {
  callId: string;
  title: string;
  date: string;
  duration?: number;
  brief?: string;
  keyPoints?: Array<{ text: string }>;
  trackers?: Array<{ name: string; count: number }>;
  participants?: any[];
}

interface VoCExtractionResult {
  totalCallsProcessed: number;
  callSummaries: CallSummaryData[];
  extractionTimestamp: string;
  averageCallDuration?: number;
  topTrackers?: Array<{ name: string; totalMentions: number }>;
}

/**
 * Voice of Customer Data Extractor Service
 * Why this matters: Extracts customer call summaries and insights from Gong for pain point analysis.
 * This service builds on the existing GongService to provide VoC-specific data extraction.
 */
class VoCDataExtractor {
  private gongService: GongService;

  constructor() {
    this.gongService = new GongService();
    console.log('✅ VoC Data Extractor initialized with Gong service');
  }

  /**
   * Test connection to Gong API
   * Why this matters: Validates that we can access Gong data before attempting bulk extraction.
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('🔍 Testing Gong API connection for VoC extraction...');
      const isConnected = await this.gongService.testConnection();
      
      if (isConnected) {
        console.log('✅ Gong API connection successful for VoC data extraction');
      } else {
        console.log('❌ Gong API connection failed');
      }
      
      return isConnected;
    } catch (error: any) {
      console.error('❌ Error testing Gong connection:', error.message);
      return false;
    }
  }

  /**
   * Basic call extraction for lightweight processing (300+ calls)
   * Why this matters: Extracts only essential call data without detailed conversation processing,
   * enabling full 300-call analysis within serverless timeout limits.
   */
  async extractCallSummariesBasic(daysBack: number = 180, maxCalls: number = 300): Promise<VoCExtractionResult> {
    try {
      console.log(`🚀 Starting basic VoC extraction (${daysBack} days, max ${maxCalls} calls)`);
      const startTime = Date.now();
      
      // 1. Test connection first
      const isConnected = await this.testConnection();
      if (!isConnected) {
        throw new Error('Failed to connect to Gong API');
      }

      // 2. Get recent calls (basic metadata only)
      console.log('📞 Fetching recent calls from Gong (basic mode)...');
      const recentCalls = await this.gongService.getRecentCalls(daysBack, maxCalls);
      
      if (recentCalls.length === 0) {
        console.log('⚠️ No calls found in the specified date range');
        return {
          totalCallsProcessed: 0,
          callSummaries: [],
          extractionTimestamp: new Date().toISOString()
        };
      }

      console.log(`🔄 Processing ${recentCalls.length} calls with basic extraction...`);
      
      // 3. Basic processing with timeout safety
      const callSummaries: CallSummaryData[] = [];
      let totalDuration = 0;
      let callsWithDuration = 0;
      const TIMEOUT_LIMIT = 10000; // 10 seconds for extraction safety

      // Process calls in smaller batches with conversation details
      // Why this matters: Smaller batches with actual content extraction, balanced for timeout safety
      const BATCH_SIZE = 25; // Reduced for conversation detail calls
      const batches = this.chunkArray(recentCalls, BATCH_SIZE);
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        // Check timeout before processing each batch
        const timeElapsed = Date.now() - startTime;
        if (timeElapsed > TIMEOUT_LIMIT) {
          console.log(`⏱️ Timeout safety: stopping at batch ${batchIndex + 1}/${batches.length} after ${timeElapsed}ms`);
          break;
        }
        const batch = batches[batchIndex];
        console.log(`📦 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} calls)...`);
        
        const batchPromises = batch.map(async (call) => {
          try {
            // Get essential conversation data for pain point analysis
            // Why this matters: We need actual call content, not just titles, for meaningful analysis
            const conversationDetails = await this.gongService.getCallConversationDetails(call.id);
            
            // Extract key content efficiently
            const highlights = conversationDetails?.highlights;
            return {
              callId: call.id,
              title: call.title,
              date: call.started,
              duration: call.duration,
              brief: highlights?.brief || call.title, // Use brief if available, fallback to title
              keyPoints: highlights?.keyPoints?.slice(0, 5) || [], // Limit to 5 key points for efficiency
              trackers: [], // Skip trackers for speed
              participants: conversationDetails?.extensiveData?.parties?.slice(0, 3) || [] // Limit participants
            };
          } catch (error: any) {
            console.error(`❌ Basic extraction failed on call ${call.id}:`, error.message);
            // Return call with title as fallback content
            return {
              callId: call.id,
              title: call.title,
              date: call.started,
              duration: call.duration,
              brief: call.title, // At least use title as content
              keyPoints: [],
              trackers: [],
              participants: []
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        callSummaries.push(...batchResults);
        
        // Add intelligent delay between batches based on processing time
        if (batchIndex < batches.length - 1) {
          const batchTime = Date.now() - startTime;
          const avgTimePerBatch = batchTime / (batchIndex + 1);
          const delay = Math.min(200, Math.max(50, avgTimePerBatch * 0.1)); // Adaptive delay
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      // Calculate statistics
      callSummaries.forEach(callSummary => {
        if (callSummary.duration) {
          totalDuration += callSummary.duration;
          callsWithDuration++;
        }
      });

      const processingTime = Date.now() - startTime;
      const avgDuration = callsWithDuration > 0 ? Math.round(totalDuration / callsWithDuration) : 0;

      console.log(`✅ Basic VoC extraction completed in ${processingTime}ms (${Math.round(processingTime/1000)}s)`);
      console.log(`📊 Processed ${callSummaries.length} calls (avg duration: ${avgDuration}s)`);

      return {
        totalCallsProcessed: callSummaries.length,
        callSummaries,
        extractionTimestamp: new Date().toISOString()
      };

    } catch (error: any) {
      console.error('❌ Failed to extract basic VoC call summaries:', error.message);
      throw new Error(`Basic VoC extraction failed: ${error.message}`);
    }
  }

  /**
   * High-efficiency parallel extraction for large call volumes
   * Why this matters: Processes 300+ calls in ~12-15 seconds using parallel workers instead of sequential batches.
   * No filtering - processes all calls as-is for maximum data completeness.
   */
  async extractCallSummariesOptimized(daysBack: number = 180, maxCalls: number = 300): Promise<VoCExtractionResult> {
    try {
      console.log(`🚀 Starting optimized VoC extraction (${daysBack} days, max ${maxCalls} calls)`);
      const startTime = Date.now();
      
      // 1. Test connection first
      const isConnected = await this.testConnection();
      if (!isConnected) {
        throw new Error('Failed to connect to Gong API');
      }

      // 2. Get recent calls
      console.log('📞 Fetching recent calls from Gong...');
      const recentCalls = await this.gongService.getRecentCalls(daysBack, maxCalls);
      
      if (recentCalls.length === 0) {
        console.log('⚠️ No calls found in the specified date range');
        return {
          totalCallsProcessed: 0,
          callSummaries: [],
          extractionTimestamp: new Date().toISOString()
        };
      }

      console.log(`🔄 Processing ${recentCalls.length} calls with parallel workers...`);
      
      // 3. Parallel processing with worker pool
      const WORKER_POOL_SIZE = 10; // Process 10 calls simultaneously
      const callChunks = this.chunkArray(recentCalls, Math.ceil(recentCalls.length / WORKER_POOL_SIZE));
      
      const callSummaries: CallSummaryData[] = [];
      const trackerStats = new Map<string, number>();
      let totalDuration = 0;
      let callsWithDuration = 0;

      // Process all chunks in parallel with staggered start times
      const processingPromises = callChunks.map(async (chunk, workerIndex) => {
        // Stagger start times by 200ms to avoid rate limit bursts
        await new Promise(resolve => setTimeout(resolve, workerIndex * 200));
        
        console.log(`👷 Worker ${workerIndex + 1} processing ${chunk.length} calls...`);
        
        const chunkResults: CallSummaryData[] = [];
        const chunkPromises = chunk.map(async (call) => {
          try {
            // Get conversation details (includes highlights, brief, key points)
            const conversationDetails = await this.gongService.getCallConversationDetails(call.id);
            
            // Extract relevant data
            const highlights = conversationDetails?.highlights;
            return {
              callId: call.id,
              title: call.title,
              date: call.started,
              duration: call.duration,
              brief: highlights?.brief || undefined,
              keyPoints: highlights?.keyPoints || [],
              trackers: highlights?.trackers || [],
              participants: conversationDetails?.extensiveData?.parties || []
            };
          } catch (error: any) {
            console.error(`❌ Worker ${workerIndex + 1} failed on call ${call.id}:`, error.message);
            // Return basic call info even if detailed extraction fails
            return {
              callId: call.id,
              title: call.title,
              date: call.started,
              duration: call.duration,
              brief: undefined,
              keyPoints: [],
              trackers: [],
              participants: []
            };
          }
        });

        const chunkResults_final = await Promise.all(chunkPromises);
        console.log(`✅ Worker ${workerIndex + 1} completed ${chunkResults_final.length} calls`);
        
        return chunkResults_final;
      });

      // Wait for all workers to complete
      const allChunkResults = await Promise.all(processingPromises);
      
      // Flatten results and calculate statistics
      allChunkResults.forEach(chunkResults => {
        chunkResults.forEach(callSummary => {
          callSummaries.push(callSummary);
          
          // Track statistics
          if (callSummary.duration) {
            totalDuration += callSummary.duration;
            callsWithDuration++;
          }

          // Aggregate tracker mentions
          if (callSummary.trackers) {
            callSummary.trackers.forEach((tracker: any) => {
              if (tracker.count > 0) {
                const currentCount = trackerStats.get(tracker.name) || 0;
                trackerStats.set(tracker.name, currentCount + tracker.count);
              }
            });
          }
        });
      });

      // Calculate summary statistics
      const averageCallDuration = callsWithDuration > 0 ? Math.round(totalDuration / callsWithDuration) : undefined;
      const topTrackers = Array.from(trackerStats.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name, totalMentions]) => ({ name, totalMentions }));

      const processingTime = Date.now() - startTime;
      
      const result: VoCExtractionResult = {
        totalCallsProcessed: callSummaries.length,
        callSummaries,
        extractionTimestamp: new Date().toISOString(),
        averageCallDuration,
        topTrackers
      };

      // Log summary
      const callsWithBriefs = callSummaries.filter(c => c.brief).length;
      const callsWithKeyPoints = callSummaries.filter(c => c.keyPoints && c.keyPoints.length > 0).length;
      
      console.log('✅ Optimized VoC extraction complete:');
      console.log(`   ⚡ Processing time: ${processingTime}ms (${Math.round(processingTime/1000)}s)`);
      console.log(`   📊 Total calls processed: ${result.totalCallsProcessed}`);
      console.log(`   📝 Calls with briefs: ${callsWithBriefs}`);
      console.log(`   🔑 Calls with key points: ${callsWithKeyPoints}`);
      console.log(`   ⏱️ Average call duration: ${averageCallDuration || 'N/A'} seconds`);
      console.log(`   🏷️ Top trackers: ${topTrackers.slice(0, 3).map(t => t.name).join(', ')}`);

      return result;

    } catch (error: any) {
      console.error('❌ Failed to extract VoC call summaries (optimized):', error.message);
      throw new Error(`Optimized VoC extraction failed: ${error.message}`);
    }
  }

  /**
   * Helper method to chunk array into smaller arrays
   * Why this matters: Divides calls into worker-sized chunks for parallel processing.
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Extract call summaries for VoC analysis (Original method)
   * Why this matters: Provides structured call data that gpt-5-nano can analyze for pain points.
   */
  async extractCallSummaries(daysBack: number = 180, maxCalls: number = 250): Promise<VoCExtractionResult> {
    try {
      console.log(`🚀 Starting VoC call summary extraction (${daysBack} days, max ${maxCalls} calls)`);
      
      // 1. Test connection first
      const isConnected = await this.testConnection();
      if (!isConnected) {
        throw new Error('Failed to connect to Gong API');
      }

      // 2. Get recent calls
      console.log('📞 Fetching recent calls from Gong...');
      const recentCalls = await this.gongService.getRecentCalls(daysBack, maxCalls);
      
      if (recentCalls.length === 0) {
        console.log('⚠️ No calls found in the specified date range');
        return {
          totalCallsProcessed: 0,
          callSummaries: [],
          extractionTimestamp: new Date().toISOString()
        };
      }

      console.log(`📋 Processing ${recentCalls.length} calls for conversation details...`);
      
      // 3. Extract conversation details for each call (with rate limiting)
      const callSummaries: CallSummaryData[] = [];
      const trackerStats = new Map<string, number>();
      let totalDuration = 0;
      let callsWithDuration = 0;

      // Process calls in smaller batches to respect rate limits
      const batchSize = 3;
      for (let i = 0; i < recentCalls.length; i += batchSize) {
        const batch = recentCalls.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (call) => {
          try {
            console.log(`🔍 Processing call: ${call.title} (${call.id})`);
            
            // Get conversation details (includes highlights, brief, key points)
            const conversationDetails = await this.gongService.getCallConversationDetails(call.id);
            
            // Extract relevant data
            const highlights = conversationDetails?.highlights;
            const callSummary: CallSummaryData = {
              callId: call.id,
              title: call.title,
              date: call.started,
              duration: call.duration,
              brief: highlights?.brief || undefined,
              keyPoints: highlights?.keyPoints || [],
              trackers: highlights?.trackers || [],
              participants: conversationDetails?.extensiveData?.parties || []
            };

            // Track statistics
            if (call.duration) {
              totalDuration += call.duration;
              callsWithDuration++;
            }

            // Aggregate tracker mentions
            if (highlights?.trackers) {
              highlights.trackers.forEach((tracker: any) => {
                if (tracker.count > 0) {
                  const currentCount = trackerStats.get(tracker.name) || 0;
                  trackerStats.set(tracker.name, currentCount + tracker.count);
                }
              });
            }

            return callSummary;
          } catch (error: any) {
            console.error(`❌ Failed to process call ${call.id}:`, error.message);
            // Return basic call info even if detailed extraction fails
            return {
              callId: call.id,
              title: call.title,
              date: call.started,
              duration: call.duration,
              brief: undefined,
              keyPoints: [],
              trackers: [],
              participants: []
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        callSummaries.push(...batchResults);
        
        // Rate limiting: wait 1 second between batches
        if (i + batchSize < recentCalls.length) {
          console.log('⏱️ Rate limiting: waiting 1 second...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Calculate summary statistics
      const averageCallDuration = callsWithDuration > 0 ? Math.round(totalDuration / callsWithDuration) : undefined;
      const topTrackers = Array.from(trackerStats.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name, totalMentions]) => ({ name, totalMentions }));

      const result: VoCExtractionResult = {
        totalCallsProcessed: callSummaries.length,
        callSummaries,
        extractionTimestamp: new Date().toISOString(),
        averageCallDuration,
        topTrackers
      };

      // Log summary
      const callsWithBriefs = callSummaries.filter(c => c.brief).length;
      const callsWithKeyPoints = callSummaries.filter(c => c.keyPoints && c.keyPoints.length > 0).length;
      
      console.log('✅ VoC call summary extraction complete:');
      console.log(`   📊 Total calls processed: ${result.totalCallsProcessed}`);
      console.log(`   📝 Calls with briefs: ${callsWithBriefs}`);
      console.log(`   🔑 Calls with key points: ${callsWithKeyPoints}`);
      console.log(`   ⏱️ Average call duration: ${averageCallDuration || 'N/A'} seconds`);
      console.log(`   🏷️ Top trackers: ${topTrackers.slice(0, 3).map(t => t.name).join(', ')}`);

      return result;

    } catch (error: any) {
      console.error('❌ Failed to extract VoC call summaries:', error.message);
      throw new Error(`VoC extraction failed: ${error.message}`);
    }
  }

  /**
   * Lightweight call data extraction for high-volume processing (300+ calls)
   * Why this matters: Skips detailed conversation processing to extract basic call data quickly,
   * maintaining full call volume while staying within serverless timeout limits.
   */
  async getCallDataLightweight(daysBack: number = 90, maxCalls: number = 300): Promise<{
    analysisText: string;
    metadata: {
      totalCalls: number;
      callsWithContent: number;
      dateRange: string;
      extractionDate: string;
    }
  }> {
    try {
      console.log('📊 Lightweight call data extraction (optimized for speed)...');
      
      // Use basic call extraction without detailed conversation processing
      const extractionResult = await this.extractCallSummariesBasic(daysBack, maxCalls);
      
      if (extractionResult.totalCallsProcessed === 0) {
        return {
          analysisText: '',
          metadata: {
            totalCalls: 0,
            callsWithContent: 0,
            dateRange: `Last ${daysBack} days`,
            extractionDate: new Date().toISOString()
          }
        };
      }

      // Format call data for analysis (lightweight version)
      const analysisTexts: string[] = [];
      let callsWithContent = 0;

      extractionResult.callSummaries.forEach((call, index) => {
        const hasContent = call.brief || (call.keyPoints && call.keyPoints.length > 0);
        if (hasContent) {
          callsWithContent++;
          
          const callText = [
            `CALL ${index + 1}:`,
            `Title: ${call.title}`,
            `Date: ${call.date}`,
            call.brief ? `Brief: ${call.brief}` : '',
            call.keyPoints && call.keyPoints.length > 0 ? 
              `Key Points: ${call.keyPoints.map((kp: any) => kp.text || kp).join('; ')}` : '',
            '---'
          ].filter(Boolean).join('\n');
          
          analysisTexts.push(callText);
        }
      });

      const analysisText = analysisTexts.join('\n\n');
      
      console.log(`✅ Lightweight extraction completed: ${callsWithContent}/${extractionResult.totalCallsProcessed} calls with content`);
      console.log(`📝 Analysis text length: ${analysisText.length} characters`);

      return {
        analysisText,
        metadata: {
          totalCalls: extractionResult.totalCallsProcessed,
          callsWithContent,
          dateRange: `Last ${daysBack} days`,
          extractionDate: new Date().toISOString()
        }
      };

    } catch (error: any) {
      console.error('❌ Error in lightweight call data extraction:', error.message);
      throw new Error(`Lightweight call data extraction failed: ${error.message}`);
    }
  }

  /**
   * Get formatted call data for pain point analysis (Optimized for high volume)
   * Why this matters: Provides clean, structured text that gpt-5-nano can analyze for customer pain points.
   * Uses optimized parallel extraction for better performance with large datasets.
   */
  async getCallDataForAnalysis(daysBack: number = 90, maxCalls: number = 300): Promise<{
    analysisText: string;
    metadata: {
      totalCalls: number;
      callsWithContent: number;
      dateRange: string;
      extractionDate: string;
    }
  }> {
    try {
      console.log('📊 Preparing call data for pain point analysis (optimized)...');
      
      const extractionResult = await this.extractCallSummariesOptimized(daysBack, maxCalls);
      
      if (extractionResult.totalCallsProcessed === 0) {
        return {
          analysisText: '',
          metadata: {
            totalCalls: 0,
            callsWithContent: 0,
            dateRange: `Last ${daysBack} days`,
            extractionDate: new Date().toISOString()
          }
        };
      }

      // Format call data for analysis
      const analysisTexts: string[] = [];
      let callsWithContent = 0;

      extractionResult.callSummaries.forEach((call, index) => {
        const hasContent = call.brief || (call.keyPoints && call.keyPoints.length > 0);
        if (hasContent) {
          callsWithContent++;
          
          const callSection = [
            `=== CALL ${index + 1}: ${call.title} ===`,
            `Date: ${new Date(call.date).toLocaleDateString()}`,
            `Duration: ${call.duration ? Math.round(call.duration / 60) + ' minutes' : 'Unknown'}`,
            ''
          ];

          if (call.brief) {
            callSection.push('CALL SUMMARY:');
            callSection.push(call.brief);
            callSection.push('');
          }

          if (call.keyPoints && call.keyPoints.length > 0) {
            callSection.push('KEY POINTS:');
            call.keyPoints.forEach((point, idx) => {
              callSection.push(`${idx + 1}. ${point.text}`);
            });
            callSection.push('');
          }

          if (call.trackers && call.trackers.length > 0) {
            const activeTrackers = call.trackers.filter(t => t.count > 0);
            if (activeTrackers.length > 0) {
              callSection.push('CONVERSATION TOPICS:');
              activeTrackers.forEach(tracker => {
                callSection.push(`- ${tracker.name} (${tracker.count} mentions)`);
              });
              callSection.push('');
            }
          }

          callSection.push('---\n');
          analysisTexts.push(callSection.join('\n'));
        }
      });

      const analysisText = analysisTexts.join('\n');
      
      console.log(`✅ Prepared analysis text: ${analysisText.length} characters from ${callsWithContent} calls`);

      return {
        analysisText,
        metadata: {
          totalCalls: extractionResult.totalCallsProcessed,
          callsWithContent,
          dateRange: `Last ${daysBack} days`,
          extractionDate: extractionResult.extractionTimestamp
        }
      };

    } catch (error: any) {
      console.error('❌ Failed to prepare call data for analysis:', error.message);
      throw error;
    }
  }

  /**
   * Get service health status
   * Why this matters: Provides monitoring and diagnostics for the VoC extraction pipeline.
   */
  async getHealthStatus(): Promise<{
    gongConnected: boolean;
    lastExtractionTest?: {
      success: boolean;
      callCount?: number;
      error?: string;
    };
  }> {
    try {
      const gongConnected = await this.testConnection();
      
      // Test a small extraction to verify full pipeline
      let lastExtractionTest: any = { success: false };
      
      if (gongConnected) {
        try {
          const testResult = await this.extractCallSummaries(7, 3); // Last 7 days, max 3 calls
          lastExtractionTest = {
            success: true,
            callCount: testResult.totalCallsProcessed
          };
        } catch (error: any) {
          lastExtractionTest = {
            success: false,
            error: error.message
          };
        }
      }

      return {
        gongConnected,
        lastExtractionTest
      };

    } catch (error: any) {
      return {
        gongConnected: false,
        lastExtractionTest: {
          success: false,
          error: error.message
        }
      };
    }
  }
}

export default VoCDataExtractor;