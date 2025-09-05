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

2. Always Be Transparent: Include clear disclosure when relevant: "Full disclosure: I work at Apollo" or "Hey, I'm [Name] from Apollo." Never try to hide affiliation - Reddit values honesty above all.

3. Add Value First, Always: Open with context and help, not promotion. If someone asks for alternatives, acknowledge competitors that might be better fits for specific needs. Show up like a regular community member, not a salesperson.

4. Sound Human, Not Corporate: Write like a peer in the sales community having a genuine conversation. Avoid corporate jargon like "As per our policy" or "We're committed to excellence." Never sound like a bot or use overly formal language.

5. Handle Apollo's Criticism Gracefully: Respond to negative feedback with "Sorry to hear this! Can you share details so we can fix it?" Never argue or get defensive. Treat Apollo's criticism like feedback from a friend.

6. Engage Beyond Self-Interest: Participate in discussions unrelated to Apollo to build trust. Answer industry questions, share insights, and be genuinely helpful even when there's no business benefit.

7. Respect Reddit Culture: Avoid emojis, hashtags, or LinkedIn-style language. Use subreddit norms and inside jokes. Never copy-paste corporate responses - Reddit can smell marketing from miles away.

RESPONSE TYPES TO GENERATE:
You must generate exactly 5 different response types, each with a distinct engagement strategy:

1. **HELPFUL_EXPERT**: Lead with value - share actionable advice that solves their problem immediately. Include transparency if Apollo is relevant: "I work at Apollo, but here's what I'd recommend regardless..." Focus on being genuinely helpful first.

2. **CURIOUS_QUESTION**: Ask thoughtful follow-up questions that show you're listening and want to understand their specific situation better. Avoid interrogating - sound like a peer who's genuinely interested.

3. **EXPERIENCE_SHARE**: Share relatable experiences from the sales trenches. Be vulnerable about challenges you've faced. Sound like someone who's been there, not someone selling a solution.

4. **RESOURCE_RECOMMENDATION**: Suggest helpful approaches, tools, or strategies without pushing Apollo. If mentioning competitors would genuinely help them, do it. Build trust through honest recommendations.

5. **COMMUNITY_SUPPORT**: Show empathy and peer support. Acknowledge their frustration, validate their experience, and offer encouragement. Sound like a supportive colleague, not a corporate representative.

FORMATTING REQUIREMENTS:
- Keep responses concise but valuable (50-150 words each)
- Use proper Reddit formatting:
  * Use line breaks between paragraphs
  * Use bullet points with "•" or "-" for lists
  * Use **bold** for emphasis on key points
  * Use numbered lists (1. 2. 3.) for steps
- Make responses scannable and easy to read
- End with a question or call-to-action to encourage engagement

CRITICAL MISTAKES TO AVOID:
- Never sound defensive or corporate when handling criticism
- Don't drop links without context or permission from moderators
- Avoid replying to every mention (prioritize high-impact threads)
- Don't ask people to DM instead of resolving issues publicly
- Never use copy-paste responses - each comment should feel authentic
- Don't only show up for negative mentions - engage in neutral discussions too
- Avoid over-engaging or seeming desperate for attention

AUTHENTIC ENGAGEMENT PRINCIPLES:
- Show up like a regular community member first, brand representative second
- Admit mistakes openly and explain what you're doing to fix them
- Share your production process or cost structure when questioned (transparency builds trust)
- Provide thoughtful answers before subtly mentioning Apollo (if relevant)
- Focus on educational value and genuine help over promotion

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

  /**
   * Generate a single Reddit response for a specific comment
   * Why this matters: Creates targeted responses to individual comments using their specific
   * content, sentiment, and keyword context for more relevant engagement.
   */
  async generateCommentResponse(
    commentContext: {
      content: string;
      author: string;
      brand_sentiment: 'positive' | 'negative' | 'neutral';
      helpfulness_sentiment: 'positive' | 'negative' | 'neutral';
      keyword_matches: string[];
      score?: number;
      created_utc?: number;
    },
    postContext: {
      title: string;
      subreddit: string;
      pain_point: string;
      audience_summary: string;
      content?: string;
    },
    brandKit?: any
  ): Promise<CommentGenerationResponse> {
    try {
      console.log(`💬 Generating comment response to u/${commentContext.author} in r/${postContext.subreddit}`);

      // Load and process brand kit
      const processedBrandKit = await brandkitService.loadBrandKit(brandKit);
      
      // Build system prompt for comment-specific responses
      const systemPrompt = this.buildCommentResponseSystemPrompt(processedBrandKit);
      
      // Build user prompt with comment and post context
      const userPrompt = this.buildCommentUserPrompt(commentContext, postContext);

      console.log('🤖 Sending request to Claude for comment response generation...');

      // Generate response using Claude
      const claudeResponse = await claudeService.generateContent({
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
        post_context: {
          title: postContext.title,
          content: postContext.content || '',
          subreddit: postContext.subreddit,
          pain_point: postContext.pain_point,
          audience_summary: postContext.audience_summary
        },
        brand_kit: brandKit
      });

      if (!claudeResponse || !claudeResponse.content) {
        throw new Error('Failed to generate comment response from Claude');
      }

      // Parse the response into structured format
      const response = this.parseCommentResponse(claudeResponse.content);

      console.log(`✅ Generated comment response successfully`);
      console.log(`🎯 Brand context applied: ${!!brandKit}`);
      console.log(`💭 Response sentiment alignment: Brand: ${commentContext.brand_sentiment}, Helpfulness: ${commentContext.helpfulness_sentiment}`);

      return {
        success: true,
        response,
        metadata: {
          subreddit: postContext.subreddit,
          post_title: postContext.title,
          comment_author: commentContext.author,
          comment_brand_sentiment: commentContext.brand_sentiment,
          comment_helpfulness_sentiment: commentContext.helpfulness_sentiment,
          keywords_matched: commentContext.keyword_matches,
          generation_timestamp: new Date().toISOString(),
          brand_context_applied: !!brandKit
        }
      };

    } catch (error) {
      console.error('❌ Error generating comment response:', error);
      throw new Error(`Comment response generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build system prompt specifically for comment responses
   * Why this matters: Creates focused prompts that generate responses to specific comments
   * rather than general post-level engagement.
   */
  private buildCommentResponseSystemPrompt(brandKit: any): string {
    const brandContext = this.buildBrandContext(brandKit);
    
    return `You are a content assistant tasked with generating a single Reddit comment response for Apollo.io, a B2B sales platform. Your goal is to create an authentic, helpful response to a specific comment while strictly adhering to Reddit's community guidelines and maintaining a peer-to-peer tone.

CRITICAL REDDIT ENGAGEMENT RULES:
1. Follow Reddit Rules and Subreddit Policies: All content must comply with Reddit's site-wide rules (no harassment, spam, or illegal content). Respect each subreddit's posting rules.

2. Always Be Transparent: Include clear disclosure when relevant: "Full disclosure: I work at Apollo" or "Hey, I'm [Name] from Apollo." Never try to hide affiliation - Reddit values honesty above all.

3. Add Value First, Always: Open with context and help, not promotion. Acknowledge their point and provide genuine value before any subtle mention of Apollo if relevant.

4. Sound Human, Not Corporate: Write like a peer in the sales community having a genuine conversation. Avoid corporate jargon. Never sound like a bot or use overly formal language.

5. Respond to Their Specific Point: Address what they actually said, not what you want to talk about. Show you read and understood their comment.

6. Match Their Tone and Sentiment: If they're frustrated, acknowledge it. If they're excited, share that energy. If they're asking for help, be genuinely helpful.

7. Respect Reddit Culture: Avoid emojis, hashtags, or LinkedIn-style language. Use subreddit norms. Never copy-paste corporate responses.

RESPONSE STRATEGY:
- Read their comment carefully and respond to their specific point
- Acknowledge their perspective or experience
- Add value through relevant insight, experience, or helpful information
- Only mention Apollo if it's genuinely relevant and helpful to their situation
- Keep it conversational and authentic
- End with a question or invitation for further discussion if appropriate

FORMATTING REQUIREMENTS:
- Keep response concise but valuable (30-100 words typically)
- Use proper Reddit formatting:
  * Use line breaks between paragraphs if needed
  * Use **bold** sparingly for key emphasis
  * Avoid excessive formatting
- Make it scannable and easy to read
- Sound like a natural reply in a conversation thread

CRITICAL MISTAKES TO AVOID:
- Don't ignore what they actually said
- Don't turn every response into an Apollo pitch
- Don't be defensive if they mention competitors or criticisms
- Don't use corporate speak or marketing language
- Don't make it about you or Apollo unless directly relevant
- Don't be overly promotional or salesy

AUTHENTIC ENGAGEMENT PRINCIPLES:
- Show up like a regular community member first
- Be genuinely helpful and add value
- Acknowledge their expertise and experience
- Share relevant insights from your own experience
- Focus on building relationships over promotion

${brandContext}

CRITICAL OUTPUT REQUIREMENTS:
- Return response in JSON format with this exact structure:
- The content must be a natural, conversational Reddit comment
- Use \\n for line breaks in JSON strings to ensure proper formatting when displayed
{
  "response": {
    "content": "Your comment response here...",
    "engagement_strategy": "Brief explanation of why this approach works for this specific comment",
    "tone_match": "How this response matches or appropriately responds to their sentiment",
    "value_provided": "What specific value or insight this response offers"
  }
}

- Do NOT include any text outside the JSON structure
- Response should be Reddit-appropriate length (not too long)
- Use authentic, conversational language that directly addresses their comment
- Focus on being genuinely helpful and building community relationships`;
  }

  /**
   * Build user prompt with comment and post context
   * Why this matters: Provides Claude with specific comment context to generate
   * targeted, relevant responses.
   */
  private buildCommentUserPrompt(
    commentContext: {
      content: string;
      author: string;
      brand_sentiment: 'positive' | 'negative' | 'neutral';
      helpfulness_sentiment: 'positive' | 'negative' | 'neutral';
      keyword_matches: string[];
      score?: number;
      created_utc?: number;
    },
    postContext: {
      title: string;
      subreddit: string;
      pain_point: string;
      audience_summary: string;
      content?: string;
    }
  ): string {
    return `Generate a Reddit comment response for this specific comment:

**Original Post Context:**
- Subreddit: r/${postContext.subreddit}
- Post Title: ${postContext.title}
- Pain Point: ${postContext.pain_point}
- Audience: ${postContext.audience_summary}

**Comment to Respond To:**
- Author: u/${commentContext.author}
- Content: "${commentContext.content}"
- Brand Sentiment: ${commentContext.brand_sentiment}
- Helpfulness: ${commentContext.helpfulness_sentiment}
- Keywords Mentioned: ${commentContext.keyword_matches.join(', ')}
- Score: ${commentContext.score || 'Unknown'}

**Your Task:**
Generate a single, authentic Reddit comment that responds directly to u/${commentContext.author}'s comment. Your response should:

1. **Address Their Specific Point**: Respond to what they actually said, not just the general topic
2. **Match Their Energy**: Acknowledge their ${commentContext.brand_sentiment} brand sentiment appropriately
3. **Add Genuine Value**: Provide helpful insight, experience, or information relevant to their comment
4. **Be Community-Focused**: Sound like a peer in the r/${postContext.subreddit} community
5. **Stay Authentic**: Avoid corporate speak, be conversational and human

Remember: This is a response to their specific comment, not a general post about the topic. Make it feel like a natural part of the conversation thread.`;
  }

  /**
   * Parse Claude's response into structured comment response
   * Why this matters: Converts Claude's JSON response into typed response object
   * for consistent frontend consumption.
   */
  private parseCommentResponse(content: string): CommentResponse {
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
      
      if (!parsed.response || !parsed.response.content) {
        throw new Error('Invalid response format: missing response.content');
      }

      // Validate and process response
      let content_text = parsed.response.content.trim();
      const MAX_COMMENT_LENGTH = 1500; // Allow for longer, more detailed Reddit comments
      
      if (content_text.length > MAX_COMMENT_LENGTH) {
        console.warn(`Comment response too long (${content_text.length} chars), applying smart truncation`);
        
        // Smart truncation: find the last complete sentence within the limit
        const truncatedAtLimit = content_text.substring(0, MAX_COMMENT_LENGTH - 3);
        const lastSentenceEnd = Math.max(
          truncatedAtLimit.lastIndexOf('.'),
          truncatedAtLimit.lastIndexOf('!'),
          truncatedAtLimit.lastIndexOf('?')
        );
        
        if (lastSentenceEnd > MAX_COMMENT_LENGTH * 0.7) {
          content_text = content_text.substring(0, lastSentenceEnd + 1);
        } else {
          const lastSpace = truncatedAtLimit.lastIndexOf(' ');
          content_text = content_text.substring(0, lastSpace) + '...';
        }
      }

      const commentResponse: CommentResponse = {
        id: `comment_response_${Date.now()}`,
        content: content_text,
        engagement_strategy: parsed.response.engagement_strategy || 'Responds authentically to the specific comment',
        tone_match: parsed.response.tone_match || 'Matches the commenter\'s sentiment appropriately',
        value_provided: parsed.response.value_provided || 'Provides relevant insight and builds community relationships'
      };

      console.log(`✅ Successfully parsed comment response`);
      return commentResponse;

    } catch (error) {
      console.error('Error parsing comment response:', error);
      // Return fallback response if parsing fails
      return this.getFallbackCommentResponse();
    }
  }

  /**
   * Provide fallback comment response if Claude generation fails
   * Why this matters: Ensures the service always returns a usable response
   * even if AI generation encounters issues.
   */
  private getFallbackCommentResponse(): CommentResponse {
    return {
      id: 'comment_response_fallback',
      content: 'That\'s a really good point! I\'ve seen similar situations come up in the community. What\'s been your experience with that approach?',
      engagement_strategy: 'Acknowledges their point and asks for their experience to continue the conversation',
      tone_match: 'Neutral and supportive, works for any sentiment',
      value_provided: 'Shows engagement and invites them to share more insights'
    };
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

// Type definitions for comment generation
export interface CommentResponse {
  id: string;
  content: string;
  engagement_strategy: string;
  tone_match: string;
  value_provided: string;
}

export interface CommentGenerationResponse {
  success: boolean;
  response: CommentResponse;
  metadata: {
    subreddit: string;
    post_title: string;
    comment_author: string;
    comment_brand_sentiment: 'positive' | 'negative' | 'neutral';
    comment_helpfulness_sentiment: 'positive' | 'negative' | 'neutral';
    keywords_matched: string[];
    generation_timestamp: string;
    brand_context_applied: boolean;
  };
}

export interface CommentGenerationRequest {
  comment_context: {
    content: string;
    author: string;
    brand_sentiment: 'positive' | 'negative' | 'neutral';
    helpfulness_sentiment: 'positive' | 'negative' | 'neutral';
    keyword_matches: string[];
    score?: number;
    created_utc?: number;
  };
  post_context: {
    title: string;
    subreddit: string;
    pain_point: string;
    audience_summary: string;
    content?: string;
  };
  brand_kit?: any;
}

export default new RedditEngagementService();
