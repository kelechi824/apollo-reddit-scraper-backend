import OpenAI from 'openai';
import VoCDataExtractor from './vocDataExtractor';

interface VoCPainPoint {
  id: string;
  theme: string;
  liquidVariable: string;
  description: string;
  frequency: number;
  severity: 'high' | 'medium' | 'low';
  customerQuotes: string[];
  emotionalTriggers: string[];
  extractionTimestamp?: string;
  analysisMetadata?: {
    modelUsed: string;
    callsAnalyzed: number;
    processingTime: number;
  };
  sourceExcerpts?: Array<{
    quote: string;
    callTitle: string;
    callDate: string;
    excerpt: string;
    callId: string;
  }>;
}

interface VoCAnalysisResult {
  painPoints: VoCPainPoint[];
  totalCallsAnalyzed: number;
  analysisTimestamp: string;
  processingTimeMs: number;
  validationMetadata?: {
    dataSource: string;
    modelUsed: string;
    validationNote: string;
  };
}

/**
 * VoC Thematic Analyzer Service
 * Why this matters: Analyzes multiple customer calls to extract thematic pain points for VoC Kit liquid variables.
 */
class VoCThematicAnalyzer {
  private openai: OpenAI;
  private vocExtractor: VoCDataExtractor;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.vocExtractor = new VoCDataExtractor();
    console.log('✅ VoC Thematic Analyzer initialized');
  }

  /**
   * Generate analysis prompt
   * Why this matters: Provides structured instructions for extracting thematic pain points.
   */
  private generateAnalysisPrompt(callData: string): string {
    const extractionTimestamp = new Date().toISOString();
    const callCount = (callData.match(/---\s*Call/g) || []).length;
    
    return `🔍 ANALYZING REAL GONG CUSTOMER CALLS - Extract thematic pain points for marketing CTAs.

VALIDATION CONTEXT:
✅ Source: Live Gong sales call data  
✅ Analysis timestamp: ${extractionTimestamp}
✅ Calls processed: ${callCount}+ customer conversations
✅ Data authenticity: Current sales pipeline insights

🎯 EXTRACT EXACTLY 20-25 DISTINCT BUSINESS PAIN POINT THEMES (you MUST provide at least 20 unique pain point themes) focusing on:

CRITICAL: Extract the customer's BUSINESS PROBLEMS that brought them to Apollo, NOT complaints about Apollo itself.

🚨 IGNORE ALL CURRENT APOLLO PERFORMANCE DISCUSSIONS:
- If customers are discussing Apollo's current data quality, skip it
- If they mention Apollo integration issues, skip it  
- If they talk about Apollo's features not working, skip it
- ONLY extract business problems from BEFORE they used Apollo or problems with NON-APOLLO systems

Focus on their PRE-APOLLO challenges and ongoing business struggles across ALL AREAS:

SALES PROCESS & EFFICIENCY:
- Manual prospecting and research inefficiencies
- Time waste on repetitive sales tasks  
- Sales process inefficiencies and bottlenecks
- Territory planning and account prioritization issues
- Cold calling and outreach challenges
- Follow-up and nurturing process gaps

DATA & LEAD QUALITY:
- Poor lead quality and data accuracy issues
- Difficulty finding accurate contact information
- Outdated or incomplete contact databases
- Lead scoring and qualification challenges
- CRM data hygiene and management issues
- Duplicate data and record management problems

PIPELINE & FORECASTING:
- Pipeline visibility and forecasting challenges
- Revenue predictability and growth constraints
- Deal progression and conversion tracking issues
- Sales cycle length and velocity problems
- Win rate and loss analysis gaps

OUTREACH & COMMUNICATION:
- Struggles with outreach personalization at scale
- Email deliverability and outreach effectiveness
- Sequence automation and cadence optimization
- Multi-channel coordination challenges
- Response rate and engagement issues
- Message testing and optimization barriers

TEAM & SCALING:
- Sales team productivity and quota pressure
- Team scaling and onboarding challenges
- Rep performance consistency issues
- Training and skill development gaps
- Manager visibility and coaching challenges
- Territory coverage and capacity planning

COMPETITIVE & MARKET:
- Competitive intelligence and market research gaps
- Market penetration and expansion challenges
- Account-based marketing coordination issues
- Industry-specific prospecting difficulties
- Geographic or vertical market challenges

BUDGET & ROI:
- Sales tool ROI justification challenges
- Budget constraints and cost optimization
- Technology stack consolidation needs
- Resource allocation and efficiency issues

INTEGRATION & WORKFLOW:
- Tool integration and workflow inefficiencies
- Cross-platform data synchronization issues
- Reporting and analytics limitations
- Workflow automation gaps
- User adoption and change management challenges

⚠️ CRITICAL: Only use DIRECT quotes from the actual call data provided below.
📍 SOURCE MAPPING: For each quote, identify the exact call summary it came from and provide surrounding context.

🔗 MANDATORY SOURCE EXCERPTS: Every pain point MUST include sourceExcerpts array with call details.
   - Extract the exact quote from the call summary
   - Include the call title and date 
   - Provide surrounding context from the call summary
   - Reference the source call for transparency

📋 COMPREHENSIVE EXTRACTION REQUIREMENTS:
   - Minimum 20 pain point themes (aim for 22-25)
   - Cover diverse customer segments and use cases
   - Include both high-frequency (common) and specialized pain points
   - MANDATORY: Each theme MUST have 2-4 actual customerQuotes from the call data
   - MANDATORY: Each theme MUST have complete sourceExcerpts with call context
   - Validate each theme appears across multiple calls
   
🗣️ CUSTOMER QUOTES REQUIREMENT: Every pain point MUST include customerQuotes array with direct quotes from calls. NO GENERIC OR MADE-UP QUOTES - only exact customer language from the provided call summaries.

🚫 WHAT NOT TO EXTRACT:
- Complaints about Apollo features or UI
- Feedback on Apollo pricing or support
- Requests for Apollo product improvements
- Technical issues with Apollo platform

✅ WHAT TO EXTRACT - LOOK FOR HISTORICAL CONTEXT:
- "Before Apollo..." or "Prior to using Apollo..." statements
- "We used to..." or "Previously we..." descriptions
- References to old tools/processes they replaced
- Mentions of why they originally sought a solution
- Comparisons to their previous state/methods
- Business challenges that led them to evaluate Apollo initially
- Ongoing non-Apollo operational inefficiencies they mention
- Problems they describe about other vendors/tools they use

EXAMPLE GOOD QUOTES (with historical context):
- "Before Apollo, we were spending 4 hours a day just finding contact info"
- "We used to miss quota because our leads from LinkedIn Sales Navigator were low quality"
- "Previously we couldn't scale outreach without hiring more people"
- "Our old CRM made pipeline forecasting a complete guessing game"
- "With our previous data provider, contact accuracy was only 60%"
- "Before we had this solution, manual prospecting took our entire morning"

EXAMPLE BAD QUOTES (DON'T EXTRACT):
- "Apollo's interface could be more intuitive"
- "I wish Apollo had better reporting"
- "Apollo pricing is too high for our budget"

🎯 ACCURATE THEME CATEGORIZATION:
Create precise, specific themes based on the expanded categories above. Examples:
- "Manual Prospecting Research Time Waste" (SALES PROCESS)
- "Contact Data Accuracy and Completeness Issues" (DATA & LEAD QUALITY)  
- "Pipeline Forecasting Visibility Gaps" (PIPELINE & FORECASTING)
- "Email Deliverability and Response Rate Challenges" (OUTREACH & COMMUNICATION)
- "Sales Team Scaling and Onboarding Difficulties" (TEAM & SCALING)
- "Competitive Intelligence Research Inefficiencies" (COMPETITIVE & MARKET)
- "Sales Tool ROI Justification Pressure" (BUDGET & ROI)
- "CRM Integration and Workflow Fragmentation" (INTEGRATION & WORKFLOW)

Be SPECIFIC with theme names - avoid generic categories. Each theme should represent a distinct business challenge with focused customer quotes.

Return valid JSON with validation metadata and source excerpts:
{
  "metadata": {
    "analysisTimestamp": "${extractionTimestamp}",
    "callsAnalyzed": ${callCount},
    "dataSource": "Gong API - Live Customer Calls",
    "modelUsed": "gpt-4.1-nano-2025-04-14",
    "validationNote": "Quotes extracted from real customer conversations with source excerpts"
  },
  "painPoints": [
    {
      "theme": "Budget Constraints & ROI Concerns",
      "liquidVariable": "budget_constraints_roi", 
      "description": "Customers struggle with justifying investments and proving ROI to stakeholders",
      "frequency": 15,
      "severity": "high",
      "customerQuotes": ["Need ROI in 90 days", "Budget approval is getting harder"],
      "emotionalTriggers": ["Financial anxiety", "Performance pressure"],
      "sourceExcerpts": [
        {
          "quote": "Need ROI in 90 days",
          "callTitle": "John & Sarah | Apollo.io Meeting",
          "callDate": "2025-01-15",
          "excerpt": "John mentioned that their finance team is requiring them to show clear ROI within 90 days of any new software purchase. He said 'We need ROI in 90 days or they won't approve the budget expansion.'",
          "callId": "12345"
        },
        {
          "quote": "Budget approval is getting harder",
          "callTitle": "Mike & Lisa | Apollo Demo",
          "callDate": "2025-01-14", 
          "excerpt": "Lisa explained that their company has tightened budget controls this quarter. She specifically mentioned 'Budget approval is getting harder since the leadership change.'",
          "callId": "12346"
        }
      ]
    }
  ]
}

REAL GONG CALL DATA:
${callData}`;
  }

  /**
   * Analyze calls for thematic pain points
   * Why this matters: Extracts recurring customer pain themes for CTA targeting.
   */
  async analyzeThemes(daysBack: number = 180, maxCalls: number = 250): Promise<VoCAnalysisResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🧠 Analyzing thematic pain points (${daysBack} days, ${maxCalls} calls)`);
      
      const callData = await this.vocExtractor.getCallDataForAnalysis(daysBack, maxCalls);
      
      if (callData.metadata.callsWithContent === 0) {
        return {
          painPoints: [],
          totalCallsAnalyzed: 0,
          analysisTimestamp: new Date().toISOString(),
          processingTimeMs: Date.now() - startTime
        };
      }

      console.log(`🤖 Processing ${callData.analysisText.length} characters with gpt-4.1-nano...`);
      
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4.1-nano-2025-04-14',
        messages: [
          {
            role: 'user',
            content: this.generateAnalysisPrompt(callData.analysisText)
          }
        ],
        temperature: 0.1,
        max_completion_tokens: 3000
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No response from analysis');
      }

      let analysisData;
      try {
        analysisData = JSON.parse(responseContent);
      } catch {
        throw new Error('Invalid JSON response');
      }

      const painPoints: VoCPainPoint[] = (analysisData.painPoints || []).map((point: any, index: number) => ({
        id: `voc_${Date.now()}_${index}`,
        theme: point.theme || `Theme ${index + 1}`,
        liquidVariable: point.liquidVariable || `theme_${index + 1}`,
        description: point.description || '',
        frequency: point.frequency || 1,
        severity: point.severity || 'medium',
        customerQuotes: Array.isArray(point.customerQuotes) ? point.customerQuotes : [],
        emotionalTriggers: Array.isArray(point.emotionalTriggers) ? point.emotionalTriggers : [],
        extractionTimestamp: analysisData.metadata?.analysisTimestamp || new Date().toISOString(),
        analysisMetadata: {
          modelUsed: analysisData.metadata?.modelUsed || 'gpt-4.1-nano-2025-04-14',
          callsAnalyzed: analysisData.metadata?.callsAnalyzed || callData.metadata.totalCalls,
          processingTime: Date.now() - startTime
        },
        sourceExcerpts: Array.isArray(point.sourceExcerpts) ? point.sourceExcerpts.map((excerpt: any) => ({
          quote: excerpt.quote || '',
          callTitle: excerpt.callTitle || 'Unknown Call',
          callDate: excerpt.callDate || '',
          excerpt: excerpt.excerpt || '',
          callId: excerpt.callId || ''
        })) : []
      }));

      const result: VoCAnalysisResult = {
        painPoints,
        totalCallsAnalyzed: callData.metadata.totalCalls,
        analysisTimestamp: new Date().toISOString(),
        processingTimeMs: Date.now() - startTime,
        validationMetadata: {
          dataSource: analysisData.metadata?.dataSource || 'Gong API - Live Customer Calls',
          modelUsed: analysisData.metadata?.modelUsed || 'gpt-4.1-nano-2025-04-14',
          validationNote: analysisData.metadata?.validationNote || 'Quotes extracted from real customer conversations'
        }
      };

      console.log(`✅ Extracted ${painPoints.length} thematic pain points`);
      return result;

    } catch (error: any) {
      console.error('❌ VoC analysis failed:', error.message);
      throw new Error(`VoC analysis failed: ${error.message}`);
    }
  }

  /**
   * Get liquid variables for VoC Kit
   * Why this matters: Formats pain points as liquid variables for the VoC Kit page.
   */
  async getLiquidVariables(daysBack: number = 180, maxCalls: number = 250): Promise<{
    variables: Record<string, string>;
    painPoints: VoCPainPoint[];
    metadata: {
      totalPainPoints: number;
      callsAnalyzed: number;
      analysisDate: string;
    };
  }> {
    try {
      const result = await this.analyzeThemes(daysBack, maxCalls);
      
      const variables: Record<string, string> = {};
      result.painPoints.forEach(point => {
        variables[point.liquidVariable] = `{{ pain_points.${point.liquidVariable} }}`;
      });

      return {
        variables,
        painPoints: result.painPoints,
        metadata: {
          totalPainPoints: result.painPoints.length,
          callsAnalyzed: result.totalCallsAnalyzed,
          analysisDate: result.analysisTimestamp
        }
      };
    } catch (error: any) {
      console.error('❌ Failed to generate VoC liquid variables:', error.message);
      throw error;
    }
  }

  /**
   * Quick test analysis
   * Why this matters: Fast testing with minimal data.
   */
  async quickTest(): Promise<{
    success: boolean;
    painPointCount: number;
    sampleThemes: string[];
    processingTime: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      const result = await this.analyzeThemes(7, 3);
      const sampleThemes = result.painPoints.slice(0, 3).map(p => p.theme);
      
      return {
        success: true,
        painPointCount: result.painPoints.length,
        sampleThemes,
        processingTime: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        success: false,
        painPointCount: 0,
        sampleThemes: [],
        processingTime: Date.now() - startTime,
        error: error.message
      };
    }
  }
}

export default VoCThematicAnalyzer;