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
   * Extract call summaries for VoC analysis
   * Why this matters: Provides structured call data that gpt-4.1-nano can analyze for pain points.
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
   * Get formatted call data for pain point analysis
   * Why this matters: Provides clean, structured text that gpt-4.1-nano can analyze for customer pain points.
   */
  async getCallDataForAnalysis(daysBack: number = 30, maxCalls: number = 25): Promise<{
    analysisText: string;
    metadata: {
      totalCalls: number;
      callsWithContent: number;
      dateRange: string;
      extractionDate: string;
    }
  }> {
    try {
      console.log('📊 Preparing call data for pain point analysis...');
      
      const extractionResult = await this.extractCallSummaries(daysBack, maxCalls);
      
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