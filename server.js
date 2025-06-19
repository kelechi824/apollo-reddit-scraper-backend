require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(cors({
  origin: 'http://localhost:3002', // Frontend URL
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Apollo Reddit Scraper Backend is running',
    timestamp: new Date().toISOString()
  });
});

// Basic info endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Apollo Reddit Scraper API',
    version: '1.0.0',
    description: 'Backend API for Reddit content analysis and insights'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Apollo Reddit Scraper Backend running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
}); 