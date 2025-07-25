import dotenv from 'dotenv';
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { HealthCheckResponse, ApiInfoResponse } from '../src/types';
import redditRoutes from '../src/routes/reddit';
import analysisRoutes from '../src/routes/analysis';
import sheetsRoutes from '../src/routes/sheets';
import workflowRoutes from '../src/routes/workflow';
import chatRoutes from '../src/routes/chat';
import contentRoutes from '../src/routes/content';
import playbooksRoutes from '../src/routes/playbooks';
import blogCreatorRoutes from '../src/routes/blogCreator';

// Load environment variables
dotenv.config();

const app: Express = express();

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [
        'https://apollo-reddit-scraper-frontend.vercel.app', // New production domain
        'https://apollo-reddit-scraper-frontend-5dwall1ms.vercel.app', // Current working domain
        'https://apollo-reddit-scraper-frontend-69az7g1ha.vercel.app', // Legacy domain for backward compatibility
        /https:\/\/.*\.netlify\.app$/ // Allow all Netlify domains for frontend deployment
      ]
    : 'http://localhost:3002',
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
    message: 'Apollo Reddit Scraper Backend is running on Vercel',
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

// Export the Express app for Vercel
export default app; 
