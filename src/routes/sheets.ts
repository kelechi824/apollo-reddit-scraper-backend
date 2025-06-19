import { Router, Request, Response } from 'express';
import GoogleSheetsService from '../services/googleSheetsService';
import { SheetsExportRequest, ApiError } from '../types';

const router = Router();
const sheetsService = new GoogleSheetsService();

/**
 * POST /api/sheets/export
 * Export analyzed Reddit posts to Google Sheets
 * Why this matters: This creates a permanent, shareable record of business insights
 * that teams can review and act upon for content strategy and market research.
 */
router.post('/export', async (req: Request, res: Response): Promise<any> => {
  try {
    // Validate request body
    const { analyzed_posts, spreadsheet_id, sheet_name }: SheetsExportRequest = req.body;

    if (!analyzed_posts || !Array.isArray(analyzed_posts) || analyzed_posts.length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'analyzed_posts array is required and must not be empty',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    if (!spreadsheet_id) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'spreadsheet_id is required',
        status: 400,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`📊 Sheets export request: ${analyzed_posts.length} posts to ${spreadsheet_id}`);

    // Export to Google Sheets
    const result = await sheetsService.exportToSheets({
      analyzed_posts,
      spreadsheet_id,
      sheet_name: sheet_name || 'Reddit Analysis'
    });

    res.json(result);

  } catch (error) {
    console.error('Sheets export endpoint error:', error);
    
    res.status(500).json({
      error: 'Sheets Export Failed',
      message: error instanceof Error ? error.message : 'Unknown export error',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/sheets/status
 * Check Google Sheets service status
 * Why this matters: Provides health monitoring for the sheets export service
 * to ensure Google Sheets integration is working properly.
 */
router.get('/status', async (req: Request, res: Response): Promise<any> => {
  try {
    const status = sheetsService.getServiceStatus();
    const isConnected = status.hasCredentials ? await sheetsService.testConnection() : false;

    res.json({
      service: 'Google Sheets',
      status: isConnected ? 'connected' : status.hasCredentials ? 'credentials_ok' : 'not_configured',
      details: {
        ...status,
        connection_test: isConnected
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Sheets status check error:', error);
    
    res.status(500).json({
      service: 'Google Sheets',
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/sheets/test
 * Test Google Sheets connection
 * Why this matters: Allows testing the Google Sheets integration without exporting real data.
 */
router.get('/test', async (req: Request, res: Response): Promise<any> => {
  try {
    const status = sheetsService.getServiceStatus();
    
    if (!status.hasCredentials) {
      return res.status(501).json({
        error: 'Service Not Configured',
        message: 'Google Sheets credentials not configured in environment variables',
        status: 501,
        timestamp: new Date().toISOString()
      });
    }

    const isConnected = await sheetsService.testConnection();

    if (isConnected) {
      res.json({
        message: 'Google Sheets connection test successful',
        status: 'connected',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        error: 'Service Unavailable',
        message: 'Google Sheets connection test failed',
        status: 503,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Sheets test error:', error);
    
    res.status(500).json({
      error: 'Test Failed',
      message: error instanceof Error ? error.message : 'Unknown test error',
      status: 500,
      timestamp: new Date().toISOString()
    });
  }
});

export default router; 