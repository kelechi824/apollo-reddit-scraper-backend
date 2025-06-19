// API Response Types
export interface HealthCheckResponse {
  status: 'OK' | 'ERROR';
  message: string;
  timestamp: string;
}

export interface ApiInfoResponse {
  name: string;
  version: string;
  description: string;
  documentation: {
    health: string;
    info: string;
    endpoints: {
      reddit: string;
      analysis: string;
      sheets: string;
    };
  };
}

// Reddit Types
export interface RedditPost {
  id: string;
  title: string;
  content: string;
  score: number;
  comments: number;
  subreddit: string;
  url: string;
  permalink: string;
  author: string;
  engagement: number;
  created_utc: number;
}

export interface RedditSearchRequest {
  keywords: string[];
  subreddits: string[];
  limit?: number;
  timeframe?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  sort?: 'relevance' | 'hot' | 'top' | 'new' | 'comments';
}

export interface RedditSearchResponse {
  posts: RedditPost[];
  total_found: number;
  keywords_used: string;
  subreddits_used: string;
  search_timestamp: string;
}

// OpenAI Analysis Types
export interface ContentAnalysisRequest {
  posts: RedditPost[];
  keywords_used: string;
  subreddits_used: string;
}

export interface ContentAnalysisResult {
  pain_point: string;
  audience_insight: string;
  content_opportunity: string;
  urgency_level: 'high' | 'medium' | 'low';
  target_demographic: string;
}

export interface AnalyzedPost extends RedditPost {
  analysis: ContentAnalysisResult;
  post_rank: number;
  analysis_timestamp: string;
}

// Google Sheets Types
export interface SheetsExportRequest {
  analyzed_posts: AnalyzedPost[];
  spreadsheet_id: string;
  sheet_name?: string;
}

export interface SheetsExportResponse {
  success: boolean;
  rows_added: number;
  spreadsheet_url: string;
  export_timestamp: string;
}

// Environment Variables Types
export interface EnvironmentConfig {
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  REDDIT_CLIENT_ID: string;
  REDDIT_CLIENT_SECRET: string;
  REDDIT_USER_AGENT: string;
  REDDIT_REDIRECT_URI: string;
  OPENAI_API_KEY: string;
  GOOGLE_SHEETS_CLIENT_EMAIL?: string;
  GOOGLE_SHEETS_PRIVATE_KEY?: string;
  GOOGLE_SHEETS_SPREADSHEET_ID?: string;
}

// Error Types
export interface ApiError {
  error: string;
  message: string;
  status: number;
  timestamp: string;
}

// Workflow Types
export interface WorkflowRequest {
  keywords: string[];
  subreddits: string[];
  limit?: number;
  export_to_sheets?: {
    spreadsheet_id: string;
    sheet_name?: string;
  };
}

export interface WorkflowResponse {
  success: boolean;
  reddit_results: RedditSearchResponse;
  analyzed_posts: AnalyzedPost[];
  sheets_export?: SheetsExportResponse;
  workflow_id: string;
  completed_at: string;
} 