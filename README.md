# Apollo Reddit Scraper - Backend API

Backend API for Apollo Reddit Scraper, a content analysis tool that identifies pain points, audience insights, and content opportunities from Reddit discussions.

## 🚀 Features

- **Express Server**: RESTful API with CORS enabled
- **Reddit Integration**: OAuth flow and post searching via snoowrap
- **OpenAI Analysis**: Content analysis for insights and opportunities
- **Google Sheets Export**: Automated data export to spreadsheets
- **Environment Config**: Secure credential management

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js 5.1.0
- **Reddit API**: snoowrap 1.23.0
- **AI**: OpenAI API 5.5.1
- **Sheets**: Google APIs 150.0.1
- **HTTP Client**: Axios 1.10.0
- **Environment**: dotenv 16.5.0

## 📋 Setup Instructions

### Prerequisites
- Node.js 18+
- Reddit App credentials
- OpenAI API key
- Google Sheets service account (optional)

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

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Google Sheets (optional)
GOOGLE_SHEETS_CLIENT_EMAIL=your_service_account_email
GOOGLE_SHEETS_PRIVATE_KEY=your_private_key
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id

# Server
PORT=3003
NODE_ENV=development
```

## 🔗 API Endpoints

### Health & Info
- `GET /health` - Backend health status
- `GET /` - API information

### Reddit (Coming Soon)
- `GET /auth/reddit` - Initiate Reddit OAuth
- `GET /auth/reddit/callback` - Handle OAuth callback
- `POST /api/reddit/search` - Search Reddit posts

### Analysis (Coming Soon)
- `POST /api/analysis/analyze-posts` - Analyze posts with OpenAI

### Sheets (Coming Soon)
- `POST /api/sheets/save-results` - Save results to Google Sheets

## 📊 API Response Examples

### Health Check
```json
{
  "status": "OK",
  "message": "Apollo Reddit Scraper Backend is running",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### API Info
```json
{
  "name": "Apollo Reddit Scraper API",
  "version": "1.0.0",
  "description": "Backend API for Reddit content analysis and insights"
}
```

## 🚦 Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests (placeholder)

## 🎯 Development Status

### Completed ✅
- [x] Express server setup
- [x] CORS configuration
- [x] Environment management
- [x] Health check endpoints
- [x] Package dependencies

### In Progress 🚧
- [ ] Reddit OAuth implementation
- [ ] Reddit search functionality
- [ ] OpenAI integration
- [ ] Google Sheets integration

### Todo 📝
- [ ] Error handling middleware
- [ ] Rate limiting
- [ ] Request validation
- [ ] Logging system
- [ ] Unit tests

## 🔧 Development

### Project Structure
```
├── server.js          # Main Express server
├── package.json       # Dependencies and scripts
├── .env.example       # Environment template
├── .gitignore        # Git ignore rules
└── README.md         # This file
```

### Adding New Endpoints
1. Create route handlers in `server.js`
2. Add middleware as needed
3. Update this documentation
4. Test with frontend integration

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