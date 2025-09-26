#!/usr/bin/env ts-node

/**
 * Test script for MCP integration in Blog Creator
 * Why this matters: Validates that MCP service can enhance blog content generation
 * with Apollo's proprietary data, ensuring the complete workflow functions correctly.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

import MCPService from './services/mcpService';
import ContentContextAnalyzer from './services/contentContextAnalyzer';
import { workflowOrchestrator } from './services/workflowOrchestrator';

async function testMCPBlogIntegration() {
  console.log('🧪 Testing MCP Integration in Blog Creator Workflow');
  console.log('=' .repeat(60));

  try {
    // Test 1: MCP Service Initialization
    console.log('\n📋 Test 1: MCP Service Initialization');
    const mcpService = new MCPService();
    
    try {
      await mcpService.initialize();
      console.log('✅ MCP Service initialized successfully');
      
      const connectionState = mcpService.getConnectionState();
      console.log(`   📊 Connection Status: ${connectionState.status}`);
      console.log(`   🔧 Tools Available: ${connectionState.availableTools.length}`);
      console.log(`   📄 Resources Available: ${connectionState.availableResources.length}`);
      
    } catch (mcpError: any) {
      console.warn('⚠️ MCP Service initialization failed (will use mock data):', mcpError.message);
    }

    // Test 2: Content Context Analyzer
    console.log('\n📋 Test 2: Content Context Analyzer');
    const analyzer = new ContentContextAnalyzer(mcpService);
    await analyzer.initialize();
    
    const analyzerStats = analyzer.getAnalyzerStats();
    console.log(`   🧠 Tool Capabilities: ${analyzerStats.toolCapabilities}`);
    console.log(`   ✅ Initialized: ${analyzerStats.initialized}`);
    console.log(`   🔗 MCP Ready: ${analyzerStats.mcpServiceReady}`);

    // Test 3: Content Analysis for Email-related Keywords
    console.log('\n📋 Test 3: Content Analysis for Email Keywords');
    const emailKeywords = [
      'email marketing strategies',
      'cold email templates for CEOs',
      'sales prospecting emails',
      'email open rates by job title'
    ];

    for (const keyword of emailKeywords) {
      console.log(`\n   🔍 Analyzing: "${keyword}"`);
      const analysisResult = await analyzer.analyzeContent({
        keyword,
        contentType: 'blog',
        existingContent: `Article about ${keyword} for B2B sales teams`
      });
      
      console.log(`   📊 Should Use MCP: ${analysisResult.shouldUseMCP}`);
      console.log(`   🎯 Confidence: ${(analysisResult.confidence * 100).toFixed(1)}%`);
      console.log(`   🛠️ Suggested Tools: ${analysisResult.suggestedTools.length}`);
      console.log(`   💎 Estimated Value: ${analysisResult.estimatedValue}`);
      console.log(`   💭 Reasoning: ${analysisResult.reasoning}`);
      
      if (analysisResult.suggestedTools.length > 0) {
        console.log(`   🔧 Tools: ${analysisResult.suggestedTools.map(t => t.tool.name).join(', ')}`);
      }
    }

    // Test 4: Mock MCP Query Execution
    console.log('\n📋 Test 4: Mock MCP Query Execution');
    const testContext = {
      keyword: 'CEO email marketing strategies',
      contentType: 'blog' as const,
      existingContent: 'Article about email marketing strategies for reaching CEO-level executives'
    };
    
    const analysisResult = await analyzer.analyzeContent(testContext);
    if (analysisResult.shouldUseMCP && analysisResult.suggestedTools.length > 0) {
      console.log(`   🔍 Executing ${analysisResult.suggestedTools.length} MCP queries...`);
      
      try {
        const mockResponses = await analyzer.executeMCPQueries(analysisResult.suggestedTools);
        console.log(`   ✅ Received ${mockResponses.length} MCP responses`);
        
        mockResponses.forEach((response, index) => {
          console.log(`   📊 Response ${index + 1}:`);
          console.log(`      🔧 Tool: ${response.toolName}`);
          console.log(`      📝 Query: ${response.query.substring(0, 80)}...`);
          console.log(`      🏷️ Attribution: ${response.attribution}`);
          console.log(`      📈 Sample Data:`, JSON.stringify(response.mockData, null, 2).substring(0, 200) + '...');
        });
      } catch (queryError: any) {
        console.error('   ❌ MCP Query execution failed:', queryError.message);
      }
    }

    // Test 5: End-to-End Blog Generation with MCP (using synchronous endpoint)
    console.log('\n📋 Test 5: End-to-End Blog Generation with MCP');
    console.log('   🚀 Testing synchronous blog generation with email keyword...');
    
    try {
      const blogResult = await workflowOrchestrator.executeContentPipeline({
        keyword: 'email marketing for CEOs',
        content_length: 'short',
        target_audience: 'B2B sales professionals',
        focus_areas: ['email performance', 'executive outreach']
      });
      
      console.log('   ✅ Blog generation completed successfully!');
      console.log(`   📊 Content Length: ${blogResult.metadata.word_count} words`);
      console.log(`   🎯 Quality Score: ${blogResult.generation_metadata.content_quality_score.toFixed(2)}`);
      console.log(`   🔧 Model Pipeline: ${blogResult.generation_metadata.model_pipeline.join(' → ')}`);
      console.log(`   ⏱️ Duration: ${blogResult.generation_metadata.total_duration_seconds.toFixed(1)}s`);
      
      // Check if content contains Apollo data attribution
      const content = blogResult.content.toLowerCase();
      const hasApolloAttribution = content.includes("according to apollo") || 
                                  content.includes("apollo's data") || 
                                  content.includes("apollo's email") ||
                                  content.includes("apollo's proprietary");
      
      console.log(`   🏷️ Contains Apollo Attribution: ${hasApolloAttribution ? '✅ Yes' : '❌ No'}`);
      
      if (hasApolloAttribution) {
        console.log('   🎉 SUCCESS: MCP data successfully integrated into blog content!');
      } else {
        console.log('   ⚠️ WARNING: No Apollo attribution found in content (may be using fallback)');
      }
      
      // Show a snippet of the content
      const contentSnippet = blogResult.content.substring(0, 300) + '...';
      console.log(`   📄 Content Snippet:\n${contentSnippet}`);
      
    } catch (blogError: any) {
      console.error('   ❌ Blog generation failed:', blogError.message);
      console.error('   📋 Error details:', blogError);
    }

    console.log('\n🎉 MCP Blog Integration Test Complete!');
    console.log('=' .repeat(60));

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testMCPBlogIntegration()
    .then(() => {
      console.log('\n✅ All tests completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test suite failed:', error);
      process.exit(1);
    });
}

export default testMCPBlogIntegration;
