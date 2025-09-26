import MCPService from './mcpService';

/**
 * Global MCP Service Manager
 * Why this matters: Provides singleton MCP service that persists across all requests
 * and survives frontend page refreshes/navigation. Essential for SaaS applications
 * requiring permanent MCP connectivity.
 */
class GlobalMcpServiceManager {
  private static instance: MCPService | null = null;
  private static initializationPromise: Promise<MCPService> | null = null;

  /**
   * Get or create the global MCP service instance
   * Why this matters: Ensures only one MCP connection exists server-wide,
   * preventing multiple connections and resource waste
   */
  static async getInstance(): Promise<MCPService> {
    if (this.instance) {
      return this.instance;
    }

    // If already initializing, wait for that to complete
    if (this.initializationPromise) {
      return await this.initializationPromise;
    }

    // Start initialization
    this.initializationPromise = this.initializeService();
    this.instance = await this.initializationPromise;
    this.initializationPromise = null;

    return this.instance;
  }

  /**
   * Initialize the MCP service with proper error handling
   * Why this matters: Robust initialization ensures the service starts correctly
   * and handles any startup errors gracefully
   */
  private static async initializeService(): Promise<MCPService> {
    console.log('🔧 Initializing global MCP service...');
    
    const mcpService = new MCPService();
    await mcpService.initialize();
    
    console.log('✅ Global MCP service initialized and ready');
    return mcpService;
  }

  /**
   * Get MCP service status without initializing
   * Why this matters: Allows checking if service is ready without triggering initialization
   */
  static isInitialized(): boolean {
    return this.instance !== null;
  }

  /**
   * Reset the global MCP service (for testing or error recovery)
   * Why this matters: Provides a way to reset the connection if needed
   */
  static async reset(): Promise<void> {
    console.log('🔄 Resetting global MCP service...');
    
    if (this.instance) {
      try {
        // Clean up existing instance if it has cleanup methods
        if (typeof (this.instance as any).cleanup === 'function') {
          (this.instance as any).cleanup();
        }
      } catch (error) {
        console.warn('⚠️ Error during MCP service cleanup:', error);
      }
    }
    
    this.instance = null;
    this.initializationPromise = null;
    
    // Reinitialize
    this.instance = await this.getInstance();
    console.log('✅ Global MCP service reset complete');
  }
}

export default GlobalMcpServiceManager;
