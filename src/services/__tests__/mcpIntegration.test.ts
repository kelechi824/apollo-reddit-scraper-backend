import MCPService from '../mcpService';
import ContentContextAnalyzer, { ContentContext } from '../contentContextAnalyzer';

describe('MCP Error Handling Integration - Real World Scenarios', () => {
  let mcpService: MCPService;
  let analyzer: ContentContextAnalyzer;

  beforeEach(() => {
    mcpService = new MCPService();
    analyzer = new ContentContextAnalyzer(mcpService);
  });

  describe('Complete Integration Flow', () => {
    it('should handle complete content generation flow with MCP unavailable', async () => {
      // Initialize analyzer (will use mock capabilities since MCP not ready)
      await analyzer.initialize();
      
      // Analyze content that would benefit from MCP data
      const context: ContentContext = {
        keyword: 'CEO email outreach best practices',
        title: 'How to Write Cold Emails to CEOs That Get High Reply Rates',
        contentType: 'blog',
        targetAudience: 'sales professionals'
      };

      // Step 1: Content analysis should identify this as valuable for MCP enhancement
      const analysis = await analyzer.analyzeContent(context);
      
      expect(analysis.shouldUseMCP).toBe(true);
      expect(analysis.estimatedValue).toBe('medium');
      expect(analysis.suggestedTools.length).toBeGreaterThan(0);
      expect(analysis.confidence).toBeGreaterThan(0.3);

      // Step 2: Execute MCP queries with graceful degradation
      const responses = await analyzer.executeMCPQueries(analysis.suggestedTools);
      
      // Should get mock responses since MCP service is not available
      expect(responses.length).toBeGreaterThan(0);
      expect(responses[0].attribution).toContain('Apollo');
      expect(responses[0].mockData).toBeDefined();
      
      // Verify the response contains realistic email performance data
      const emailResponse = responses.find(r => r.toolName === 'pythia_emails_query');
      expect(emailResponse).toBeDefined();
      expect(emailResponse?.mockData.openRate).toBeDefined();
      expect(emailResponse?.mockData.replyRate).toBeDefined();
      expect(emailResponse?.mockData.sampleSize).toBeDefined();
    });

    it('should provide health monitoring information', async () => {
      const healthStatus = await mcpService.getHealthStatus();
      
      expect(healthStatus).toMatchObject({
        connected: false, // Not connected since we haven't initialized
        initialized: false,
        toolsAvailable: 0,
        resourcesAvailable: 0,
        circuitBreakerState: 'CLOSED'
      });
      
      expect(healthStatus.lastConnected).toBeUndefined();
    });

    it('should track connection state properly', () => {
      const connectionState = mcpService.getConnectionState();
      
      expect(connectionState.status).toBe('discovering');
      expect(connectionState.toolsDiscovered).toBe(0);
      expect(connectionState.resourcesDiscovered).toBe(0);
      expect(connectionState.circuitBreakerState.state).toBe('CLOSED');
    });

    it('should handle analyzer stats when MCP service is not ready', () => {
      const stats = analyzer.getAnalyzerStats();
      
      expect(stats.mcpServiceReady).toBe(false);
      expect(stats.initialized).toBe(false); // Not initialized yet
      expect(stats.toolCapabilities).toBe(0); // No capabilities loaded yet
    });

    it('should initialize analyzer with mock capabilities when MCP unavailable', async () => {
      await analyzer.initialize();
      
      const stats = analyzer.getAnalyzerStats();
      
      expect(stats.initialized).toBe(true);
      expect(stats.toolCapabilities).toBe(3); // Mock capabilities loaded
      expect(stats.mcpServiceReady).toBe(false);
    });
  });

  describe('Error Handling Configuration', () => {
    it('should have proper MCP error handling configurations', () => {
      // Access the private properties for testing
      const retryConfig = (mcpService as any).retryConfig;
      const circuitBreaker = (mcpService as any).circuitBreaker;
      const rateLimiter = (mcpService as any).rateLimiter;
      
      // Verify retry configuration
      expect(retryConfig).toMatchObject({
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 15000,
        backoffMultiplier: 2,
        jitterMs: 500
      });
      
      // Verify circuit breaker and rate limiter exist
      expect(circuitBreaker).toBeDefined();
      expect(rateLimiter).toBeDefined();
      
      // Check circuit breaker state
      const cbState = circuitBreaker.getState();
      expect(cbState.state).toBe('CLOSED');
      expect(cbState.failures).toBe(0);
    });
  });

  describe('Content Enhancement Scenarios', () => {
    beforeEach(async () => {
      await analyzer.initialize();
    });

    it('should enhance email content with Apollo data', async () => {
      const context: ContentContext = {
        keyword: 'email open rates by job title',
        contentType: 'blog'
      };

      const analysis = await analyzer.analyzeContent(context);
      const responses = await analyzer.executeMCPQueries(analysis.suggestedTools);

      expect(responses.length).toBeGreaterThan(0);
      
      // Should have email performance data
      const emailData = responses[0].mockData;
      expect(emailData.openRate).toBeGreaterThan(0);
      expect(emailData.replyRate).toBeGreaterThan(0);
      expect(emailData.sampleSize).toBeGreaterThan(1000);
    });

    it('should enhance company-specific content', async () => {
      const context: ContentContext = {
        keyword: 'Amazon employee email outreach',
        contentType: 'blog'
      };

      const analysis = await analyzer.analyzeContent(context);
      const responses = await analyzer.executeMCPQueries(analysis.suggestedTools);

      // Should include both email and organization analysis
      expect(responses.length).toBeGreaterThanOrEqual(2);
      
      const orgResponse = responses.find(r => r.toolName === 'pythia_people_organizations_query');
      expect(orgResponse).toBeDefined();
      expect(orgResponse?.mockData.companyName).toBe('Amazon');
      expect(orgResponse?.mockData.domain).toBe('amazon.com');
    });

    it('should skip MCP for irrelevant content', async () => {
      const context: ContentContext = {
        keyword: 'cooking recipes',
        contentType: 'blog'
      };

      const analysis = await analyzer.analyzeContent(context);
      
      expect(analysis.shouldUseMCP).toBe(false);
      expect(analysis.suggestedTools.length).toBe(0);
      expect(analysis.estimatedValue).toBe('low');
    });
  });
});
