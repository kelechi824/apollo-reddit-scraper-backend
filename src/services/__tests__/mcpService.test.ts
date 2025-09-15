import MCPService from '../mcpService';

/**
 * Basic tests for MCPService functionality
 * Why this matters: Ensures the MCP service can initialize, connect, and discover tools
 * before integrating it into the content generation pipeline.
 */
describe('MCPService', () => {
  let mcpService: MCPService;
  
  beforeEach(() => {
    // Mock environment variable for testing
    process.env.MCP_SERVER_URL = 'http://10.60.0.115/mcp';
  });
  
  afterEach(() => {
    delete process.env.MCP_SERVER_URL;
  });
  
  describe('Constructor', () => {
    it('should initialize with proper configuration', () => {
      expect(() => {
        mcpService = new MCPService();
      }).not.toThrow();
    });
    
    it('should throw error when MCP_SERVER_URL is missing', () => {
      delete process.env.MCP_SERVER_URL;
      
      expect(() => {
        new MCPService();
      }).toThrow('Missing MCP_SERVER_URL environment variable');
    });
  });
  
  describe('Connection State', () => {
    beforeEach(() => {
      mcpService = new MCPService();
    });
    
    it('should start in discovering state', () => {
      const state = mcpService.getConnectionState();
      expect(state.status).toBe('discovering');
    });
    
    it('should provide health status', async () => {
      const health = await mcpService.getHealthStatus();
      expect(health).toHaveProperty('connected');
      expect(health).toHaveProperty('initialized');
      expect(health).toHaveProperty('toolsAvailable');
      expect(health).toHaveProperty('resourcesAvailable');
    });
  });
  
  describe('Tool Management', () => {
    beforeEach(() => {
      mcpService = new MCPService();
    });
    
    it('should reject tool calls when not ready', async () => {
      await expect(
        mcpService.callTool('test_tool', { query: 'test' })
      ).rejects.toThrow('MCP service not ready');
    });
    
    it('should reject resource reads when not ready', async () => {
      await expect(
        mcpService.readResource('test://resource')
      ).rejects.toThrow('MCP service not ready');
    });
    
    it('should reject prompt gets when not ready', async () => {
      await expect(
        mcpService.getPrompt('test_prompt')
      ).rejects.toThrow('MCP service not ready');
    });
  });
});
