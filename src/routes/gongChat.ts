import { Router, Request, Response } from 'express';
import claudeService from '../services/claudeService';
import { 
  StartGongConversationRequest, 
  SendGongMessageRequest,
  GongChatConversation,
  ChatMessage,
  StartGongConversationResponse,
  SendGongMessageResponse
} from '../types';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// In-memory storage for Gong conversations (similar to claude service)
const gongConversations: Map<string, GongChatConversation> = new Map();
const conversationTimeout = 30 * 60 * 1000; // 30 minutes
const maxMessages = 50; // Prevent runaway conversations

/**
 * POST /api/gong-chat/start-conversation
 * Start a new CRO-focused conversation with Gong call context
 * Why this matters: Initializes CRO optimization guidance with specific
 * call insights, setting up landing page and ad copy improvement recommendations.
 */
router.post('/start-conversation', async (req: Request, res: Response): Promise<any> => {
  try {
    // Validate request body
    const { 
      call_id, 
      title, 
      date, 
      duration, 
      participants, 
      sentiment, 
      callSummary, 
      painPoints, 
      croOpportunity 
    }: StartGongConversationRequest = req.body;

    if (!call_id || !title || !callSummary || !painPoints) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'call_id, title, callSummary, and painPoints are required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`🎯 Starting CRO conversation for call: "${title.substring(0, 50)}..."`);

    const conversationId = uuidv4();
    const now = new Date().toISOString();

    // Create conversation with Gong call context
    const conversation: GongChatConversation = {
      id: conversationId,
      gong_call_context: {
        call_id,
        title,
        date,
        duration,
        participants,
        sentiment,
        callSummary,
        painPoints,
        croOpportunity
      },
      messages: [],
      conversation_stage: 'Opportunity Assessment',
      created_at: now,
      updated_at: now,
      status: 'active'
    };

    // Generate initial CRO optimization message
    const initialMessage = await generateInitialCROMessage(conversation);
    conversation.messages.push(initialMessage);
    conversation.updated_at = new Date().toISOString();

    // Store conversation
    gongConversations.set(conversationId, conversation);

    console.log(`🎯 Started new CRO conversation ${conversationId} for call: "${title.substring(0, 50)}..."`);

    const response: StartGongConversationResponse = {
      conversation_id: conversationId,
      initial_message: initialMessage
    };

    res.json({
      success: true,
      ...response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Start CRO conversation error:', error);
    
    res.status(500).json({
      error: 'CRO Conversation Start Failed',
      message: error instanceof Error ? error.message : 'Unknown conversation error',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/gong-chat/message
 * Send a message in an existing CRO conversation and get AI response
 * Why this matters: Continues the CRO optimization guidance process, providing specific
 * landing page improvements and ad copy recommendations based on call insights.
 */
router.post('/message', async (req: Request, res: Response): Promise<any> => {
  try {
    // Validate request body
    const { conversation_id, message }: SendGongMessageRequest = req.body;

    if (!conversation_id || !message) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'conversation_id and message are required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'message must be a non-empty string',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`💬 Processing CRO message in conversation ${conversation_id}`);

    const conversation = gongConversations.get(conversation_id);
    if (!conversation) {
      return res.status(404).json({
        error: 'Conversation Not Found',
        message: 'CRO conversation not found or expired',
        status: 404,
        timestamp: new Date().toISOString()
      });
    }

    // Handle ping messages to test conversation existence
    if (message === '__PING__') {
      const pingMessage: ChatMessage = {
        id: uuidv4(),
        role: 'user',
        content: '__PING__',
        timestamp: new Date().toISOString()
      };
      
      return res.json({
        success: true,
        user_message: pingMessage,
        assistant_message: {
          id: uuidv4(),
          role: 'assistant',
          content: '__PONG__',
          timestamp: new Date().toISOString()
        },
        conversation_stage: determineCROConversationStage(conversation),
        timestamp: new Date().toISOString()
      });
    }

    if (conversation.status !== 'active') {
      return res.status(410).json({
        error: 'Conversation Ended',
        message: 'CRO conversation is not active',
        status: 410,
        timestamp: new Date().toISOString()
      });
    }

    if (conversation.messages.length >= maxMessages) {
      return res.status(429).json({
        error: 'Conversation Limit Reached',
        message: 'CRO conversation has reached maximum message limit',
        status: 429,
        timestamp: new Date().toISOString()
      });
    }

    const now = new Date().toISOString();

    // Create user message
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: message.trim(),
      timestamp: now
    };

    // Add user message to conversation
    conversation.messages.push(userMessage);

    // Generate AI response
    const assistantMessage = await generateCROResponse(conversation, userMessage);
    conversation.messages.push(assistantMessage);
    conversation.updated_at = new Date().toISOString();

    // Update conversation in storage
    gongConversations.set(conversation_id, conversation);

    const response: SendGongMessageResponse = {
      user_message: userMessage,
      assistant_message: assistantMessage,
      conversation_stage: determineCROConversationStage(conversation)
    };

    res.json({
      success: true,
      ...response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Send CRO message error:', error);
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('expired')) {
        return res.status(404).json({
          error: 'Conversation Not Found',
          message: error.message,
          status: 404,
          timestamp: new Date().toISOString()
        });
      }
      
      if (error.message.includes('not active')) {
        return res.status(410).json({
          error: 'Conversation Ended',
          message: error.message,
          status: 410,
          timestamp: new Date().toISOString()
        });
      }

      if (error.message.includes('maximum message limit')) {
        return res.status(429).json({
          error: 'Conversation Limit Reached',
          message: error.message,
          status: 429,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    res.status(500).json({
      error: 'CRO Message Failed',
      message: error instanceof Error ? error.message : 'Unknown message error',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/gong-chat/conversation/:id
 * Retrieve CRO conversation history by ID
 * Why this matters: Allows frontend to fetch complete CRO conversation context
 * for display and continuation of optimization guidance sessions.
 */
router.get('/conversation/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const conversationId = req.params.id;

    if (!conversationId) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'conversation ID is required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    const conversation = gongConversations.get(conversationId);

    if (!conversation) {
      return res.status(404).json({
        error: 'Conversation Not Found',
        message: 'CRO conversation not found or has expired',
        status: 404,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      conversation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get CRO conversation error:', error);
    
    res.status(500).json({
      error: 'CRO Conversation Retrieval Failed',
      message: error instanceof Error ? error.message : 'Unknown retrieval error',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/gong-chat/status
 * Check CRO chat service status and connection
 * Why this matters: Provides health monitoring for the CRO chat service
 * to ensure Claude integration is working properly for optimization guidance.
 */
router.get('/status', async (req: Request, res: Response): Promise<any> => {
  try {
    const isConnected = await claudeService.testConnection();

    res.json({
      service: 'CRO Chat',
      status: isConnected ? 'connected' : 'disconnected',
      details: {
        active_conversations: gongConversations.size,
        connection_test: isConnected
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('CRO chat status check error:', error);
    
    res.status(500).json({
      service: 'CRO Chat',
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Generate initial CRO optimization message based on Gong call context
 * Why this matters: Sets the tone for CRO-focused guidance that leads to actionable
 * landing page improvements and ad copy recommendations.
 */
async function generateInitialCROMessage(conversation: GongChatConversation): Promise<ChatMessage> {
  const context = conversation.gong_call_context;
  
  const systemPrompt = buildCROSystemPrompt();
  const initialPrompt = `
GONG CALL CONTEXT FOR CRO OPTIMIZATION:
- Call Title: "${context.title}"
- Call Date: ${context.date || 'Not specified'}
- Duration: ${context.duration || 'Not specified'} minutes
- Participants: ${context.participants ? context.participants.join(', ') : 'Not specified'}
- Sentiment: ${context.sentiment || 'neutral'}
- Call Summary: "${context.callSummary}"

EXTRACTED PAIN POINTS:
${Array.isArray(context.painPoints) ? 
  context.painPoints.map(pp => 
    typeof pp === 'string' ? `- ${pp}` : `- ${pp.text || pp} (${pp.category || 'general'}, ${pp.emotionalTrigger || 'standard'})`
  ).join('\n') : 
  context.painPoints ? `- ${String(context.painPoints)}` : '- No specific pain points identified'}

CRO OPPORTUNITIES IDENTIFIED:
- Ad Copy Ideas: ${context.croOpportunity?.adCopyIdeas?.join(', ') || 'Will be generated based on call insights'}
- Google Ads Headlines: ${context.croOpportunity?.googleAdsHeadlines?.slice(0, 3).join(', ') || 'Will be created from pain points'}...
- Google Ads Descriptions: ${context.croOpportunity?.googleAdsDescriptions?.slice(0, 2).join(', ') || 'Will be developed from customer language'}...
- Landing Page Recommendations: ${context.croOpportunity?.landingPageRecommendations?.slice(0, 3).join(', ') || 'Will be provided based on conversion barriers'}...

You're mentoring a CRO manager who wants to leverage these call insights for conversion optimization.

CRITICAL INSTRUCTION:
Generate a compelling opening that identifies the biggest CRO opportunity from this call data, then provides specific next steps for landing page optimization or ad copy improvements.

OPENING STRUCTURE:
1. Quickly identify the core conversion opportunity in this call
2. Connect specific pain points to landing page or ad copy improvements
3. Provide 2-3 immediate, actionable CRO recommendations
4. Focus on measurable conversion improvements they can implement

EXAMPLE TONE:
"Excellent call analysis! I can see some powerful conversion opportunities here. Based on the ${context.sentiment} sentiment and key pain points around [specific issue], there are 3 specific areas where you can likely improve conversion rates immediately.

Let me break down the biggest opportunities and give you some concrete next steps..."

Generate a practical, action-oriented opening that identifies the top CRO opportunities and provides specific optimization strategies based on this call data.`;

  try {
    // Use Claude service for content generation
    const response = await claudeService.generateContent({
      system_prompt: systemPrompt,
      user_prompt: initialPrompt,
      post_context: { 
        keyword: 'CRO optimization',
        title: context.title
      },
      brand_kit: null
    });

    return {
      id: uuidv4(),
      role: 'assistant',
      content: response.content,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error generating initial CRO message:', error);
    
    // Fallback initial message
    const topPainPoints = context.painPoints.slice(0, 3);
    const topRecommendations = context.croOpportunity.landingPageRecommendations.slice(0, 3);
    
    return {
      id: uuidv4(),
      role: 'assistant',
      content: `Perfect! I've analyzed this ${context.sentiment} call and spotted some excellent CRO opportunities.

**Key Conversion Insights:**
${topPainPoints.map(pp => `• **${pp.category.replace('_', ' ')}:** ${pp.text}`).join('\n')}

**Immediate Action Items:**
${topRecommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n')}

The customer language from this call gives us powerful material for both landing page copy and Google Ads. 

Which area would you like to tackle first - landing page optimization or ad copy improvements? I can walk you through specific changes based on what resonated (or didn't) in this conversation.`,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Generate AI response using Claude with CRO conversation context
 * Why this matters: Maintains CRO-focused conversation flow while providing specific
 * optimization guidance based on call insights.
 */
async function generateCROResponse(conversation: GongChatConversation, userMessage: ChatMessage): Promise<ChatMessage> {
  const systemPrompt = buildCROSystemPrompt();
  const conversationHistory = buildCROConversationContext(conversation);

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

    // Use Claude service for response generation
    const response = await claudeService.generateContent({
      system_prompt: systemPrompt + "\n\n" + conversationHistory,
      user_prompt: userMessage.content,
      post_context: { 
        keyword: 'CRO conversation',
        title: conversation.gong_call_context.title
      },
      brand_kit: null
    });

    return {
      id: uuidv4(),
      role: 'assistant',
      content: response.content,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error generating CRO response:', error);
    
    // Fallback response
    return {
      id: uuidv4(),
      role: 'assistant',
      content: 'That\'s a great point. Can you tell me more about what specific conversion metrics you\'re trying to improve? I can provide more targeted recommendations based on the call insights.',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Build the core system prompt for CRO optimization guidance
 * Why this matters: This is the heart of the CRO feature - transforming generic chat into
 * targeted conversion optimization guidance based on real customer insights.
 */
function buildCROSystemPrompt(): string {
  return `
You are an expert Conversion Rate Optimization (CRO) consultant who specializes in leveraging customer call insights to improve landing pages and ad copy performance.

CRO COACHING PHILOSOPHY:
Provide actionable, data-driven optimization recommendations based on real customer language and pain points from sales calls. Focus on measurable conversion improvements.

YOUR APPROACH:
1. Analyze customer pain points from calls to identify conversion barriers
2. Recommend specific landing page improvements based on customer language
3. Suggest Google Ads copy variations using authentic customer phrases
4. Provide A/B testing strategies for optimization recommendations
5. Focus on psychological triggers and trust factors revealed in calls
6. Guide implementation of customer-centric messaging

CRO OPTIMIZATION AREAS:

LANDING PAGE OPTIMIZATION:
- Headlines that address specific pain points mentioned in calls
- Value propositions using customer language and priorities
- Trust signals that address concerns raised during calls
- CTA optimization based on customer decision-making patterns
- Form optimization based on prospect hesitations
- Social proof that resonates with the target audience

GOOGLE ADS OPTIMIZATION:
- Headlines using exact customer language from calls
- Descriptions that address specific pain points
- Ad extensions highlighting benefits customers actually care about
- Landing page alignment with ad messaging
- Negative keywords based on misaligned prospects

CONVERSION PSYCHOLOGY:
- Pain point prioritization based on emotional triggers
- Trust factor optimization based on customer concerns
- Urgency creation using real customer timelines
- Risk reversal addressing specific objections
- Social proof selection based on prospect demographics

TESTING STRATEGY:
- A/B testing prioritization based on pain point severity
- Statistical significance guidance for test duration
- Metric selection based on business goals
- Customer segment testing based on call patterns

CONVERSATION STAGES:
1. Opportunity Assessment: What's the biggest conversion opportunity?
2. Implementation Planning: How to execute specific improvements?
3. Testing Strategy: How to validate and measure improvements?
4. Optimization Refinement: How to iterate based on results?

COMMUNICATION STYLE:
- Speak as an experienced CRO consultant would in conversation
- Confident and data-driven, with practical recommendations
- Use concrete examples from the call insights provided
- Focus on measurable outcomes and conversion impact
- Make abstract concepts immediately actionable
- Provide specific copy suggestions and implementation steps

CRITICAL - NEVER INCLUDE:
- Stage directions like "*Wait for their response*" or "*Then...*"
- Explanations of methodology like "This guides them to discover..."
- Multiple questions in sequence - provide guidance and ask ONE question
- Brackets, asterisks, or any meta-commentary
- Numbered lists that look mechanical (integrate into natural flow)

CONVERSATION RULES:
- Ask ONE question per response, then stop completely
- Provide specific, actionable CRO recommendations
- Use authentic customer language from the call context
- Focus on immediate implementation steps
- Reference specific pain points and opportunities
- Keep responses conversational and practical

COMMON CRO IMPROVEMENTS BY PAIN POINT:
- Manual Tasks → Automation messaging, time-saving headlines
- Data Quality → Accuracy trust signals, data security messaging  
- Integration → Seamless workflow messaging, compatibility assurance
- Cost Concerns → ROI focus, cost-savings calculations
- Compliance → Security badges, certification displays
- Deliverability → Performance metrics, success rate data

REMEMBER: Always ground recommendations in the specific call insights provided. Use real customer language and address actual pain points mentioned in the conversation.
`;
}

/**
 * Build conversation context for CRO optimization
 * Why this matters: Provides full context for targeted CRO responses.
 */
function buildCROConversationContext(conversation: GongChatConversation): string {
  const context = conversation.gong_call_context;
  return `
GONG CALL CONTEXT:
- Call: "${context.title}" (${context.date})
- Duration: ${context.duration} minutes  
- Sentiment: ${context.sentiment}
- Summary: "${context.callSummary}"

PAIN POINTS FROM CALL:
${context.painPoints.map(pp => `- ${pp.text} (${pp.category})`).join('\n')}

CRO OPPORTUNITIES:
- Landing Page: ${context.croOpportunity.landingPageRecommendations.slice(0, 3).join(', ')}
- Ad Copy Ideas: ${context.croOpportunity.adCopyIdeas.slice(0, 3).join(', ')}

CONVERSATION STAGE: ${determineCROConversationStage(conversation)}
MESSAGES SO FAR: ${conversation.messages.length}
`;
}

/**
 * Determine current CRO conversation stage based on message count and content
 * Why this matters: Helps guide the conversation flow through optimization stages.
 */
function determineCROConversationStage(conversation: GongChatConversation): string {
  const messageCount = conversation.messages.length;
  
  if (messageCount <= 4) return 'Opportunity Assessment';
  if (messageCount <= 8) return 'Implementation Planning';
  if (messageCount <= 12) return 'Testing Strategy';
  return 'Optimization Refinement';
}

// Clean up expired conversations every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, conversation] of gongConversations.entries()) {
    const conversationAge = now - new Date(conversation.updated_at).getTime();
    if (conversationAge > conversationTimeout) {
      gongConversations.delete(id);
      console.log(`🧹 Cleaned up expired CRO conversation: ${id}`);
    }
  }
}, 10 * 60 * 1000);

export default router; 