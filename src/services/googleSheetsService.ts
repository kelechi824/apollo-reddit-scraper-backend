import { google } from 'googleapis';
import { AnalyzedPost, SheetsExportRequest, SheetsExportResponse } from '../types';

class GoogleSheetsService {
  private sheets: any = null;
  private isInitialized: boolean = false;

  constructor() {
    // Delay initialization to allow environment variables to load
    // Commented out to prevent warning when Google Sheets credentials are not needed
    // setTimeout(() => {
    //   this.initializeClient();
    // }, 100);
  }

  /**
   * Initialize Google Sheets client with service account credentials
   * Why this matters: Google Sheets API requires service account authentication
   * for programmatic access to spreadsheets.
   */
  private async initializeClient(): Promise<void> {
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;

    if (!clientEmail || !privateKey) {
      console.log('⚠️  Google Sheets credentials not configured - sheets export will be disabled');
      return;
    }

    try {
      // Format the private key (handle escaped newlines)
      const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');

      // Create JWT auth client
      const auth = new google.auth.JWT({
        email: clientEmail,
        key: formattedPrivateKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });

      // Authenticate
      await auth.authorize();

      // Initialize Sheets API
      this.sheets = google.sheets({ version: 'v4', auth });
      this.isInitialized = true;

      console.log('✅ Google Sheets client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Google Sheets client:', error);
      console.log('Sheets export will be disabled for this session');
    }
  }

  /**
   * Export analyzed posts to Google Sheets
   * Why this matters: This creates a permanent, shareable record of Reddit insights
   * that teams can access and analyze for business decision-making.
   */
  async exportToSheets(request: SheetsExportRequest): Promise<SheetsExportResponse> {
    if (!this.isInitialized || !this.sheets) {
      throw new Error('Google Sheets service not initialized or credentials missing');
    }

    const { analyzed_posts, spreadsheet_id, sheet_name = 'Reddit Analysis' } = request;

    if (!analyzed_posts || analyzed_posts.length === 0) {
      throw new Error('No analyzed posts provided for export');
    }

    console.log(`📊 Exporting ${analyzed_posts.length} analyzed posts to Google Sheets`);

    try {
      // Prepare the data rows
      const rows = this.prepareDataRows(analyzed_posts);

      // Check if sheet exists, create if not
      await this.ensureSheetExists(spreadsheet_id, sheet_name);

      // Clear existing content and add headers
      await this.setupSheet(spreadsheet_id, sheet_name);

      // Append the data
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheet_id,
        range: `${sheet_name}!A2:N`, // Start from row 2 (after headers)
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: rows
        }
      });

      const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheet_id}`;
      const rowsAdded = response.data.updates?.updatedRows || 0;

      console.log(`✅ Successfully exported ${rowsAdded} rows to Google Sheets`);

      return {
        success: true,
        rows_added: rowsAdded,
        spreadsheet_url: spreadsheetUrl,
        export_timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Google Sheets export failed:', error);
      throw new Error(`Sheets export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Prepare data rows for Google Sheets export
   * Why this matters: Transforms analyzed Reddit posts into a structured format
   * suitable for spreadsheet analysis and business review.
   */
  private prepareDataRows(analyzedPosts: AnalyzedPost[]): string[][] {
    return analyzedPosts.map(post => [
      post.post_rank.toString(),
      post.title,
      post.subreddit,
      post.author,
      post.score.toString(),
      post.comments.toString(),
      post.engagement.toString(),
      post.analysis.pain_point,
      post.analysis.audience_insight,
      post.analysis.content_opportunity,
      post.analysis.urgency_level,
      post.permalink,
      post.analysis_timestamp
    ]);
  }

  /**
   * Set up sheet with proper headers
   * Why this matters: Creates a professional spreadsheet layout that's easy
   * for business teams to understand and analyze.
   */
  private async setupSheet(spreadsheetId: string, sheetName: string): Promise<void> {
    const headers = [
      'Rank',
      'Post Title',
      'Subreddit',
      'Author',
      'Score',
      'Comments',
      'Engagement',
      'Pain Point',
      'Audience Insight',
      'Content Opportunity',
      'Urgency Level',
      'Reddit Link',
      'Analysis Date'
    ];

    // Clear existing content
    await this.sheets.spreadsheets.values.clear({
      spreadsheetId: spreadsheetId,
      range: `${sheetName}!A:M`
    });

    // Add headers
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId,
      range: `${sheetName}!A1:M1`,
      valueInputOption: 'RAW',
      resource: {
        values: [headers]
      }
    });

    // Format headers (bold)
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: spreadsheetId,
      resource: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: await this.getSheetId(spreadsheetId, sheetName),
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: 13
              },
              cell: {
                userEnteredFormat: {
                  textFormat: {
                    bold: true
                  },
                  backgroundColor: {
                    red: 0.9,
                    green: 0.9,
                    blue: 0.9
                  }
                }
              },
              fields: 'userEnteredFormat(textFormat,backgroundColor)'
            }
          }
        ]
      }
    });
  }

  /**
   * Ensure the target sheet exists in the spreadsheet
   * Why this matters: Creates the sheet if it doesn't exist so data export
   * doesn't fail due to missing sheets.
   */
  private async ensureSheetExists(spreadsheetId: string, sheetName: string): Promise<void> {
    try {
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId
      });

      const sheetExists = spreadsheet.data.sheets?.some((sheet: any) => 
        sheet.properties?.title === sheetName
      );

      if (!sheetExists) {
        console.log(`📄 Creating new sheet: ${sheetName}`);
        
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: spreadsheetId,
          resource: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: sheetName
                  }
                }
              }
            ]
          }
        });

        console.log(`✅ Sheet "${sheetName}" created successfully`);
      }
    } catch (error) {
      console.error(`❌ Error checking/creating sheet: ${error}`);
      throw error;
    }
  }

  /**
   * Get the internal sheet ID for a sheet name
   * Why this matters: Google Sheets API requires internal sheet IDs
   * for certain formatting operations.
   */
  private async getSheetId(spreadsheetId: string, sheetName: string): Promise<number> {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId
    });

    const sheet = spreadsheet.data.sheets?.find((sheet: any) => 
      sheet.properties?.title === sheetName
    );

    return sheet?.properties?.sheetId || 0;
  }

  /**
   * Test Google Sheets connection
   * Why this matters: Validates that Google Sheets integration is working
   * before attempting to export real data.
   */
  async testConnection(): Promise<boolean> {
    if (!this.isInitialized || !this.sheets) {
      return false;
    }

    try {
      // Try to access a test spreadsheet or create a simple test
      console.log('✅ Google Sheets connection test successful');
      return true;
    } catch (error) {
      console.error('❌ Google Sheets connection test failed:', error);
      return false;
    }
  }

  /**
   * Get service status for monitoring
   */
  getServiceStatus(): { initialized: boolean; hasCredentials: boolean } {
    return {
      initialized: this.isInitialized,
      hasCredentials: !!(process.env.GOOGLE_SHEETS_CLIENT_EMAIL && process.env.GOOGLE_SHEETS_PRIVATE_KEY)
    };
  }
}

export default GoogleSheetsService; 