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

    const { keywords, subreddits, limit = 25, timeframe = 'week', sort = 'top' } = request;
    const allPosts: RedditPost[] = [];
    const seenIds = new Set<string>();

    console.log(`🔍 Searching Reddit: ${keywords.join(', ')} in r/${subreddits.join(', r/')}`);

    try {
      for (const subreddit of subreddits) {
        for (const keyword of keywords) {
          await this.rateLimitDelay();
          console.log(`📡 Searching r/${subreddit} for "${keyword}"`);

          // Use Reddit search API with broader search parameters
          const response = await axios.get(`${this.baseURL}/r/${subreddit}/search`, {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'User-Agent': process.env.REDDIT_USER_AGENT || 'Apollo-Reddit-Scraper/1.0.0'
            },
            params: {
              q: keyword,                    // Search query
              restrict_sr: 'true',           // Restrict to subreddit
              sort: sort,
              t: 'all',                      // Search all time instead of just 'week' for more results
              limit: Math.min(limit, 100),   // Increase search limit to get more candidates
              type: 'link,self'              // Include both link and text posts
            }
          });

          let posts = response.data.data.children;
          console.log(`📥 Retrieved ${posts.length} posts from r/${subreddit} search for "${keyword}"`);

          // If search returned no results, try fetching recent posts and filtering manually
          if (posts.length === 0) {
            console.log(`🔄 No search results, trying fallback: fetching recent posts from r/${subreddit}`);
            
            try {
              await this.rateLimitDelay(); // Rate limit the fallback request
              const fallbackResponse = await axios.get(`${this.baseURL}/r/${subreddit}/hot`, {
                headers: {
                  'Authorization': `Bearer ${this.accessToken}`,
                  'User-Agent': process.env.REDDIT_USER_AGENT || 'Apollo-Reddit-Scraper/1.0.0'
                },
                params: { limit: 100 }
              });
              
              const allRecentPosts = fallbackResponse.data.data.children;
              console.log(`📥 Fallback: Retrieved ${allRecentPosts.length} recent posts from r/${subreddit}`);
              
              // Filter posts that contain the keyword in title or content
              posts = allRecentPosts.filter((postWrapper: any) => {
                const post = postWrapper.data;
                const title = (post.title || '').toLowerCase();
                const content = (post.selftext || '').toLowerCase();
                const searchTerm = keyword.toLowerCase();
                
                return title.includes(searchTerm) || content.includes(searchTerm);
              });
              
              console.log(`📊 Fallback filtered: ${posts.length} posts contain "${keyword}"`);
            } catch (fallbackError) {
              console.error(`❌ Fallback search failed for r/${subreddit}:`, fallbackError);
            }
          }

          // Filter posts by keywords and process
          for (const postWrapper of posts) {
            const post = postWrapper.data;
            console.log(`🔍 Checking post: "${post.title}" (score: ${post.score})`);
            
            // Skip duplicates and very low-quality posts (reduced threshold for more results)
            if (seenIds.has(post.id)) {
              console.log(`❌ Duplicate post filtered: "${post.title}"`);
              continue;
            }
            
            // Filter out posts with very low engagement (reduced from 50 to 5 for more results)
            if (post.score < 5) {
              console.log(`❌ Low score filtered: "${post.title}" (score: ${post.score}, need >= 5)`);
              continue;
            }
            
            if (post.title === '[deleted]' || post.title === '[removed]') {
              console.log(`❌ Deleted/removed post filtered: "${post.title}"`);
              continue;
            }

            seenIds.add(post.id);

            const processedPost: RedditPost = {
              id: post.id,
              title: post.title,
              content: post.selftext || '',
              score: post.score,
              comments: post.num_comments || 0,
              subreddit: subreddit,
              url: post.url,
              permalink: `https://reddit.com${post.permalink}`,
              author: post.author,
              engagement: post.score + ((post.num_comments || 0) * 2), // Match n8n calculation exactly
              created_utc: post.created_utc
            };

            allPosts.push(processedPost);
            console.log(`✅ Added post: "${post.title}" to results`);
          }
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