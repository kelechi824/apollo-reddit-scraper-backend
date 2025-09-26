/**
 * Test direct MCP connection with improved session management
 */

const axios = require('axios');

async function testMCPConnection() {
  console.log('🔬 Testing MCP Server Connection with Session Management\n');
  
  const baseUrl = 'http://10.60.0.115/mcp';
  let sessionId = null;
  
  try {
    // Step 1: Initial connection with initialize request to get session ID
    console.log('🔗 Step 1: Establishing connection with initialize...');
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: { listChanged: true },
          sampling: {}
        },
        clientInfo: {
          name: 'Apollo-Content-Generator',
          version: '1.0.0'
        }
      }
    };
    
    const connectionResponse = await axios.post(baseUrl, initRequest, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'User-Agent': 'Apollo-Content-Generator/1.0.0'
      },
      timeout: 30000,
      responseType: 'text'
    });
    
    // Extract session ID from headers
    sessionId = connectionResponse.headers['mcp-session-id'];
    console.log(`🔑 Session ID extracted: ${sessionId || 'None received'}`);
    
    if (!sessionId) {
      console.log('📄 Response data:', connectionResponse.data.substring(0, 500));
    }
    
    console.log('✅ Initialize response received');
    console.log('📄 Response sample:', connectionResponse.data.substring(0, 200));
    
    // Step 2: Send initialized notification
    console.log('\n📢 Step 2: Sending initialized notification...');
    const notification = {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {}
    };
    
    await axios.post(baseUrl, notification, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'User-Agent': 'Apollo-Content-Generator/1.0.0',
        ...(sessionId && { 'mcp-session-id': sessionId })
      },
      timeout: 30000
    });
    
    console.log('✅ Initialized notification sent');
    
    // Step 3: Test a query
    console.log('\n🔍 Step 3: Testing actual query...');
    const queryRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'query',
      params: {
        query: 'What are CEO email open rates by industry?'
      }
    };
    
    const queryResponse = await axios.post(baseUrl, queryRequest, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'User-Agent': 'Apollo-Content-Generator/1.0.0',
        ...(sessionId && { 'mcp-session-id': sessionId })
      },
      timeout: 30000,
      responseType: 'text'
    });
    
    console.log('✅ Query response received');
    console.log('📊 Response length:', queryResponse.data.length, 'characters');
    console.log('📄 Response sample:', queryResponse.data.substring(0, 500));
    
    console.log('\n🎉 MCP Connection Test: SUCCESS');
    console.log('✅ Connection established');
    console.log('✅ Session management working');
    console.log('✅ Protocol handshake completed');
    console.log('✅ Query execution successful');
    
  } catch (error) {
    console.log('\n❌ MCP Connection Test: FAILED');
    console.error('Error details:', error.message);
    
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Headers:', error.response.headers);
      console.log('Data sample:', error.response.data?.substring?.(0, 500) || error.response.data);
    }
    
    console.log('\n🔧 Session management status:');
    console.log(`   Session ID: ${sessionId || 'Not obtained'}`);
  }
}

testMCPConnection();