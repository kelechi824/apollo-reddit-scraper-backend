import dotenv from 'dotenv';
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { HealthCheckResponse, ApiInfoResponse } from '../src/types';
import redditRoutes from '../src/routes/reddit';
import redditCommentsRoutes from '../src/routes/redditComments';
import analysisRoutes from '../src/routes/analysis';
import sheetsRoutes from '../src/routes/sheets';
import workflowRoutes from '../src/routes/workflow';
import chatRoutes from '../src/routes/chat';
import contentRoutes from '../src/routes/content';
import playbooksRoutes from '../src/routes/playbooks';
import blogCreatorRoutes from '../src/routes/blogCreator';
import gongRoutes from '../src/routes/gong';
import gongAnalysisRoutes from '../src/routes/gongAnalysis';
import gongChatRoutes from '../src/routes/gongChat';
import croRoutes from '../src/routes/cro';
import screenshotRoutes from '../src/routes/screenshot';
import vocExtractionRoutes from '../src/routes/vocExtraction';
import articleExtractionRoutes from '../src/routes/articleExtraction';
import contentAnalysisRoutes from '../src/routes/contentAnalysis';
import personaPainPointMatchingRoutes from '../src/routes/personaPainPointMatching';
import enhancedPersonaDetectionRoutes from '../src/routes/enhancedPersonaDetection';
import ctaGenerationRoutes from '../src/routes/ctaGeneration';
import competitorConquestingRoutes from '../src/routes/competitorConquesting';
import sitemapRoutes from '../src/routes/sitemap';
import sitemapChunkedRoutes from '../src/routes/sitemapChunked';
import redditEngagementRoutes from '../src/routes/redditEngagement';
import jokesRoutes from '../src/routes/jokes';
import abTestingRoutes from '../src/routes/abTesting';
import cacheInvalidationRoutes from '../src/routes/cacheInvalidation';
import uncoverRoutes from '../src/routes/uncover';
import vocAgentRoutes from '../src/routes/vocAgent';

// Load environment variables
dotenv.config();

// Trigger Vercel redeploy after fixing Uncover 404 routes - 2024-01-XX

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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api/reddit', redditRoutes);
app.use('/api/reddit', redditCommentsRoutes);
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
app.use('/api/jokes', jokesRoutes);
app.use('/api/ab-testing', abTestingRoutes);
app.use('/api/cache-invalidation', cacheInvalidationRoutes);
app.use('/api/uncover', uncoverRoutes);
app.use('/api/voc-agent', vocAgentRoutes);

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
        blogCreator: '/api/blog-creator/*',
        cro: '/api/cro/*',
        gong: '/api/gong/*',
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
        redditEngagement: '/api/reddit-engagement/*',
        jokes: '/api/jokes/*',
        abTesting: '/api/ab-testing/*',
        cacheInvalidation: '/api/cache-invalidation/*',
        emailNewsletter: '/api/email-newsletter/*',
        uncover: '/api/uncover/*',
        vocAgent: '/api/voc-agent/*'
      }
    }
  });
});

// Export the Express app for Vercel
export default app; 
