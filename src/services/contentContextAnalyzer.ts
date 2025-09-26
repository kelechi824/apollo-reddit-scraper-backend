import MCPService, { MCPTool, ToolCapability, ToolSelection } from './mcpService';

// Content analysis interfaces
interface ContentContext {
  keyword: string;
  title?: string;
  description?: string;
  existingContent?: string;
  contentType: 'blog' | 'competitor_conquesting' | 'general';
  targetAudience?: string;
  industry?: string;
}

interface ContentAnalysisResult {
  shouldUseMCP: boolean;
  confidence: number; // 0-1 scale
  reasoning: string;
  suggestedTools: ToolSelection[];
  estimatedValue: 'high' | 'medium' | 'low';
}

interface CompanyMention {
  name: string;
  domain?: string;
  confidence: number;
}

interface MockMCPResponse {
  toolName: string;
  query: string;
  mockData: any;
  attribution: string;
}

/**
 * ContentContextAnalyzer - Intelligent MCP Tool Selection System
 * Why this matters: Prevents unnecessary MCP calls while ensuring we capture all opportunities
 * to enhance content with Apollo's proprietary data. This analyzer determines WHEN to use MCP
 * data and WHICH tools to use based on content context, keywords, and semantic analysis.
 */
class ContentContextAnalyzer {
  private mcpService: MCPService;
  private toolCapabilities: Map<string, ToolCapability> = new Map();
  
  // Content type detection patterns
  private readonly EMAIL_PATTERNS = [
    'email', 'outreach', 'cold email', 'email marketing', 'email campaign',
    'subject line', 'open rate', 'reply rate', 'email template', 'email sequence',
    'prospecting', 'sales email', 'follow up', 'email automation'
  ];
  
  private readonly SALES_PATTERNS = [
    'sales', 'prospecting', 'lead generation', 'conversion', 'pipeline',
    'sales development', 'SDR', 'BDR', 'account executive', 'sales rep',
    'quota', 'revenue', 'deal', 'opportunity', 'sales process'
  ];
  
  private readonly JOB_TITLE_PATTERNS = [
    'CEO', 'CTO', 'CMO', 'VP', 'director', 'manager', 'executive',
    'founder', 'president', 'head of', 'chief', 'senior', 'lead'
  ];
  
  private readonly COMPANY_INDICATORS = [
    'company', 'organization', 'enterprise', 'startup', 'business',
    'corporation', 'firm', 'agency', 'team', 'department'
  ];

  constructor(mcpService: MCPService) {
    this.mcpService = mcpService;
    console.log('🧠 ContentContextAnalyzer initialized');
  }

  /**
   * Initialize analyzer by discovering and caching MCP tool capabilities
   * Why this matters: We need to understand what tools are available before we can
   * intelligently select them for content enhancement.
   */
  async initialize(): Promise<void> {
    try {
      console.log('🔍 Initializing ContentContextAnalyzer with MCP capabilities...');
      
      // Get current MCP connection state and available tools
      const connectionState = this.mcpService.getConnectionState();
      
      if (connectionState.status !== 'ready') {
        console.warn('⚠️ MCP service not ready, using mock tool capabilities');
        this.createMockToolCapabilities();
        return;
      }
      
      // Cache tool capabilities from MCP service
      connectionState.toolCapabilities.forEach(cap => {
        this.toolCapabilities.set(cap.name, {
          name: cap.name,
          type: cap.type as any,
          description: `Tool for ${cap.type} analysis`,
          parameters: ['query'],
          examples: [],
          priority: cap.priority as any
        });
      });
      
      console.log(`✅ ContentContextAnalyzer initialized with ${this.toolCapabilities.size} tool capabilities`);
      
    } catch (error) {
      console.error('❌ Failed to initialize ContentContextAnalyzer:', error);
      // Fallback to mock capabilities
      this.createMockToolCapabilities();
    }
  }

  /**
   * Create mock tool capabilities for testing when MCP service is unavailable
   * Why this matters: Ensures the analyzer can function even when MCP server is down,
   * allowing development and testing to continue with realistic mock data.
   */
  private createMockToolCapabilities(): void {
    console.log('🎭 Creating mock MCP tool capabilities for testing...');
    
    const mockCapabilities: ToolCapability[] = [
      {
        name: 'pythia_emails_query',
        type: 'email_analysis',
        description: 'Query Apollo email performance data by job titles, roles, and demographics',
        parameters: ['query'],
        examples: ['CEO email performance', 'job title analysis', 'email open rates by role'],
        priority: 'high'
      },
      {
        name: 'pythia_people_organizations_query',
        type: 'organization_analysis', 
        description: 'Query Apollo people and organizations data for company-specific insights',
        parameters: ['query'],
        examples: ['company email performance', 'domain-based analysis', 'organization metrics'],
        priority: 'medium'
      },
      {
        name: 'pythia_email_templates_query',
        type: 'email_template_analysis',
        description: 'Query Apollo email template effectiveness and optimization data',
        parameters: ['query'],
        examples: ['template effectiveness', 'highest performing templates', 'template optimization'],
        priority: 'medium'
      }
    ];
    
    mockCapabilities.forEach(cap => {
      this.toolCapabilities.set(cap.name, cap);
    });
    
    console.log(`🎭 Created ${mockCapabilities.length} mock tool capabilities`);
  }

  /**
   * Main analysis method - determines if MCP data would enhance content
   * Why this matters: This is the core intelligence that prevents unnecessary API calls
   * while ensuring we capture all opportunities to add Apollo's proprietary insights.
   */
  async analyzeContent(context: ContentContext): Promise<ContentAnalysisResult> {
    console.log(`🔍 [MCP-INTEGRATION-TEST] Analyzing content context for: "${context.keyword || 'undefined'}"`);
    
    try {
      // Validate context
      if (!context || !context.keyword) {
        return {
          shouldUseMCP: false,
          confidence: 0,
          reasoning: 'Invalid or missing content context',
          suggestedTools: [],
          estimatedValue: 'low'
        };
      }
      
      // Step 1: Detect content relevance to Apollo's data domains
      const relevanceScore = this.calculateRelevanceScore(context);
      
      // Step 2: Extract entities (companies, job titles, etc.)
      const entities = this.extractEntities(context);
      
      // Step 3: Determine if MCP data would add value
      const shouldUseMCP = relevanceScore >= 0.3; // 30% relevance threshold
      
      if (!shouldUseMCP) {
        return {
          shouldUseMCP: false,
          confidence: relevanceScore, // Use relevance score as confidence (0 for irrelevant content)
          reasoning: `Content relevance score (${(relevanceScore * 100).toFixed(1)}%) below threshold. No Apollo data enhancement needed.`,
          suggestedTools: [],
          estimatedValue: 'low'
        };
      }
      
      // Step 4: Select appropriate tools using analysis-suggestions prompt
      console.log(`🧠 [MCP-INTEGRATION-TEST] About to call selectBestTools with analysis-suggestions prompt for "${context.keyword}"`);
      const suggestedTools = await this.selectBestTools(context, entities, relevanceScore);
      console.log(`✅ [MCP-INTEGRATION-TEST] selectBestTools returned ${suggestedTools.length} tool selections`);
      
      // Step 5: Estimate the value of MCP data for this content
      const estimatedValue = this.estimateContentValue(relevanceScore, suggestedTools.length, entities);
      
      const result: ContentAnalysisResult = {
        shouldUseMCP: true,
        confidence: relevanceScore,
        reasoning: this.generateReasoning(context, entities, suggestedTools),
        suggestedTools,
        estimatedValue
      };
      
      console.log(`✅ Content analysis complete: ${suggestedTools.length} tools suggested (${estimatedValue} value)`);
      return result;
      
    } catch (error) {
      console.error('❌ Content analysis failed:', error);
      
      // Return safe fallback
      return {
        shouldUseMCP: false,
        confidence: 0,
        reasoning: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        suggestedTools: [],
        estimatedValue: 'low'
      };
    }
  }

  /**
   * Calculate how relevant the content is to Apollo's data domains
   * Why this matters: Prevents calling MCP for content that wouldn't benefit from
   * Apollo's email/sales data (e.g., content about cooking or sports).
   */
  private calculateRelevanceScore(context: ContentContext): number {
    const text = `${context.keyword} ${context.title || ''} ${context.description || ''}`.toLowerCase();
    let score = 0;
    
    // Email relevance (highest weight - this is Apollo's core strength)
    const emailMatches = this.EMAIL_PATTERNS.filter(pattern => text.includes(pattern)).length;
    if (emailMatches > 0) {
      score += Math.min(emailMatches * 0.25, 0.6); // Up to 60% for email content
    }
    
    // Sales relevance (high weight)
    const salesMatches = this.SALES_PATTERNS.filter(pattern => text.includes(pattern)).length;
    if (salesMatches > 0) {
      score += Math.min(salesMatches * 0.2, 0.5); // Up to 50% for sales content
    }
    
    // Job title relevance (medium weight)
    const jobTitleMatches = this.JOB_TITLE_PATTERNS.filter(pattern => text.includes(pattern)).length;
    if (jobTitleMatches > 0) {
      score += Math.min(jobTitleMatches * 0.15, 0.4); // Up to 40% for job title content
    }
    
    // Company/organization relevance (lower weight)
    const companyMatches = this.COMPANY_INDICATORS.filter(pattern => text.includes(pattern)).length;
    if (companyMatches > 0) {
      score += Math.min(companyMatches * 0.1, 0.3); // Up to 30% for company content
    }
    
    // Cap the total score at 1.0
    const finalScore = Math.min(score, 1.0);
    
    console.log(`📊 Relevance analysis: ${(finalScore * 100).toFixed(1)}% (email: ${emailMatches}, sales: ${salesMatches}, titles: ${jobTitleMatches}, companies: ${companyMatches})`);
    
    return finalScore;
  }

  /**
   * Extract entities (companies, job titles) from content context
   * Why this matters: Entities help us generate specific, targeted MCP queries
   * rather than generic ones, leading to more relevant and valuable data.
   */
  private extractEntities(context: ContentContext): {
    companies: CompanyMention[];
    jobTitles: string[];
    emailTerms: string[];
  } {
    const text = `${context.keyword} ${context.title || ''} ${context.description || ''}`.toLowerCase();
    
    // Extract company mentions (look for well-known company names)
    const companies = this.extractCompanyMentions(text);
    
    // Extract job titles
    const jobTitles = this.JOB_TITLE_PATTERNS.filter(title => 
      text.includes(title.toLowerCase())
    );
    
    // Extract email-related terms for query specificity
    const emailTerms = this.EMAIL_PATTERNS.filter(term => 
      text.includes(term.toLowerCase())
    );
    
    console.log(`🏷️ Extracted entities: ${companies.length} companies, ${jobTitles.length} job titles, ${emailTerms.length} email terms`);
    
    return { companies, jobTitles, emailTerms };
  }

  /**
   * Extract company mentions from text using pattern matching
   * Why this matters: Company-specific data from Apollo is extremely valuable
   * for creating targeted, relevant content with specific performance metrics.
   */
  private extractCompanyMentions(text: string): CompanyMention[] {
    const companies: CompanyMention[] = [];
    
    // Common company patterns and their domains
    const companyPatterns = [
      { names: ['amazon', 'amazon.com'], domain: 'amazon.com', confidence: 0.9 },
      { names: ['google', 'alphabet'], domain: 'google.com', confidence: 0.9 },
      { names: ['microsoft', 'msft'], domain: 'microsoft.com', confidence: 0.9 },
      { names: ['apple'], domain: 'apple.com', confidence: 0.9 },
      { names: ['meta', 'facebook'], domain: 'meta.com', confidence: 0.9 },
      { names: ['salesforce'], domain: 'salesforce.com', confidence: 0.9 },
      { names: ['hubspot'], domain: 'hubspot.com', confidence: 0.9 },
      { names: ['linkedin'], domain: 'linkedin.com', confidence: 0.9 },
      { names: ['slack'], domain: 'slack.com', confidence: 0.8 },
      { names: ['zoom'], domain: 'zoom.us', confidence: 0.8 },
      { names: ['shopify'], domain: 'shopify.com', confidence: 0.8 },
      { names: ['stripe'], domain: 'stripe.com', confidence: 0.8 }
    ];
    
    for (const pattern of companyPatterns) {
      for (const name of pattern.names) {
        if (text.includes(name.toLowerCase())) {
          companies.push({
            name: pattern.names[0], // Use primary name
            domain: pattern.domain,
            confidence: pattern.confidence
          });
          break; // Only add once per company
        }
      }
    }
    
    return companies;
  }

  /**
   * Select the best MCP tools using the analysis-suggestions prompt
   * Why this matters: Uses Apollo's intelligent analysis-suggestions prompt to determine
   * the best queries and tools rather than hardcoded patterns, enabling more sophisticated
   * and contextual data retrieval.
   */
  private async selectBestTools(context: ContentContext, entities: any, relevanceScore: number): Promise<ToolSelection[]> {
    console.log('🔍 [MCP-INTEGRATION-TEST] Using analysis-suggestions prompt for intelligent tool selection...');
    
    try {
      // Get intelligent suggestions from the MCP analysis-suggestions prompt
      console.log('📞 [MCP-INTEGRATION-TEST] Calling mcpService.getPrompt with analysis-suggestions...');
      const suggestions = await this.mcpService.getPrompt('analysis-suggestions', {
        keyword: context.keyword,
        content_type: context.contentType,
        target_audience: context.targetAudience || 'sales professionals',
        entities: JSON.stringify({
          companies: entities.companies.map((c: any) => c.name),
          jobTitles: entities.jobTitles,
          emailTerms: entities.emailTerms
        })
      });
      
      // Parse the suggestions to extract recommended queries and tools
      const toolSelections = await this.parseAnalysisSuggestions(suggestions, context, entities);
      
      console.log(`✅ Analysis-suggestions prompt returned ${toolSelections.length} intelligent tool selections`);
      return toolSelections;
      
    } catch (error) {
      console.warn('⚠️ Analysis-suggestions prompt failed, falling back to hardcoded selection:', error);
      
      // Fallback to the original hardcoded logic
      return this.selectBestToolsHardcoded(context, entities, relevanceScore);
    }
  }
  
  /**
   * Parse analysis suggestions from the MCP prompt response
   * Why this matters: Converts the natural language suggestions from the prompt
   * into structured tool selections with specific queries.
   */
  private async parseAnalysisSuggestions(suggestions: any, context: ContentContext, entities: any): Promise<ToolSelection[]> {
    const selections: ToolSelection[] = [];
    
    // Extract the suggestions content from the MCP prompt response
    const suggestionsText = suggestions?.messages?.[0]?.content?.text || '';
    
    // Parse the suggestions to identify recommended tools and queries
    const toolRecommendations = this.extractToolRecommendations(suggestionsText, context, entities);
    
    for (const recommendation of toolRecommendations) {
      const tool = this.findToolByName(recommendation.toolName);
      if (tool && recommendation.query) {
        selections.push({
          tool,
          query: recommendation.query,
          priority: recommendation.priority,
          reasoning: recommendation.reasoning
        });
      }
    }
    
    return selections;
  }
  
  /**
   * Extract tool recommendations from the analysis-suggestions prompt text
   * Why this matters: Parses the intelligent suggestions to identify which specific
   * Apollo tools to use and what queries to run.
   */
  private extractToolRecommendations(suggestionsText: string, context: ContentContext, entities: any): Array<{
    toolName: string;
    query: string;
    priority: 'high' | 'medium' | 'low';
    reasoning: string;
  }> {
    const recommendations = [];
    
    // Check for email analysis recommendations
    if (suggestionsText.includes('analyze_emails') || this.isEmailContent(context, entities)) {
      recommendations.push({
        toolName: 'pythia_emails_query',
        query: this.generateIntelligentEmailQuery(context, entities, suggestionsText),
        priority: 'high' as const,
        reasoning: 'Email analysis recommended by Apollo\'s analysis-suggestions prompt'
      });
    }
    
    // Check for organization analysis recommendations
    if ((suggestionsText.includes('analyze_people_and_organizations') || entities.companies.length > 0)) {
      const company = entities.companies[0];
      if (company) {
        recommendations.push({
          toolName: 'pythia_people_organizations_query',
          query: this.generateIntelligentCompanyQuery(context, company, suggestionsText),
          priority: 'medium' as const,
          reasoning: `Organization analysis recommended for ${company.name} by analysis-suggestions prompt`
        });
      }
    }
    
    // Check for email template analysis recommendations
    if (suggestionsText.includes('analyze_email_templates') || this.isTemplateContent(context, entities)) {
      recommendations.push({
        toolName: 'pythia_email_templates_query',
        query: this.generateIntelligentTemplateQuery(context, entities, suggestionsText),
        priority: 'medium' as const,
        reasoning: 'Email template analysis recommended by analysis-suggestions prompt'
      });
    }
    
    // Check for complex orchestration recommendations
    if (suggestionsText.includes('execute_agent_orchestration')) {
      // For complex analysis that spans multiple data sources
      const complexQuery = this.generateComplexOrchestrationQuery(context, entities, suggestionsText);
      if (complexQuery) {
        recommendations.push({
          toolName: 'pythia_emails_query', // Use primary tool for orchestration
          query: complexQuery,
          priority: 'high' as const,
          reasoning: 'Complex multi-source analysis recommended by analysis-suggestions prompt'
        });
      }
    }
    
    return recommendations;
  }
  
  /**
   * Generate intelligent email query based on analysis suggestions
   * Why this matters: Creates more sophisticated queries that follow the patterns
   * suggested by the analysis-suggestions prompt.
   */
  private generateIntelligentEmailQuery(context: ContentContext, entities: any, suggestionsText: string): string {
    const { jobTitles, emailTerms } = entities;
    
    // Look for specific analysis patterns mentioned in the suggestions
    if (suggestionsText.includes('time of day')) {
      if (jobTitles.length > 0) {
        return `Show me the best times of day for email outreach to ${jobTitles[0]}s, including open rates and reply rates by hour of day`;
      }
      return 'Analyze email engagement patterns by time of day across different job titles';
    }
    
    if (suggestionsText.includes('subject lines')) {
      return 'Find the most effective email subject lines with their open rates and reply rates';
    }
    
    // Default to job title analysis if available
    if (jobTitles.length > 0) {
      const primaryTitle = jobTitles[0];
      return `Provide comprehensive email performance analysis for outreach to ${primaryTitle}s, including open rates, reply rates, best practices, and optimization insights`;
    }
    
    // Fallback for general email analysis
    return 'Analyze email performance patterns including open rates, reply rates, and engagement metrics across different segments';
  }
  
  /**
   * Generate intelligent company query based on analysis suggestions
   * Why this matters: Creates targeted company analysis queries following prompt guidance.
   */
  private generateIntelligentCompanyQuery(context: ContentContext, company: CompanyMention, suggestionsText: string): string {
    if (!company.domain) {
      return `Analyze engagement patterns and performance metrics for outreach to ${company.name} employees`;
    }
    
    // Check for specific analysis patterns
    if (suggestionsText.includes('engagement patterns')) {
      return `Analyze people engagement patterns by industry for ${company.name} (domain: ${company.domain}), including response rates and best outreach strategies`;
    }
    
    if (suggestionsText.includes('decision makers')) {
      return `Identify key decision makers and their engagement patterns at ${company.name} (${company.domain}), including email performance metrics`;
    }
    
    // Default comprehensive company analysis
    return `Provide comprehensive analysis of email performance for outreach to ${company.name} employees (${company.domain}), including open rates, reply rates, and engagement insights`;
  }
  
  /**
   * Generate intelligent template query based on analysis suggestions
   * Why this matters: Creates template analysis queries aligned with prompt recommendations.
   */
  private generateIntelligentTemplateQuery(context: ContentContext, entities: any, suggestionsText: string): string {
    const { emailTerms } = entities;
    
    // Look for specific template analysis patterns
    if (suggestionsText.includes('highest open rates')) {
      return 'Which email templates have the highest open rates? Show specific examples with performance metrics and success factors';
    }
    
    if (suggestionsText.includes('customer segment')) {
      return 'Analyze email template performance by customer segment, showing which templates work best for different audiences';
    }
    
    if (suggestionsText.includes('optimization')) {
      return 'Find opportunities to optimize email template content, including subject line improvements and body text optimization';
    }
    
    // Default template analysis
    return 'Analyze email template effectiveness showing top-performing templates with open rates, reply rates, and optimization recommendations';
  }
  
  /**
   * Generate complex orchestration query for multi-step analysis
   * Why this matters: Creates sophisticated queries that span multiple data sources
   * as recommended by the analysis-suggestions prompt.
   */
  private generateComplexOrchestrationQuery(context: ContentContext, entities: any, suggestionsText: string): string | null {
    const { jobTitles, companies, emailTerms } = entities;
    
    // Complex queries that require orchestration across multiple models
    if (jobTitles.length > 0 && companies.length > 0) {
      return `Show me the best time to write email to ${jobTitles[0]}s at ${companies[0].name} and identify the best performing email campaigns based on reply rates, then find email templates that are related to those successful campaigns`;
    }
    
    if (emailTerms.includes('template') && jobTitles.length > 0) {
      return `Analyze the most effective email templates for ${jobTitles[0]}s, then identify the best times and strategies for outreach to this audience`;
    }
    
    return null;
  }
  
  /**
   * Find MCP tool by exact name
   * Why this matters: Enables precise tool selection based on prompt recommendations.
   */
  private findToolByName(toolName: string): MCPTool | null {
    const capability = this.toolCapabilities.get(toolName);
    if (capability) {
      return {
        name: toolName,
        description: capability.description,
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Natural language query' }
          },
          required: ['query']
        }
      };
    }
    return null;
  }
  
  /**
   * Fallback hardcoded tool selection (original logic)
   * Why this matters: Provides fallback when analysis-suggestions prompt is unavailable.
   */
  private selectBestToolsHardcoded(context: ContentContext, entities: any, relevanceScore: number): ToolSelection[] {
    const selections: ToolSelection[] = [];
    
    // 1. Email Analysis Tool Selection
    if (this.isEmailContent(context, entities)) {
      const emailTool = this.findToolByType('email_analysis');
      if (emailTool) {
        const query = this.generateEmailQuery(context, entities);
        if (query) {
          selections.push({
            tool: emailTool,
            query,
            priority: 'high',
            reasoning: 'Email content detected - Apollo email performance data will provide specific open/reply rates'
          });
        }
      }
    }
    
    // 2. Organization Analysis Tool Selection
    if (entities.companies.length > 0) {
      const orgTool = this.findToolByType('organization_analysis');
      if (orgTool) {
        const query = this.generateCompanyQuery(context, entities.companies[0]);
        if (query) {
          selections.push({
            tool: orgTool,
            query,
            priority: 'medium',
            reasoning: `Company "${entities.companies[0].name}" mentioned - Apollo org data will provide company-specific performance metrics`
          });
        }
      }
    }
    
    // 3. Email Template Analysis Tool Selection
    if (this.isTemplateContent(context, entities)) {
      const templateTool = this.findToolByType('email_template_analysis');
      if (templateTool) {
        const query = this.generateTemplateQuery(context, entities);
        if (query) {
          selections.push({
            tool: templateTool,
            query,
            priority: 'medium',
            reasoning: 'Email template content detected - Apollo template data will provide optimization insights'
          });
        }
      }
    }
    
    console.log(`🎯 Selected ${selections.length} MCP tools for content enhancement (hardcoded fallback)`);
    return selections;
  }

  /**
   * Determine if content is email-related
   * Why this matters: Email content benefits most from Apollo's email performance data
   */
  private isEmailContent(context: ContentContext, entities: any): boolean {
    const text = `${context.keyword} ${context.title || ''}`.toLowerCase();
    return entities.emailTerms.length > 0 || 
           this.EMAIL_PATTERNS.some(pattern => text.includes(pattern));
  }

  /**
   * Determine if content is template-related
   * Why this matters: Template content should get Apollo's template effectiveness data
   */
  private isTemplateContent(context: ContentContext, entities: any): boolean {
    const text = `${context.keyword} ${context.title || ''}`.toLowerCase();
    return text.includes('template') || text.includes('email template') || 
           text.includes('subject line') || text.includes('email copy');
  }

  /**
   * Find MCP tool by capability type
   * Why this matters: Enables dynamic tool selection based on discovered capabilities
   */
  private findToolByType(type: string): MCPTool | null {
    for (const [toolName, capability] of this.toolCapabilities) {
      if (capability.type === type) {
        return {
          name: toolName,
          description: capability.description,
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Natural language query' }
            },
            required: ['query']
          }
        };
      }
    }
    return null;
  }

  /**
   * Generate email performance query for Apollo data
   * Why this matters: Creates specific, targeted queries that will return relevant
   * email performance data rather than generic responses.
   */
  private generateEmailQuery(context: ContentContext, entities: any): string | null {
    const { jobTitles, emailTerms } = entities;
    
    // Prioritize job title queries (most valuable for email performance)
    if (jobTitles.length > 0) {
      const primaryTitle = jobTitles[0];
      return `Please provide opening and reply rates for emails sent to those contacts whose primary_title contains ${primaryTitle} or similar executive roles. Include average open rates and reply rates with sample sizes.`;
    }
    
    // Fallback to general email performance query
    if (emailTerms.length > 0) {
      return `Please provide general email performance metrics including average open rates and reply rates across different job titles and industries. Focus on ${emailTerms[0]} related campaigns.`;
    }
    
    return null;
  }

  /**
   * Generate company-specific query for Apollo org data
   * Why this matters: Company-specific data is extremely valuable for targeted content
   */
  private generateCompanyQuery(context: ContentContext, company: CompanyMention): string | null {
    if (!company.domain) return null;
    
    return `Give me the open rate and reply rate percentages for email campaigns sent to people working at ${company.name} (filtering by web_domain = '${company.domain}'), excluding records where emailer_campaign_id is null. Open rate = opened_emails / delivered_emails, Reply rate = replied_emails / delivered_emails.`;
  }

  /**
   * Generate email template effectiveness query
   * Why this matters: Template data helps create actionable optimization insights
   */
  private generateTemplateQuery(context: ContentContext, entities: any): string | null {
    const { emailTerms } = entities;
    
    if (emailTerms.includes('subject line')) {
      return `Which email subject line templates have the highest open rates? Provide specific examples with performance metrics.`;
    }
    
    return `Which email templates have the highest open rates and reply rates? Include specific template examples and their performance metrics.`;
  }

  /**
   * Estimate the potential value of MCP data for this content
   * Why this matters: Helps prioritize which content gets MCP enhancement when resources are limited
   */
  private estimateContentValue(relevanceScore: number, toolCount: number, entities: any): 'high' | 'medium' | 'low' {
    // High value: Strong relevance + multiple tools OR strong relevance + specific entities
    if ((relevanceScore >= 0.6 && toolCount >= 2) || 
        (relevanceScore >= 0.7 && entities.companies.length > 0) ||
        (relevanceScore >= 0.8 && toolCount >= 1)) {
      return 'high';
    }
    
    // Medium value: Good relevance + some tools
    if (relevanceScore >= 0.3 && toolCount >= 1) {
      return 'medium';
    }
    
    // Low value: Everything else
    return 'low';
  }

  /**
   * Generate human-readable reasoning for MCP tool selection
   * Why this matters: Provides transparency and debugging information for tool selection decisions
   */
  private generateReasoning(context: ContentContext, entities: any, tools: ToolSelection[]): string {
    const reasons = [];
    
    if (entities.companies.length > 0) {
      reasons.push(`Company "${entities.companies[0].name}" mentioned - company-specific Apollo data available`);
    }
    
    if (entities.jobTitles.length > 0) {
      reasons.push(`Job titles detected (${entities.jobTitles.join(', ')}) - Apollo email performance data by role available`);
    }
    
    if (entities.emailTerms.length > 0) {
      reasons.push(`Email content detected (${entities.emailTerms.join(', ')}) - Apollo email metrics available`);
    }
    
    if (tools.length > 0) {
      reasons.push(`${tools.length} relevant Apollo tools selected: ${tools.map(t => t.tool.name).join(', ')}`);
    }
    
    return reasons.join('. ') || 'General sales/marketing content - Apollo data may provide relevant insights';
  }

  /**
   * Execute MCP queries with proper error handling and graceful degradation
   * Why this matters: Ensures content generation continues even when MCP server is unavailable,
   * while still attempting to enhance content with Apollo's proprietary data when possible.
   */
  async executeMCPQueries(toolSelections: ToolSelection[]): Promise<MockMCPResponse[]> {
    console.log(`🔧 Executing ${toolSelections.length} MCP queries...`);
    
    const responses: MockMCPResponse[] = [];
    const mcpServiceReady = this.getAnalyzerStats().mcpServiceReady;
    
    // If MCP service is not ready, use mock responses for development
    if (!mcpServiceReady) {
      console.warn('⚠️ MCP service not ready, using mock responses for development');
      return this.executeMockQueries(toolSelections);
    }
    
    for (const selection of toolSelections) {
      try {
        // Attempt real MCP query
        const mcpResult = await this.mcpService.callTool(selection.tool.name, {
          query: selection.query
        });
        
        // Convert MCP result to our response format
        const response: MockMCPResponse = {
          toolName: selection.tool.name,
          query: selection.query,
          mockData: JSON.parse(mcpResult.content[0].text || '{}'),
          attribution: this.getAttributionForTool(selection.tool.name)
        };
        
        responses.push(response);
        console.log(`✅ Real MCP query executed: ${selection.tool.name}`);
        
      } catch (error) {
        console.error(`❌ MCP query failed for ${selection.tool.name}:`, error);
        
        // Graceful degradation: Use mock response as fallback
        console.log(`🔄 Falling back to mock response for ${selection.tool.name}`);
        const mockResponse = this.generateMockResponse(selection);
        responses.push(mockResponse);
      }
    }
    
    return responses;
  }

  /**
   * Execute mock MCP queries for development and testing
   * Why this matters: Provides consistent development experience when MCP server is unavailable
   */
  private async executeMockQueries(toolSelections: ToolSelection[]): Promise<MockMCPResponse[]> {
    console.log(`🎭 Executing ${toolSelections.length} mock MCP queries...`);
    
    const responses: MockMCPResponse[] = [];
    
    for (const selection of toolSelections) {
      try {
        const mockResponse = this.generateMockResponse(selection);
        responses.push(mockResponse);
        
        console.log(`✅ Mock MCP query executed: ${selection.tool.name}`);
      } catch (error) {
        console.error(`❌ Mock MCP query failed: ${selection.tool.name}`, error);
        // Continue with other queries even if one fails
      }
    }
    
    return responses;
  }

  /**
   * Get appropriate attribution phrase for each tool type
   * Why this matters: Ensures proper attribution of Apollo's proprietary data
   */
  private getAttributionForTool(toolName: string): string {
    const toolType = this.toolCapabilities.get(toolName)?.type;
    
    switch (toolType) {
      case 'email_analysis':
        return "According to Apollo's email performance data";
      case 'organization_analysis':
        return "According to Apollo's People & Organizations data";
      case 'email_template_analysis':
        return "According to Apollo's email template analysis";
      default:
        return "According to Apollo's proprietary data";
    }
  }

  /**
   * Generate realistic mock responses for testing
   * Why this matters: Provides realistic test data that matches the structure and content
   * we expect from the real MCP server, enabling proper testing of the integration.
   */
  private generateMockResponse(selection: ToolSelection): MockMCPResponse {
    const toolType = this.toolCapabilities.get(selection.tool.name)?.type;
    
    switch (toolType) {
      case 'email_analysis':
        return {
          toolName: selection.tool.name,
          query: selection.query,
          mockData: {
            openRate: 0.234, // 23.4%
            replyRate: 0.087, // 8.7%
            sampleSize: 15420,
            jobTitle: 'CEO',
            insights: [
              'CEO emails perform 34% better than average',
              'Best performing time: Tuesday 10-11 AM',
              'Personalized subject lines increase open rates by 23%'
            ]
          },
          attribution: "According to Apollo's email performance data"
        };
        
      case 'organization_analysis':
        return {
          toolName: selection.tool.name,
          query: selection.query,
          mockData: {
            companyName: 'Amazon',
            domain: 'amazon.com',
            openRate: 0.189, // 18.9%
            replyRate: 0.056, // 5.6%
            sampleSize: 8934,
            insights: [
              'Amazon employees respond 15% better to technical content',
              'Engineering roles have 28% higher engagement',
              'Best outreach time: Wednesday 2-4 PM PST'
            ]
          },
          attribution: "According to Apollo's People & Organizations data"
        };
        
      case 'email_template_analysis':
        return {
          toolName: selection.tool.name,
          query: selection.query,
          mockData: {
            topTemplates: [
              {
                template: 'Quick question about {{company}} growth',
                openRate: 0.312,
                replyRate: 0.145,
                category: 'Question-based'
              },
              {
                template: 'Noticed {{company}} is hiring - congrats!',
                openRate: 0.287,
                replyRate: 0.134,
                category: 'Congratulatory'
              }
            ],
            insights: [
              'Question-based subject lines perform 45% better',
              'Company personalization increases replies by 67%',
              'Templates under 50 characters get 23% more opens'
            ]
          },
          attribution: "According to Apollo's email template analysis"
        };
        
      default:
        return {
          toolName: selection.tool.name,
          query: selection.query,
          mockData: {
            message: 'Mock data for unknown tool type',
            toolType: toolType
          },
          attribution: "According to Apollo's proprietary data"
        };
    }
  }

  /**
   * Get analyzer health and statistics
   * Why this matters: Provides monitoring information for the content analysis system
   */
  getAnalyzerStats(): {
    toolCapabilities: number;
    initialized: boolean;
    mcpServiceReady: boolean;
  } {
    let mcpServiceReady = false;
    
    try {
      const mcpState = this.mcpService.getConnectionState();
      mcpServiceReady = mcpState.status === 'ready';
    } catch (error) {
      // MCP service may not be available - that's okay for stats
      mcpServiceReady = false;
    }
    
    return {
      toolCapabilities: this.toolCapabilities.size,
      initialized: this.toolCapabilities.size > 0,
      mcpServiceReady
    };
  }
}

export default ContentContextAnalyzer;
export type { ContentContext, ContentAnalysisResult, CompanyMention, MockMCPResponse };
