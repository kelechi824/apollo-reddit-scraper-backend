// Jest setup file for global test configuration
// This file runs before all tests

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.MCP_SERVER_URL = 'http://localhost:3000/mcp-test';

// Global test timeout
jest.setTimeout(30000);

// Mock console methods to reduce noise during testing
global.console = {
  ...console,
  // Uncomment to suppress console.log during tests
  // log: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};
