import OpenAI from 'openai';
import { RedditPost, ContentAnalysisRequest, ContentAnalysisResult, AnalyzedPost } from '../types';

class OpenAIService {
  private client: OpenAI | null = null;

  constructor() {
    // Delay initialization to allow environment variables to load
    setTimeout(() => {
      this.initializeClient();
    }, 100);
  }

  /**
   * Initialize OpenAI client with API key
   * Why this matters: OpenAI requires API key authentication for all requests.
   */
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
   * Analyze multiple Reddit posts for business insights
   * Why this matters: This transforms raw Reddit data into actionable business intelligence
   * about pain points, audience needs, and content opportunities.
   */
  async analyzePosts(request: ContentAnalysisRequest): Promise<AnalyzedPost[]> {
    const { posts, keywords_used, subreddits_used } = request;
    
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }
    
    if (!posts || posts.length === 0) {
      throw new Error('No posts provided for analysis');
    }

    console.log(`🧠 Analyzing ${posts.length} Reddit posts with OpenAI`);
    
    const analyzedPosts: AnalyzedPost[] = [];

    // Process posts individually to get detailed analysis
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      
      try {
        console.log(`📊 Analyzing post ${i + 1}/${posts.length}: "${post.title.substring(0, 50)}..."`);
        
        const analysis = await this.analyzePost(post, keywords_used, subreddits_used);
        
        const analyzedPost: AnalyzedPost = {
          ...post,
          analysis,
          post_rank: i + 1,
          analysis_timestamp: new Date().toISOString()
        };

        analyzedPosts.push(analyzedPost);
        
        // Rate limit: small delay between OpenAI requests
        if (i < posts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
      } catch (error) {
        console.error(`❌ Failed to analyze post ${post.id}:`, error);
        
        // Create fallback analysis if OpenAI fails
        const fallbackAnalysis: ContentAnalysisResult = {
          pain_point: 'Analysis failed - manual review required',
          audience_insight: 'Unable to generate insight due to analysis error',
          content_opportunity: 'Manual analysis recommended',
          urgency_level: 'low'
        };

        const analyzedPost: AnalyzedPost = {
          ...post,
          analysis: fallbackAnalysis,
          post_rank: i + 1,
          analysis_timestamp: new Date().toISOString()
        };

        analyzedPosts.push(analyzedPost);
      }
    }

    console.log(`✅ Completed analysis of ${analyzedPosts.length} posts`);
    return analyzedPosts;
  }

  /**
   * Analyze a single Reddit post for business insights
   * Why this matters: Uses structured prompts to extract specific business intelligence
   * from Reddit content, focusing on pain points and opportunities.
   */
  private async analyzePost(
    post: RedditPost, 
    keywords: string, 
    subreddits: string
  ): Promise<ContentAnalysisResult> {
    
    const prompt = this.buildAnalysisPrompt(post, keywords, subreddits);
    
    try {
      const completion = await this.client!.chat.completions.create({
        model: "gpt-4.1-nano-2025-04-14",
        messages: [
          {
            role: "system",
            content: "You are a business analyst expert at identifying pain points, audience insights, and content opportunities from social media discussions. You provide structured analysis in JSON format."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_completion_tokens: 500,
        response_format: { type: "json_object" }
      });

      // Log token usage and cost calculation for content analysis
      if (completion.usage) {
        const inputTokens = completion.usage.prompt_tokens;
        const outputTokens = completion.usage.completion_tokens;
        const totalTokens = completion.usage.total_tokens;
        
        // GPT-4.1-nano pricing (approximate)
        const inputCost = (inputTokens / 1000) * 0.0015;
        const outputCost = (outputTokens / 1000) * 0.006;
        const totalCost = inputCost + outputCost;
        
        console.log(`💰 Content Analysis Token Usage - Input: ${inputTokens}, Output: ${outputTokens}, Total: ${totalTokens}`);
        console.log(`💵 Content Analysis Cost - Input: $${inputCost.toFixed(4)}, Output: $${outputCost.toFixed(4)}, Total: $${totalCost.toFixed(4)}`);
      }

      const responseContent = completion.choices[0]?.message?.content;
      
      if (!responseContent) {
        throw new Error('Empty response from OpenAI');
      }

      // Parse and validate the JSON response
      const analysis = JSON.parse(responseContent) as ContentAnalysisResult;
      
      // Validate required fields
      if (!analysis.pain_point || !analysis.audience_insight || !analysis.content_opportunity) {
        throw new Error('Incomplete analysis response from OpenAI');
      }

      // Ensure urgency_level is valid
      if (!['high', 'medium', 'low'].includes(analysis.urgency_level)) {
        analysis.urgency_level = 'medium';
      }

      return analysis;

    } catch (error) {
      console.error('OpenAI analysis error:', error);
      throw new Error(`OpenAI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build analysis prompt based on Reddit post content
   * Why this matters: The prompt engineering determines the quality and relevance
   * of the business insights we extract from Reddit discussions.
   */
  private buildAnalysisPrompt(post: RedditPost, keywords: string, subreddits: string): string {
    return `
Analyze this Reddit post for business insights. Focus on identifying pain points, audience needs, and content marketing opportunities.

CONTEXT:
- Keywords searched: ${keywords}
- Subreddits: ${subreddits}
- Post engagement: ${post.engagement} (score: ${post.score}, comments: ${post.comments})

REDDIT POST:
Title: "${post.title}"
Content: "${post.content || 'No additional content'}"
Subreddit: r/${post.subreddit}
Author: u/${post.author}

ANALYSIS REQUIRED:
Provide a JSON response with exactly these fields:

{
  "pain_point": "What specific problem or frustration is this post revealing? Be concrete and actionable.",
  "audience_insight": "What does this tell us about the target audience's needs, behaviors, mindset, and demographics? Include specific details about who they are (job roles, experience level, industry, etc.) and what drives them.",
  "content_opportunity": "What type of content could address this pain point or serve this audience?",
  "urgency_level": "high|medium|low - How urgent/important is this pain point?"
}

Focus on:
1. Business-relevant pain points that companies could solve
2. Specific audience insights that inform marketing/product decisions  
3. Actionable content opportunities
4. Professional, business-focused language

Respond only with valid JSON.`;
  }

  /**
   * Test OpenAI connection and functionality
   * Why this matters: Validates that OpenAI integration is working before processing real data.
   */
  async testConnection(): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    
    try {
      const testCompletion = await this.client.chat.completions.create({
        model: "gpt-4.1-nano-2025-04-14",
        messages: [
          {
            role: "user",
            content: "Respond with just the word 'success' if you can read this message."
          }
        ],
        max_completion_tokens: 10,
        temperature: 0
      });

      const response = testCompletion.choices[0]?.message?.content?.toLowerCase();
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

  /**
   * Convert raw text data to markdown format using GPT-4.1-nano
   * Why this matters: Transforms unstructured raw data into clean, processable markdown
   * format that can be used as context for playbook generation.
   */
  async convertToMarkdown(request: { raw_data: string; job_title: string }): Promise<string> {
    const { raw_data, job_title } = request;
    
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }
    
    if (!raw_data || !job_title) {
      throw new Error('raw_data and job_title are required');
    }

    console.log(`📝 Converting raw data to markdown for job title: ${job_title}`);

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4.1-nano', // Fixed model name - using standard OpenAI API format
        messages: [
          {
            role: 'system',
            content: `You are a skilled technical writer specializing in converting raw text data into clean, well-structured markdown format for business playbooks. Your task is to transform unstructured data into organized markdown that can be easily processed by other systems.

IMPORTANT CONTEXT: You are working with executive job title data and business metrics. When you see common business abbreviations, interpret them in their executive/business context:
- CRO = Chief Revenue Officer (NOT Conversion Rate Optimization)
- CMO = Chief Marketing Officer  
- CFO = Chief Financial Officer
- CEO = Chief Executive Officer
- CTO = Chief Technology Officer
- VP = Vice President
- etc.

Always use the executive job title interpretation for these abbreviations in your markdown output.`
          },
          {
            role: 'user',
            content: `Turn this raw text data about the executive role "${job_title}" into a single markdown output for easy processing. This is business performance data for an executive position, not marketing metrics. DO NOT separate each template. Think deeply about what I just asked you to do before creating the markdown. Ensure you understand the task before proceeding.

Raw data:
${raw_data}

Please convert this into clean, structured markdown format that preserves all the important information while making it easy to process programmatically. Remember that any abbreviations should be interpreted in their executive/business context.`
          }
        ],
        max_completion_tokens: 4000,
        temperature: 0.3, // Lower temperature for more consistent formatting
      });

      const markdownContent = response.choices[0]?.message?.content;
      
      if (!markdownContent) {
        throw new Error('No markdown content generated');
      }

      console.log(`✅ Successfully converted raw data to markdown for ${job_title}`);
      
      return markdownContent;

    } catch (error) {
      console.error('❌ Failed to convert raw data to markdown:', error);
      throw new Error(`Failed to convert raw data to markdown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get service status for monitoring
   */
  getServiceStatus(): { initialized: boolean; hasApiKey: boolean } {
    return {
      initialized: !!this.client,
      hasApiKey: !!process.env.OPENAI_API_KEY
    };
  }
}

// Export singleton instance
export const openaiService = new OpenAIService();
export default openaiService; 