#!/usr/bin/env ts-node

/**
 * MCP Cortex Analyst Query Test
 * Why this matters: Tests the actual query functionality to ensure we can retrieve
 * Apollo's proprietary email performance data through the Cortex Analyst interface.
 */

import dotenv from 'dotenv';
import MCPService from './services/mcpService';

// Load environment variables
dotenv.config();

async function testCortexAnalystQueries() {
  console.log('🧪 Testing Cortex Analyst Query Functionality...\n');
  
  try {
    // Initialize MCP Service
    console.log('1️⃣ Initializing MCPService...');
    const mcpService = new MCPService();
    
    // Initialize connection
    console.log('2️⃣ Connecting to Cortex Analyst...');
    await mcpService.initialize();
    
    // Test CEO email performance query (from your example)
    console.log('3️⃣ Testing CEO email performance query...');
    const ceoQuery = "Please provide me opening and reply rates for emails sent to those contacts whose primary_title contains CEO or Chief Executive Officer";
    
    const ceoResult = await mcpService.callTool('pythia_query', {
      query: ceoQuery
    });
    
    console.log('📊 CEO Email Performance Results:');
    console.log(ceoResult.content[0].text);
    
    // Test company-specific query
    console.log('\n4️⃣ Testing company-specific query...');
    const companyQuery = "Give me the open rate and reply rate percentages for email campaigns sent to people working at amazon.com (filtering by web_domain = 'amazon.com'), excluding records where emailer_campaign_id is null. Open rate = opened_emails / delivered_emails, Reply rate = replied_emails / delivered_emails.";
    
    const companyResult = await mcpService.callTool('pythia_query', {
      query: companyQuery
    });
    
    console.log('📊 Amazon Email Performance Results:');
    console.log(companyResult.content[0].text);
    
    // Test email template query
    console.log('\n5️⃣ Testing email template effectiveness query...');
    const templateQuery = "Which email templates have the highest open rates?";
    
    const templateResult = await mcpService.callTool('pythia_query', {
      query: templateQuery
    });
    
    console.log('📊 Email Template Results:');
    console.log(templateResult.content[0].text);
    
    console.log('\n✅ All Cortex Analyst queries completed successfully!');
    console.log('🚀 MCP integration is ready for content generation pipeline!');
    
  } catch (error: any) {
    console.error('\n❌ Cortex Analyst query test failed:');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    process.exit(1);
  }
}

// Run the test
testCortexAnalystQueries();
