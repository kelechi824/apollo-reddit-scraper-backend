import claudeService from './claudeService';
import { brandkitService } from './brandkitService';

/**
 * Reddit Engagement Service
 * Why this matters: Generates authentic, brand-aligned Reddit responses that help social media teams
 * engage at scale while maintaining community guidelines and Apollo's brand voice.
 */
class RedditEngagementService {
  constructor() {
    // No need to initialize brandkitService since we import the singleton
  }

  /**
   * Generate 5 different Reddit response types for community engagement
   * Why this matters: Provides social media teams with ready-to-use responses that follow
   * Reddit community guidelines while maintaining authentic, peer-to-peer tone.
   */
  async generateRedditResponses(
    postContext: {
      title: string;
      content: string;
      subreddit: string;
      pain_point: string;
      content_opportunity: string;
      audience_summary: string;
    },
    brandKit?: any
  ): Promise<RedditEngagementResponse> {
    try {
      console.log(`🎯 Generating Reddit responses for: "${postContext.title.substring(0, 50)}..."`);

      // Load and process brand kit
      const processedBrandKit = await brandkitService.loadBrandKit(brandKit);
      
      // Build system prompt with Reddit engagement guidelines
      const systemPrompt = this.buildRedditEngagementSystemPrompt(processedBrandKit);
      
      // Build user prompt with post context
      const userPrompt = this.buildUserPrompt(postContext);

      console.log('🤖 Sending request to Claude for Reddit response generation...');

      // Generate responses using Claude
      const claudeResponse = await claudeService.generateContent({
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
        post_context: postContext,
        brand_kit: brandKit
      });

      if (!claudeResponse || !claudeResponse.content) {
        throw new Error('Failed to generate Reddit responses from Claude');
      }

      // Parse the response into structured format
      const responses = this.parseRedditResponses(claudeResponse.content);

      console.log(`✅ Generated ${responses.length} Reddit responses successfully`);
      console.log(`📊 Response types: ${responses.map(r => r.type).join(', ')}`);
      console.log(`🎯 Brand context applied: ${!!brandKit}`);

      return {
        success: true,
        responses,
        metadata: {
          subreddit: postContext.subreddit,
          post_title: postContext.title,
          generation_timestamp: new Date().toISOString(),
          brand_context_applied: !!brandKit
        }
      };

    } catch (error) {
      console.error('❌ Error generating Reddit responses:', error);
      throw new Error(`Reddit response generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build comprehensive system prompt for Reddit engagement
   * Why this matters: Ensures responses follow Reddit community guidelines while maintaining
   * Apollo's brand voice and authentic peer-to-peer engagement style.
   */
  private buildRedditEngagementSystemPrompt(brandKit: any): string {
    const brandContext = this.buildBrandContext(brandKit);
    
    return `You are a content assistant tasked with generating Reddit responses for Apollo.io, a B2B sales platform. Your goal is to drive authentic engagement among sales professionals on Reddit while strictly adhering to Reddit's community guidelines and maintaining a peer-to-peer tone.

CRITICAL REDDIT ENGAGEMENT RULES:
1. Follow Reddit Rules and Subreddit Policies: All content must comply with Reddit's site-wide rules (no harassment, spam, or illegal content). Respect each subreddit's posting rules. Do not post if content feels like self-promotion where it isn't allowed.
2. Keep Tone Authentic and Human: Write like a peer in the sales community, not a corporate marketer. Be conversational, empathetic, and avoid buzzwords. Never sound like an ad.
3. Prioritize Value Over Promotion: Focus on insights, stories, or questions that encourage discussion. Do not pitch Apollo.io unless directly relevant and clearly allowed. At least 90% of responses should be non-promotional.
4. Engage with Pain Points & Questions: Address real problems SDRs, BDRs, AEs, and Sales Leaders face — quota struggles, cold email strategies, burnout, CRM inefficiencies, etc.
5. Encourage Conversation: Always end responses with a question or invitation for input to drive engagement.
6. Safety Checks: Ensure no response contains disallowed content, aggressive self-promotion, or subreddit violations.

RESPONSE TYPES TO GENERATE:
You must generate exactly 5 different response types, each with a distinct engagement strategy:

1. **HELPFUL_EXPERT**: Share actionable advice based on sales expertise (3-5 sentences with clear steps)
2. **CURIOUS_QUESTION**: Ask thoughtful follow-up questions to drive discussion (2-3 sentences + engaging question)
3. **EXPERIENCE_SHARE**: Share relatable experiences or observations (4-6 sentences with specific example)
4. **RESOURCE_RECOMMENDATION**: Suggest helpful approaches without direct promotion (3-4 sentences with practical tips)
5. **COMMUNITY_SUPPORT**: Show empathy and peer support (2-4 sentences with encouragement)

FORMATTING REQUIREMENTS:
- Keep responses concise but valuable (50-150 words each)
- Use proper Reddit formatting:
  * Use line breaks between paragraphs
  * Use bullet points with "•" or "-" for lists
  * Use **bold** for emphasis on key points
  * Use numbered lists (1. 2. 3.) for steps
- Make responses scannable and easy to read
- End with a question or call-to-action to encourage engagement

${brandContext}

CRITICAL OUTPUT REQUIREMENTS:
- Return responses in JSON format with this exact structure:
- Each response content must include proper formatting (line breaks, bullet points, bold text where appropriate)
- Use \\n for line breaks in JSON strings to ensure proper formatting when displayed
{
  "responses": [
    {
      "type": "HELPFUL_EXPERT",
      "content": "Your response text here...",
      "engagement_strategy": "Brief explanation of why this approach works"
    },
    {
      "type": "CURIOUS_QUESTION", 
      "content": "Your response text here...",
      "engagement_strategy": "Brief explanation of why this approach works"
    },
    {
      "type": "EXPERIENCE_SHARE",
      "content": "Your response text here...",
      "engagement_strategy": "Brief explanation of why this approach works"
    },
    {
      "type": "RESOURCE_RECOMMENDATION",
      "content": "Your response text here...",
      "engagement_strategy": "Brief explanation of why this approach works"
    },
    {
      "type": "COMMUNITY_SUPPORT",
      "content": "Your response text here...",
      "engagement_strategy": "Brief explanation of why this approach works"
    }
  ]
}

- Do NOT include any text outside the JSON structure
- Each response should be Reddit-appropriate length (not too long)
- Use authentic, conversational language
- Avoid corporate jargon or promotional language
- Focus on being genuinely helpful to the Reddit community
- Each response must be distinct and serve a different engagement purpose`;
  }

  /**
   * Build user prompt with specific post context
   * Why this matters: Provides Claude with all necessary context about the Reddit post
   * to generate relevant, targeted responses.
   */
  private buildUserPrompt(postContext: {
    title: string;
    content: string;
    subreddit: string;
    pain_point: string;
    content_opportunity: string;
    audience_summary: string;
  }): string {
    return `Generate 5 different Reddit responses for this post context:

**Subreddit:** r/${postContext.subreddit}
**Post Title:** ${postContext.title}
**Post Content:** ${postContext.content}

**Analysis Context:**
- Pain Point: ${postContext.pain_point}
- Audience Summary: ${postContext.audience_summary}
- Content Opportunity: ${postContext.content_opportunity}

Generate 5 distinct responses that would be appropriate for engaging with this post in r/${postContext.subreddit}. Each response should:
- Address the specific pain point or situation described
- Be appropriate for the subreddit's community and culture
- Provide genuine value to the discussion
- Encourage further engagement and conversation
- Follow Reddit community guidelines
- Maintain an authentic, peer-to-peer tone

Remember: These responses should help our social media team engage authentically in Reddit discussions while providing real value to the community.`;
  }

  /**
   * Build brand context from processed brand kit
   * Why this matters: Provides consistent Apollo messaging context while maintaining
   * authentic Reddit engagement style.
   */
  private buildBrandContext(brandKit: any): string {
    if (!brandKit || !brandKit.variables) {
      return `BRAND CONTEXT: You are representing Apollo.io, a leading all-in-one GTM sales platform that helps sales teams find, engage, and close their ideal customers.`;
    }

    const brandVars = brandKit.variables.reduce((acc: any, variable: any) => {
      acc[variable.key] = variable.value;
      return acc;
    }, {});

    return `BRAND CONTEXT FOR AUTHENTIC ENGAGEMENT:
- Company: ${brandVars.about_brand || 'Apollo.io - all-in-one GTM sales platform'}
- Target Audience: ${brandVars.ideal_customer_profile || 'Sales professionals, SDRs, AEs, Sales Leaders, RevOps, Account Executives'}
- Brand Voice: ${brandVars.tone_of_voice || 'Professional but approachable, helpful, data-driven'}
- Key Differentiators: ${brandVars.brand_point_of_view || 'Comprehensive all-in-one GTM sales platform'}
- Writing Guidelines: ${brandVars.writing_rules || 'Be authentic, helpful, and avoid corporate jargon'}

Use this context to make responses authentic and aligned with Apollo's brand while maintaining Reddit community standards. Never be promotional - focus on being genuinely helpful.`;
  }

  /**
   * Parse Claude's response into structured Reddit responses
   * Why this matters: Converts Claude's JSON response into typed response objects
   * for consistent frontend consumption with proper validation.
   */
  private parseRedditResponses(content: string): RedditResponse[] {
    try {
      // Clean the content to extract JSON
      let cleanContent = content.trim();
      
      // Remove any markdown code blocks if present
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(cleanContent);
      
      if (!parsed.responses || !Array.isArray(parsed.responses)) {
        throw new Error('Invalid response format: missing responses array');
      }

      // Validate and categorize responses
      const validResponseTypes = ['HELPFUL_EXPERT', 'CURIOUS_QUESTION', 'EXPERIENCE_SHARE', 'RESOURCE_RECOMMENDATION', 'COMMUNITY_SUPPORT'];
      const processedResponses: RedditResponse[] = [];

      parsed.responses.forEach((response: any, index: number) => {
        // Validate response structure
        if (!response.content || typeof response.content !== 'string') {
          console.warn(`Response ${index + 1} missing or invalid content, skipping`);
          return;
        }

        // Validate response type
        const responseType = validResponseTypes.includes(response.type) ? response.type : 'COMMUNITY_SUPPORT';
        
        // Ensure content is appropriate length for Reddit (concise but valuable)
        let content = response.content.trim();
        const MAX_REDDIT_LENGTH = 800; // Optimal length for Reddit engagement - not too long, not too short
        
        if (content.length > MAX_REDDIT_LENGTH) {
          console.warn(`Response ${index + 1} too long (${content.length} chars), applying smart truncation`);
          
          // Smart truncation: find the last complete sentence within the limit
          const truncatedAtLimit = content.substring(0, MAX_REDDIT_LENGTH - 3);
          const lastSentenceEnd = Math.max(
            truncatedAtLimit.lastIndexOf('.'),
            truncatedAtLimit.lastIndexOf('!'),
            truncatedAtLimit.lastIndexOf('?')
          );
          
          if (lastSentenceEnd > MAX_REDDIT_LENGTH * 0.7) {
            // If we found a sentence ending in the last 30% of the limit, use it
            content = content.substring(0, lastSentenceEnd + 1);
          } else {
            // Otherwise, find the last complete word and add ellipsis
            const lastSpace = truncatedAtLimit.lastIndexOf(' ');
            content = content.substring(0, lastSpace) + '...';
          }
        }

        processedResponses.push({
          id: `reddit_response_${Date.now()}_${index + 1}`,
          type: responseType,
          content: content,
          engagement_strategy: response.engagement_strategy || this.getDefaultStrategy(responseType)
        });
      });

      // Ensure we have at least 3 responses, fill with fallbacks if needed
      if (processedResponses.length < 3) {
        console.warn(`Only ${processedResponses.length} valid responses generated, adding fallbacks`);
        const fallbacks = this.getFallbackResponses();
        const needed = Math.min(5 - processedResponses.length, fallbacks.length);
        processedResponses.push(...fallbacks.slice(0, needed));
      }

      console.log(`✅ Successfully parsed ${processedResponses.length} Reddit responses`);
      return processedResponses.slice(0, 5); // Ensure max 5 responses

    } catch (error) {
      console.error('Error parsing Reddit responses:', error);
      // Return fallback responses if parsing fails
      return this.getFallbackResponses();
    }
  }

  /**
   * Get default engagement strategy for response type
   * Why this matters: Provides consistent strategy explanations when Claude doesn't provide them.
   */
  private getDefaultStrategy(type: string): string {
    const strategies = {
      'HELPFUL_EXPERT': 'Positions Apollo as knowledgeable while providing genuine value to the community',
      'CURIOUS_QUESTION': 'Drives engagement by asking thoughtful questions that encourage discussion',
      'EXPERIENCE_SHARE': 'Builds relatability and trust by sharing relevant experiences',
      'RESOURCE_RECOMMENDATION': 'Provides helpful suggestions without being promotional',
      'COMMUNITY_SUPPORT': 'Shows empathy and peer support to build community relationships'
    };
    return strategies[type as keyof typeof strategies] || 'Engages authentically with the Reddit community';
  }

  /**
   * Provide fallback responses if Claude generation fails
   * Why this matters: Ensures the service always returns usable responses
   * even if AI generation encounters issues.
   */
  private getFallbackResponses(): RedditResponse[] {
    return [
      {
        id: 'reddit_response_1',
        type: 'HELPFUL_EXPERT',
        content: 'That\'s a great point about the challenges in this area. In my experience, focusing on the fundamentals and building consistent processes tends to yield the best results. What specific aspect has been most challenging for you?',
        engagement_strategy: 'Provides validation and asks for specifics to continue the conversation'
      },
      {
        id: 'reddit_response_2',
        type: 'CURIOUS_QUESTION',
        content: 'Interesting perspective! Have you tried any specific approaches to address this, or are you still exploring different options?',
        engagement_strategy: 'Shows genuine interest and invites the person to share more details'
      },
      {
        id: 'reddit_response_3',
        type: 'EXPERIENCE_SHARE',
        content: 'I\'ve seen similar situations come up frequently in the sales community. What often helps is taking a step back and focusing on the core metrics that actually drive results. It\'s easy to get caught up in the noise.',
        engagement_strategy: 'Shares relatable experience and provides gentle guidance'
      },
      {
        id: 'reddit_response_4',
        type: 'RESOURCE_RECOMMENDATION',
        content: 'For challenges like this, I\'ve found that breaking it down into smaller, manageable pieces usually works well. Sometimes the solution is simpler than we think.',
        engagement_strategy: 'Offers practical advice without being prescriptive'
      },
      {
        id: 'reddit_response_5',
        type: 'COMMUNITY_SUPPORT',
        content: 'You\'re definitely not alone in facing this challenge. It\'s something that comes up a lot in our industry, and it\'s completely normal to feel frustrated about it. Keep pushing forward!',
        engagement_strategy: 'Provides emotional support and encouragement'
      }
    ];
  }
}

// Type definitions for Reddit engagement responses
export interface RedditResponse {
  id: string;
  type: 'HELPFUL_EXPERT' | 'CURIOUS_QUESTION' | 'EXPERIENCE_SHARE' | 'RESOURCE_RECOMMENDATION' | 'COMMUNITY_SUPPORT';
  content: string;
  engagement_strategy: string;
}

export interface RedditEngagementResponse {
  success: boolean;
  responses: RedditResponse[];
  metadata: {
    subreddit: string;
    post_title: string;
    generation_timestamp: string;
    brand_context_applied: boolean;
  };
}

export interface RedditEngagementRequest {
  post_context: {
    title: string;
    content: string;
    subreddit: string;
    pain_point: string;
    content_opportunity: string;
    audience_summary: string;
  };
  brand_kit?: any;
}

export default new RedditEngagementService();
