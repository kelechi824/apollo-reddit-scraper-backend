const axios = require('axios');

async function testMCPComponents() {
  console.log('🔧 Testing MCP Components Directly...\n');
  
  try {
    // Test the actual MCP server connection directly
    console.log('1. Testing MCP server connection at http://10.60.0.115/mcp...');
    
    try {
      const mcpResponse = await axios.get('http://10.60.0.115/mcp', {
        timeout: 10000,
        headers: {
          'Accept': 'text/event-stream',
          'User-Agent': 'Apollo-Content-Generator'
        }
      });
      console.log('✅ MCP server responds:', mcpResponse.status);
    } catch (mcpError) {
      console.log('❌ MCP server connection failed:', mcpError.message);
      console.log('   This explains why MCP integration is not working');
    }
    
    // Test if backend routes are working
    console.log('\n2. Testing simple backend routes...');
    
    const apiInfo = await axios.get('http://localhost:3003/');
    console.log('✅ API info endpoint works');
    
    // Try a simpler endpoint
    console.log('\n3. Testing workflow status endpoint...');
    const workflowStatus = await axios.get('http://localhost:3003/api/blog-creator/workflow-status');
    console.log('✅ Workflow status:', workflowStatus.data);
    
    // Test content creation with minimal payload
    console.log('\n4. Testing minimal content generation...');
    const minimalRequest = {
      keyword: "test keyword",
      use_default_prompts: true
    };
    
    console.log('📝 Sending minimal request...');
    const minimalResponse = await axios.post(
      'http://localhost:3003/api/blog-creator/generate-content',
      minimalRequest,
      {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    console.log('✅ Minimal content generation works!');
    console.log('Response status:', minimalResponse.status);
    
  } catch (error) {
    console.error('❌ Component test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testMCPComponents();
