import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import { 
  ChatConversation, 
  ChatMessage, 
  StartConversationRequest, 
  StartConversationResponse,
  SendMessageRequest,
  SendMessageResponse 
} from '../types';

class ClaudeService {
  private client: Anthropic | null = null;
  private conversations: Map<string, ChatConversation> = new Map();
  private readonly conversationTimeout = 30 * 60 * 1000; // 30 minutes
  private readonly maxMessages = 50; // Prevent runaway conversations

  constructor() {
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
        model: "claude-3-5-sonnet-20241022", // Using latest Claude 3.5 Sonnet (Claude 4 not yet available via API)
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
        model: "claude-3-5-sonnet-20241022", // Using latest Claude 3.5 Sonnet (Claude 4 not yet available via API)
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
   * Generate content using Claude with Reddit context and brand kit
   * Why this matters: Creates SEO-optimized content by combining Reddit insights with brand positioning.
   */
  async generateContent(request: {
    system_prompt: string;
    user_prompt: string;
    post_context: any;
    brand_kit: any;
  }): Promise<{ content: string; title?: string; description?: string }> {
    if (!this.client) {
      throw new Error('Claude client not initialized');
    }

    try {
      console.log('🤖 Generating content with Claude...');

      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        temperature: 0.7,
        system: request.system_prompt,
        messages: [
          {
            role: 'user',
            content: request.user_prompt
          }
        ]
      });

      if (response.content[0].type === 'text') {
        const content = response.content[0].text;
        
        return {
          content,
          title: request.post_context?.title || '',
          description: 'Generated SEO-optimized content'
        };
      } else {
        throw new Error('Unexpected response format from Claude');
      }

    } catch (error) {
      console.error('Content generation error:', error);
      throw new Error(`Content generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
      const completion = await this.client.messages.create({
        model: "claude-3-5-sonnet-20241022", // Using latest Claude 3.5 Sonnet (Claude 4 not yet available via API)
        max_tokens: 50,
        messages: [{ role: "user", content: "Hello, this is a connection test." }]
      });

      return completion.content.length > 0;
    } catch (error) {
      console.error('Claude connection test failed:', error);
      return false;
    }
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
  } {
    return {
      initialized: this.client !== null,
      hasApiKey: !!process.env.CLAUDE_API_KEY,
      activeConversations: Array.from(this.conversations.values())
        .filter(conv => conv.status === 'active').length,
      totalConversations: this.conversations.size
    };
  }
}

// Export singleton instance
export const claudeService = new ClaudeService();
export default claudeService; 