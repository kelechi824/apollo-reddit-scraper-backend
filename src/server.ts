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
import gongRoutes from './routes/gong';
import gongAnalysisRoutes from './routes/gongAnalysis';
import gongChatRoutes from './routes/gongChat';
import croRoutes from './routes/cro';
import screenshotRoutes from './routes/screenshot';
import vocExtractionRoutes from './routes/vocExtraction';
import articleExtractionRoutes from './routes/articleExtraction';
import contentAnalysisRoutes from './routes/contentAnalysis';
import personaPainPointMatchingRoutes from './routes/personaPainPointMatching';
import enhancedPersonaDetectionRoutes from './routes/enhancedPersonaDetection';
import ctaGenerationRoutes from './routes/ctaGeneration';
import competitorConquestingRoutes from './routes/competitorConquesting';
import sitemapRoutes from './routes/sitemap';
import sitemapChunkedRoutes from './routes/sitemapChunked';
import redditEngagementRoutes from './routes/redditEngagement';

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT: number = parseInt(process.env.PORT || '3003', 10);

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3002', // Local frontend
    'http://localhost:3000', // Alternative frontend port
    'https://apollo-reddit-scraper-frontend.vercel.app', // Production frontend
  ],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api/reddit', redditRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/sheets', sheetsRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/playbooks', playbooksRoutes);
app.use('/api/blog-creator', blogCreatorRoutes);
app.use('/api/gong', gongRoutes);
app.use('/api/gong-analysis', gongAnalysisRoutes);
app.use('/api/gong-chat', gongChatRoutes);
app.use('/api/cro', croRoutes);
app.use('/api', screenshotRoutes);
app.use('/api/voc-extraction', vocExtractionRoutes);
app.use('/api/article-extraction', articleExtractionRoutes);
app.use('/api/content-analysis', contentAnalysisRoutes);
app.use('/api/persona-pain-point-matching', personaPainPointMatchingRoutes);
app.use('/api/enhanced-persona-detection', enhancedPersonaDetectionRoutes);
app.use('/api/cta-generation', ctaGenerationRoutes);
app.use('/api/competitor-conquesting', competitorConquestingRoutes);
app.use('/api/sitemap', sitemapRoutes);
app.use('/api/sitemap-chunked', sitemapChunkedRoutes);
app.use('/api/reddit-engagement', redditEngagementRoutes);

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
        blogCreator: '/api/blog-creator/*',
        cro: '/api/cro/*',
        gongAnalysis: '/api/gong-analysis/*',
        gongChat: '/api/gong-chat/*',
        screenshot: '/api/screenshot/*',
        vocExtraction: '/api/voc-extraction/*',
        articleExtraction: '/api/article-extraction/*',
        contentAnalysis: '/api/content-analysis/*',
        personaPainPointMatching: '/api/persona-pain-point-matching/*',
        enhancedPersonaDetection: '/api/enhanced-persona-detection/*',
        ctaGeneration: '/api/cta-generation/*',
        competitorConquesting: '/api/competitor-conquesting/*',
        sitemap: '/api/sitemap/*',
        sitemapChunked: '/api/sitemap-chunked/*',
        redditEngagement: '/api/reddit-engagement/*'
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