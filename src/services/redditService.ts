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
   * Search Reddit posts by keywords in specific subreddits
   * Why this matters: This is our core data collection functionality.
   */
  async searchPosts(request: RedditSearchRequest): Promise<RedditSearchResponse> {
    if (!this.accessToken) {
      throw new Error('Reddit client not initialized');
    }

    const { keywords, subreddits, limit = 25, timeframe = 'week', sort = 'top' } = request;
    const allPosts: RedditPost[] = [];
    const seenIds = new Set<string>();

    console.log(`🔍 Searching Reddit: ${keywords.join(', ')} in r/${subreddits.join(', r/')}`);

    try {
      for (const subreddit of subreddits) {
        await this.rateLimitDelay();
        console.log(`📡 Searching r/${subreddit}`);

        // Get posts from subreddit
        const response = await axios.get(`${this.baseURL}/r/${subreddit}/${sort}`, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'User-Agent': process.env.REDDIT_USER_AGENT || 'Apollo-Reddit-Scraper/1.0.0'
          },
          params: {
            limit: limit,
            t: timeframe
          }
        });

        const posts = response.data.data.children;

        // Filter posts by keywords and process
        for (const postWrapper of posts) {
          const post = postWrapper.data;
          
          // Check if post title or content contains any keyword
          const hasKeyword = keywords.some(keyword => {
            const titleMatch = post.title.toLowerCase().includes(keyword.toLowerCase());
            const contentMatch = post.selftext && post.selftext.toLowerCase().includes(keyword.toLowerCase());
            return titleMatch || contentMatch;
          });

          if (!hasKeyword) continue;

          // Skip duplicates and low-quality posts
          if (seenIds.has(post.id) || 
              post.score < 50 || 
              post.title === '[deleted]' || 
              post.title === '[removed]') {
            continue;
          }

          seenIds.add(post.id);

          const processedPost: RedditPost = {
            id: post.id,
            title: post.title,
            content: post.selftext || '',
            score: post.score,
            comments: post.num_comments,
            subreddit: subreddit,
            url: post.url,
            permalink: `https://reddit.com${post.permalink}`,
            author: post.author,
            engagement: post.score + (post.num_comments * 2),
            created_utc: post.created_utc
          };

          allPosts.push(processedPost);
        }
      }

      // Sort by engagement and return top results
      allPosts.sort((a, b) => b.engagement - a.engagement);
      const topPosts = allPosts.slice(0, Math.min(10, allPosts.length));

      console.log(`✅ Found ${allPosts.length} posts, returning top ${topPosts.length}`);

      return {
        posts: topPosts,
        total_found: allPosts.length,
        keywords_used: keywords.join(','),
        subreddits_used: subreddits.join(','),
        search_timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Reddit search failed:', error);
      throw new Error(`Reddit search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Test Reddit connection
   */
  async testConnection(): Promise<boolean> {
    if (!this.accessToken) {
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