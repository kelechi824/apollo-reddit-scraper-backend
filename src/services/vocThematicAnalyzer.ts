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

EXTRACT 8-12 THEMES focusing on:
- Budget/ROI concerns and financial justification
- Pipeline visibility issues and sales transparency
- Lead quality problems and data accuracy
- Integration challenges with existing systems
- Manual inefficiencies and time waste
- Compliance concerns and security requirements
- Team adoption issues and change resistance
- Competitive pressure and market positioning
- Time constraints and resource limitations
- Scale limitations and growth bottlenecks
- Quota attainment and performance pressure
- Revenue uncertainty and forecasting challenges

⚠️ CRITICAL: Only use DIRECT quotes from the actual call data provided below.
📍 SOURCE MAPPING: For each quote, identify the exact call summary it came from and provide surrounding context.

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
  async analyzeThemes(daysBack: number = 30, maxCalls: number = 25): Promise<VoCAnalysisResult> {
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
        max_tokens: 3000
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
  async getLiquidVariables(daysBack: number = 30, maxCalls: number = 25): Promise<{
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