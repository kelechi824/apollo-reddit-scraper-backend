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
    workflow: string;
    chat: string;
    content: string;
    playbooks: string;
    blogCreator: string;
    cro: string;
    gongAnalysis: string;
    gongChat: string;
    screenshot: string;
    vocExtraction: string;
    articleExtraction: string;
    contentAnalysis: string;
    personaPainPointMatching: string;
    enhancedPersonaDetection: string;
    ctaGeneration: string;
    competitorConquesting: string;
    sitemap: string;
    sitemapChunked: string;
  };
  };
}

// Gong Analysis Types
export interface GongAnalysisRequest {
  daysBack: number;
  limit: number;
  sentiment?: 'positive' | 'negative' | 'all';
}

export interface GongAnalyzedCall {
  id: string;
  title: string;
  date: string;
  duration: number;
  participants: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  analysis: {
    callSummary: string;
    painPoints: ExtractedPainPoint[];
    croOpportunity: {
      adCopyIdeas: string[];
      googleAdsHeadlines: string[];
      googleAdsDescriptions: string[];
      landingPageRecommendations: string[];
    };
  };
  highlights: any;
  extensive_data: any;
  call_rank: number;
  analysis_timestamp: string;
}

export interface GongAnalysisResponse {
  success: boolean;
  analyzed_calls: GongAnalyzedCall[];
  cro_content?: CROContentGenerationResult;
  analysis_metadata: {
    total_calls_found: number;
    total_calls_analyzed: number;
    sentiment_filter_applied: string;
    date_range: {
      days_back: number;
      start_date: string;
      end_date: string;
    };
    analysis_timestamp: string;
    processing_time_ms: number;
  };
  errors?: string[];
}

// CRO Content Generation Types
export interface CROContentGenerationResult {
  googleAdsContent: GoogleAdsContent;
  landingPageRecommendations: LandingPageCopyRecommendations;
  abTestingSuggestions: ABTestingSuggestions;
  generationMetadata: {
    callsAnalyzed: number;
    painPointsConsidered: number;
    customerPhrasesUsed: number;
    generationTimestamp: string;
    processingTimeMs: number;
  };
}

export interface GoogleAdsContent {
  headlines: Array<{
    id: string;
    text: string;
    characterCount: number;
    painPointsAddressed: string[];
    emotionalTrigger: string;
    customerLanguageUsed: string[];
    performancePrediction: 'high' | 'medium' | 'low';
  }>;
  descriptions: Array<{
    id: string;
    text: string;
    characterCount: number;
    painPointsAddressed: string[];
    callToAction: string;
    trustSignals: string[];
    flowsWithHeadlines: string[];
  }>;
}

export interface LandingPageCopyRecommendations {
  heroSection: {
    headline: string;
    subheadline: string;
    ctaButton: string;
    painPointsAddressed: string[];
  };
  trustSignals: Array<{
    type: 'testimonial' | 'guarantee' | 'certification' | 'social_proof';
    content: string;
    placement: string;
  }>;
  formOptimizations: Array<{
    issue: string;
    recommendation: string;
    expectedImpact: string;
  }>;
  copyImprovements: Array<{
    section: string;
    currentIssue: string;
    improvedCopy: string;
    reasonForChange: string;
  }>;
}

export interface ABTestingSuggestions {
  headlines: Array<{
    testName: string;
    variant: string;
    hypothesis: string;
    expectedOutcome: string;
    painPointAddressed: string;
  }>;
  ctas: Array<{
    testName: string;
    variant: string;
    hypothesis: string;
    expectedOutcome: string;
  }>;
  formElements: Array<{
    testName: string;
    element: string;
    variant: string;
    hypothesis: string;
    expectedOutcome: string;
  }>;
  trustElements: Array<{
    testName: string;
    element: string;
    variant: string;
    hypothesis: string;
    expectedOutcome: string;
  }>;
}

export interface LandingPageAnalysisRequest {
  url: string;
  callInsights: GongAnalyzedCall[];
}

export interface LandingPageAnalysisResult {
  url: string;
  screenshot: {
    id: string;
    url: string;
    screenshotPath: string;
    timestamp: Date;
    viewport: {
      width: number;
      height: number;
    };
    pageTitle?: string;
    error?: string;
  };
  extractedContent: {
    title: string;
    headings: string[];
    bodyText: string;
    buttonTexts: string[];
    links: string[];
    metaDescription?: string;
  };
  croRecommendations: {
    headlineImprovements: string[];
    copyImprovements: string[];
    googleAdsVariations: {
      headlines: string[];
      descriptions: string[];
    };
    conversionOptimizations: string[];
  };
  analysisMetadata: {
    totalCallsAnalyzed: number;
    painPointsConsidered: number;
    customerPhrasesUsed: number;
    analysisTimestamp: string;
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
  timeframe?: 'recent' | 'older' | 'hour' | 'day' | 'week' | 'month' | 'year';
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
  timeframe?: 'recent' | 'older' | 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
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

// Chat Types for "Dig Deeper" Feature
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatConversation {
  id: string;
  reddit_post_context: {
    post_id: string;
    title: string;
    content: string;
    pain_point: string;
    audience_insight: string;
  };
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
  status: 'active' | 'completed' | 'expired';
}

export interface StartConversationRequest {
  post_id: string;
  title: string;
  content: string;
  pain_point: string;
  audience_insight: string;
}

export interface StartConversationResponse {
  conversation_id: string;
  initial_message: ChatMessage;
}

export interface SendMessageRequest {
  conversation_id: string;
  message: string;
}

export interface SendMessageResponse {
  user_message: ChatMessage;
  assistant_message: ChatMessage;
  conversation_stage?: string;
}

// Gong Chat Types for CRO Conversations
export interface GongChatConversation {
  id: string;
  gong_call_context: {
    call_id: string;
    title: string;
    date: string;
    duration: number;
    participants: string[];
    sentiment: 'positive' | 'negative' | 'neutral';
    callSummary: string;
    painPoints: ExtractedPainPoint[];
    croOpportunity: {
      adCopyIdeas: string[];
      googleAdsHeadlines: string[];
      googleAdsDescriptions: string[];
      landingPageRecommendations: string[];
    };
  };
  messages: ChatMessage[];
  conversation_stage: string;
  created_at: string;
  updated_at: string;
  status: 'active' | 'completed' | 'expired';
}

export interface StartGongConversationRequest {
  call_id: string;
  title: string;
  date: string;
  duration: number;
  participants: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  callSummary: string;
  painPoints: ExtractedPainPoint[];
  croOpportunity: {
    adCopyIdeas: string[];
    googleAdsHeadlines: string[];
    googleAdsDescriptions: string[];
    landingPageRecommendations: string[];
  };
}

export interface StartGongConversationResponse {
  conversation_id: string;
  initial_message: ChatMessage;
}

export interface SendGongMessageRequest {
  conversation_id: string;
  message: string;
}

export interface SendGongMessageResponse {
  user_message: ChatMessage;
  assistant_message: ChatMessage;
  conversation_stage?: string;
}

// Gong API Types
export interface GongUser {
  id: string;
  emailAddress: string;
  firstName: string;
  lastName: string;
  active: boolean;
  created: string;
}

export interface GongCall {
  id: string;
  title: string;
  started: string;
  primaryUserId: string;
  actualStart: string;
  direction: 'Inbound' | 'Outbound' | 'Conference' | 'Unknown';
  participants: GongParticipant[];
  duration?: number;
  customData?: any;
}

export interface GongParticipant {
  userId?: string;
  name?: string;
  emailAddress?: string;
  phoneNumber?: string;
  mediaChannelId?: number;
}

export interface GongTranscript {
  callId: string;
  transcript: Array<{
    speakerId: string;
    topic: string;
    sentences: Array<{
      start: number;
      end: number;
      text: string;
    }>;
  }>;
}

export interface GongCallsResponse {
  records: {
    totalRecords: number;
    currentPageSize: number;
    currentPageNumber: number;
    cursor?: string;
  };
  calls: GongCall[];
}

export interface GongUsersResponse {
  records: {
    totalRecords: number;
    currentPageSize: number;
    currentPageNumber: number;
    cursor?: string;
  };
  users: GongUser[];
}

// Pain Point Analysis Types
export interface ExtractedPainPoint {
  id: string;
  text: string;
  category: 'manual_tasks' | 'data_quality' | 'deliverability' | 'compliance' | 'integration' | 'cost' | 'other';
  emotionalTrigger: 'frustration' | 'anxiety' | 'excitement' | 'relief' | 'fear' | 'neutral';
  frequency: number;
  confidence: number; // 0-1 score
  callId: string;
  speakerId: string;
  timestamp?: number;
}

export interface CustomerPhrase {
  id: string;
  phrase: string;
  frequency: number;
  category: string;
  context: 'early_call' | 'mid_call' | 'late_call' | 'objection' | 'excitement';
  callIds: string[];
}

export interface CallAnalysisResult {
  callId: string;
  callTitle: string;
  callDate: string;
  painPoints: ExtractedPainPoint[];
  customerPhrases: CustomerPhrase[];
  speakers: {
    id: string;
    name?: string;
    role: 'prospect' | 'sales_rep' | 'unknown';
  }[];
  summary: string;
  competitorMentions?: string[];
} 

// Copy Analysis Types for CRO
export interface PageTextContent {
  title: string;
  headings: string[];
  bodyText: string;
  buttonTexts: string[];
  links: string[];
  metaDescription?: string;
}

export interface CopyAnalysisResult {
  id: string;
  url: string;
  pageContent: PageTextContent;
  painPointAlignment: {
    painPoint: ExtractedPainPoint;
    relevanceScore: number;
    recommendations: string[];
  }[];
  customerLanguageGaps: {
    missingPhrase: CustomerPhrase;
    suggestedPlacement: string;
    impact: 'high' | 'medium' | 'low';
  }[];
  overallScore: number;
  keyRecommendations: string[];
  timestamp: Date;
} 