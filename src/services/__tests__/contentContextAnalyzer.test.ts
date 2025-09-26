import ContentContextAnalyzer, { ContentContext, ContentAnalysisResult } from '../contentContextAnalyzer';
import MCPService from '../mcpService';

// Mock MCPService for testing
jest.mock('../mcpService');
const MockedMCPService = MCPService as jest.MockedClass<typeof MCPService>;

describe('ContentContextAnalyzer', () => {
  let analyzer: ContentContextAnalyzer;
  let mockMCPService: jest.Mocked<MCPService>;

  beforeEach(() => {
    // Create mock MCP service
    mockMCPService = new MockedMCPService() as jest.Mocked<MCPService>;
    
    // Mock the getConnectionState method to return ready state
    mockMCPService.getConnectionState.mockReturnValue({
      status: 'ready',
      toolsDiscovered: 3,
      resourcesDiscovered: 0,
      availableTools: ['pythia_emails_query', 'pythia_people_organizations_query', 'pythia_email_templates_query'],
      availableResources: [],
      availablePrompts: [],
      toolCapabilities: [
        { name: 'pythia_emails_query', type: 'email_analysis', priority: 'high' },
        { name: 'pythia_people_organizations_query', type: 'organization_analysis', priority: 'medium' },
        { name: 'pythia_email_templates_query', type: 'email_template_analysis', priority: 'medium' }
      ],
      circuitBreakerState: { state: 'closed' }
    });
    
    analyzer = new ContentContextAnalyzer(mockMCPService);
  });

  describe('initialization', () => {
    it('should initialize with MCP service capabilities', async () => {
      await analyzer.initialize();
      
      const stats = analyzer.getAnalyzerStats();
      expect(stats.initialized).toBe(true);
      expect(stats.toolCapabilities).toBe(3);
      expect(stats.mcpServiceReady).toBe(true);
    });

    it('should fallback to mock capabilities when MCP service not ready', async () => {
      // Mock MCP service as not ready
      mockMCPService.getConnectionState.mockReturnValue({
        status: 'failed',
        toolsDiscovered: 0,
        resourcesDiscovered: 0,
        availableTools: [],
        availableResources: [],
        availablePrompts: [],
        toolCapabilities: [],
        circuitBreakerState: { state: 'open' }
      });
      
      await analyzer.initialize();
      
      const stats = analyzer.getAnalyzerStats();
      expect(stats.initialized).toBe(true);
      expect(stats.toolCapabilities).toBe(3); // Should have mock capabilities
      expect(stats.mcpServiceReady).toBe(false);
    });
  });

  describe('content analysis', () => {
    beforeEach(async () => {
      await analyzer.initialize();
    });

    it('should detect high-value email content with CEO mentions', async () => {
      const context: ContentContext = {
        keyword: 'CEO email outreach strategies',
        title: 'How to Write Cold Emails to CEOs That Get Replies',
        contentType: 'blog',
        targetAudience: 'sales professionals'
      };

      const result = await analyzer.analyzeContent(context);

      expect(result.shouldUseMCP).toBe(true);
      expect(result.estimatedValue).toBe('medium'); // 60% relevance + 1 tool = medium value
      expect(result.suggestedTools.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0.5);
      
      // Should suggest email analysis tool for CEO content
      const emailTool = result.suggestedTools.find(t => t.tool.name === 'pythia_emails_query');
      expect(emailTool).toBeDefined();
      expect(emailTool?.query).toContain('CEO');
    });

    it('should detect company-specific content and suggest organization analysis', async () => {
      const context: ContentContext = {
        keyword: 'Amazon email marketing case study',
        title: 'How to Reach Amazon Employees with Cold Email',
        contentType: 'blog'
      };

      const result = await analyzer.analyzeContent(context);

      expect(result.shouldUseMCP).toBe(true);
      expect(result.suggestedTools.length).toBeGreaterThan(0);
      
      // Should suggest organization analysis tool for Amazon
      const orgTool = result.suggestedTools.find(t => t.tool.name === 'pythia_people_organizations_query');
      expect(orgTool).toBeDefined();
      expect(orgTool?.query).toContain('amazon.com');
    });

    it('should detect email template content and suggest template analysis', async () => {
      const context: ContentContext = {
        keyword: 'best email templates for sales',
        title: 'Top 10 Email Templates That Convert',
        contentType: 'blog'
      };

      const result = await analyzer.analyzeContent(context);

      expect(result.shouldUseMCP).toBe(true);
      
      // Should suggest template analysis tool
      const templateTool = result.suggestedTools.find(t => t.tool.name === 'pythia_email_templates_query');
      expect(templateTool).toBeDefined();
      expect(templateTool?.query).toContain('template');
    });

    it('should reject irrelevant content', async () => {
      const context: ContentContext = {
        keyword: 'best pizza recipes',
        title: 'How to Make Perfect Pizza at Home',
        contentType: 'blog'
      };

      const result = await analyzer.analyzeContent(context);

      expect(result.shouldUseMCP).toBe(false);
      expect(result.estimatedValue).toBe('low');
      expect(result.suggestedTools.length).toBe(0);
      expect(result.reasoning).toContain('below threshold');
    });

    it('should handle multiple relevant patterns in single content', async () => {
      const context: ContentContext = {
        keyword: 'Google CEO email templates sales outreach',
        title: 'Email Templates for Reaching Google Executives',
        contentType: 'blog'
      };

      const result = await analyzer.analyzeContent(context);

      expect(result.shouldUseMCP).toBe(true);
      expect(result.estimatedValue).toBe('high');
      expect(result.suggestedTools.length).toBeGreaterThanOrEqual(2);
      
      // Should suggest multiple tools
      const toolNames = result.suggestedTools.map(t => t.tool.name);
      expect(toolNames).toContain('pythia_emails_query'); // CEO content
      expect(toolNames).toContain('pythia_people_organizations_query'); // Google company
    });
  });

  describe('mock MCP query execution', () => {
    beforeEach(async () => {
      await analyzer.initialize();
    });

    it('should execute mock MCP queries and return realistic responses', async () => {
      const context: ContentContext = {
        keyword: 'CEO email outreach open rates performance metrics',
        contentType: 'blog'
      };

      const analysis = await analyzer.analyzeContent(context);
      expect(analysis.shouldUseMCP).toBe(true);

      const responses = await analyzer.executeMCPQueries(analysis.suggestedTools);

      expect(responses.length).toBeGreaterThan(0);
      
      const emailResponse = responses.find(r => r.toolName === 'pythia_emails_query');
      expect(emailResponse).toBeDefined();
      expect(emailResponse?.mockData.openRate).toBeDefined();
      expect(emailResponse?.mockData.replyRate).toBeDefined();
      expect(emailResponse?.attribution).toContain('Apollo');
    });

    it('should generate company-specific mock responses', async () => {
      const context: ContentContext = {
        keyword: 'Microsoft email outreach strategies',
        contentType: 'blog'
      };

      const analysis = await analyzer.analyzeContent(context);
      const responses = await analyzer.executeMCPQueries(analysis.suggestedTools);

      const orgResponse = responses.find(r => r.toolName === 'pythia_people_organizations_query');
      expect(orgResponse).toBeDefined();
      expect(orgResponse?.mockData.domain).toBeDefined();
      expect(orgResponse?.mockData.insights).toBeDefined();
    });

    it('should generate template-specific mock responses', async () => {
      const context: ContentContext = {
        keyword: 'email subject line templates',
        contentType: 'blog'
      };

      const analysis = await analyzer.analyzeContent(context);
      const responses = await analyzer.executeMCPQueries(analysis.suggestedTools);

      const templateResponse = responses.find(r => r.toolName === 'pythia_email_templates_query');
      expect(templateResponse).toBeDefined();
      expect(templateResponse?.mockData.topTemplates).toBeDefined();
      expect(Array.isArray(templateResponse?.mockData.topTemplates)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle MCP service initialization errors gracefully', async () => {
      // Mock MCP service to throw error
      mockMCPService.getConnectionState.mockImplementation(() => {
        throw new Error('MCP connection failed');
      });

      await analyzer.initialize();
      
      // Should still initialize with mock capabilities
      const stats = analyzer.getAnalyzerStats();
      expect(stats.initialized).toBe(true);
      expect(stats.toolCapabilities).toBe(3);
    });

    it('should handle content analysis errors gracefully', async () => {
      await analyzer.initialize();
      
      // Test with malformed context
      const context = {} as ContentContext;
      
      const result = await analyzer.analyzeContent(context);
      
      expect(result.shouldUseMCP).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.suggestedTools.length).toBe(0);
    });
  });

  describe('relevance scoring', () => {
    beforeEach(async () => {
      await analyzer.initialize();
    });

    it('should give high scores to email-heavy content', async () => {
      const context: ContentContext = {
        keyword: 'cold email outreach open rates reply rates email marketing',
        contentType: 'blog'
      };

      const result = await analyzer.analyzeContent(context);
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('should give medium scores to sales-related content', async () => {
      const context: ContentContext = {
        keyword: 'sales prospecting lead generation conversion',
        contentType: 'blog'
      };

      const result = await analyzer.analyzeContent(context);
      expect(result.confidence).toBeGreaterThan(0.3);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });

    it('should give low scores to unrelated content', async () => {
      const context: ContentContext = {
        keyword: 'cooking recipes food preparation',
        contentType: 'blog'
      };

      const result = await analyzer.analyzeContent(context);
      expect(result.confidence).toBe(0);
    });
  });
});
