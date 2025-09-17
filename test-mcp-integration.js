const axios = require('axios');

async function testMCPIntegration() {
  console.log('🧪 Testing MCP Integration...\n');
  
  try {
    // Test 1: Check if backend is running
    console.log('1. Testing backend connectivity...');
    const healthResponse = await axios.get('http://localhost:3003/health');
    console.log('✅ Backend health:', healthResponse.data);
    
    // Test 2: Direct MCP integration test with email-focused content
    console.log('\n2. Testing content generation with email keywords...');
    const contentRequest = {
      keyword: "Apollo email performance data CEO open rates",
      target_audience: "sales development representatives", 
      content_length: "short",
      focus_areas: ["CEO email metrics", "Apollo data", "executive outreach performance"],
      use_default_prompts: true
    };
    
    console.log('📝 Sending request:', JSON.stringify(contentRequest, null, 2));
    
    const startTime = Date.now();
    const contentResponse = await axios.post(
      'http://localhost:3003/api/blog-creator/generate-content',
      contentRequest,
      {
        timeout: 120000, // 2 minutes
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    const duration = (Date.now() - startTime) / 1000;
    console.log(`⏱️ Request completed in ${duration}s`);
    
    if (contentResponse.data.success) {
      console.log('✅ Content generation successful!');
      
      // Check if content contains Apollo data references
      const content = contentResponse.data.data.content;
      const apolloReferences = [
        'According to Apollo',
        'Apollo data', 
        'Apollo analysis',
        'Apollo research',
        'proprietary data',
        'internal data'
      ];
      
      const foundReferences = apolloReferences.filter(ref => 
        content.toLowerCase().includes(ref.toLowerCase())
      );
      
      if (foundReferences.length > 0) {
        console.log('🎯 Found Apollo data references:', foundReferences);
        console.log('✅ MCP integration appears to be working!');
      } else {
        console.log('⚠️ No Apollo data references found in content');
        console.log('🔍 This might indicate MCP integration is not active');
      }
      
      // Show content preview
      console.log('\n📄 Content preview (first 500 chars):');
      console.log(content.substring(0, 500) + '...');
      
    } else {
      console.log('❌ Content generation failed:', contentResponse.data);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testMCPIntegration();
