import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import { 
  ChatConversation, 
  ChatMessage, 
  StartConversationRequest, 
  StartConversationResponse,
  SendMessageRequest,
  SendMessageResponse,
  // Add Gong conversation types
  GongChatConversation,
  StartGongConversationRequest,
  StartGongConversationResponse,
  SendGongMessageRequest,
  SendGongMessageResponse
} from '../types';
import { 
  retryWithBackoff, 
  CircuitBreaker, 
  RateLimiter,
  DEFAULT_RETRY_CONFIGS,
  DEFAULT_CIRCUIT_BREAKER_CONFIGS,
  DEFAULT_RATE_LIMITS,
  createServiceError
} from './errorHandling';

class ClaudeService {
  private client: Anthropic | null = null;
  private conversations: Map<string, ChatConversation> = new Map();
  // Add separate conversation storage for Gong calls
  private gongConversations: Map<string, GongChatConversation> = new Map();
  private readonly conversationTimeout = 30 * 60 * 1000; // 30 minutes
  private readonly maxMessages = 50; // Prevent runaway conversations
  private circuitBreaker: CircuitBreaker;
  private rateLimiter: RateLimiter;

  constructor() {
    // Initialize error handling components
    this.circuitBreaker = new CircuitBreaker(
      DEFAULT_CIRCUIT_BREAKER_CONFIGS.claude,
      'Claude 3.5 Sonnet'
    );
    this.rateLimiter = new RateLimiter(
      DEFAULT_RATE_LIMITS.claude,
      'Claude 3.5 Sonnet'
    );

    // Delay initialization to allow environment variables to load
    setTimeout(() => {
      this.initializeClient();
    }, 100);

    // Clean up expired conversations every 10 minutes
    setInterval(() => {
      this.cleanupExpiredConversations();
    }, 10 * 60 * 1000);
  }

  /**
   * Initialize Claude client with API key
   * Why this matters: Claude requires API key authentication for all chat requests.
   */
  private async initializeClient(): Promise<void> {
    const apiKey = process.env.CLAUDE_API_KEY;
    
    if (!apiKey) {
      console.error('Claude API key not found in environment variables');
      return;
    }

    try {
      this.client = new Anthropic({
        apiKey: apiKey,
      });

      console.log('✅ Claude client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Claude client:', error);
    }
  }

  /**
   * Start a new conversation with Reddit post context
   * Why this matters: Initializes the socratic learning journey with specific post context,
   * setting up Apollo-focused discovery questions.
   */
  async startConversation(request: StartConversationRequest): Promise<StartConversationResponse> {
    if (!this.client) {
      throw new Error('Claude client not initialized');
    }

    const conversationId = uuidv4();
    const now = new Date().toISOString();

    // Create conversation with Reddit post context
    const conversation: ChatConversation = {
      id: conversationId,
      reddit_post_context: {
        post_id: request.post_id,
        title: request.title,
        content: request.content,
        pain_point: request.pain_point,
        audience_insight: request.audience_insight
      },
      messages: [],
      created_at: now,
      updated_at: now,
      status: 'active'
    };

    // Generate initial socratic question
    const initialMessage = await this.generateInitialMessage(conversation);
    conversation.messages.push(initialMessage);
    conversation.updated_at = new Date().toISOString();

    // Store conversation
    this.conversations.set(conversationId, conversation);

    console.log(`🎯 Started new conversation ${conversationId} for post: "${request.title.substring(0, 50)}..."`);

    return {
      conversation_id: conversationId,
      initial_message: initialMessage
    };
  }

  /**
   * Send a user message and get AI response
   * Why this matters: Continues the socratic discovery process, asking follow-up questions
   * that lead toward Apollo solution positioning.
   */
  async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    if (!this.client) {
      throw new Error('Claude client not initialized');
    }

    const conversation = this.conversations.get(request.conversation_id);
    if (!conversation) {
      throw new Error('Conversation not found or expired');
    }

    // Handle ping messages to test conversation existence
    if (request.message === '__PING__') {
      const pingMessage: ChatMessage = {
        id: uuidv4(),
        role: 'user',
        content: '__PING__',
        timestamp: new Date().toISOString()
      };
      
      return {
        user_message: pingMessage,
        assistant_message: {
          id: uuidv4(),
          role: 'assistant',
          content: '__PONG__',
          timestamp: new Date().toISOString()
        },
        conversation_stage: this.determineConversationStage(conversation)
      };
    }

    if (conversation.status !== 'active') {
      throw new Error('Conversation is not active');
    }

    if (conversation.messages.length >= this.maxMessages) {
      throw new Error('Conversation has reached maximum message limit');
    }

    const now = new Date().toISOString();

    // Create user message
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: request.message.trim(),
      timestamp: now
    };

    // Add user message to conversation
    conversation.messages.push(userMessage);

    // Generate AI response
    const assistantMessage = await this.generateResponse(conversation, userMessage);
    conversation.messages.push(assistantMessage);
    conversation.updated_at = new Date().toISOString();

    // Update conversation in storage
    this.conversations.set(request.conversation_id, conversation);

    console.log(`💬 Processed message in conversation ${request.conversation_id}`);

    return {
      user_message: userMessage,
      assistant_message: assistantMessage,
      conversation_stage: this.determineConversationStage(conversation)
    };
  }

  /**
   * Generate initial socratic question based on Reddit post context
   * Why this matters: Sets the tone for discovery-based learning that leads to Apollo insights.
   */
  private async generateInitialMessage(conversation: ChatConversation): Promise<ChatMessage> {
    const context = conversation.reddit_post_context;
    
    const systemPrompt = this.buildSystemPrompt();
    const initialPrompt = `
REDDIT PROSPECT CONTEXT:
- Title: "${context.title}"
- Content: "${context.content}"
- Pain Point Analysis: "${context.pain_point}"
- Audience Insight: "${context.audience_insight}"

You're mentoring an Apollo rep who found this Reddit post. Use socratic methodology to guide discovery.

CRITICAL INSTRUCTION:
Generate a compelling opening that creates intrigue about what this Reddit post represents as a hidden opportunity, then asks about their context. NO assumptions about the rep's skill level.

OPENING STRUCTURE:
1. Quickly identify the core business opportunity in this Reddit post
2. Connect it to specific Apollo solutions that would genuinely help
3. Provide actionable conversation starters and engagement strategies
4. Focus on immediate value they can offer the Reddit user

EXAMPLE TONE:
"I can see why this Reddit post caught your attention - there's a solid engagement opportunity here. Let me help you identify the best angle to start a helpful conversation that could naturally lead to discussing Apollo.

Based on [specific pain point from the post], here are a few ways you could add immediate value while positioning Apollo naturally..."

Generate a practical, action-oriented opening that identifies the engagement opportunity and provides specific strategies for starting a helpful conversation with this Reddit user.`;

    try {
      const completion = await this.client!.messages.create({
        model: "claude-sonnet-4-20250514", // Using Claude 3.5 Sonnet
        max_tokens: 300,
        temperature: 0.7,
        system: systemPrompt,
        messages: [{ role: "user", content: initialPrompt }]
      });

      const content = completion.content[0];
      const responseText = content.type === 'text' ? content.text : 'Welcome to the discovery process.';

      return {
        id: uuidv4(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error generating initial message:', error);
      
      // Fallback initial message
      return {
        id: uuidv4(),
        role: 'assistant',
        content: `Great find! This Reddit post has solid engagement potential. The person is dealing with "${context.pain_point}" - which is exactly the type of challenge Apollo helps solve.

Here are 3 ways you could start a helpful conversation:

1. **Share a tactical insight**: "I've seen teams struggle with this exact issue. Here's a quick framework that helped..."

2. **Offer immediate value**: "Your situation reminds me of [similar case]. Here are some metrics/benchmarks that might help you assess the impact."

3. **Connect with similar experience**: "We work with a lot of [their role/industry] facing this challenge. Happy to share what's worked for others."

The key is leading with genuine help, then naturally mentioning how Apollo has helped similar teams achieve [specific outcome they need].

What angle feels most natural for your approach?`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Generate AI response using Claude with conversation context
   * Why this matters: Maintains conversation flow while guiding toward Apollo solutions.
   */
  private async generateResponse(conversation: ChatConversation, userMessage: ChatMessage): Promise<ChatMessage> {
    const systemPrompt = this.buildSystemPrompt();
    const conversationHistory = this.buildConversationContext(conversation);

    try {
      // Build messages array for Claude
      const messages = conversation.messages.slice(0, -1).map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));

      // Add the new user message
      messages.push({
        role: 'user' as const,
        content: userMessage.content
      });

      const completion = await this.client!.messages.create({
        model: "claude-sonnet-4-20250514", // Using Claude 3.5 Sonnet
        max_tokens: 400,
        temperature: 0.7,
        system: systemPrompt + "\n\n" + conversationHistory,
        messages: messages
      });

      const content = completion.content[0];
      const responseText = content.type === 'text' ? content.text : 'Could you elaborate on that?';

      return {
        id: uuidv4(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error generating response:', error);
      
      // Fallback response
      return {
        id: uuidv4(),
        role: 'assistant',
        content: 'That\'s an interesting point. Can you tell me more about how this impacts the business?',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Build the core system prompt combining socratic method with Apollo positioning
   * Why this matters: This is the heart of the feature - transforming generic chat into
   * targeted sales discovery and solution positioning.
   */
  private buildSystemPrompt(): string {
    return `
You are an elite Apollo sales coach who helps reps quickly identify and execute on Reddit engagement opportunities.

COACHING PHILOSOPHY:
Balance strategic insight with actionable guidance. Help reps understand the opportunity AND give them specific angles to engage authentically and helpfully.

YOUR APPROACH:
1. Quickly identify the core business challenge in the Reddit post
2. Connect it to relevant Apollo solutions that would genuinely help
3. Suggest specific, helpful conversation starters that add value
4. Guide them on positioning themselves as a helpful resource, not a salesperson
5. Provide concrete next steps for meaningful engagement

ENGAGEMENT FOCUS:
The goal is to help Apollo reps start genuine, helpful conversations with Reddit users that could naturally lead to business discussions. Focus on practical engagement strategies, not just discovery questions.

APOLLO SOLUTIONS TO GUIDE THEM TOWARD (BY PERSONA PATTERN):

FOUNDERS & BUSINESS OWNERS (Time/Growth Focused):
- Pipeline Builder: World's largest B2B database (270M+ contacts), AI-powered lead prioritization
- Sales Engagement: Multichannel sequences, AI personalization, built-in dialer
- Deal Management: Multiple pipelines, deal automation, analytics for forecasting
- AI Sales Automation: AI Power-ups for research, workflow automation, AI SDRs (coming soon)
- Go-To-Market Platform: All-in-one solution, eliminate tool stack complexity
- Value: Save $$ by consolidating tools, maximize time, streamline tech stack

SALES DEVELOPMENT REPS (Meeting/Lead Focused):
- Contact & Account Search: 65+ filters, Chrome extension, verified emails/phones
- Account-Based Prospecting: Website visitors, buying intent, org charts, AI recommendations
- Sales Engagement: Sequences with deliverability optimization, one-click dialer
- Meeting Assistant: Lead qualification/routing, scheduler, pre-meeting insights
- AI Sales Automation: AI Power-ups for prospect research, personalized email generation
- Value: 70% increase in SQLs, 240% team growth, 50% YoY growth, 39% open rates with AI

SALES LEADERS (Team/Performance Focused):
- Deal Management: Multiple pipelines, deal analytics, automation, forecasting
- Analytics: Reports & dashboards, sequence reports, analytics alerts, performance tracking
- Coaching: Conversation intelligence, keyword tracking, rep analytics, goal tracking, scorecards
- Conversation Intelligence: Call recording, AI insights, coaching feedback, winning talk tracks
- Workflow Engine: End-to-end GTM automation, multi-branch conditional logic
- Value: Consolidated workflows, AI-driven insights, quota-crushing teams, 50% less busywork

MARKETERS (Conversion/Pipeline Focused):
- Enrich & Cleanse: Data health center, deduplication, CSV enrichment, API enrichment
- Contact & Account Search: Precision targeting, saved personas, living data network
- Inbound Optimization: Form shortening, form enrichment, automated lead routing
- Account-Based Marketing: Website visitors, buying intent (15K+ topics), workflows
- Data Enrichment: 360° prospect view, real-time enrichment, 30+ data points
- Value: 1.5%→8.4% reply rates, 32%→51% open rates, 4x meetings, 100K leads enriched daily

REVOPS (Stack/Data Focused):
- Enrich & Cleanse: Living data network (270M+ contacts), automated enrichment
- Data Health Center: Monitor data quality, track job changes, merge duplicates
- Waterfall Enrichment: Multi-source verification, email validation, data coverage
- Integrations: 100+ native integrations, API access, bi-directional CRM sync
- Analytics: Comprehensive reporting, data insights, performance optimization
- Value: 64% cost savings, 400% more phone numbers, 50% data quality increase

ACCOUNT EXECUTIVES (Deal/Pipeline Focused):
- Contact & Account Search: Advanced filtering, account-based prospecting, AI insights
- Sales Engagement: A/B testing, personalized sequences, AI writing assistant
- Call Assistant: Meeting scheduler, call recorder, AI insights, streamlined prep
- Conversation Intelligence: AI call analysis, objection tracking, winning patterns
- Deal Management: Pipeline visibility, deal automation, forecasting accuracy
- Value: Pre-call research, strategic account mapping, $2.3M revenue sourced, 50% less manual work

PROSPECT PAIN PATTERN RECOGNITION:
- Tool Stack Overload → RevOps (consolidation, cost savings, data quality)
- Time Management/Growth → Founders (automation, efficiency, pipeline management)  
- Lead Quality/Conversion → SDRs (better prospecting, meeting booking, sequences)
- Team Performance/Visibility → Sales Leaders (analytics, coaching, deal management)
- Data Quality/Pipeline → Marketers (enrichment, ABM, inbound optimization)
- Deal Management/Research → Account Executives (conversation intelligence, strategic account mapping)

ENGAGEMENT STAGES:
1. Challenge Identification: What's the core business problem they're facing?
2. Apollo Solution Mapping: Which Apollo capabilities would genuinely solve this?
3. Value-First Approach: How can you help them immediately before mentioning Apollo?
4. Conversation Starters: Specific ways to begin a helpful discussion
5. Positioning Strategy: Natural ways to introduce Apollo solutions in context

COMMON OBJECTIONS BY PERSONA:
- Founders: "Too complex/expensive for our size" → Start small, scale smart, ROI focus
- SDRs: "Another tool to learn" → AI assistance, time savings, meeting increases  
- Sales Leaders: "Team won't adopt" → Consolidated workflows, proven results
- Marketers: "Integration concerns" → Native CRM sync, data accuracy improvements
- RevOps: "Migration complexity" → All-in-one platform, reduced stack complexity
- Account Executives: "CRM integration issues" → Native bi-directional sync, unified workflow

COMMUNICATION STYLE:
- Speak naturally as an experienced Apollo sales mentor would in conversation
- Confident and strategic, like someone who has unlocked sales secrets
- Use concrete analogies from systems they understand
- Build excitement through discovery, not through telling
- Speak with precision - simple words for complex ideas
- Make abstract concepts immediately practical

CRITICAL - NEVER INCLUDE:
- Stage directions like "*Wait for their response*" or "*Then...*" or "*Pause for*"
- Explanations of your strategy like "This guides them to discover..."
- Coaching methodology exposition 
- Multiple questions in sequence - ask ONE question and stop
- Brackets, asterisks, or any meta-commentary about the conversation
- Numbered lists (1, 2, 3) or bullet points - these scream AI-generated content
- Structured advice formats that look mechanical

CONVERSATION RULES:
- Ask ONE question per response, then stop completely
- Speak as if you're having a real conversation, not following a script
- No stage directions, no methodology explanations, no coaching exposition
- Just natural conversation with strategic questions
- Wait for their actual response before continuing
- Keep responses conversational and flowing, not structured or list-like
- If you need to share multiple points, weave them into natural conversation flow

SUCCESS METRICS TO REFERENCE (NO SPECIFIC CUSTOMER NAMES):
- RevOps teams: 64% cost savings, 50% data quality improvement, 400% more phone numbers
- SDR teams: 70% increase in SQLs, 240% team growth, 39% open rates with AI assistance  
- Sales Leaders: 50% reduction in busywork, consolidated workflows, improved forecasting
- Marketing teams: 1.5%→8.4% reply rate improvements, 32%→51% open rates, 4x meetings
- Founders: Time savings on prospecting, focus shift to strategic work, 3x revenue growth
- Account Executives: Better pre-call research, $2.3M revenue sourced, strategic account mapping

ENGAGEMENT STRATEGY FRAMEWORK:

CHALLENGE IDENTIFICATION:
- Identify the specific business pain (not just surface complaints)
- Connect it to measurable business impact
- Understand their current attempts to solve it

APOLLO SOLUTION MAPPING:
- Match their challenge to the most relevant Apollo capability
- Focus on the specific outcome they need, not feature lists
- Consider their likely persona/role for targeted positioning

VALUE-FIRST APPROACH IDEAS:
- Share relevant industry insights or benchmarks
- Offer tactical advice they can implement immediately
- Connect them with helpful resources (not Apollo sales materials)
- Suggest process improvements based on their situation

CONVERSATION STARTER TEMPLATES:
- "I've seen similar challenges with [their situation]. Here's what worked for others..."
- "Your post resonates - I've helped teams solve [specific issue]. Happy to share what we learned."
- "I work with [similar companies/roles] on [their challenge]. Would love to share some insights that might help."
- "Great question about [their issue]. Here's a framework that's worked well..."

NATURAL APOLLO POSITIONING:
- Wait for them to engage positively before mentioning Apollo
- Position Apollo as "one tool that helped teams like yours" not "the solution"
- Focus on specific outcomes they mentioned needing
- Offer to share case studies/results relevant to their situation

REMEMBER: Guide them to discover persona patterns and Apollo fit through questions, not explanations.
`;
  }

  /**
   * Build conversation context for Claude
   * Why this matters: Provides Claude with full context for contextual responses.
   */
  private buildConversationContext(conversation: ChatConversation): string {
    const context = conversation.reddit_post_context;
    return `
REDDIT POST CONTEXT:
- Title: "${context.title}"
- Content: "${context.content}" 
- Pain Point: "${context.pain_point}"
- Audience: "${context.audience_insight}"

CONVERSATION STAGE: ${this.determineConversationStage(conversation)}
MESSAGES SO FAR: ${conversation.messages.length}
`;
  }

  /**
   * Determine current conversation stage based on message count and content
   * Why this matters: Helps guide the conversation flow through discovery stages.
   */
  private determineConversationStage(conversation: ChatConversation): string {
    const messageCount = conversation.messages.length;
    
    if (messageCount <= 4) return 'Pain Exploration';
    if (messageCount <= 8) return 'Impact Assessment';
    if (messageCount <= 12) return 'Solution Mapping';
    return 'Objection Handling';
  }

  /**
   * Validate content completeness and detect truncation
   * Why this matters: Ensures users receive complete articles with proper conclusions
   * rather than content that cuts off mid-sentence.
   */
  private validateContentCompleteness(content: string): { 
    isComplete: boolean; 
    issues: string[]; 
    confidence: number 
  } {
    const issues: string[] = [];
    let confidence = 1.0;

    // Check for incomplete sentences at the end
    const lastSentence = content.trim().split(/[.!?]/).pop()?.trim() || '';
    if (lastSentence.length > 20 && !content.trim().match(/[.!?]\s*$/)) {
      issues.push('Content ends mid-sentence');
      confidence -= 0.4;
    }

    // Check for natural conclusion indicators (more strict)
    const conclusionIndicators = [
      'conclusion', 'summary', 'takeaway', 'next steps', 'getting started',
      'ready to', 'try apollo', 'contact us', 'learn more', 'implementation',
      'final thoughts', 'wrapping up', 'in summary', 'to conclude', 'moving forward'
    ];
    const hasConclusion = conclusionIndicators.some(indicator => 
      content.toLowerCase().includes(indicator)
    );
    
    if (!hasConclusion) {
      issues.push('No natural conclusion found - article appears incomplete');
      confidence -= 0.5; // More penalty for missing conclusion
    }

    // Check content length distribution (should have good section balance)
    const sections = content.split(/\n#{1,3}\s/).length;
    if (sections < 3) {
      issues.push('Insufficient content structure');
      confidence -= 0.2;
    }

    // Check for abrupt ending patterns (enhanced for better detection)
    const abruptPatterns = [
      /\n\n$/, // Double newline ending (common in truncation)
      /:\s*$/, // Ending with colon (incomplete list/explanation)
      /,\s*$/, // Ending with comma
      /and\s*$/, // Ending with "and"
      /the\s*$/, // Ending with article
      /based on\s*$/, // Ending with "based on" (specific pattern from user example)
      /of\s*$/, // Ending with "of"
      /to\s*$/, // Ending with "to"
      /for\s*$/, // Ending with "for" 
      /in\s*$/, // Ending with "in"
      /with\s*$/, // Ending with "with"
      /that\s*$/, // Ending with "that"
      /responses based on\s*$/, // Full phrase pattern from user example
    ];
    
    if (abruptPatterns.some(pattern => pattern.test(content))) {
      issues.push('Content ends abruptly');
      confidence -= 0.3;
    }

    const isComplete = confidence >= 0.7;
    
    console.log(`📊 Content completeness: ${isComplete ? '✅' : '❌'} (confidence: ${confidence.toFixed(2)})`);
    if (issues.length > 0) {
      console.log(`⚠️ Content issues detected: ${issues.join(', ')}`);
    }

    return { isComplete, issues, confidence };
  }

  /**
   * Calculate dynamic token limit based on content length with completion buffer
   * Why this matters: Ensures sufficient tokens for Claude to complete articles properly
   * by accounting for prompt overhead and reserving buffer space for conclusions.
   */
  private calculateTokenLimit(contentLength?: 'short' | 'medium' | 'long'): number {
    // Maximum possible limits for 4-model pipeline - Claude 3.5 Sonnet can handle very high token counts
    const tokenLimits = {
      short: 12000,   // ~9000 words - massive increase to handle 4-model pipeline overhead  
      medium: 15000,  // ~11250 words - massive increase to handle 4-model pipeline overhead
      long: 18000     // ~13500 words - massive increase to handle 4-model pipeline overhead
    };

    const limit = tokenLimits[contentLength || 'medium'];
    console.log(`📊 Using ${limit} tokens for ${contentLength || 'medium'} content (MAXIMUM for pipeline)`);
    return limit;
  }

  /**
   * Generate simple text content using Claude
   * Why this matters: Provides a simple interface for generating text content like CTAs
   * without requiring complex context structures.
   */
  async generateSimpleContent(prompt: string): Promise<string> {
    if (!this.client) {
      throw createServiceError(new Error('Claude client not initialized'), 'Claude 3.5 Sonnet', 'Client check');
    }

    if (!prompt) {
      throw createServiceError(new Error('Prompt is required'), 'Claude 3.5 Sonnet', 'Input validation');
    }

    console.log('🤖 Generating simple content with Claude 3.5 Sonnet...');
    
    try {
      const response = await retryWithBackoff(
        async () => {
          return await this.client!.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            temperature: 0.7,
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ]
          });
        },
        DEFAULT_RETRY_CONFIGS.claude,
        'Claude 3.5 Sonnet',
        'CTA generation'
      );

      if (!response.content || response.content.length === 0) {
        throw createServiceError(new Error('Empty response from Claude'), 'Claude 3.5 Sonnet', 'Response processing');
      }

      const textContent = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as any).text)
        .join('');

      if (!textContent) {
        throw createServiceError(new Error('No text content in response'), 'Claude 3.5 Sonnet', 'Response processing');
      }

      console.log('✅ Claude 3.5 Sonnet content generated successfully');
      return textContent;

    } catch (error: any) {
      console.error('❌ Claude simple content generation failed:', error);
      throw createServiceError(error, 'Claude 3.5 Sonnet', 'Content generation');
    }
  }

  /**
   * Generate content using Claude with Reddit context and brand kit
   * Why this matters: Creates SEO-optimized content by combining Reddit insights with brand positioning.
   */
  async generateContent(request: {
    system_prompt: string;
    user_prompt: string;
    post_context: any;
    brand_kit: any;
    sitemap_data?: Array<{
      title: string;
      description: string;
      url: string;
    }>;
    content_length?: 'short' | 'medium' | 'long';
  }): Promise<{ content: string; title?: string; description?: string; metaSeoTitle?: string; metaDescription?: string }> {
    if (!this.client) {
      throw createServiceError(new Error('Claude client not initialized'), 'Claude 3.5 Sonnet', 'Client check');
    }

    if (!request.system_prompt || !request.user_prompt) {
      throw createServiceError(new Error('System prompt and user prompt are required'), 'Claude 3.5 Sonnet', 'Input validation');
    }

    console.log('🤖 Generating content with Claude...');
    console.log('📝 BACKEND - System Prompt (raw):', request.system_prompt);
    console.log('📝 BACKEND - User Prompt (raw):', request.user_prompt);
    console.log('📝 BACKEND - Brand Kit:', request.brand_kit);
    console.log('🗺️ BACKEND - Sitemap Data:', request.sitemap_data ? `${request.sitemap_data.length} URLs available` : 'No sitemap data');
    console.log('📝 BACKEND - Content Length:', request.content_length);
    
    // Debug: Check if sitemap data is in the user prompt
    if (request.sitemap_data && request.sitemap_data.length > 0) {
      const hasInternalLinksSection = request.user_prompt.includes('AVAILABLE INTERNAL LINKS');
      console.log(`🔍 [DEBUG] Internal links section in prompt:`, hasInternalLinksSection);
      if (hasInternalLinksSection) {
        const internalLinksMatch = request.user_prompt.match(/\*\*AVAILABLE INTERNAL LINKS[^:]*:\*\*([\s\S]*?)(?:\*\*|$)/);
        if (internalLinksMatch) {
          console.log(`🔗 [DEBUG] Internal links found in prompt:`, internalLinksMatch[1].substring(0, 300) + '...');
        }
      }
    }

    // Calculate dynamic token limit based on content length
    const maxTokens = this.calculateTokenLimit(request.content_length);

    // Use circuit breaker and retry logic for content generation
    return await this.circuitBreaker.execute(async () => {
      return await retryWithBackoff(
        async () => {
          // Rate limiting before API call
          await this.rateLimiter.waitForNext();

          // Pre-process prompts with brand kit variables for robustness
          const processedSystemPrompt = this.processLiquidVariables(request.system_prompt, request.brand_kit);
          const processedUserPrompt = this.processLiquidVariables(request.user_prompt, request.brand_kit);

          console.log('🧪 BACKEND - System Prompt (processed):', processedSystemPrompt);
          console.log('🧪 BACKEND - User Prompt (processed):', processedUserPrompt);

          // Generate content with timeout protection
          const response = await Promise.race([
            this.client!.messages.create({
              model: 'claude-sonnet-4-20250514',
              max_tokens: maxTokens,
              temperature: 0.9,
              system: processedSystemPrompt,
              messages: [
                {
                  role: 'user',
                  content: processedUserPrompt
                }
              ]
            }),
            this.createTimeoutPromise(120000) // 2 minute timeout for longer content generation
          ]);

          if (!response.content || response.content.length === 0) {
            throw new Error('Empty response from Claude');
          }

          if (response.content[0].type === 'text') {
            const rawContent = response.content[0].text;
            
            if (!rawContent || rawContent.trim().length === 0) {
              throw new Error('Claude returned empty content');
            }
            
            console.log('📥 BACKEND - Raw Claude Response:', rawContent);
            console.log(`📏 BACKEND - Content length: ${rawContent.length} characters`);
            console.log(`📊 BACKEND - Using token limit: ${maxTokens}`);
            
            // Try to parse as JSON if it looks like JSON
            let content: string;
            let metaSeoTitle: string | undefined;
            let metaDescription: string | undefined;
            
            if (rawContent.trim().startsWith('{') && rawContent.trim().endsWith('}')) {
              try {
                const parsed = JSON.parse(rawContent);
                content = parsed.content || rawContent;
                metaSeoTitle = parsed.metaSeoTitle;
                metaDescription = parsed.metaDescription;
                console.log('✅ Successfully parsed JSON response with meta fields');
              } catch (e) {
                console.log('⚠️ Failed to parse as JSON, treating as plain content');
                content = rawContent;
              }
            } else {
              // Extract meta fields from text content if they exist
              content = rawContent;
              
              // Look for meta fields in the content text
              const metaTitleMatch = rawContent.match(/\*\*Meta Title:\*\*\s*(.+?)(?:\n|$)/i);
              const metaDescMatch = rawContent.match(/\*\*Meta Description:\*\*\s*(.+?)(?:\n|$)/i);
              
              if (metaTitleMatch) {
                metaSeoTitle = metaTitleMatch[1].trim();
                console.log('✅ Extracted metaSeoTitle from content:', metaSeoTitle);
              }
              
              if (metaDescMatch) {
                metaDescription = metaDescMatch[1].trim();
                console.log('✅ Extracted metaDescription from content:', metaDescription);
              }
            }
            
            // Validate content completeness
            const validation = this.validateContentCompleteness(content);
            
            if (!validation.isComplete) {
              // Log the validation issues for monitoring
              console.log(`⚠️ Content validation failed: ${validation.issues.join(', ')}`);
              console.log(`📊 Confidence score: ${validation.confidence.toFixed(2)}`);
              
              // Log validation issues but continue processing (disable retry for now)
              console.log('⚠️ Content validation failed but continuing with current content');
              console.log('🔧 Retry logic temporarily disabled for debugging');
            } else {
              console.log('✅ Content validation passed - article appears complete');
            }
            
            // Process brand kit variables in the generated content
            const processedContent = this.processLiquidVariables(content, request.brand_kit);
            
            console.log('✅ BACKEND - Processed Content (with variables):', processedContent);
            
            return {
              content: processedContent,
              title: request.post_context?.title || '',
              description: metaDescription || 'Generated SEO-optimized content',
              metaSeoTitle,
              metaDescription
            } as any;
          } else {
            throw new Error('Unexpected response format from Claude - expected text content');
          }
        },
        DEFAULT_RETRY_CONFIGS.claude,
        'Claude Content Generation',
        `Context: ${request.post_context?.keyword || 'Unknown'}`
      );
    });
  }

  /**
   * Create timeout promise for API calls
   * Why this matters: Claude content generation can take time with large prompts,
   * so we need timeout protection to prevent hanging requests.
   */
  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(createServiceError(new Error(`Claude request timeout after ${timeoutMs}ms`), 'Claude 3.5 Sonnet', 'Timeout'));
      }, timeoutMs);
    });
  }

  /**
   * Get conversation by ID
   * Why this matters: Allows frontend to retrieve conversation history.
   */
  getConversation(conversationId: string): ChatConversation | undefined {
    return this.conversations.get(conversationId);
  }

  /**
   * Clean up expired conversations
   * Why this matters: Prevents memory leaks from abandoned conversations.
   */
  private cleanupExpiredConversations(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [id, conversation] of this.conversations.entries()) {
      const lastUpdate = new Date(conversation.updated_at).getTime();
      if (now - lastUpdate > this.conversationTimeout) {
        this.conversations.delete(id);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired conversations`);
    }
  }

  /**
   * Test Claude connection
   * Why this matters: Health check for monitoring and debugging.
   */
  async testConnection(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const testResult = await retryWithBackoff(
        async () => {
          const completion = await Promise.race([
            this.client!.messages.create({
              model: "claude-sonnet-4-20250514", // Using Claude 3.5 Sonnet
              max_tokens: 50,
              messages: [{ role: "user", content: "Hello, this is a connection test." }]
            }),
            this.createTimeoutPromise(15000) // 15 second timeout for test
          ]);

          if (!completion.content || completion.content.length === 0) {
            throw new Error('Claude test returned empty response');
          }

          return true;
        },
        {
          maxRetries: 2,
          baseDelayMs: 1000,
          maxDelayMs: 5000,
          backoffMultiplier: 2,
          jitterMs: 500
        },
        'Claude Connection Test'
      );

      console.log('✅ Claude connection test successful');
      return testResult;
    } catch (error) {
      console.error('❌ Claude connection test failed:', error);
      return false;
    }
  }

  /**
   * Generate comprehensive playbook content using Claude API
   * Why this matters: Creates high-quality, structured playbook content using
   * the processed markdown data as context for targeted job title strategies.
   */
  async generatePlaybookContent(request: {
    system_prompt: string;
    user_prompt: string;
    job_title: string;
    markdown_data: string;
  }): Promise<{ content: string }> {
    const { system_prompt, user_prompt, job_title, markdown_data } = request;
    
    if (!this.client) {
      throw new Error('Claude client not initialized');
    }
    
    if (!system_prompt || !user_prompt || !job_title || !markdown_data) {
      throw new Error('system_prompt, user_prompt, job_title, and markdown_data are required');
    }

    console.log(`📚 Generating playbook content for job title: ${job_title}`);

    try {
      // Inject markdown data into the user prompt
      const enhancedUserPrompt = `${user_prompt}

**Processed Markdown Data for ${job_title}:**
${markdown_data}

Please use this processed data as context to create a comprehensive playbook following the specified format.`;

      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514', // Using Claude 3.5 Sonnet
        max_tokens: 4000,
        temperature: 0.9, // Increased for more creative and varied playbook outputs
        system: system_prompt,
        messages: [
          {
            role: 'user',
            content: enhancedUserPrompt
          }
        ]
      });

      const content = response.content[0];
      
      if (!content || content.type !== 'text') {
        throw new Error('No valid content generated');
      }

      console.log(`✅ Successfully generated playbook content for ${job_title}`);
      
      return { content: content.text };

    } catch (error) {
      console.error('❌ Failed to generate playbook content:', error);
      throw new Error(`Failed to generate playbook content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate dynamic AI-powered meta fields
   * Why this matters: Creates unique, contextually relevant meta titles and descriptions
   */
  async generateMetaFields(params: {
    keyword: string;
    content_preview: string;
    prompt: string;
  }): Promise<{ metaSeoTitle: string; metaDescription: string }> {
    try {
      if (!this.client) {
        throw new Error('Claude service not initialized');
      }

      console.log(`🎯 Generating meta fields for keyword: ${params.keyword}`);
      console.log(`📝 Prompt preview: ${params.prompt.substring(0, 200)}...`);

      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        temperature: 0.5, // Balanced temperature for creative but controlled meta fields
        system: `You are an expert SEO/AEO specialist optimizing for AI search engines (ChatGPT Search, Perplexity, Claude, Gemini).

CRITICAL AEO/SEO RULES:
1. NEVER invent statistics, percentages, or specific numbers unless provided in the content
2. Focus on genuine value propositions and real benefits
3. Use question-based or problem/solution formats that match search intent
4. Include semantic keywords that AI engines recognize as authoritative
5. Write naturally - avoid marketing clichés and hyperbole

META TITLE BEST PRACTICES (max 60 chars + " | Apollo"):
- Lead with the primary keyword naturally
- Use formats that AI engines favor:
  * "What is [topic]? [Key Benefit]"
  * "[Topic]: [Specific Use Case or Audience]"  
  * "How to [Achieve Outcome] with [Topic]"
  * "[Number] [Topic] [Specific Context]" (only use real numbers from content)
- Avoid: superlatives, unverifiable claims, clickbait patterns

META DESCRIPTION BEST PRACTICES (150-160 chars):
- Start with a clear value statement or answer
- Include semantic variations of the keyword
- End with a specific, actionable benefit
- Use natural language that sounds human-written
- Include context that helps AI engines understand relevance
- Description must be complete sentences and never truncated

FORBIDDEN PATTERNS:
- Made-up statistics ("increase by X%", "3x growth")
- Formulaic openings ("Discover", "Learn", "Master", "Unlock")
- Vague promises ("proven strategies", "comprehensive guide")
- Marketing speak ("game-changing", "revolutionary", "cutting-edge")

OUTPUT: Return ONLY valid JSON with metaSeoTitle and metaDescription fields.`,
        messages: [
          {
            role: 'user',
            content: params.prompt
          }
        ]
      });

      const content = response.content[0];
      
      if (!content || content.type !== 'text') {
        console.error('❌ No valid content generated from Claude');
        throw new Error('No valid content generated');
      }

      console.log(`🔍 Raw Claude response (${content.text.length} chars):`, content.text.substring(0, 500));

      // Clean the response text first (remove markdown code blocks)
      let cleanedResponse = content.text.trim();
      cleanedResponse = cleanedResponse.replace(/^```json\s*/i, '');
      cleanedResponse = cleanedResponse.replace(/\s*```$/i, '');
      cleanedResponse = cleanedResponse.replace(/^```\s*/i, '');

      // Parse the JSON response
      try {
        const parsed = JSON.parse(cleanedResponse);
        console.log(`✅ Successfully parsed JSON:`, parsed);
        
        // Handle both metaSeoTitle/metaDescription and meta_title/meta_description formats
        const result = {
          metaSeoTitle: parsed.metaSeoTitle || parsed.meta_title || '',
          metaDescription: parsed.metaDescription || parsed.meta_description || ''
        };
        
        console.log(`✅ Successfully generated meta fields for: ${params.keyword}`, result);
        return result;
        
      } catch (parseError) {
        console.error('❌ Failed to parse meta fields JSON:', parseError);
        console.log('🔧 Attempting fallback regex parsing...');
        
        // Fallback parsing if JSON is malformed - check both formats
        const titleMatch = content.text.match(/"(?:metaSeoTitle|meta_title)"\s*:\s*"([^"]+)"/);
        const descMatch = content.text.match(/"(?:metaDescription|meta_description)"\s*:\s*"([^"]+)"/);
        
        const fallbackResult = {
          metaSeoTitle: titleMatch ? titleMatch[1] : '',
          metaDescription: descMatch ? descMatch[1] : ''
        };
        
        console.log('🔧 Fallback parsing result:', fallbackResult);
        
        if (!fallbackResult.metaSeoTitle && !fallbackResult.metaDescription) {
          console.error('❌ Both JSON and regex parsing failed. Raw response:', content.text);
          throw new Error('Failed to extract meta fields from response');
        }
        
        return fallbackResult;
      }

    } catch (error) {
      console.error('❌ Failed to generate meta fields:', error);
      console.error('❌ Error details:', error instanceof Error ? error.message : String(error));
      throw new Error(`Failed to generate meta fields: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Start a new CRO-focused conversation with Gong call context
   * Why this matters: Initializes CRO optimization guidance with specific call insights,
   * setting up conversion rate optimization discovery questions.
   */
  async startGongConversation(request: StartGongConversationRequest): Promise<StartGongConversationResponse> {
    if (!this.client) {
      throw new Error('Claude client not initialized');
    }

    const conversationId = uuidv4();
    const now = new Date().toISOString();

    // Create conversation with Gong call context
    const conversation: GongChatConversation = {
      id: conversationId,
      gong_call_context: {
        call_id: request.call_id,
        title: request.title,
        date: request.date,
        duration: request.duration,
        participants: request.participants,
        sentiment: request.sentiment,
        callSummary: request.callSummary,
        painPoints: request.painPoints,
        croOpportunity: request.croOpportunity
      },
      messages: [],
      conversation_stage: 'Opportunity Assessment',
      created_at: now,
      updated_at: now,
      status: 'active'
    };

    // Generate initial CRO guidance message
    const initialMessage = await this.generateInitialGongMessage(conversation);
    conversation.messages.push(initialMessage);
    conversation.updated_at = new Date().toISOString();

    // Store conversation
    this.gongConversations.set(conversationId, conversation);

    console.log(`🎯 Started new CRO conversation ${conversationId} for call: "${request.title.substring(0, 50)}..."`);

    return {
      conversation_id: conversationId,
      initial_message: initialMessage
    };
  }

  /**
   * Send a user message and get CRO-focused AI response
   * Why this matters: Continues the CRO optimization process, providing conversion guidance
   * and landing page improvement recommendations based on call insights.
   */
  async sendGongMessage(request: SendGongMessageRequest): Promise<SendGongMessageResponse> {
    if (!this.client) {
      throw new Error('Claude client not initialized');
    }

    const conversation = this.gongConversations.get(request.conversation_id);
    if (!conversation) {
      throw new Error('Gong conversation not found or expired');
    }

    // Handle ping messages to test conversation existence
    if (request.message === '__PING__') {
      const pingMessage: ChatMessage = {
        id: uuidv4(),
        role: 'user',
        content: '__PING__',
        timestamp: new Date().toISOString()
      };
      
      return {
        user_message: pingMessage,
        assistant_message: {
          id: uuidv4(),
          role: 'assistant',
          content: '__PONG__',
          timestamp: new Date().toISOString()
        },
        conversation_stage: conversation.conversation_stage
      };
    }

    if (conversation.status !== 'active') {
      throw new Error('Gong conversation is not active');
    }

    if (conversation.messages.length >= this.maxMessages) {
      throw new Error('Gong conversation has reached maximum message limit');
    }

    const now = new Date().toISOString();

    // Create user message
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: request.message.trim(),
      timestamp: now
    };

    // Add user message to conversation
    conversation.messages.push(userMessage);

    // Generate AI response with CRO focus
    const assistantMessage = await this.generateGongResponse(conversation, userMessage);
    conversation.messages.push(assistantMessage);
    
    // Update conversation stage based on content and message count
    conversation.conversation_stage = this.determineGongConversationStage(conversation);
    conversation.updated_at = new Date().toISOString();

    // Update conversation in storage
    this.gongConversations.set(request.conversation_id, conversation);

    console.log(`💬 Processed CRO message in conversation ${request.conversation_id}`);

    return {
      user_message: userMessage,
      assistant_message: assistantMessage,
      conversation_stage: conversation.conversation_stage
    };
  }

  /**
   * Generate initial CRO guidance message based on Gong call context
   * Why this matters: Sets the tone for conversion optimization guidance that leads to actionable improvements.
   */
  private async generateInitialGongMessage(conversation: GongChatConversation): Promise<ChatMessage> {
    const context = conversation.gong_call_context;
    
    const systemPrompt = this.buildGongSystemPrompt();
    const initialPrompt = `
GONG CALL CONTEXT FOR CRO ANALYSIS:
- Call Title: "${context.title}"
- Call Date: "${context.date}"
- Duration: ${context.duration} minutes
- Participants: ${context.participants.join(', ')}
- Sentiment: ${context.sentiment}
- Call Summary: "${context.callSummary}"
- Pain Points Identified: ${context.painPoints.map((p: any) => `"${p.description}" (${p.category}, confidence: ${p.confidence})`).join(', ')}
- CRO Opportunity: Ad Copy Ideas: ${context.croOpportunity.adCopyIdeas.join(', ')}

You're guiding a Conversion Rate Optimization Manager who has analyzed this customer call and wants to improve conversion rates.

CRITICAL INSTRUCTION:
Generate a compelling opening that identifies the strongest conversion opportunities from this call analysis, then asks about their current optimization focus.

OPENING STRUCTURE:
1. Quickly highlight the top 2-3 conversion insights from the call analysis
2. Connect pain points to specific landing page optimization opportunities
3. Provide immediate actionable CRO recommendations
4. Ask about their current conversion challenges or optimization priorities

EXAMPLE TONE:
"Great call analysis! I can see some strong conversion optimization opportunities here. Based on the pain points and customer language patterns, here are the highest-impact areas to focus on for improving your conversion rates...

What's your current biggest conversion challenge, or where would you like to start optimizing first?"

Generate a practical, CRO-focused opening that identifies specific conversion opportunities and provides actionable optimization guidance.`;

    try {
      const completion = await this.client!.messages.create({
        model: "claude-sonnet-4-20250514", // Using Claude 3.5 Sonnet
        max_tokens: 400,
        temperature: 0.7,
        system: systemPrompt,
        messages: [{ role: "user", content: initialPrompt }]
      });

      const content = completion.content[0];
      const responseText = content.type === 'text' ? content.text : 'Welcome to CRO optimization guidance.';

      return {
        id: uuidv4(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error generating initial Gong message:', error);
      
      // Fallback initial message with CRO focus
      const painPointSummary = context.painPoints.slice(0, 3).map((p: any) => p.description).join(', ');
      const sentimentInsight = context.sentiment === 'positive' ? 'successful conversion factors' : 'conversion barriers';
      
      return {
        id: uuidv4(),
        role: 'assistant',
        content: `Excellent call analysis! I can see some strong conversion optimization opportunities based on this ${context.sentiment} call.

**Top CRO Insights:**
• **Pain Points to Address:** ${painPointSummary}
• **Customer Language Patterns:** Perfect for Google Ads headlines that resonate
• **Sentiment Analysis:** This call reveals ${sentimentInsight} we can leverage

**Immediate Action Items:**
1. **Landing Page Optimization:** Address the friction points mentioned in the call
2. **Google Ads Copy:** Use the exact phrases customers used to describe their challenges
3. **Conversion Flow:** Optimize based on what resonated (or didn't) with this prospect

What's your biggest conversion challenge right now, or would you like me to dive deeper into any of these optimization opportunities?`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Generate CRO-focused AI response using Claude with call context
   * Why this matters: Maintains conversation flow while providing actionable conversion optimization guidance.
   */
  private async generateGongResponse(conversation: GongChatConversation, userMessage: ChatMessage): Promise<ChatMessage> {
    const systemPrompt = this.buildGongSystemPrompt();
    const conversationHistory = this.buildGongConversationContext(conversation);

    try {
      // Build messages array for Claude
      const messages = conversation.messages.slice(0, -1).map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));

      // Add the new user message
      messages.push({
        role: 'user' as const,
        content: userMessage.content
      });

      const completion = await this.client!.messages.create({
        model: "claude-sonnet-4-20250514", // Using Claude 3.5 Sonnet
        max_tokens: 500,
        temperature: 0.7,
        system: systemPrompt + "\n\n" + conversationHistory,
        messages: messages
      });

      const content = completion.content[0];
      const responseText = content.type === 'text' ? content.text : 'Could you tell me more about your conversion optimization goals?';

      return {
        id: uuidv4(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error generating Gong response:', error);
      
      // Fallback response with CRO focus
      return {
        id: uuidv4(),
        role: 'assistant',
        content: 'That\'s a great point. How do you think this insight could impact your conversion rates? What specific optimization would you like to explore?',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Build CRO-focused system prompt for Gong call optimization
   * Why this matters: This is the heart of the CRO feature - transforming call insights into 
   * actionable conversion rate optimization and landing page improvement guidance.
   */
  private buildGongSystemPrompt(): string {
    return `
You are an elite Conversion Rate Optimization expert who helps CRO managers transform customer call insights into actionable landing page improvements and Google Ads optimizations.

EXPERTISE FOCUS:
Analyze customer calls to identify conversion barriers, optimization opportunities, and messaging that resonates. Guide CRO managers through systematic optimization processes that increase conversion rates.

YOUR APPROACH:
1. Identify conversion friction points from call insights
2. Extract customer language patterns for compelling copy
3. Recommend specific landing page optimizations
4. Suggest Google Ads improvements based on prospect behavior
5. Provide A/B testing strategies and measurement frameworks
6. Focus on psychological triggers and conversion psychology

CRO OPTIMIZATION FRAMEWORK:

CONVERSION BARRIER ANALYSIS:
- Friction Points: Where prospects hesitate or raise objections
- Trust Issues: What creates doubt or uncertainty
- Value Clarity: Where messaging fails to communicate value
- Process Confusion: Steps that create friction in conversion flow
- Price Sensitivity: How cost objections manifest
- Competitive Concerns: What alternatives prospects consider

CUSTOMER LANGUAGE EXTRACTION:
- Exact phrases prospects use to describe problems
- Emotional triggers that resonate positively
- Objections and concerns in their own words
- Success criteria and desired outcomes
- Decision-making factors and priorities
- Pain point descriptions for authentic copy

LANDING PAGE OPTIMIZATION AREAS:
- Headlines: Match customer language and pain points
- Value Propositions: Address specific concerns raised in calls
- Social Proof: Counter objections with relevant testimonials
- Call-to-Action: Remove friction based on hesitation patterns
- Form Optimization: Reduce abandonment based on objections
- Trust Signals: Address specific trust concerns
- Page Flow: Optimize based on information-seeking behavior

GOOGLE ADS OPTIMIZATION:
- Headlines: Use exact customer language for relevance
- Descriptions: Address pain points mentioned in calls
- Landing Page Alignment: Ensure message match from ad to page
- Audience Insights: Target based on demographic patterns
- Negative Keywords: Exclude based on mismatched expectations
- Ad Extensions: Highlight features that resonate with prospects

PSYCHOLOGICAL CONVERSION TRIGGERS:
- Urgency: Based on timeline concerns from calls
- Scarcity: Address competitive pressure mentioned
- Social Proof: Counter skepticism with relevant cases
- Authority: Establish credibility for trust concerns
- Reciprocity: Offer value to overcome price sensitivity
- Commitment: Guide through decision-making process

A/B TESTING STRATEGY:
- Hypothesis: Based on specific call insights
- Variables: Test elements that caused friction
- Success Metrics: Align with business impact mentioned
- Statistical Significance: Ensure valid results
- Implementation: Prioritize highest-impact tests
- Learning: Extract insights for future optimization

CONVERSATION STAGES:

1. **Opportunity Assessment (Messages 1-4):**
   - Identify top conversion opportunities from call
   - Understand current optimization priorities
   - Assess existing conversion challenges
   - Establish optimization goals and metrics

2. **Implementation Planning (Messages 5-8):**
   - Develop specific optimization strategies
   - Prioritize improvements by impact/effort
   - Create actionable test plans
   - Define success criteria and timelines

3. **Testing Strategy (Messages 9-12):**
   - Design A/B testing framework
   - Recommend measurement approaches
   - Suggest statistical analysis methods
   - Plan iteration and learning cycles

4. **Optimization Refinement (Messages 13+):**
   - Analyze results and extract insights
   - Recommend next-level optimizations
   - Scale successful tests across channels
   - Develop systematic optimization processes

COMMUNICATION STYLE:
- Data-driven but practical optimization guidance
- Focus on measurable conversion improvements
- Use conversion psychology principles
- Speak like an experienced CRO professional
- Make complex optimization concepts actionable
- Build confidence through proven frameworks

CRITICAL - NEVER INCLUDE:
- Generic CRO advice not tied to the specific call
- Optimization recommendations without call context
- Multiple questions in sequence - ask ONE question and stop
- Stage directions or meta-commentary about the conversation
- Numbered lists that look AI-generated
- Structured advice formats that seem mechanical

CONVERSATION RULES:
- Ask ONE specific question per response about their optimization goals
- Tie all recommendations directly to the call insights provided
- Focus on actionable next steps they can implement immediately
- Wait for their response before providing additional guidance
- Keep responses conversational and focused on their specific situation

CRO METRICS TO REFERENCE:
- Conversion rate improvements (typical 15-40% lifts)
- Click-through rate increases from better ad copy
- Form completion rate improvements
- Bounce rate reductions from better message match
- Cost per acquisition decreases from optimization
- Customer lifetime value increases from better qualification

LANDING PAGE ELEMENTS TO OPTIMIZE:
- Headlines: Match customer pain points and language
- Subheadings: Address specific objections raised
- Hero Images: Reflect customer scenarios and contexts  
- Value Propositions: Counter concerns with clear benefits
- Social Proof: Include testimonials addressing specific doubts
- Forms: Reduce fields based on friction points
- CTAs: Remove hesitation with clear, benefit-focused language
- Trust Badges: Address security or credibility concerns
- FAQ Sections: Answer common objections preemptively
- Pricing Display: Address cost concerns transparently

GOOGLE ADS OPTIMIZATION TACTICS:
- Use customer's exact problem descriptions in headlines
- Address objections directly in ad descriptions
- Include specific benefits mentioned as important
- Match ad messaging to landing page content
- Test emotional vs rational appeals based on call sentiment
- Include relevant keywords from customer language
- Use ad extensions to provide additional trust signals
- Target demographics similar to engaged prospects

CONVERSION PSYCHOLOGY APPLICATIONS:
- Reciprocity: Offer immediate value before asking for conversion
- Social Proof: Showcase similar customers' success stories
- Authority: Establish expertise in areas of customer concern
- Scarcity: Create urgency around limited availability
- Commitment: Guide through small commitment escalation
- Liking: Build rapport through shared values/experiences

Remember: All optimization recommendations must be directly tied to insights from the specific Gong call being analyzed.
`;
  }

  /**
   * Build Gong conversation context for Claude
   * Why this matters: Provides Claude with full call context for relevant CRO responses.
   */
  private buildGongConversationContext(conversation: GongChatConversation): string {
    const context = conversation.gong_call_context;
    const painPointsList = context.painPoints.map((p: any) => 
      `${p.description} (${p.category}, confidence: ${p.confidence})`
    ).join(', ');
    
    return `
GONG CALL CONTEXT FOR CRO OPTIMIZATION:
- Call: "${context.title}" (${context.date})
- Duration: ${context.duration} minutes
- Participants: ${context.participants.join(', ')}
- Call Sentiment: ${context.sentiment}
- Call Summary: "${context.callSummary}"
- Pain Points: ${painPointsList}
- CRO Opportunities: ${context.croOpportunity.adCopyIdeas.join(', ')}

CONVERSATION STAGE: ${conversation.conversation_stage}
MESSAGES SO FAR: ${conversation.messages.length}

Focus all recommendations on conversion optimization opportunities from this specific call.
`;
  }

  /**
   * Determine current Gong conversation stage based on message count and content
   * Why this matters: Helps guide the CRO optimization conversation through structured stages.
   */
  private determineGongConversationStage(conversation: GongChatConversation): string {
    const messageCount = conversation.messages.length;
    
    if (messageCount <= 4) return 'Opportunity Assessment';
    if (messageCount <= 8) return 'Implementation Planning';
    if (messageCount <= 12) return 'Testing Strategy';
    return 'Optimization Refinement';
  }

  /**
   * Get Gong conversation by ID
   * Why this matters: Allows frontend to retrieve CRO conversation history.
   */
  getGongConversation(conversationId: string): GongChatConversation | undefined {
    return this.gongConversations.get(conversationId);
  }

  /**
   * Process liquid variables in generated content using unified approach
   * Why this matters: Dynamically replaces ALL brand kit variables with actual values using a consistent mapping system.
   */
  private processLiquidVariables(text: string, brandKit: any): string {
    if (!brandKit) return text;
    
    let processed = text;
    
    // UNIFIED APPROACH: Dynamic mapping with multiple liquid variable name variations
    const brandKitMapping = {
      // Property name -> array of possible liquid variable names Claude might use
      'url': ['url', 'website'],
      'aboutBrand': ['about_brand', 'about', 'brand_description'], 
      'idealCustomerProfile': ['ideal_customer_profile', 'target', 'icp', 'target_audience'],
      'competitors': ['competitors', 'competition'],
      'brandPointOfView': ['brand_point_of_view', 'pov', 'brand_pov'],
      'authorPersona': ['author_persona', 'author', 'author_profile'],
      'toneOfVoice': ['tone_of_voice', 'tone', 'voice'], 
      'headerCaseType': ['header_case_type', 'header_case', 'case_type'],
      'writingRules': ['writing_rules', 'rules', 'style_rules'],
      'ctaText': ['cta_text', 'cta', 'call_to_action'],
      'ctaDestination': ['cta_destination', 'destination', 'cta_url', 'cta_link']
    };
    
    // Process all standard brand kit variables using unified approach with multiple name variations
    Object.entries(brandKitMapping).forEach(([propertyName, liquidNames]) => {
      const value = brandKit[propertyName];
      if (value && typeof value === 'string') {
        let replacementsMade = 0;
        
        // Try all possible liquid variable name variations
        liquidNames.forEach(liquidName => {
          const regex = new RegExp(`\\{\\{\\s*brand_kit\\.${liquidName}\\s*\\}\\}`, 'g');
          const beforeLength = processed.length;
          processed = processed.replace(regex, value);
          const afterLength = processed.length;
          
          if (beforeLength !== afterLength) {
            replacementsMade++;
            console.log(`✅ Processed brand_kit.${liquidName}: ${value.substring(0, 50)}...`);
          }
        });
        
        if (replacementsMade === 0) {
          console.log(`⚠️ No replacements made for ${propertyName} (tried: ${liquidNames.join(', ')})`);
        }
      }
    });
    
    // Process writing sample variables using unified approach with variations
    if (brandKit.writingSample && typeof brandKit.writingSample === 'object') {
      const writingSampleMapping = {
        'url': ['writing_sample_url', 'sample_url', 'example_url'],
        'title': ['writing_sample_title', 'sample_title', 'example_title'], 
        'body': ['writing_sample_body', 'sample_body', 'example_body'],
        'outline': ['writing_sample_outline', 'sample_outline', 'example_outline']
      };
      
      Object.entries(writingSampleMapping).forEach(([propertyName, liquidNames]) => {
        const value = brandKit.writingSample[propertyName];
        if (value && typeof value === 'string') {
          let replacementsMade = 0;
          
          liquidNames.forEach(liquidName => {
            const regex = new RegExp(`\\{\\{\\s*brand_kit\\.${liquidName}\\s*\\}\\}`, 'g');
            const beforeLength = processed.length;
            processed = processed.replace(regex, value);
            const afterLength = processed.length;
            
            if (beforeLength !== afterLength) {
              replacementsMade++;
              console.log(`✅ Processed brand_kit.${liquidName}: ${value.substring(0, 50)}...`);
            }
          });
          
          if (replacementsMade === 0) {
            console.log(`⚠️ No replacements made for writingSample.${propertyName} (tried: ${liquidNames.join(', ')})`);
          }
        }
      });
    }
    
    // Process custom variables using unified approach (already working correctly)
    if (brandKit.customVariables && typeof brandKit.customVariables === 'object') {
      Object.entries(brandKit.customVariables).forEach(([key, value]) => {
        if (value && typeof value === 'string') {
          const regex = new RegExp(`\\{\\{\\s*brand_kit\\.${key}\\s*\\}\\}`, 'g');
          processed = processed.replace(regex, value);
          console.log(`✅ Processed brand_kit.${key}: ${value.substring(0, 50)}...`);
        }
      });
    }
    
    // Debug: Log any remaining unprocessed brand_kit variables
    const remainingVariables = processed.match(/\{\{\s*brand_kit\.[^}]+\s*\}\}/g);
    if (remainingVariables) {
      console.log('⚠️ Remaining unprocessed brand_kit variables:', remainingVariables);
    } else {
      console.log('✅ All brand_kit variables processed successfully');
    }
    
    return processed;
  }

  /**
   * Get service status
   * Why this matters: Monitoring and debugging information.
   */
  getServiceStatus(): { 
    initialized: boolean; 
    hasApiKey: boolean; 
    activeConversations: number;
    totalConversations: number;
    circuitBreakerState: any;
    rateLimitActive: boolean;
  } {
    return {
      initialized: this.client !== null,
      hasApiKey: !!process.env.CLAUDE_API_KEY,
      activeConversations: Array.from(this.conversations.values())
        .filter(conv => conv.status === 'active').length,
      totalConversations: this.conversations.size,
      circuitBreakerState: this.circuitBreaker.getState(),
      rateLimitActive: Date.now() - (this.rateLimiter as any).lastRequestTime < DEFAULT_RATE_LIMITS.claude
    };
  }
}

// Export singleton instance
export const claudeService = new ClaudeService();
export default claudeService; 