# Apollo's Reddit Prospecting & Content Generation Tool

Backend API for Apollo Reddit Content Creator, a content analysis tool that identifies pain points, audience insights, and content opportunities from Reddit discussions, with AI-powered content generation capabilities.

## 🚀 Features

- **Express Server**: RESTful API with CORS enabled
- **Reddit Integration**: OAuth flow and post searching via snoowrap
- **AI Analysis**: OpenAI GPT-4 for business intelligence analysis
- **Claude Content Generation**: Claude Sonnet 4 for SEO-optimized content creation
- **Chat Interface**: Socratic learning conversations for sales discovery and Reddit conversation starter
- **Environment Config**: Secure credential management

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js 5.1.0
- **Reddit API**: snoowrap 1.23.0
- **AI**: OpenAI API 5.5.1
- **Claude API**: Anthropic Claude Sonnet 4
- **HTTP Client**: Axios 1.10.0
- **Environment**: dotenv 16.5.0

## 📋 Setup Instructions

### Prerequisites
- Node.js 18+
- Reddit App credentials
- OpenAI API key
- Claude API key

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/kelechi824/apollo-reddit-scraper-backend.git
   cd apollo-reddit-scraper-backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

Server runs on http://localhost:3003

## 🔑 Environment Variables

```env
# Reddit App Credentials
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret
REDDIT_USER_AGENT=Apollo-Reddit-Scraper/1.0.0

# OpenAI for Business Analysis
OPENAI_API_KEY=your_openai_api_key

# Claude API for Content Generation & Chat
CLAUDE_API_KEY=your_claude_api_key

# Server
PORT=3003
NODE_ENV=development
```

## 🔗 API Endpoints

### Health & Info
- `GET /health` - Backend health status
- `GET /` - API information

### Reddit Search
- `POST /api/reddit/search` - Search Reddit posts by keywords and subreddits
- `GET /api/reddit/status` - Get Reddit service status

### AI Analysis
- `POST /api/analysis/analyze-posts` - Analyze posts with OpenAI for business insights
- `GET /api/analysis/status` - Check OpenAI service status
- `GET /api/analysis/test` - Test OpenAI connection

### Content Generation
- `POST /api/content/generate` - Generate SEO-optimized content using Claude Sonnet 4
- Supports LinkedIn posts, blog articles, and custom content types

### Chat & Discovery
- `POST /api/chat/start-conversation` - Start socratic learning conversation
- `POST /api/chat/message` - Send message and get AI response
- `GET /api/chat/conversation/:id` - Retrieve conversation history
- `GET /api/chat/status` - Check Claude service status
- `GET /api/chat/test` - Test Claude connection

### Workflow Orchestration
- `POST /api/workflow/run-analysis` - Complete Reddit → OpenAI analysis pipeline
- `GET /api/workflow/status` - Check all services status

## 📊 API Response Examples

### Health Check
```json
{
  "status": "OK",
  "message": "Apollo Reddit Scraper Backend is running",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Content Generation Response
```json
{
  "success": true,
  "content": ["Generated content variations..."],
  "title": "SEO-Optimized Title",
  "description": "Meta description",
  "generated_at": "2024-01-01T12:00:00.000Z"
}
```

## 🚦 Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests (placeholder)

## 🎯 Development Status

### Completed ✅
- [x] Express server setup with TypeScript
- [x] CORS configuration and environment management
- [x] Reddit OAuth and search functionality
- [x] OpenAI integration for business analysis
- [x] Claude Sonnet 4 integration for content generation
- [x] Chat interface for socratic learning discovery
- [x] Workflow orchestration and health monitoring
- [x] Complete end-to-end pipeline functionality

### Todo 📝
- [ ] Rate limiting enhancements
- [ ] Advanced caching strategies
- [ ] Performance monitoring
- [ ] Unit and integration tests

## 🔧 Development

### Project Structure
```
├── api/
│   └── index.ts          # Vercel serverless entry point
├── src/
│   ├── routes/           # API route handlers
│   │   ├── reddit.ts     # Reddit search endpoints
│   │   ├── analysis.ts   # OpenAI analysis endpoints
│   │   ├── content.ts    # Claude content generation
│   │   ├── chat.ts       # Chat and discovery endpoints
│   │   └── workflow.ts   # Orchestration endpoints
│   ├── services/         # Business logic services
│   │   ├── redditService.ts      # Reddit API integration
│   │   ├── openaiService.ts      # OpenAI business analysis
│   │   └── claudeService.ts      # Claude content generation
│   ├── types/            # TypeScript type definitions
│   └── server.ts         # Express server configuration
├── package.json          # Dependencies and scripts
└── vercel.json          # Vercel deployment config
```

### Key Features

#### Reddit Integration
- OAuth authentication flow
- Advanced post searching with filters
- High-engagement post discovery
- Rate limiting and error handling

#### AI-Powered Analysis
- OpenAI GPT-4 business intelligence extraction
- Pain point identification
- Audience insight analysis
- Content opportunity mapping

#### Content Generation
- Claude Sonnet 4 for high-quality content creation
- SEO-optimized article generation
- LinkedIn thought leadership posts
- Brand kit variable integration

#### Chat Discovery
- Socratic methodology for sales discovery
- Apollo solution positioning
- Conversation stage tracking
- Multi-persona engagement strategies

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -m 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit a Pull Request

## 📄 License

ISC

## 🔗 Related

- [Frontend Repository](https://github.com/kelechi824/apollo-reddit-scraper-frontend)
- [Apollo.io](https://apollo.io) 
# Force deployment - Tue Jul 15 14:42:24 CDT 2025
