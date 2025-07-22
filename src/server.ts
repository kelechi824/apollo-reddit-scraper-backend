import dotenv from 'dotenv';
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { HealthCheckResponse, ApiInfoResponse } from './types';
import redditRoutes from './routes/reddit';
import analysisRoutes from './routes/analysis';
import sheetsRoutes from './routes/sheets';
import workflowRoutes from './routes/workflow';
import chatRoutes from './routes/chat';
import contentRoutes from './routes/content';
import playbooksRoutes from './routes/playbooks';
import blogCreatorRoutes from './routes/blogCreator';

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT: number = parseInt(process.env.PORT || '3003', 10);

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3002', // Local frontend
    'https://apollo-reddit-scraper-frontend.vercel.app', // Production frontend
  ],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/reddit', redditRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/sheets', sheetsRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/playbooks', playbooksRoutes);
app.use('/api/blog-creator', blogCreatorRoutes);

// Health check endpoint
app.get('/health', (req: Request, res: Response<HealthCheckResponse>): void => {
  res.json({ 
    status: 'OK', 
    message: 'Apollo Reddit Scraper Backend is running',
    timestamp: new Date().toISOString()
  });
});

// Basic info endpoint
app.get('/', (req: Request, res: Response<ApiInfoResponse>): void => {
  res.json({
    name: 'Apollo Reddit Scraper API',
    version: '1.0.0',
    description: 'Backend API for Reddit content analysis and insights',
    documentation: {
      health: '/health',
      info: '/',
      endpoints: {
        reddit: '/api/reddit/*',
        analysis: '/api/analysis/*',
        sheets: '/api/sheets/*',
        workflow: '/api/workflow/*',
        chat: '/api/chat/*',
        content: '/api/content/*',
        playbooks: '/api/playbooks/*',
        blogCreator: '/api/blog-creator/*'
      }
    }
  });
});

// Start server
app.listen(PORT, (): void => {
  console.log(`🚀 Apollo Reddit Scraper Backend running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📚 API info: http://localhost:${PORT}/`);
});

export default app; 