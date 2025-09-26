#!/usr/bin/env ts-node

/**
 * MCP Service Test Script
 * Why this matters: Validates that the MCPService can successfully connect to Apollo's
 * MCP server and discover available tools before integrating into content generation pipeline.
 */

import dotenv from 'dotenv';
import MCPService from './services/mcpService';

// Load environment variables
dotenv.config();

async function testMCPService() {
  console.log('🧪 Testing MCP Service Integration...\n');
  
  try {
    // Initialize MCP Service
    console.log('1️⃣ Initializing MCPService...');
    const mcpService = new MCPService();
    
    // Test initialization and connection
    console.log('2️⃣ Connecting to MCP server...');
    await mcpService.initialize();
    
    // Get connection state
    console.log('3️⃣ Checking connection state...');
    const connectionState = mcpService.getConnectionState();
    console.log('📊 Connection State:', {
      status: connectionState.status,
      toolsDiscovered: connectionState.toolsDiscovered,
      resourcesDiscovered: connectionState.resourcesDiscovered,
      lastConnected: connectionState.lastConnected
    });
    
    // Get health status
    console.log('4️⃣ Checking health status...');
    const healthStatus = await mcpService.getHealthStatus();
    console.log('🏥 Health Status:', healthStatus);
    
    // List available tools
    console.log('5️⃣ Available MCP Tools:');
    connectionState.availableTools.forEach((toolName, index) => {
      console.log(`   ${index + 1}. ${toolName}`);
    });
    
    // List tool capabilities
    console.log('6️⃣ Tool Capabilities:');
    connectionState.toolCapabilities.forEach((capability, index) => {
      console.log(`   ${index + 1}. ${capability.name} (${capability.type}) - ${capability.priority} priority`);
    });
    
    console.log('\n✅ MCP Service test completed successfully!');
    console.log('🚀 Ready to proceed with ContentContextAnalyzer (Task 1.2)');
    
  } catch (error: any) {
    console.error('\n❌ MCP Service test failed:');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    if (error.message.includes('MCP_SERVER_URL')) {
      console.log('\n💡 Solution: Add MCP_SERVER_URL=http://10.60.0.115/mcp to your backend/.env file');
    }
    
    process.exit(1);
  }
}

// Run the test
testMCPService();
