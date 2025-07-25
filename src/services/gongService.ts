import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { Buffer } from 'buffer';

interface GongUser {
  id: string;
  emailAddress: string;
  firstName: string;
  lastName: string;
  active: boolean;
  created: string;
}

interface GongCall {
  id: string;
  title: string;
  started: string;
  primaryUserId: string;
  actualStart: string;
  direction: 'Inbound' | 'Outbound' | 'Conference' | 'Unknown';
  participants: GongParticipant[];
  duration?: number;
  customData?: any;
}

interface GongParticipant {
  userId?: string;
  name?: string;
  emailAddress?: string;
  phoneNumber?: string;
  mediaChannelId?: number;
}

interface GongTranscript {
  callId: string;
  transcript: Array<{
    speakerId: string;
    topic: string;
    sentences: Array<{
      start: number;
      end: number;
      text: string;
    }>;
  }>;
}

// New interfaces for rich conversation details
interface GongCallAnalytics {
  callId: string;
  topics: Array<{
    topic: string;
    mentions: number;
    sentiment?: 'positive' | 'negative' | 'neutral';
  }>;
  trackers: Array<{
    name: string;
    mentions: number;
    occurrences: Array<{
      start: number;
      end: number;
      speakerId: string;
    }>;
  }>;
  sentiment: {
    overall: 'positive' | 'negative' | 'neutral';
    byParticipant: Array<{
      speakerId: string;
      sentiment: 'positive' | 'negative' | 'neutral';
      score: number;
    }>;
  };
  callMoments: Array<{
    momentType: string;
    timestamp: number;
    duration: number;
    description: string;
  }>;
}

interface GongCallStats {
  callId: string;
  talkTime: {
    totalTalkTime: number;
    participantTalkTime: Array<{
      speakerId: string;
      talkTime: number;
      percentage: number;
    }>;
  };
  interactivity: {
    questionsAsked: number;
    monologues: Array<{
      speakerId: string;
      duration: number;
      timestamp: number;
    }>;
  };
}

interface GongScorecard {
  callId: string;
  scorecardId: string;
  scorecardName: string;
  overallScore: number;
  sections: Array<{
    sectionName: string;
    score: number;
    questions: Array<{
      question: string;
      score: number;
      comments?: string;
    }>;
  }>;
}

interface GongCallsResponse {
  records: {
    totalRecords: number;
    currentPageSize: number;
    currentPageNumber: number;
    cursor?: string;
  };
  calls: GongCall[];
}

interface GongUsersResponse {
  records: {
    totalRecords: number;
    currentPageSize: number; 
    currentPageNumber: number;
    cursor?: string;
  };
  users: GongUser[];
}

/**
 * Service for interacting with Gong's conversation intelligence API
 * Why this matters: Gong contains rich call transcript data with customer pain points
 * and emotional triggers that we can analyze for CRO and ad copy generation.
 */
class GongService {
  private client: AxiosInstance;
  private baseUrl = 'https://api.gong.io';
  private accessKey: string;
  private accessSecret: string;
  private authHeader: string;
  
  constructor() {
    // Load Gong credentials from environment variables for security
    // Why this matters: Environment variables prevent credentials from being committed to git,
    // allow different credentials per environment, and follow security best practices
    this.accessKey = process.env.GONG_ACCESS_KEY || '';
    this.accessSecret = process.env.GONG_ACCESS_SECRET || '';
    
    // Validate that required environment variables are set
    if (!this.accessKey || !this.accessSecret) {
      throw new Error('Missing required Gong API credentials. Please set GONG_ACCESS_KEY and GONG_ACCESS_SECRET in your .env file');
    }
    
    // Create Base64 encoded auth header: ACCESS_KEY:ACCESS_SECRET
    this.authHeader = Buffer.from(`${this.accessKey}:${this.accessSecret}`).toString('base64');
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Basic ${this.authHeader}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000, // 30 second timeout
    });

    console.log('✅ Gong API service initialized with credentials');
  }

  /**
   * Test Gong API connection by fetching users
   * Why this matters: Validates authentication and API connectivity before processing calls.
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/v2/users', {
        params: { limit: 1 } // Just fetch 1 user to test connection
      });
      
      console.log('✅ Gong API connection successful');
      return true;
    } catch (error: any) {
      console.error('❌ Gong API connection failed:', error?.response?.data || error.message);
      return false;
    }
  }

  /**
   * Fetch all users from Gong workspace
   * Why this matters: Users are needed to map call participants and identify prospect vs sales rep statements.
   */
  async getAllUsers(): Promise<GongUser[]> {
    try {
      const allUsers: GongUser[] = [];
      let cursor: string | undefined;
      let hasMore = true;
      
      while (hasMore) {
        const params: any = { limit: 100 };
        if (cursor) {
          params.cursor = cursor;
        }
        
        const response: AxiosResponse<GongUsersResponse> = await this.client.get('/v2/users', { params });
        const { users, records } = response.data;
        
        allUsers.push(...users);
        
        // Check if there are more pages
        cursor = records.cursor;
        hasMore = !!cursor && allUsers.length < records.totalRecords;
        
        console.log(`📥 Fetched ${users.length} users (${allUsers.length}/${records.totalRecords} total)`);
      }
      
      console.log(`✅ Retrieved ${allUsers.length} total users from Gong`);
      return allUsers;
    } catch (error: any) {
      console.error('❌ Failed to fetch Gong users:', error?.response?.data || error.message);
      throw new Error(`Gong API Error: ${error?.response?.data?.message || error.message}`);
    }
  }

  /**
   * Fetch recent calls from Gong with optional date filtering
   * Why this matters: Call data contains the conversations we need to analyze for pain points.
   */
  async getRecentCalls(daysBack: number = 30, limit: number = 100): Promise<GongCall[]> {
    try {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - daysBack);
      
      const allCalls: GongCall[] = [];
      let cursor: string | undefined;
      let hasMore = true;
      let fetchedCount = 0;
      
      while (hasMore && fetchedCount < limit) {
        const params: any = {
          fromDateTime: fromDate.toISOString(),
          limit: Math.min(100, limit - fetchedCount) // Gong API limit is 100 per request
        };
        
        if (cursor) {
          params.cursor = cursor;
        }
        
        const response: AxiosResponse<GongCallsResponse> = await this.client.get('/v2/calls', { params });
        const { calls, records } = response.data;
        
        allCalls.push(...calls);
        fetchedCount += calls.length;
        
        // Check if there are more pages and we haven't hit our limit
        cursor = records.cursor;
        hasMore = !!cursor && fetchedCount < limit && allCalls.length < records.totalRecords;
        
        console.log(`📞 Fetched ${calls.length} calls (${allCalls.length}/${Math.min(limit, records.totalRecords)} requested)`);
      }
      
      console.log(`✅ Retrieved ${allCalls.length} calls from last ${daysBack} days`);
      return allCalls;
    } catch (error: any) {
      console.error('❌ Failed to fetch Gong calls:', error?.response?.data || error.message);
      throw new Error(`Gong API Error: ${error?.response?.data?.message || error.message}`);
    }
  }

  /**
   * Fetch detailed call data with extensive metadata using proper POST endpoint
   * Why this matters: Provides rich conversation details including topics, trackers, highlights, and key points.
   */
  async getCallExtensiveData(callId: string): Promise<any> {
    try {
      // Proper payload for POST /v2/calls/extensive endpoint
      const payload = {
        filter: {
          callIds: [callId]
        },
        contentSelector: {
          context: "Extended",
          contextTiming: ["Now"],
          exposedFields: {
            parties: true,
            content: {
              structure: true,
              topics: true,
              trackers: true,
              trackerOccurrences: true,
              pointsOfInterest: true,
              brief: true,
              outline: true,
              highlights: true,
              callOutcome: true,
              keyPoints: true
            },
            interaction: {
              speakers: true,
              video: true,
              personInteractionStats: true,
              questions: true
            },
            collaboration: {
              publicComments: true
            },
            media: false // Set to true if you need media URLs
          }
        }
      };

      const response = await this.client.post('/v2/calls/extensive', payload);
      
      console.log(`📊 Retrieved extensive data for call ${callId}`);
      return response.data;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        console.log(`⚠️ No extensive data available for call ${callId}`);
        return null;
      }
      
      console.error(`❌ Failed to fetch extensive data for call ${callId}:`, error?.response?.data || error.message);
      throw new Error(`Gong API Error: ${error?.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get call highlights and key insights (extracted from extensive data)
   * Why this matters: Provides the most important conversation moments and insights without full transcript.
   */
  async getCallHighlights(callId: string): Promise<any> {
    try {
      const extensiveData = await this.getCallExtensiveData(callId);
      
      if (!extensiveData || !extensiveData.calls || extensiveData.calls.length === 0) {
        return null;
      }
      
      const callData = extensiveData.calls[0];
      
      // Extract key highlights and insights
      const highlights = {
        callId,
        brief: callData.content?.brief || null,
        keyPoints: callData.content?.keyPoints || [],
        highlights: callData.content?.highlights || [],
        callOutcome: callData.content?.callOutcome || null,
        topics: callData.content?.topics || [],
        trackers: callData.content?.trackers || [],
        speakers: callData.interaction?.speakers || [],
        questions: callData.interaction?.questions || {},
        interactionStats: callData.interaction?.interactionStats || [],
        publicComments: callData.collaboration?.publicComments || [],
        timestamp: new Date().toISOString()
      };
      
      console.log(`⭐ Extracted highlights for call ${callId}`);
      return highlights;
    } catch (error: any) {
      console.error(`❌ Failed to get highlights for call ${callId}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch transcript for a specific call
   * Why this matters: Transcripts contain the actual customer language we need to analyze.
   */
  async getCallTranscript(callId: string): Promise<GongTranscript | null> {
    try {
      const response = await this.client.get(`/v2/calls/${callId}/transcript`);
      
      console.log(`📝 Retrieved transcript for call ${callId}`);
      return response.data;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        console.log(`⚠️ No transcript available for call ${callId}`);
        return null;
      }
      
      console.error(`❌ Failed to fetch transcript for call ${callId}:`, error?.response?.data || error.message);
      throw new Error(`Gong API Error: ${error?.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get comprehensive conversation insights for a call
   * Why this matters: Combines extensive data and highlights for complete conversation understanding.
   */
  async getCallConversationDetails(callId: string): Promise<any> {
    try {
      console.log(`🔍 Fetching comprehensive conversation details for call ${callId}`);
      
      const [extensiveData, highlights] = await Promise.allSettled([
        this.getCallExtensiveData(callId),
        this.getCallHighlights(callId)
      ]);
      
      return {
        callId,
        extensiveData: extensiveData.status === 'fulfilled' ? extensiveData.value : null,
        highlights: highlights.status === 'fulfilled' ? highlights.value : null,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      console.error(`❌ Failed to fetch conversation details for call ${callId}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch multiple call transcripts in batch
   * Why this matters: Efficiently processes multiple calls for bulk analysis.
   */
  async getCallTranscripts(callIds: string[]): Promise<Array<{callId: string, transcript: GongTranscript | null}>> {
    const results: Array<{callId: string, transcript: GongTranscript | null}> = [];
    
    console.log(`🔄 Fetching transcripts for ${callIds.length} calls...`);
    
    // Process in smaller batches to respect rate limits (3 calls per second)
    const batchSize = 3;
    for (let i = 0; i < callIds.length; i += batchSize) {
      const batch = callIds.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (callId) => {
        try {
          const transcript = await this.getCallTranscript(callId);
          return { callId, transcript };
        } catch (error) {
          console.error(`❌ Failed to fetch transcript for call ${callId}`);
          return { callId, transcript: null };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Rate limiting: wait 1 second between batches to stay under 3 calls/second
      if (i + batchSize < callIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    const successfulTranscripts = results.filter(r => r.transcript !== null).length;
    console.log(`✅ Successfully retrieved ${successfulTranscripts}/${callIds.length} transcripts`);
    
    return results;
  }

  /**
   * Get comprehensive call data with transcripts for analysis
   * Why this matters: Provides complete dataset for pain point extraction pipeline.
   */
  async getCallsWithTranscripts(daysBack: number = 30, maxCalls: number = 50): Promise<Array<{call: GongCall, transcript: GongTranscript | null}>> {
    try {
      console.log(`🚀 Starting comprehensive call data fetch (${daysBack} days, max ${maxCalls} calls)`);
      
      // 1. Test connection first
      const isConnected = await this.testConnection();
      if (!isConnected) {
        throw new Error('Failed to connect to Gong API');
      }
      
      // 2. Fetch recent calls
      const calls = await this.getRecentCalls(daysBack, maxCalls);
      
      if (calls.length === 0) {
        console.log('⚠️ No calls found in the specified date range');
        return [];
      }
      
      // 3. Fetch transcripts for all calls
      const callIds = calls.map(call => call.id);
      const transcriptResults = await this.getCallTranscripts(callIds);
      
      // 4. Combine calls with their transcripts
      const callsWithTranscripts = calls.map(call => {
        const transcriptResult = transcriptResults.find(r => r.callId === call.id);
        return {
          call,
          transcript: transcriptResult?.transcript || null
        };
      });
      
      const withTranscripts = callsWithTranscripts.filter(c => c.transcript !== null).length;
      console.log(`✅ Comprehensive fetch complete: ${withTranscripts}/${calls.length} calls have transcripts`);
      
      return callsWithTranscripts;
    } catch (error: any) {
      console.error('❌ Failed to fetch comprehensive call data:', error.message);
      throw error;
    }
  }

  /**
   * Get service health status
   * Why this matters: Provides monitoring and diagnostics for the Gong integration.
   */
  async getHealthStatus(): Promise<{
    connected: boolean;
    authenticated: boolean;
    rateLimitInfo?: any;
    lastError?: string;
  }> {
    try {
      const isConnected = await this.testConnection();
      
      return {
        connected: isConnected,
        authenticated: isConnected,
        rateLimitInfo: {
          limit: '3 calls/second, 10,000/day',
          note: 'Rate limits are managed automatically'
        }
      };
    } catch (error: any) {
      return {
        connected: false,
        authenticated: false,
        lastError: error.message
      };
    }
  }
}

export default GongService; 