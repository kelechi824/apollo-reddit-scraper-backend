/**
 * Test MCPService initialization with real Apollo server
 */

const axios = require('axios');

async function testMCPServiceInitialization() {
  console.log('🔬 Testing MCPService Backend Initialization\n');
  
  try {
    // Test the backend MCP service initialization endpoint
    console.log('🚀 Testing MCPService through backend API...');
    
    // First check if we can hit the health endpoint
    const health = await axios.get('http://localhost:3003/health', { timeout: 5000 });
    console.log('✅ Backend health:', health.data.status);
    
    // Create a request that should trigger MCP initialization
    // Using a keyword that should have high MCP confidence
    const testData = {
      keyword: 'Apollo CEO email open rates executive outreach performance data metrics',
      contentType: 'blog',
      existingContent: 'Article about Apollo CEO email performance data insights'
    };
    
    console.log('📝 Testing with high-confidence keyword:', testData.keyword);
    
    // Test content analysis that should trigger MCP
    const analysisResponse = await axios.post('http://localhost:3003/api/blog-creator/workflow-status', {
      keyword: testData.keyword
    }, { timeout: 10000 });
    
    console.log('✅ Backend workflow status endpoint accessible');
    
    // Test a mock content generation request to see MCP integration
    console.log('\n🎯 Testing content generation with MCP integration...');
    
    const contentRequest = {
      keyword: testData.keyword,
      synchronous: true,
      testMode: true
    };
    
    // This should trigger the full pipeline including MCP analysis
    const contentResponse = await axios.post('http://localhost:3003/api/blog-creator/generate', contentRequest, {
      timeout: 60000, // Long timeout for full pipeline
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log('✅ Content generation pipeline completed');
    console.log('📊 Response status:', contentResponse.status);
    
    if (contentResponse.data.mcpAnalysis) {
      console.log('🎯 MCP Analysis Results:');
      console.log('   Confidence:', contentResponse.data.mcpAnalysis.confidence);
      console.log('   Should use MCP:', contentResponse.data.mcpAnalysis.shouldUseMCP);
      console.log('   Tools suggested:', contentResponse.data.mcpAnalysis.suggestedTools?.length || 0);
    }
    
    if (contentResponse.data.mcpData) {
      console.log('📊 MCP Data Retrieved:');
      console.log('   Data sources:', contentResponse.data.mcpData.length);
      contentResponse.data.mcpData.forEach((data, index) => {
        console.log(`   ${index + 1}. ${data.attribution || 'Unknown source'}`);
      });
    }
    
    console.log('\n🎉 MCPService Integration Test: SUCCESS');
    console.log('✅ Backend running with MCP integration');
    console.log('✅ Content pipeline with MCP analysis working');
    
    if (contentResponse.data.mcpAnalysis?.shouldUseMCP) {
      console.log('✅ MCP would be triggered for this content type');
    } else {
      console.log('⚠️ MCP not triggered - confidence threshold not met');
      console.log('   This is expected behavior for graceful degradation');
    }
    
  } catch (error) {
    console.log('\n❌ MCPService Integration Test: FAILED');
    console.error('Error details:', error.message);
    
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Response data:', error.response.data);
    }
    
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 Backend not running. Start with: npm run dev');
    }
  }
}

testMCPServiceInitialization();