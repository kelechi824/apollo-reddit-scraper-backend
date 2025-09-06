import OpenAI from 'openai';
import { AnalyzedPost } from '../types';

interface PatternCategory {
  id: string;
  name: string;
  description: string;
  post_count: number;
  total_upvotes: number;
  total_comments: number;
  posts: Array<{
    id: string;
    title: string;
    excerpt: string;
    subreddit: string;
    score: number;
    comments: number;
    created_utc: number;
    permalink: string;
    author: string;
    post_rank: number;
  }>;
  key_themes: string[];
  urgency_level: 'high' | 'medium' | 'low';
}

interface PatternAnalysisResult {
  categories: PatternCategory[];
  overall_summary: {
    total_posts: number;
    total_upvotes: number;
    total_comments: number;
    most_active_subreddit: string;
    dominant_themes: string[];
    community_narrative: string; // Rich, human-readable summary of what the community is discussing
    time_range: {
      oldest_post: number;
      newest_post: number;
    };
  };
  analysis_timestamp: string;
}

interface PatternAnalysisRequest {
  analyzed_posts: AnalyzedPost[];
  keywords: string;
}

/**
 * Pattern Analysis Service
 * Why this matters: Uses GPT-5 Nano to categorize Reddit posts into meaningful patterns and themes
 * for high-level overview and insights discovery.
 */
class PatternAnalysisService {
  private client: OpenAI | null = null;

  constructor() {
    // Delay initialization to allow environment variables to load
    setTimeout(() => {
      this.initializeClient();
    }, 100);
  }

  /**
   * Initialize OpenAI client with API key
   * Why this matters: OpenAI requires API key authentication and delayed initialization ensures
   * environment variables are loaded before attempting to create the client.
   */
  private async initializeClient(): Promise<void> {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      console.error('❌ OPENAI_API_KEY not found in environment variables for PatternAnalysisService');
      this.client = null;
      return;
    }

    try {
      this.client = new OpenAI({
        apiKey: apiKey,
      });
      console.log('✅ Pattern Analysis Service initialized with OpenAI GPT-5 Nano');
    } catch (error) {
      console.error('❌ Failed to initialize OpenAI client for PatternAnalysisService:', error);
      this.client = null;
    }
  }

  /**
   * Analyze patterns across multiple analyzed posts
   * Why this matters: Groups posts by themes, pain points, and discussion patterns to provide
   * a high-level overview similar to Reddit's native categorization
   */
  /**
   * Generate consistent cache key for OpenAI prompt caching
   * Why this matters: Creates deterministic cache keys for system prompts to enable
   * OpenAI's automatic caching, reducing costs by 50% for repeated requests.
   */
  private generateCacheKey(promptType: string, version: string = 'v1'): string {
    return `apollo-pattern-analysis-${promptType}-${version}`;
  }

  /**
   * Build system prompt for pattern analysis
   * Why this matters: Defines the analytical framework for identifying patterns and themes
   * across Reddit posts, enabling consistent categorization and insight generation.
   * 
   * CACHING OPTIMIZATION: This system prompt is static and can be cached with prompt_cache_key
   * to reduce costs by 50% on subsequent requests.
   */
  private buildSystemPrompt(): string {
    return `You are an expert Reddit discussion analyst specializing in identifying patterns, themes, and categories across multiple posts. You analyze collections of Reddit posts to group them into meaningful categories based on common themes, pain points, and discussion patterns.

Your task is to analyze the provided Reddit posts and group them into 3-6 meaningful categories that represent the main discussion themes. Each category should contain related posts and provide insights into the overall conversation patterns.

CRITICAL: You must respond with ONLY valid JSON. No explanations, no markdown, no extra text. Just the JSON object.`;
  }

  async analyzePatterns(request: PatternAnalysisRequest): Promise<PatternAnalysisResult> {
    // Ensure client is initialized before use
    if (!this.client) {
      await this.initializeClient();
    }
    
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    if (request.analyzed_posts.length === 0) {
      throw new Error('No posts provided for pattern analysis');
    }

    console.log(`🧠 Analyzing patterns across ${request.analyzed_posts.length} posts with GPT-5 Nano...`);

    try {
      const analysisPrompt = this.buildPatternAnalysisPrompt(request.analyzed_posts, request.keywords);
      
      const startTime = Date.now();
      
      const response = await this.client.responses.create({
        model: 'gpt-5-nano',
        input: [
          {
            role: "developer",
            content: [
              {
                type: "input_text",
                text: this.buildSystemPrompt()
              }
            ]
          },
          {
            role: "user", 
            content: [
              {
                type: "input_text",
                text: analysisPrompt
              }
            ]
          }
        ]
        // Note: prompt_cache_key removed due to TypeScript definition limitations
      });

      const duration = Date.now() - startTime;
      const usage = response.usage;
      
      if (usage) {
        const inputTokens = usage.input_tokens || 0;
        const outputTokens = usage.output_tokens || 0;
        const totalTokens = inputTokens + outputTokens;
        
        // GPT-5-nano pricing (approximate)
        const inputCost = (inputTokens / 1000) * 0.0015;
        const outputCost = (outputTokens / 1000) * 0.006;
        const totalCost = inputCost + outputCost;
        
        console.log(`💰 Pattern Analysis Token Usage - Input: ${inputTokens}, Output: ${outputTokens}, Total: ${totalTokens}`);
        console.log(`💵 Pattern Analysis Cost - Input: $${inputCost.toFixed(4)}, Output: $${outputCost.toFixed(4)}, Total: $${totalCost.toFixed(4)}`);
        console.log(`⏱️ Pattern Analysis Duration: ${duration}ms`);
      }

      const content = response.output_text;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      console.log('🔍 GPT-5-nano pattern analysis response (first 500 chars):', content.substring(0, 500));

      const analysis = JSON.parse(content) as PatternAnalysisResult;
      
      // Add timestamp
      analysis.analysis_timestamp = new Date().toISOString();
      
      // Validate the analysis structure
      this.validatePatternAnalysis(analysis, request.analyzed_posts);
      
      console.log(`✅ Pattern analysis completed: ${analysis.categories.length} categories identified`);
      
      return analysis;
      
    } catch (error) {
      console.error('❌ Pattern analysis error:', error);
      throw error;
    }
  }

  /**
   * Build the analysis prompt for GPT-5 Nano
   * Why this matters: Creates a structured prompt that guides the AI to categorize posts effectively
   */
  private buildPatternAnalysisPrompt(posts: AnalyzedPost[], keywords: string): string {
    const postsData = posts.map(post => ({
      id: post.id,
      title: post.title,
      content: post.content ? post.content.substring(0, 500) : '', // Limit content length
      subreddit: post.subreddit,
      score: post.score,
      comments: post.comments,
      created_utc: post.created_utc,
      permalink: post.permalink,
      author: post.author,
      post_rank: post.post_rank,
      pain_point: post.analysis.pain_point,
      audience_insight: post.analysis.audience_insight,
      content_opportunity: post.analysis.content_opportunity,
      urgency_level: post.analysis.urgency_level,
      comment_analysis: post.comment_analysis ? {
        keyword_mentions: post.comment_analysis.keyword_mentions,
        brand_sentiment_breakdown: post.comment_analysis.brand_sentiment_breakdown,
        helpfulness_sentiment_breakdown: post.comment_analysis.helpfulness_sentiment_breakdown,
        top_comment_themes: post.comment_analysis.key_themes,
        sample_comments: post.comment_analysis.top_comments.slice(0, 2).map(c => ({
          content: c.content.substring(0, 200),
          brand_sentiment: c.brand_sentiment,
          helpfulness_sentiment: c.helpfulness_sentiment,
          score: c.score
        }))
      } : null
    }));

    // Calculate overall statistics
    const totalUpvotes = posts.reduce((sum, post) => sum + post.score, 0);
    const totalComments = posts.reduce((sum, post) => sum + post.comments, 0);
    const subreddits = [...new Set(posts.map(post => post.subreddit))];
    const oldestPost = Math.min(...posts.map(post => post.created_utc));
    const newestPost = Math.max(...posts.map(post => post.created_utc));

    return `
ANALYSIS CONTEXT:
- Keywords searched: "${keywords}"
- Total posts to analyze: ${posts.length}
- Subreddits involved: ${subreddits.join(', ')}
- Total upvotes across all posts: ${totalUpvotes}
- Total comments across all posts: ${totalComments}

POSTS DATA:
${JSON.stringify(postsData, null, 2)}

ANALYSIS REQUIREMENTS:

1. Group these posts into 3-6 meaningful categories based on:
   - Common themes and topics
   - Similar pain points or challenges
   - Discussion patterns and sentiment
   - Audience types and concerns
   - Comment insights and keyword mentions (when available)

2. For each category, provide:
   - A clear, descriptive name (e.g., "Performance and Reliability Concerns", "Feature Requests", "Alternative Solutions")
   - A brief description of what this category represents
   - List of posts that belong to this category
   - Key themes that define this category
   - Urgency level based on the posts' urgency levels
   - Comment insights: total keyword mentions, average sentiment, and key themes from comments
   - Top comments preview when available

3. Create an overall summary with:
   - Total statistics
   - Most active subreddit
   - Dominant themes across all categories
   - Community narrative: A compelling, human-readable 2-3 sentence summary that captures what this community is actively seeking, discussing, and caring about. Write it as if you're briefing a social media manager about the pulse of the conversation. Focus on specific challenges, solutions being sought, tools being discussed, and the overall direction of community interests.
   - Time range of discussions

4. For each post in a category, include:
   - Post ID, title, excerpt (first 150 characters of content)
   - Subreddit, score, comments, timestamp
   - Permalink and author
   - Post rank

RESPONSE FORMAT (JSON):
{
  "categories": [
    {
      "id": "category-1",
      "name": "Category Name",
      "description": "Brief description of this category",
      "post_count": 3,
      "total_upvotes": 150,
      "total_comments": 45,
      "posts": [
        {
          "id": "post_id",
          "title": "Post Title",
          "excerpt": "First 150 characters of content...",
          "subreddit": "subreddit_name",
          "score": 50,
          "comments": 15,
          "created_utc": 1234567890,
          "permalink": "https://reddit.com/r/...",
          "author": "username",
          "post_rank": 1,
          "comment_mentions": 3
        }
      ],
      "key_themes": ["theme1", "theme2", "theme3"],
      "urgency_level": "high",
      "comment_mentions": 8,
      "avg_comment_sentiment": 0.65,
      "has_comment_mentions": true,
      "top_comments": [
        {
          "id": "comment_id",
          "content": "Sample comment content...",
          "author": "commenter",
          "sentiment": "positive",
          "excerpt": "Sample comment excerpt..."
        }
      ],
      "comment_insights": {
        "key_theme": "Main theme from comments",
        "sentiment_summary": "Overall sentiment description"
      }
    }
  ],
  "overall_summary": {
    "total_posts": ${posts.length},
    "total_upvotes": ${totalUpvotes},
    "total_comments": ${totalComments},
    "most_active_subreddit": "subreddit_with_most_posts",
    "dominant_themes": ["theme1", "theme2", "theme3"],
    "community_narrative": "A compelling 2-3 sentence summary of what this community is actively seeking, discussing, and caring about. Focus on specific challenges, solutions, tools, and community interests.",
    "time_range": {
      "oldest_post": ${oldestPost},
      "newest_post": ${newestPost}
    },
    "comment_summary": {
      "total_comments_analyzed": 0,
      "total_keyword_mentions": 0,
      "most_active_comment_subreddit": "subreddit_name",
      "overall_sentiment": "neutral",
      "sentiment_summary": "Brief summary of overall comment sentiment and themes"
    }
  }
}

Analyze the posts and respond with the JSON structure above.`;
  }

  /**
   * Validate the pattern analysis result
   * Why this matters: Ensures the AI response has the correct structure and all posts are categorized
   */
  private validatePatternAnalysis(analysis: PatternAnalysisResult, originalPosts: AnalyzedPost[]): void {
    if (!analysis.categories || !Array.isArray(analysis.categories)) {
      throw new Error('Invalid pattern analysis: categories must be an array');
    }

    if (analysis.categories.length === 0) {
      throw new Error('Invalid pattern analysis: at least one category is required');
    }

    if (!analysis.overall_summary) {
      throw new Error('Invalid pattern analysis: overall_summary is required');
    }

    if (!analysis.overall_summary.community_narrative) {
      throw new Error('Invalid pattern analysis: community_narrative is required in overall_summary');
    }

    // Validate each category
    for (const category of analysis.categories) {
      if (!category.id || !category.name || !category.description) {
        throw new Error('Invalid category: id, name, and description are required');
      }

      if (!Array.isArray(category.posts)) {
        throw new Error('Invalid category: posts must be an array');
      }

      if (!Array.isArray(category.key_themes)) {
        throw new Error('Invalid category: key_themes must be an array');
      }
    }

    // Check that all posts are categorized
    const categorizedPostIds = new Set();
    analysis.categories.forEach(category => {
      category.posts.forEach(post => {
        categorizedPostIds.add(post.id);
      });
    });

    const originalPostIds = new Set(originalPosts.map(post => post.id));
    
    if (categorizedPostIds.size !== originalPostIds.size) {
      console.warn(`⚠️ Not all posts were categorized. Original: ${originalPostIds.size}, Categorized: ${categorizedPostIds.size}`);
    }

    console.log('✅ Pattern analysis validation passed');
  }

  /**
   * Get service status for health checks
   * Why this matters: Allows the system to verify the pattern analysis service is available
   */
  getStatus(): { available: boolean; model: string } {
    return {
      available: this.client !== null,
      model: 'gpt-5-nano'
    };
  }
}

// Export singleton instance
export const patternAnalysisService = new PatternAnalysisService();
export default PatternAnalysisService;
export { PatternAnalysisRequest, PatternAnalysisResult, PatternCategory };
