import axios from 'axios';
import OpenAI from 'openai';
import { RedditPost, RedditSearchRequest, RedditSearchResponse } from '../types';
import ApolloBrandSentimentService from './apolloBrandSentimentService';

class RedditService {
  private accessToken: string | null = null;
  private lastRequestTime: number = 0;
  private readonly rateLimitDelayMs: number = 1000;
  private readonly baseURL = 'https://oauth.reddit.com';
  private apolloSentimentService: ApolloBrandSentimentService;

  constructor() {
    // Initialize Apollo sentiment service
    this.apolloSentimentService = new ApolloBrandSentimentService();
    
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
   * Fetch comments for a specific Reddit post and search for keyword mentions
   * Why this matters: Analyzes comment discussions to find keyword mentions and sentiment
   */
  async fetchCommentsForPost(postId: string, keywords: string[], postContext?: { title: string; content?: string }): Promise<any[]> {
    await this.ensureInitialized();
    
    const userAgent = process.env.REDDIT_USER_AGENT || 'Apollo-Reddit-Scraper/1.0.0';
    
    try {
      console.log(`🔍 STEP 1: Fetching ALL comments for post ${postId}...`);
      
      // STEP 1: Fetch ALL comments first (no filtering)
      const allComments = await this.fetchAllCommentsFromPost(postId, userAgent);
      
      console.log(`📊 STEP 1 COMPLETE: Fetched ${allComments.length} total comments from post ${postId}`);
      
      // STEP 2: Do keyword matching on ALL comments
      console.log(`🔍 STEP 2: Analyzing ${allComments.length} comments for keyword matches...`);
      const searchTerms = keywords.map(k => k.toLowerCase());
      const matchingComments: any[] = [];
      
      for (const comment of allComments) {
        const commentText = comment.content.toLowerCase();
        const foundKeywords = this.findKeywordMatches(commentText, searchTerms);
        
        if (foundKeywords.length > 0) {
          console.log(`✅ KEYWORD MATCH: u/${comment.author}: "${comment.content.substring(0, 100)}..."`);
          matchingComments.push({
            ...comment,
            keyword_matches: foundKeywords
          });
        }
      }
      
      console.log(`📊 STEP 2 COMPLETE: Found ${matchingComments.length} comments with keyword matches out of ${allComments.length} total`);
      
      // STEP 3: Do sentiment analysis on matching comments
      console.log(`🔍 STEP 3: Analyzing sentiment for ${matchingComments.length} matching comments...`);
      
      for (const comment of matchingComments) {
        try {
          comment.brand_sentiment = await this.analyzeBrandSentiment(comment.content, postContext);
          comment.helpfulness_sentiment = await this.analyzeHelpfulnessSentiment(comment.content, postContext);
          console.log(`📊 SENTIMENT: u/${comment.author} -> Brand: ${comment.brand_sentiment}, Helpfulness: ${comment.helpfulness_sentiment}`);
        } catch (error) {
          console.warn(`⚠️ Sentiment analysis failed for comment ${comment.id}:`, error);
          comment.brand_sentiment = 'neutral'; // fallback
          comment.helpfulness_sentiment = 'neutral'; // fallback
        }
      }
      
      console.log(`📊 STEP 3 COMPLETE: Sentiment analysis completed for all matching comments`);
      console.log(`🎉 FINAL RESULT: ${matchingComments.length} fully analyzed comments with keywords and sentiment`);
      
      return matchingComments;
      
    } catch (error: any) {
      console.error(`❌ Error in fetchCommentsForPost for ${postId}:`, error?.response?.status, error?.message);
      return [];
    }
  }

  /**
   * Fetch ALL comments from a post without any filtering
   * Why this matters: Gets complete comment dataset before any analysis or filtering
   */
  private async fetchAllCommentsFromPost(postId: string, userAgent: string): Promise<any[]> {
    const allComments: any[] = [];
    const processedCommentIds = new Set<string>();
    
    // Process comment recursively and collect ALL comments
    const processComment = (commentData: any, depth: number = 0) => {
      if (!commentData) return;
      
      // Handle "more" objects that contain additional comments
      if (commentData.kind === 'more') {
        console.log(`🔄 Found "more" object with ${commentData.data?.count || 0} additional comments (skipping for now)`);
        return;
      }
      
      if (commentData.kind !== 't1') return;
      
      const comment = commentData.data;
      if (!comment || !comment.id) return;
      
      // Skip if already processed
      if (processedCommentIds.has(comment.id)) return;
      processedCommentIds.add(comment.id);
      
      // Skip deleted/removed comments
      if (!comment.body || comment.body === '[deleted]' || comment.body === '[removed]') {
        return;
      }
      
      // Add ALL comments to our collection (no filtering here)
      allComments.push({
        id: comment.id,
        content: comment.body,
        author: comment.author || 'unknown',
        score: comment.score || 0,
        created_utc: comment.created_utc,
        post_id: postId,
        parent_id: comment.parent_id,
        depth: depth
      });
      
      // Process replies recursively
      if (comment.replies && comment.replies.data && comment.replies.data.children) {
        comment.replies.data.children.forEach((reply: any) => processComment(reply, depth + 1));
      }
    };
    
    // Fetch comments using multiple sort methods to get comprehensive coverage
    const sortMethods = ['confidence', 'new', 'old', 'controversial', 'top'];
    
    for (const sortMethod of sortMethods) {
      try {
        await this.rateLimitDelay();
        
        console.log(`📄 Fetching comments with sort: ${sortMethod}`);
        
        const response = await axios.get(`${this.baseURL}/comments/${postId}`, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'User-Agent': userAgent
          },
          params: {
            limit: null, // No limit
            sort: sortMethod,
            depth: null, // No depth limit
            showmore: true,
            threaded: false
          }
        });
        
        const commentListing = response.data[1];
        if (commentListing?.data?.children) {
          const beforeCount = allComments.length;
          commentListing.data.children.forEach((commentData: any) => processComment(commentData, 0));
          const newComments = allComments.length - beforeCount;
          console.log(`📄 Sort '${sortMethod}': Added ${newComments} new comments (${allComments.length} total so far)`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to fetch comments with sort '${sortMethod}':`, error);
      }
    }
    
    console.log(`📊 Fetched ${allComments.length} unique comments using ${sortMethods.length} different sort methods`);
    return allComments;
  }

  /**
   * Find keyword matches in text with improved but permissive matching logic
   * Why this matters: Finds more matches than simple includes() while avoiding false negatives
   */
  private findKeywordMatches(text: string, searchTerms: string[]): string[] {
    const foundKeywords: string[] = [];
    
    for (const term of searchTerms) {
      const trimmedTerm = term.trim();
      if (!trimmedTerm) continue;
      
      // Method 1: Simple case-insensitive match (most permissive)
      if (text.includes(trimmedTerm)) {
        foundKeywords.push(trimmedTerm);
        continue;
      }
      
      // Method 2: Handle compound terms by checking individual words
      if (trimmedTerm.includes(' ')) {
        const words = trimmedTerm.split(' ').filter(w => w.length > 2);
        const matchedWords = words.filter(word => text.includes(word));
        
        // If we match any significant word from the compound term, include it
        if (matchedWords.length > 0) {
          foundKeywords.push(trimmedTerm);
          continue;
        }
      }
      
      // Method 3: Simple plural/variation check
      const variations = [
        trimmedTerm + 's',           // plural
        trimmedTerm + 'ed',          // past tense
        trimmedTerm + 'ing',         // present participle
        trimmedTerm.endsWith('y') ? trimmedTerm.slice(0, -1) + 'ies' : null // y to ies
      ].filter(Boolean) as string[];
      
      for (const variation of variations) {
        if (text.includes(variation)) {
          foundKeywords.push(trimmedTerm);
          break;
        }
      }
    }
    
    return [...new Set(foundKeywords)]; // Remove duplicates
  }

  /**
   * Analyze brand sentiment in comments using specialized Apollo sentiment analysis
   * Why this matters: Provides accurate Apollo-specific brand sentiment analysis for competitive intelligence,
   * helping identify engagement opportunities by understanding how users specifically feel about Apollo.io
   * versus generic sentiment analysis that might miss Apollo-specific context and terminology.
   */
  private async analyzeBrandSentiment(
    content: string, 
    postContext?: { title: string; content?: string }
  ): Promise<'positive' | 'negative' | 'neutral'> {
    // Use specialized Apollo sentiment analyzer
    return await this.apolloSentimentService.analyzeApolloSentiment(content, postContext);
  }

  /**
   * Analyze helpfulness sentiment in comments using AI-powered contextual analysis
   * Why this matters: Determines if comments are constructive, helpful, and supportive toward
   * the original poster, regardless of brand mentions. Useful for understanding community
   * dynamics and identifying high-quality engagement opportunities.
   */
  private async analyzeHelpfulnessSentiment(
    content: string, 
    postContext?: { title: string; content?: string }
  ): Promise<'positive' | 'negative' | 'neutral'> {
    // Fallback to simple analysis for very short comments or if AI fails
    if (!content || content.trim().length < 10) {
      return this.fallbackSentimentAnalysis(content);
    }

    try {
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });

      const contextPrompt = postContext ? 
        `HELPFULNESS CONTEXT: You are analyzing how helpful and constructive this comment is toward the original poster's situation, regardless of brand mentions.

ORIGINAL POST CONTEXT:
Title: "${postContext.title}"
Content: "${postContext.content || 'No additional content'}"

COMMENT TO ANALYZE: "${content}"

Analyze how helpful this comment is to the original poster. Consider:
- Is the commenter providing useful advice or information?
- Are they being supportive of the poster's situation or needs?
- Are they sharing relevant experience that helps the poster?
- Focus on helpfulness to the poster, not brand sentiment

Examples:
- "I had the same issue, here's what worked for me..." → POSITIVE (helpful advice)
- "You're an idiot for even asking this" → NEGATIVE (unhelpful, dismissive)
- "That company sucks, try this alternative instead" → POSITIVE (helpful despite harsh language)
- "I agree with the other commenter" → NEUTRAL (acknowledging but not adding value)
- "Here are 3 solutions you should consider..." → POSITIVE (constructive advice)
- "This post is stupid" → NEGATIVE (unhelpful criticism)

Respond with only one word: "positive", "negative", or "neutral"

Guidelines:
- positive: Helpful advice, supportive responses, sharing relevant experience, constructive suggestions
- negative: Dismissive, unhelpful, critical of the poster, trolling, off-topic negativity
- neutral: Factual but not particularly helpful, unclear relevance, minimal engagement` :
        `Analyze the helpfulness of this Reddit comment toward the original poster.

Comment: "${content}"

Respond with only one word: "positive", "negative", or "neutral"

Guidelines:
- positive: Helpful, supportive, constructive advice
- negative: Dismissive, unhelpful, critical of poster
- neutral: Factual but not particularly helpful`;

      const completion = await openai.responses.create({
        model: "gpt-5-nano",
        input: contextPrompt
      });

      const sentiment = completion.output_text?.trim().toLowerCase();
      
      if (sentiment === 'positive' || sentiment === 'negative' || sentiment === 'neutral') {
        return sentiment as 'positive' | 'negative' | 'neutral';
      }
      
      // Fallback if AI response is unexpected
      return this.fallbackSentimentAnalysis(content);
      
    } catch (error) {
      console.warn('⚠️ AI helpfulness sentiment analysis failed, using fallback:', error);
      return this.fallbackSentimentAnalysis(content);
    }
  }

  /**
   * Fallback sentiment analysis using improved keyword-based approach
   * Why this matters: Provides backup sentiment analysis when AI is unavailable
   */
  private fallbackSentimentAnalysis(content: string): 'positive' | 'negative' | 'neutral' {
    if (!content) return 'neutral';
    
    const text = content.toLowerCase();
    
    // Enhanced keyword lists with more comprehensive coverage
    const positiveWords = [
      'great', 'awesome', 'excellent', 'love', 'amazing', 'perfect', 'best', 'good', 'helpful', 
      'recommend', 'works', 'easy', 'simple', 'fantastic', 'wonderful', 'brilliant', 'outstanding',
      'impressive', 'solid', 'reliable', 'effective', 'useful', 'valuable', 'satisfied', 'happy',
      'pleased', 'glad', 'thank', 'thanks', 'appreciate', 'grateful', 'success', 'win', 'solved'
    ];
    
    const negativeWords = [
      'terrible', 'awful', 'hate', 'worst', 'bad', 'horrible', 'useless', 'broken', 'sucks', 
      'disappointed', 'frustrating', 'difficult', 'hard', 'problem', 'issue', 'bug', 'error',
      'fail', 'failed', 'failing', 'wrong', 'annoying', 'stupid', 'ridiculous', 'waste',
      'regret', 'avoid', 'warning', 'beware', 'scam', 'fraud', 'rip', 'ripoff', 'overpriced'
    ];
    
    // Check for negation words that might flip sentiment
    const negationWords = ['not', 'no', 'never', 'dont', "don't", 'cant', "can't", 'wont', "won't", 'isnt', "isn't", 'wasnt', "wasn't"];
    const hasNegation = negationWords.some(neg => text.includes(neg));
    
    let positiveCount = 0;
    let negativeCount = 0;
    
    // Count positive words
    positiveWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) positiveCount += matches.length;
    });
    
    // Count negative words  
    negativeWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) negativeCount += matches.length;
    });
    
    // Apply negation logic - if there's negation, be more conservative
    if (hasNegation) {
      // If there's negation and positive words, it might be negative
      if (positiveCount > 0 && negativeCount === 0) {
        return 'negative'; // e.g., "not good"
      }
      // If there's negation and negative words, it might be positive
      if (negativeCount > 0 && positiveCount === 0) {
        return 'positive'; // e.g., "not bad"
      }
    }
    
    // Standard comparison with higher threshold for classification
    const threshold = 1; // Require at least 1 more sentiment word to classify
    if (positiveCount > negativeCount + threshold) return 'positive';
    if (negativeCount > positiveCount + threshold) return 'negative';
    return 'neutral';
  }

  /**
   * Fetch and analyze comments for multiple posts
   * Why this matters: Efficiently processes comments for all posts in a batch
   */
  async analyzeCommentsForPosts(posts: any[], keywords: string[]): Promise<Map<string, any>> {
    const commentAnalysis = new Map<string, any>();
    
    console.log(`🔍 Analyzing comments for ${posts.length} posts...`);
    
    for (const post of posts) {
      try {
        const postContext = {
          title: post.title,
          content: post.content || post.selftext
        };
        
        const comments = await this.fetchCommentsForPost(post.id, keywords, postContext);
        
        if (comments.length > 0) {
          // Comments already have sentiment analysis from fetchCommentsForPost
          const analyzedComments = comments;
          
          // Calculate sentiment breakdowns for both types
          const brandSentimentBreakdown = {
            positive: analyzedComments.filter(c => c.brand_sentiment === 'positive').length,
            negative: analyzedComments.filter(c => c.brand_sentiment === 'negative').length,
            neutral: analyzedComments.filter(c => c.brand_sentiment === 'neutral').length
          };
          
          const helpfulnessSentimentBreakdown = {
            positive: analyzedComments.filter(c => c.helpfulness_sentiment === 'positive').length,
            negative: analyzedComments.filter(c => c.helpfulness_sentiment === 'negative').length,
            neutral: analyzedComments.filter(c => c.helpfulness_sentiment === 'neutral').length
          };
          
          // Get all comments with keyword matches (sorted by score)
          const topComments = analyzedComments
            .sort((a, b) => b.score - a.score)
            .map(comment => ({
              ...comment,
              excerpt: comment.content.length > 150 ? comment.content.substring(0, 150) + '...' : comment.content
            }));
          
          commentAnalysis.set(post.id, {
            total_comments_analyzed: analyzedComments.length,
            keyword_mentions: analyzedComments.reduce((sum, c) => {
              // Count actual keyword occurrences in comment content (case-insensitive)
              const content = c.content.toLowerCase();
              return sum + c.keyword_matches.reduce((keywordSum: number, keyword: string) => {
                const regex = new RegExp(keyword.toLowerCase(), 'gi');
                const matches = content.match(regex);
                return keywordSum + (matches ? matches.length : 0);
              }, 0);
            }, 0),
            brand_sentiment_breakdown: brandSentimentBreakdown,
            helpfulness_sentiment_breakdown: helpfulnessSentimentBreakdown,
            top_comments: topComments,
            key_themes: [...new Set(analyzedComments.flatMap(c => c.keyword_matches))]
          });
        }
      } catch (error) {
        console.error(`❌ Error analyzing comments for post ${post.id}:`, error);
        // Continue with other posts
      }
    }
    
    console.log(`✅ Comment analysis complete. Found insights for ${commentAnalysis.size} posts`);
    return commentAnalysis;
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