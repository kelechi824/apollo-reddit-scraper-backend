import OpenAI from 'openai';
import { ContentAnalysisRequest, ContentAnalysisResult, AnalyzedPost } from '../types';

class OpenAIServiceOptimized {
  private client: OpenAI | null = null;

  constructor() {
    // Delay initialization to allow environment variables to load
    setTimeout(() => {
      this.initializeClient();
    }, 100);
  }

  private async initializeClient(): Promise<void> {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      console.error('OpenAI API key not found in environment variables');
      return;
    }

    try {
      this.client = new OpenAI({
        apiKey: apiKey,
      });

      console.log('✅ OpenAI client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize OpenAI client:', error);
    }
  }

  /**
   * Analyze multiple Reddit posts for business insights with parallel processing
   * Why this matters: This transforms raw Reddit data into actionable business intelligence
   * about pain points, audience needs, and content opportunities using parallel OpenAI calls
   * to reduce total processing time from ~4 minutes to ~30-60 seconds.
   */
  async analyzePosts(request: ContentAnalysisRequest): Promise<AnalyzedPost[]> {
    const { posts, keywords_used, subreddits_used } = request;
    
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }
    
    if (!posts || posts.length === 0) {
      throw new Error('No posts provided for analysis');
    }

    console.log(`🧠 Analyzing ${posts.length} Reddit posts with OpenAI (parallel processing)`);
    
    // Process posts in parallel batches to optimize speed while respecting rate limits
    const batchSize = 5; // Process 5 posts simultaneously for maximum speed while staying within rate limits
    const analyzedPosts: AnalyzedPost[] = [];

    for (let i = 0; i < posts.length; i += batchSize) {
      const batch = posts.slice(i, i + batchSize);
      console.log(`🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(posts.length / batchSize)} (${batch.length} posts)`);
      
      try {
        // Process batch in parallel
        const batchPromises = batch.map(async (post, batchIndex) => {
          const globalIndex = i + batchIndex;
          console.log(`📊 Analyzing post ${globalIndex + 1}/${posts.length}: "${post.title.substring(0, 50)}..."`);
          
          try {
            const keywordsStr = Array.isArray(keywords_used) ? keywords_used.join(', ') : keywords_used;
            const subredditsStr = Array.isArray(subreddits_used) ? subreddits_used.join(', ') : subreddits_used;
            const analysis = await this.analyzePost(post, keywordsStr, subredditsStr);
            
            return {
              ...post,
              analysis,
              post_rank: globalIndex + 1,
              analysis_timestamp: new Date().toISOString()
            } as AnalyzedPost;
          } catch (error) {
            console.error(`❌ Failed to analyze post "${post.title}":`, error);
            
            // Create fallback analysis if OpenAI fails
            const fallbackAnalysis: ContentAnalysisResult = {
              pain_point: 'Analysis failed - manual review required',
              audience_insight: 'Unable to generate insight due to analysis error',
              content_opportunity: 'Manual content review needed',
              urgency_level: 'low'
            };

            return {
              ...post,
              analysis: fallbackAnalysis,
              post_rank: globalIndex + 1,
              analysis_timestamp: new Date().toISOString()
            } as AnalyzedPost;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        analyzedPosts.push(...batchResults);
        
        console.log(`✅ Completed batch ${Math.floor(i / batchSize) + 1} - analyzed ${batchResults.length} posts`);
        
        // Small delay between batches to avoid overwhelming the API
        if (i + batchSize < posts.length) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second between batches
        }
        
      } catch (error) {
        console.error(`❌ Failed to process batch starting at post ${i + 1}:`, error);
        
        // Fallback: try processing the batch sequentially
        console.log(`🔄 Falling back to sequential processing for batch ${Math.floor(i / batchSize) + 1}`);
        for (let j = 0; j < batch.length; j++) {
          const post = batch[j];
          const globalIndex = i + j;
          try {
            console.log(`📊 Analyzing post ${globalIndex + 1}/${posts.length}: "${post.title.substring(0, 50)}..." (fallback)`);
            
            const keywordsStr = Array.isArray(keywords_used) ? keywords_used.join(', ') : keywords_used;
            const subredditsStr = Array.isArray(subreddits_used) ? subreddits_used.join(', ') : subreddits_used;
            const analysis = await this.analyzePost(post, keywordsStr, subredditsStr);
            
            const analyzedPost: AnalyzedPost = {
              ...post,
              analysis,
              post_rank: globalIndex + 1,
              analysis_timestamp: new Date().toISOString()
            };

            analyzedPosts.push(analyzedPost);
            
            // Rate limit delay in fallback mode
            if (j < batch.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          } catch (postError) {
            console.error(`❌ Failed to analyze post "${post.title}":`, postError);
            
            // Create fallback analysis
            const fallbackAnalysis: ContentAnalysisResult = {
              pain_point: 'Analysis failed - manual review required',
              audience_insight: 'Unable to generate insight due to analysis error',
              content_opportunity: 'Manual content review needed',
              urgency_level: 'low'
            };

            const fallbackPost: AnalyzedPost = {
              ...post,
              analysis: fallbackAnalysis,
              post_rank: globalIndex + 1,
              analysis_timestamp: new Date().toISOString()
            };

            analyzedPosts.push(fallbackPost);
          }
        }
      }
    }

    console.log(`✅ Completed parallel analysis of ${analyzedPosts.length} posts`);
    return analyzedPosts;
  }

  /**
   * Analyze individual Reddit post for business insights
   * Why this matters: This is the core AI analysis that extracts business value from raw Reddit content.
   */
  private async analyzePost(post: any, keywords_used: string, subreddits_used: string): Promise<ContentAnalysisResult> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const prompt = `
Analyze this Reddit post for business insights. Focus on identifying pain points, audience needs, and content marketing opportunities.

CONTEXT:
- Keywords searched: ${keywords_used}
- Subreddits: ${subreddits_used}
- Post engagement: ${post.score} score, ${post.num_comments || 0} comments

REDDIT POST:
Title: "${post.title}"
Content: "${post.content || 'No additional content'}"
Subreddit: r/${post.subreddit}
Author: u/${post.author || 'unknown'}

ANALYSIS REQUIRED:
Provide a JSON response with exactly these fields. Use clear, readable formatting with bullet points and short paragraphs:

{
  "pain_point": "What specific problem or frustration is this post revealing? Format as: Brief overview sentence, then bullet points for specific issues. Keep each bullet point concise (1-2 sentences max).",
  "audience_insight": "What does this tell us about the target audience? Format as: Who they are (job roles, experience, industry), then bullet points for their specific needs, behaviors, and motivations. Use clear, scannable formatting.",
  "content_opportunity": "What content could address this pain point? Format as: Brief intro sentence, then numbered list of specific content ideas. Each idea should be actionable and specific (e.g., '1. Create a step-by-step guide for...').",
  "urgency_level": "high|medium|low - How urgent/important is this pain point?"
}

Focus on:
1. Business-relevant pain points that companies could solve
2. Specific audience insights that inform marketing/product decisions  
3. Actionable content opportunities
4. Professional, business-focused language

FORMATTING REQUIREMENTS:
- Use bullet points (•) for lists within each field
- Keep sentences concise and scannable
- Use line breaks (\n) to separate sections
- Number content opportunities (1., 2., 3., etc.)
- Avoid dense paragraph blocks

Respond only with valid JSON.`;

    try {
      const startTime = Date.now();
      
      const response = await this.client.responses.create({
        model: 'gpt-5-nano',
        input: `You are a business intelligence analyst expert at identifying pain points, audience insights, and content opportunities from social media discussions. You provide structured analysis in JSON format.

${prompt}`
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
        
        console.log(`💰 Content Analysis Token Usage - Input: ${inputTokens}, Output: ${outputTokens}, Total: ${totalTokens}`);
        console.log(`💵 Content Analysis Cost - Input: $${inputCost.toFixed(4)}, Output: $${outputCost.toFixed(4)}, Total: $${totalCost.toFixed(4)}`);
      }

      const content = response.output_text;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      const analysis = JSON.parse(content) as ContentAnalysisResult;
      
      // Validate required fields
      const requiredFields = ['pain_point', 'audience_insight', 'content_opportunity', 'urgency_level'];
      for (const field of requiredFields) {
        if (!analysis[field as keyof ContentAnalysisResult]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      return analysis;
      
    } catch (error) {
      console.error('OpenAI analysis error:', error);
      throw error;
    }
  }

  /**
   * Get service status for health checks
   * Why this matters: Allows the workflow to verify OpenAI is available before starting analysis.
   */
  getServiceStatus() {
    return {
      initialized: this.client !== null,
      hasApiKey: !!process.env.OPENAI_API_KEY,
      service: 'OpenAI GPT-5-nano'
    };
  }

  /**
   * Test OpenAI connection
   * Why this matters: Verifies the API key works and service is reachable.
   */
  async testConnection(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const testResponse = await this.client.responses.create({
        model: 'gpt-5-nano',
        input: 'Respond with just the word "success" if you can read this message.'
      });

      const response = testResponse.output_text?.toLowerCase();
      const isSuccess = response?.includes('success') || false;
      
      if (isSuccess) {
        console.log('✅ OpenAI connection test successful');
      } else {
        console.log('❌ OpenAI connection test failed: unexpected response');
      }
      
      return isSuccess;
    } catch (error) {
      console.error('❌ OpenAI connection test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
const openaiServiceOptimized = new OpenAIServiceOptimized();
export default openaiServiceOptimized;
