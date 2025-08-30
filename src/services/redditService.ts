import axios from 'axios';
import { RedditPost, RedditSearchRequest, RedditSearchResponse } from '../types';

class RedditService {
  private accessToken: string | null = null;
  private lastRequestTime: number = 0;
  private readonly rateLimitDelayMs: number = 1000;
  private readonly baseURL = 'https://oauth.reddit.com';

  constructor() {
    // Delay initialization to allow environment variables to load
    setTimeout(() => {
      this.initializeClient();
    }, 100);
  }

  /**
   * Initialize Reddit client with OAuth credentials
   * Why this matters: Reddit requires OAuth authentication for API access.
   */
  private async initializeClient(): Promise<void> {
    const clientId = process.env.REDDIT_CLIENT_ID;
    const clientSecret = process.env.REDDIT_CLIENT_SECRET;
    const userAgent = process.env.REDDIT_USER_AGENT || 'Apollo-Reddit-Scraper/1.0.0';

    if (!clientId || !clientSecret) {
      console.error('Reddit credentials not found in environment variables');
      return;
    }

    try {
      // Get access token using client credentials flow
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      
      const response = await axios.post('https://www.reddit.com/api/v1/access_token', 
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'User-Agent': userAgent,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      console.log('✅ Reddit client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Reddit client:', error);
      console.log('Credentials available:', { 
        hasClientId: !!clientId, 
        hasClientSecret: !!clientSecret,
        userAgent 
      });
    }
  }

  /**
   * Rate limiting helper
   * Why this matters: Reddit API has rate limits to prevent abuse.
   */
  private async rateLimitDelay(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelayMs) {
      const delayTime = this.rateLimitDelayMs - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delayTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Fetch posts from a subreddit within a specific time window by paginating /new
   * Why this matters: Reddit doesn't support arbitrary date ranges. Streaming /new
   * and filtering by created_utc lets us implement exact windows (e.g., 1–30 days,
   * 31–120 days) with predictable, non-overlapping results.
   */
  private async fetchPostsByWindow(params: {
    subreddit: string;
    keyword: string;
    sinceUnix: number;     // older bound (inclusive)
    untilUnix: number;     // newer bound (exclusive)
    maxToCollect: number;  // safety cap to avoid unbounded pagination
    userAgent: string;
  }): Promise<any[]> {
    const { subreddit, keyword, sinceUnix, untilUnix, maxToCollect, userAgent } = params;

    let after: string | undefined = undefined;
    const collected: any[] = [];
    const searchTerm = keyword.toLowerCase();

    console.log(`🔍 Searching r/${subreddit} for "${keyword}" between ${new Date(sinceUnix * 1000).toDateString()} and ${new Date(untilUnix * 1000).toDateString()}`);
    
    while (collected.length < maxToCollect) {
      await this.rateLimitDelay();
      
      try {
        const resp: any = await axios.get(`${this.baseURL}/r/${subreddit}/new`, {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'User-Agent': userAgent,
          },
          params: { limit: 100, after },
        });

        const children: any[] = resp?.data?.data?.children || [];
        console.log(`📄 Got ${children.length} posts from Reddit API`);
        if (children.length === 0) break;

        for (const child of children) {
        const p = child?.data;
        if (!p?.created_utc) continue;
        const ts: number = p.created_utc;

        // Debug: Log first few posts to see what we're getting
        if (collected.length === 0) {
          console.log(`📅 First post timestamp: ${ts} (${new Date(ts * 1000).toDateString()})`);
        }

        // Results are newest -> older; once older than lower bound we can stop early
        if (ts < sinceUnix) {
          console.log(`⏹️ Reached posts older than target range. Stopping search.`);
          return collected;
        }

        if (ts >= sinceUnix && ts < untilUnix) {
          const title = (p.title || '').toLowerCase();
          const content = (p.selftext || '').toLowerCase();
          if (title.includes(searchTerm) || content.includes(searchTerm)) {
            console.log(`✅ Found matching post: "${p.title}" (${new Date(ts * 1000).toDateString()})`);
            collected.push(child);
            if (collected.length >= maxToCollect) break;
          }
        }
        }

        after = resp?.data?.data?.after;
        if (!after) break;
        
      } catch (error: any) {
        console.error(`❌ Error fetching from r/${subreddit}:`, error?.response?.status, error?.response?.statusText);
        
        if (error?.response?.status === 404) {
          console.error(`❌ Subreddit r/${subreddit} not found or is private/restricted`);
          throw new Error(`Subreddit r/${subreddit} not found or is private. Please try a different subreddit.`);
        } else if (error?.response?.status === 403) {
          console.error(`❌ Access forbidden to r/${subreddit}`);
          throw new Error(`Access forbidden to r/${subreddit}. The subreddit may be private or restricted.`);
        } else {
          console.error(`❌ Reddit API error for r/${subreddit}:`, error?.message);
          throw new Error(`Reddit API error: ${error?.message || 'Unknown error'}`);
        }
      }
    }

    return collected;
  }

  /**
   * Ensure Reddit client is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.accessToken) {
      console.log('🔄 Reddit client not initialized, initializing now...');
      await this.initializeClient();
      
      if (!this.accessToken) {
        throw new Error('Reddit client not initialized');
      }
    }
  }

  /**
   * Search Reddit posts by keywords in specific subreddits
   * Why this matters: This is our core data collection functionality.
   */
  async searchPosts(request: RedditSearchRequest): Promise<RedditSearchResponse> {
    await this.ensureInitialized();

    const { keywords, subreddits, limit = 25, timeframe = 'recent' } = request;
    const allPosts: RedditPost[] = [];
    const seenIds = new Set<string>();

    console.log(`🔍 Searching Reddit: ${keywords.join(', ')} in r/${subreddits.join(', r/')}`);

    try {
      // Validate all subreddits before proceeding
      console.log(`🔍 Validating ${subreddits.length} subreddits...`);
      for (const subreddit of subreddits) {
        const validation = await this.validateSubreddit(subreddit);
        if (!validation.valid) {
          throw new Error(validation.error || `Invalid subreddit: r/${subreddit}`);
        }
      }
      console.log(`✅ All subreddits validated successfully`);

      const userAgent = process.env.REDDIT_USER_AGENT || 'Apollo-Reddit-Scraper/1.0.0';
      const now = Math.floor(Date.now() / 1000);

      // Windows (exact per your spec):
      // Newest: 1–30 days; Older: 31–120 days
      let windowSince = 0; // older bound (inclusive)
      let windowUntil = now; // newer bound (exclusive)

      if (timeframe === 'recent') {
        // Recent: 1-30 days old (last month)
        const maxDays = 30;
        const minDays = 1;
        windowSince = now - maxDays * 24 * 60 * 60;
        windowUntil = now - (minDays - 1) * 24 * 60 * 60; // exclusive of 0 days
      } else if (timeframe === 'older') {
        // Older: 31-365 days old (2-12 months, no overlap with recent)
        const minDays = 31;  // 31 days minimum (ensures no overlap with recent 1-30 days)
        const maxDays = 365; // 12 months maximum (full year of historical data)
        windowSince = now - maxDays * 24 * 60 * 60;
        windowUntil = now - (minDays - 1) * 24 * 60 * 60;
      } else {
        // Fallback: treat unknown timeframe as recent
        const maxDays = 30;
        const minDays = 1;
        windowSince = now - maxDays * 24 * 60 * 60;
        windowUntil = now - (minDays - 1) * 24 * 60 * 60;
      }

      // Collect children within the window for each subreddit/keyword
      let windowedChildren: any[] = [];
      for (const subreddit of subreddits) {
        for (const keyword of keywords) {
          const chunk = await this.fetchPostsByWindow({
            subreddit,
            keyword,
            sinceUnix: windowSince,
            untilUnix: windowUntil,
            maxToCollect: Math.max(limit * 10, 200),
            userAgent,
          });
          windowedChildren.push(...chunk);
        }
      }

      // Deduplicate by id
      const seenChildIds = new Set<string>();
      windowedChildren = windowedChildren.filter((c: any) => {
        const id = c?.data?.id;
        if (!id) return false;
        if (seenChildIds.has(id)) return false;
        seenChildIds.add(id);
        return true;
      });

      // Process into RedditPost
      for (const postWrapper of windowedChildren) {
        const post = postWrapper.data;
        if (!post || !post.title || !post.id) continue;
        if (seenIds.has(post.id)) continue;
        if (post.title === '[deleted]' || post.title === '[removed]') continue;

        seenIds.add(post.id);

        const processedPost: RedditPost = {
          id: post.id,
          title: post.title,
          content: post.selftext || '',
          score: post.score,
          comments: post.num_comments || 0,
          subreddit: post.subreddit || '',
          url: post.url,
          permalink: `https://reddit.com${post.permalink}`,
          author: post.author,
          engagement: post.score + ((post.num_comments || 0) * 2),
          created_utc: post.created_utc,
        };

        allPosts.push(processedPost);
      }

      // Sort by engagement and return top results
      allPosts.sort((a, b) => b.engagement - a.engagement);
      const topPosts = allPosts.slice(0, Math.min(limit, allPosts.length));

      console.log(`✅ Windowed search (${timeframe}) found ${allPosts.length} posts, returning top ${topPosts.length}`);

      return {
        posts: topPosts,
        total_found: allPosts.length,
        keywords_used: keywords.join(','),
        subreddits_used: subreddits.join(','),
        search_timestamp: new Date().toISOString(),
      };

    } catch (error) {
      console.error('❌ Reddit search failed:', error);
      throw new Error(`Reddit search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate that a subreddit exists and is accessible
   * Why this matters: Prevents 404 errors by checking subreddit accessibility before attempting to search
   */
  async validateSubreddit(subreddit: string): Promise<{ valid: boolean; error?: string }> {
    try {
      await this.ensureInitialized();
      await this.rateLimitDelay();
      
      // Test with a simple request to the subreddit
      const response = await axios.get(`${this.baseURL}/r/${subreddit}/hot`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'User-Agent': process.env.REDDIT_USER_AGENT || 'Apollo-Reddit-Scraper/1.0.0'
        },
        params: { limit: 1 }
      });

      console.log(`✅ Subreddit r/${subreddit} is accessible`);
      return { valid: true };
      
    } catch (error: any) {
      console.error(`❌ Subreddit validation failed for r/${subreddit}:`, error?.response?.status, error?.response?.statusText);
      
      if (error?.response?.status === 404) {
        return { valid: false, error: `Subreddit r/${subreddit} does not exist` };
      } else if (error?.response?.status === 403) {
        return { valid: false, error: `Subreddit r/${subreddit} is private or restricted` };
      } else {
        return { valid: false, error: `Unable to access r/${subreddit}: ${error?.message || 'Unknown error'}` };
      }
    }
  }

  /**
   * Test Reddit connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.ensureInitialized();
    } catch (error) {
      return false;
    }

    try {
      await this.rateLimitDelay();
      
      // Test with a simple subreddit request
      const response = await axios.get(`${this.baseURL}/r/popular/hot`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'User-Agent': process.env.REDDIT_USER_AGENT || 'Apollo-Reddit-Scraper/1.0.0'
        },
        params: { limit: 1 }
      });

      console.log(`✅ Reddit connection test successful`);
      return true;
    } catch (error) {
      console.error('❌ Reddit connection test failed:', error);
      return false;
    }
  }

  /**
   * Get client status for monitoring
   */
  getClientStatus(): { initialized: boolean; hasCredentials: boolean } {
    const hasCredentials = !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
    
    return {
      initialized: this.accessToken !== null,
      hasCredentials
    };
  }
}

export const redditService = new RedditService();
export default redditService; 