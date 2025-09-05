import OpenAI from 'openai';

/**
 * Specialized Apollo Brand Sentiment Analysis Service
 * Why this matters: Provides accurate, Apollo-specific sentiment analysis that understands
 * the nuances of how people discuss Apollo.io, including technical terms, features,
 * and common pain points that generic sentiment analysis might miss.
 */
class ApolloBrandSentimentService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Analyze sentiment specifically toward Apollo brand
   * Why this matters: Unlike generic sentiment analysis, this focuses specifically on
   * how the commenter feels about Apollo.io as a product/service, understanding
   * Apollo-specific terminology and context.
   */
  async analyzeApolloSentiment(
    content: string, 
    postContext?: { title: string; content?: string }
  ): Promise<'positive' | 'negative' | 'neutral'> {
    
    // First check if Apollo is actually mentioned
    if (!this.mentionsApollo(content) && !this.mentionsApollo(postContext?.title || '') && !this.mentionsApollo(postContext?.content || '')) {
      return 'neutral'; // No Apollo mention = neutral Apollo sentiment
    }

    // Fallback for very short comments
    if (!content || content.trim().length < 10) {
      return this.fallbackApolloSentiment(content);
    }

    try {
      const contextPrompt = this.buildApolloSentimentPrompt(content, postContext);

      const completion = await this.openai.responses.create({
        model: "gpt-5-nano",
        input: contextPrompt
      });

      const sentiment = completion.output_text?.trim().toLowerCase();
      
      if (sentiment === 'positive' || sentiment === 'negative' || sentiment === 'neutral') {
        return sentiment as 'positive' | 'negative' | 'neutral';
      }
      
      // Fallback if AI response is unexpected
      return this.fallbackApolloSentiment(content);
      
    } catch (error) {
      console.warn('⚠️ Apollo sentiment analysis failed, using fallback:', error);
      return this.fallbackApolloSentiment(content);
    }
  }

  /**
   * Check if content mentions Apollo
   * Why this matters: We only want to analyze Apollo sentiment when Apollo is actually
   * being discussed. This prevents false positives from general negative comments.
   */
  private mentionsApollo(text: string): boolean {
    if (!text) return false;
    
    const apolloTerms = [
      'apollo', 'apollo.io', 'apolloio', 'apollo io',
      // Common misspellings
      'apolo', 'appollo', 'apallo'
    ];
    
    const lowerText = text.toLowerCase();
    return apolloTerms.some(term => lowerText.includes(term));
  }

  /**
   * Build specialized prompt for Apollo sentiment analysis
   * Why this matters: This prompt is specifically designed to understand Apollo.io
   * context, terminology, and common user experiences that generic prompts miss.
   */
  private buildApolloSentimentPrompt(content: string, postContext?: { title: string; content?: string }): string {
    const contextSection = postContext ? 
      `ORIGINAL POST CONTEXT:
Title: "${postContext.title}"
Content: "${postContext.content || 'No additional content'}"

` : '';

    return `You are analyzing sentiment specifically toward Apollo.io (the sales engagement platform) in Reddit comments.

${contextSection}COMMENT TO ANALYZE: "${content}"

APOLLO.IO CONTEXT:
- Apollo.io is a sales engagement platform for prospecting, email outreach, and lead generation
- Common Apollo features: data enrichment, email sequences, contact database, Chrome extension, verifier
- Common Apollo pain points: data quality issues, email bounces, deliverability, pricing, UI/UX
- Common positive mentions: good data coverage, helpful features, ROI, lead generation success

ANALYSIS INSTRUCTIONS:
Focus ONLY on sentiment toward Apollo.io specifically. Ignore general sentiment about other topics.

POSITIVE Apollo sentiment indicators:
- Praising Apollo's features, data quality, or results
- Success stories using Apollo
- Recommending Apollo over competitors
- Positive comparisons ("Apollo is better than X")
- Expressing satisfaction with Apollo's performance

NEGATIVE Apollo sentiment indicators:
- Criticizing Apollo's data quality, features, or performance
- Complaints about Apollo's pricing, deliverability, or bugs
- Expressing frustration with Apollo specifically
- Warning others about Apollo issues
- Negative comparisons ("X is better than Apollo")
- Mentioning problems like "bounces", "data quality slipped", "wasted outreach" in Apollo context

NEUTRAL Apollo sentiment indicators:
- Factual questions about Apollo
- Neutral feature comparisons
- Asking for Apollo alternatives without criticism
- Technical discussions without clear positive/negative stance

EXAMPLES:
- "Apollo's data quality has slipped lately, super frustrating" → NEGATIVE
- "Apollo helped us increase our pipeline by 40%" → POSITIVE  
- "Has anyone tried Apollo for cold outreach?" → NEUTRAL
- "Apollo's verifier catches bounces but still get some bad emails" → NEGATIVE
- "Apollo works great for our team" → POSITIVE

Respond with only one word: "positive", "negative", or "neutral"`;
  }

  /**
   * Fallback Apollo sentiment analysis using Apollo-specific keywords
   * Why this matters: When AI fails, we need a backup that understands Apollo-specific
   * terminology and context better than generic sentiment analysis.
   */
  private fallbackApolloSentiment(content: string): 'positive' | 'negative' | 'neutral' {
    if (!content || !this.mentionsApollo(content)) return 'neutral';
    
    const text = content.toLowerCase();
    
    // Apollo-specific positive indicators
    const apolloPositiveTerms = [
      'apollo works', 'apollo helped', 'apollo is great', 'apollo is good',
      'love apollo', 'apollo rocks', 'apollo delivers', 'apollo increased',
      'apollo improved', 'success with apollo', 'apollo roi', 'apollo results',
      'recommend apollo', 'apollo over', 'apollo better than'
    ];
    
    // Apollo-specific negative indicators  
    const apolloNegativeTerms = [
      'apollo sucks', 'apollo terrible', 'apollo awful', 'apollo problems',
      'apollo issues', 'apollo bugs', 'apollo broken', 'apollo disappointing',
      'apollo frustrating', 'apollo data quality', 'apollo bounces', 
      'apollo deliverability', 'apollo overpriced', 'apollo expensive',
      'moved away from apollo', 'switched from apollo', 'apollo alternative',
      'better than apollo', 'apollo slipped', 'apollo declined'
    ];

    // Apollo-specific context terms that often indicate problems
    const apolloProblemContext = [
      'data quality', 'bounces', 'bounce rate', 'deliverability', 
      'wasted outreach', 'bad emails', 'invalid emails', 'outdated data'
    ];
    
    let positiveScore = 0;
    let negativeScore = 0;
    
    // Check for Apollo-specific positive terms
    apolloPositiveTerms.forEach(term => {
      if (text.includes(term)) positiveScore += 2;
    });
    
    // Check for Apollo-specific negative terms
    apolloNegativeTerms.forEach(term => {
      if (text.includes(term)) negativeScore += 2;
    });
    
    // Check for problem context when Apollo is mentioned
    if (this.mentionsApollo(text)) {
      apolloProblemContext.forEach(term => {
        if (text.includes(term)) negativeScore += 1;
      });
    }
    
    // General negative words in Apollo context get higher weight
    const generalNegativeInApolloContext = [
      'frustrating', 'disappointed', 'problem', 'issue', 'terrible', 'awful', 'sucks'
    ];
    
    if (this.mentionsApollo(text)) {
      generalNegativeInApolloContext.forEach(term => {
        if (text.includes(term)) negativeScore += 1;
      });
    }
    
    // Determine sentiment based on scores
    if (positiveScore > negativeScore) return 'positive';
    if (negativeScore > positiveScore) return 'negative';
    return 'neutral';
  }
}

export default ApolloBrandSentimentService;
