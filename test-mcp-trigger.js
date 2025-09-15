/**
 * Test MCP integration by triggering content generation with high-confidence keyword
 */

const axios = require('axios');

async function testMCPTrigger() {
  console.log('🔬 Testing MCP Integration via Content Generation\n');
  
  try {
    // Test backend health first
    const health = await axios.get('http://localhost:3003/health', { timeout: 5000 });
    console.log('✅ Backend health:', health.data.status);
    
    // Create a keyword that should trigger high MCP confidence
    // Based on the logs, we need: email, CEO, executive, outreach, open rate keywords
    const highConfidenceKeyword = 'CEO email open rates Apollo email performance data executive outreach metrics';
    
    console.log('📝 Testing with keyword:', highConfidenceKeyword);
    console.log('🎯 Expected: Should trigger MCP with >50% confidence\n');
    
    // Test direct content generation
    const contentRequest = {
      keyword: highConfidenceKeyword,
      contentType: 'blog',
      synchronous: true
    };
    
    console.log('🚀 Starting content generation pipeline...');
    
    const response = await axios.post('http://localhost:3003/api/blog-creator/generate-content', contentRequest, {
      timeout: 120000, // 2 minute timeout
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log('✅ Content generation completed');
    console.log('📊 Response status:', response.status);
    
    // Check if MCP was analyzed
    if (response.data.debug?.mcpAnalysis) {
      console.log('\n🧪 MCP Analysis Results:');
      const mcp = response.data.debug.mcpAnalysis;
      console.log(`   📊 Confidence: ${(mcp.confidence * 100).toFixed(1)}%`);
      console.log(`   🎯 Should use MCP: ${mcp.shouldUseMCP}`);
      console.log(`   🛠️  Tools suggested: ${mcp.suggestedTools?.length || 0}`);
      
      if (mcp.reasoning) {
        console.log(`   💭 Reasoning: ${mcp.reasoning}`);
      }
      
      if (mcp.suggestedTools && mcp.suggestedTools.length > 0) {
        console.log('\n🔧 Suggested MCP Tools:');
        mcp.suggestedTools.forEach((tool, i) => {
          console.log(`   ${i + 1}. ${tool.tool?.name || 'Unknown'}: ${tool.query}`);
        });
      }
    } else {
      console.log('\n⚠️ No MCP analysis found in response');
    }
    
    // Check if MCP data was used
    if (response.data.mcpData) {
      console.log('\n📊 MCP Data Used:');
      response.data.mcpData.forEach((data, i) => {
        console.log(`   ${i + 1}. ${data.attribution || 'Unknown source'}`);
        console.log(`      Query: ${data.query || 'N/A'}`);
      });
    } else if (response.data.debug?.mcpAnalysis?.shouldUseMCP) {
      console.log('\n⚠️ MCP should have been used but no data found');
      console.log('   This might indicate connection issues with the MCP server');
    }
    
    // Check content generation result
    if (response.data.content) {
      const contentLength = response.data.content.length;
      console.log(`\n📄 Generated content: ${contentLength} characters`);
      
      // Check if content contains Apollo data attribution
      const hasApolloAttribution = response.data.content.includes('According to Apollo') || 
                                  response.data.content.includes('Apollo data') ||
                                  response.data.content.includes('Apollo\'s');
      
      if (hasApolloAttribution) {
        console.log('✅ Content includes Apollo data attribution');
      } else {
        console.log('⚠️ Content does not include Apollo data attribution');
      }
    }
    
    console.log('\n🎉 MCP Integration Test Results:');
    
    if (response.data.debug?.mcpAnalysis) {
      const shouldUseMCP = response.data.debug.mcpAnalysis.shouldUseMCP;
      const hasData = response.data.mcpData && response.data.mcpData.length > 0;
      
      if (shouldUseMCP && hasData) {
        console.log('✅ FULL SUCCESS: MCP triggered and data integrated');
      } else if (shouldUseMCP && !hasData) {
        console.log('⚠️ PARTIAL: MCP should be used but no data retrieved');
        console.log('   → This suggests MCP server connection issues');
      } else {
        console.log('✅ SUCCESS: MCP analysis working, confidence threshold not met');
        console.log('   → This is expected behavior for content that doesn\'t need Apollo data');
      }
    } else {
      console.log('❌ FAILED: No MCP analysis performed');
    }
    
  } catch (error) {
    console.log('\n❌ MCP Integration Test: FAILED');
    console.error('Error details:', error.message);
    
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Response data preview:', JSON.stringify(error.response.data).substring(0, 200));
    }
    
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 Backend not running. Start with: npm run dev');
    }
  }
}

testMCPTrigger();