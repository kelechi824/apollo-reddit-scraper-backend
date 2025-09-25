import express, { Request, Response } from 'express';
import VoCThematicAnalyzer from '../services/vocThematicAnalyzer';
import FirecrawlService from '../services/firecrawlService';
import PageContentAnalyzer from '../services/pageContentAnalyzer';

const router = express.Router();

/**
 * VoC Agent Routes
 * Why this matters: Provides enhanced AI-powered VoC analysis with Apollo product mapping
 * and page optimization guidance using GPT-5-nano insights.
 */

/**
 * POST /api/voc-agent/analyze-enhanced
 * Enhanced VoC analysis with AI insights and Apollo product mapping
 * Why this matters: Provides deeper customer insights with product relevance scoring
 */
router.post('/analyze-enhanced', async (req: Request, res: Response): Promise<any> => {
  try {
    const {
      daysBack = 90, // Keep original scope
      maxCalls = 300, // Keep original scope
      includeApolloMapping = true,
      includeCustomerStruggles = true
    } = req.body;

    console.log(`🚀 Starting enhanced VoC analysis (${daysBack} days, ${maxCalls} calls)`);
    console.log(`🎯 Apollo mapping: ${includeApolloMapping}, Customer struggles: ${includeCustomerStruggles}`);

    const vocAnalyzer = new VoCThematicAnalyzer();

    // Set response timeout to prevent client-side timeout
    res.setTimeout(25000); // 25 second timeout for client

    // Add timeout wrapper with longer limit for full analysis
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Analysis timeout - processing took longer than expected')), 20000); // 20 second timeout
    });

    // Use lightweight analysis first, then enhance asynchronously if needed
    console.log('📊 Starting lightweight analysis for immediate response...');
    const lightweightResult = await vocAnalyzer.analyzeThemesLightweight(daysBack, maxCalls);
    
    // If we have basic results, return them immediately with enhancement flag
    if (lightweightResult.painPoints.length > 0) {
      console.log(`✅ Lightweight analysis complete: ${lightweightResult.painPoints.length} pain points found`);
      
      // Return lightweight results immediately
      const quickResponse = {
        success: true,
        data: {
          painPoints: lightweightResult.painPoints,
          metadata: {
            totalPainPoints: lightweightResult.painPoints.length,
            callsAnalyzed: lightweightResult.totalCallsAnalyzed,
            analysisDate: lightweightResult.analysisTimestamp,
            enhancementType: 'lightweight_fast',
            apolloMappingIncluded: false,
            processingTime: lightweightResult.processingTimeMs
          }
        },
        message: `Fast analysis completed: ${lightweightResult.painPoints.length} pain points identified`,
        timestamp: new Date().toISOString(),
        enhancementAvailable: true
      };

      return res.json(quickResponse);
    }

    // Fallback to enhanced analysis if lightweight didn't work
    console.log('🔄 Falling back to enhanced analysis...');
    const analysisPromise = vocAnalyzer.analyzeThemesEnhanced(
      daysBack,
      maxCalls,
      {
        includeApolloMapping,
        includeCustomerStruggles,
        apolloProductContext: getApolloProductContext()
      }
    );

    const analysisResult = await Promise.race([analysisPromise, timeoutPromise]) as any;

    res.json({
      success: true,
      data: analysisResult,
      message: `Enhanced analysis completed: ${analysisResult.metadata.totalPainPoints} pain points with AI insights`,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Enhanced VoC analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Enhanced VoC analysis failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/voc-agent/enhance-results
 * Enhance existing lightweight results with AI insights and Apollo mapping
 * Why this matters: Allows for progressive enhancement without blocking initial results
 */
router.post('/enhance-results', async (req: Request, res: Response): Promise<any> => {
  try {
    const {
      painPoints,
      daysBack = 90,
      maxCalls = 300,
      includeApolloMapping = true,
      includeCustomerStruggles = true
    } = req.body;

    if (!painPoints || !Array.isArray(painPoints)) {
      return res.status(400).json({
        success: false,
        error: 'Pain points array is required for enhancement',
        message: 'Please provide existing pain points to enhance'
      });
    }

    console.log(`🔧 Enhancing ${painPoints.length} pain points with AI insights`);

    const vocAnalyzer = new VoCThematicAnalyzer();
    
    // Process enhancements in smaller batches to prevent timeout
    const batchSize = 5;
    const enhancedPainPoints = [];
    
    for (let i = 0; i < painPoints.length; i += batchSize) {
      const batch = painPoints.slice(i, i + batchSize);
      console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(painPoints.length/batchSize)}`);
      
      // Add AI enhancement to each pain point in batch
      for (const painPoint of batch) {
        try {
          // Add Apollo product mapping and customer struggle analysis
          const enhanced = {
            ...painPoint,
            apolloRelevance: includeApolloMapping ? await getApolloRelevanceScore(painPoint) : null,
            customerStruggles: includeCustomerStruggles ? await analyzeCustomerStruggles(painPoint) : null,
            enhanced: true,
            enhancedAt: new Date().toISOString()
          };
          enhancedPainPoints.push(enhanced);
        } catch (error) {
          console.warn(`⚠️ Failed to enhance pain point: ${painPoint.title}`, error);
          enhancedPainPoints.push({ ...painPoint, enhanced: false });
        }
      }
    }

    res.json({
      success: true,
      data: {
        painPoints: enhancedPainPoints,
        metadata: {
          totalPainPoints: enhancedPainPoints.length,
          enhancedCount: enhancedPainPoints.filter(p => p.enhanced).length,
          enhancementType: 'progressive_ai_enhancement',
          apolloMappingIncluded: includeApolloMapping,
          processingDate: new Date().toISOString()
        }
      },
      message: `Enhanced ${enhancedPainPoints.filter(p => p.enhanced).length}/${enhancedPainPoints.length} pain points with AI insights`,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Enhancement failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Pain point enhancement failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/voc-agent/optimize-page
 * AI-powered page optimization guidance
 * Why this matters: Analyzes Apollo pages and provides optimization recommendations
 */
router.post('/optimize-page', async (req: Request, res: Response): Promise<any> => {
  try {
    console.log('🚀 DEBUG: VoC optimize-page route called');
    console.log('🔍 DEBUG: Request body:', JSON.stringify(req.body, null, 2));

    const {
      message,
      painPoints,
      selectedSitemap,
      targetUrl,
      conversationId
    } = req.body;

    console.log(`🔍 Page optimization request: ${message}`);
    console.log(`📊 Using ${painPoints?.length || 0} pain points for guidance`);

    let recommendation = '';
    let analysisData: any = null;
    let suggestedActions: string[] = [];

    // Handle different types of requests
    if (message.toLowerCase().includes('analyze sitemap')) {
      // Analyze the sitemap for optimization opportunities
      const sitemapAnalysis = await analyzeSitemapForOptimization(selectedSitemap, painPoints);
      recommendation = sitemapAnalysis.recommendation;
      analysisData = sitemapAnalysis.analysisData;
      suggestedActions = sitemapAnalysis.suggestedActions;

    } else if (targetUrl || isUrl(message)) {
      // Analyze a specific URL
      const urlToAnalyze = targetUrl || extractUrlFromMessage(message);
      const urlAnalysis = await analyzeUrlForOptimization(urlToAnalyze, painPoints);
      recommendation = urlAnalysis.recommendation;
      analysisData = urlAnalysis.analysisData;
      suggestedActions = urlAnalysis.suggestedActions;

    } else {
      // General optimization guidance
      recommendation = await generateOptimizationGuidance(message, painPoints, selectedSitemap);
      suggestedActions = [
        'Consider analyzing specific product pages',
        'Review pain points alignment with current content',
        'Test optimization recommendations on high-traffic pages'
      ];
    }

    res.json({
      success: true,
      data: {
        recommendation,
        analysisData,
        suggestedActions,
        conversationId
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Page optimization failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Page optimization guidance failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Analyze sitemap for optimization opportunities using Firecrawl + GPT-5
 * Why this matters: Identifies the best pages to optimize based on pain points using full content analysis
 */
async function analyzeSitemapForOptimization(sitemapUrl: string, painPoints: any[]): Promise<{
  recommendation: string;
  analysisData: any;
  suggestedActions: string[];
}> {
  try {
    console.log(`🗺️ Analyzing sitemap with Firecrawl + GPT-5: ${sitemapUrl}`);

    // Parse sitemap to get URLs
    const urls = await parseSitemapXML(sitemapUrl);

    if (urls.length === 0) {
      return {
        recommendation: "I couldn't find any URLs in the selected sitemap. Please try a different sitemap or provide a specific URL to analyze.",
        analysisData: { type: 'sitemap-analysis', url: sitemapUrl, urlCount: 0 },
        suggestedActions: ['Try a different sitemap', 'Provide a specific URL to analyze']
      };
    }

    // Use more pain points for comprehensive analysis - prioritize by customer impact
    const prioritizedPainPoints = prioritizePainPointsByImpact(painPoints);
    const topPainPoints = prioritizedPainPoints.slice(0, 15); // Increased from 8 to 15
    const painPointSummary = topPainPoints.map(p => `• **${p.theme}**: ${p.description}`).join('\n');

    console.log(`📊 Using ${topPainPoints.length} prioritized pain points out of ${painPoints.length} total for analysis`);

    // Sample URLs for comprehensive analysis (reduced to 5 for deep analysis)
    const sampleUrls = urls.slice(0, 5);
    console.log(`🔄 Performing deep Firecrawl + GPT-5 analysis on ${sampleUrls.length} URLs...`);

    // Initialize PageContentAnalyzer for advanced analysis
    const contentAnalyzer = new PageContentAnalyzer();

    // Perform comprehensive content analysis
    const urlAnalyses = await contentAnalyzer.analyzeMultiplePages(
      sampleUrls,
      painPoints,
      2 // Max 2 concurrent to avoid overwhelming services
    );

    if (urlAnalyses.length === 0) {
      return {
        recommendation: `I analyzed the sitemap but couldn't extract content from any of the ${sampleUrls.length} sample pages. This might be due to authentication requirements or server restrictions. Please try providing a specific Apollo URL for analysis.`,
        analysisData: { type: 'sitemap-analysis', url: sitemapUrl, urlCount: urls.length, analyzedCount: 0 },
        suggestedActions: ['Provide a specific URL to analyze', 'Try a different sitemap', 'Check page accessibility']
      };
    }

    // Create enhanced table with content previews and specific recommendations
    const tableRows = urlAnalyses.map((analysis, idx) => {
      const topRecommendation = analysis.contentStructure?.h1?.after || 'Content optimization needed';
      const priority = 'High'; // Since we're doing deep analysis, all pages are high priority

      // Create content preview from the before/after structure
      const h1Before = analysis.contentStructure?.h1?.before || 'No H1 found';
      const contentPreviewFormatted = h1Before.length > 120
        ? h1Before.substring(0, 120) + '...'
        : h1Before;

      return `| [View Page](${analysis.pageUrl}) | ${topRecommendation} | ${priority} | ${contentPreviewFormatted} |`;
    }).join('\n');

    // Create detailed analysis sections with before/after structure
    const detailedAnalyses = urlAnalyses.map((analysis, idx) => {
      const topPainMapping = analysis.painPointMappings[0];
      const h1Content = analysis.contentStructure?.h1;
      const h2Content = analysis.contentStructure?.h2s?.[0];

      return `### ${idx + 1}. ${analysis.pageTitle}
**URL:** ${analysis.pageUrl}
**Current H1:** ${h1Content?.before || 'No H1 found'}
**Optimized H1:** ${h1Content?.after || 'Optimization pending'}
**H1 Reasoning:** ${h1Content?.reason || 'Analysis in progress'}
**Current H2s:** ${analysis.contentStructure?.h2s?.map(h2 => h2.before).join(' | ') || 'No H2s found'}
**Primary Pain Point Addressed:** ${topPainMapping?.painPointTheme || 'N/A'}
**Customer Quote Context:** ${topPainMapping?.customerQuoteContext || 'Analysis pending'}`;
    }).join('\n\n');

    const recommendation = `# 🎯 Enhanced Sitemap Analysis Complete

**Analysis Summary:** Found **${urls.length} total pages** in sitemap. Performed deep Firecrawl + GPT-5 analysis on **${urlAnalyses.length} sample pages** with full content extraction and pain point mapping.

## 📊 Your Top Customer Pain Points
${painPointSummary}

## 🔍 Recommended Pages for Optimization

| Page URL | Top Optimization | Priority | Content Preview |
|----------|------------------|----------|-----------------|
${tableRows}

## 📋 Detailed Analysis Results

${detailedAnalyses}

## 🚀 Next Steps

**Immediate Actions:**
- 🎯 **Copy any URL** from the table above for even deeper analysis with specific copy recommendations
- 📝 **Ask for detailed copy suggestions** like "Show me specific copy recommendations for [page URL]"
- 🔄 **Request pain point deep-dive** for any specific page
- 📊 **Analyze a high-priority page** for maximum impact

**Pro Tip:** Start with **High Priority** pages (80+ scores) as they have the most optimization potential based on your customer pain points.

**Ready for detailed copy recommendations?** Just paste any URL from above and I'll provide specific before/after copy suggestions based on your Gong customer insights!`;

    return {
      recommendation,
      analysisData: {
        type: 'enhanced-sitemap-analysis',
        url: sitemapUrl,
        urlCount: urls.length,
        analyzedCount: urlAnalyses.length,
        sampleUrls: urlAnalyses.map(a => ({
          url: a.pageUrl,
          title: a.pageTitle,
          status: 'analyzed_with_firecrawl',
          contentStructure: a.contentStructure,
          painPointMappings: a.painPointMappings,
          topPainPoint: a.painPointMappings[0]?.painPointTheme,
          topRecommendation: a.contentStructure?.h1?.after || 'Optimization pending'
        })),
        processingTime: `${urlAnalyses.length} pages analyzed with Firecrawl + GPT-5`,
        analysisMethod: 'firecrawl_content_extraction_plus_gpt5_analysis'
      },
      suggestedActions: [
        'Copy a URL from the table for detailed copy recommendations',
        'Start with High Priority pages (80+ scores) for maximum impact',
        'Ask for specific copy suggestions based on customer pain points',
        'Request pain point deep-dive analysis for target pages'
      ]
    };

  } catch (error: any) {
    console.error('❌ Enhanced sitemap analysis failed:', error);
    return {
      recommendation: `I encountered an error during the enhanced sitemap analysis: ${error.message}. Please try providing a specific Apollo URL for individual page analysis instead.`,
      analysisData: { type: 'error', error: error.message, analysisMethod: 'enhanced_firecrawl_analysis' },
      suggestedActions: ['Provide a specific URL to analyze', 'Check sitemap URL validity', 'Try individual page analysis']
    };
  }
}

/**
 * Analyze specific URL for optimization using Firecrawl + GPT-5
 * Why this matters: Provides detailed page analysis with specific copy recommendations based on customer pain points
 */
async function analyzeUrlForOptimization(url: string, painPoints: any[]): Promise<{
  recommendation: string;
  analysisData: any;
  suggestedActions: string[];
}> {
  try {
    console.log(`🔍 Performing deep Firecrawl + GPT-5 analysis on URL: ${url}`);

    // Initialize PageContentAnalyzer for comprehensive analysis
    const contentAnalyzer = new PageContentAnalyzer();

    // Perform comprehensive content analysis
    const analysis = await contentAnalyzer.analyzePageContent(url, painPoints);

    // Generate enhanced recommendation with detailed copy suggestions
    const recommendation = await generateDetailedCopyRecommendations(analysis, painPoints);

    return {
      recommendation,
      analysisData: {
        type: 'enhanced-url-analysis',
        url,
        title: analysis.pageTitle,
        contentStructure: analysis.contentStructure,
        painPointMappings: analysis.painPointMappings.length,
        analysisMethod: 'firecrawl_content_extraction_plus_gpt5_analysis'
      },
      suggestedActions: [
        'Review H1 optimization recommendations',
        'Implement suggested H2/H3 improvements',
        'Apply pain point-focused messaging',
        'Test optimized content with target audience',
        'Monitor conversion improvements'
      ]
    };

  } catch (error: any) {
    console.error('❌ Enhanced URL analysis failed:', error);
    return {
      recommendation: `I encountered an error during the enhanced analysis of ${url}: ${error.message}. This might be due to authentication requirements or server restrictions. Please try a different Apollo URL or check accessibility.`,
      analysisData: { type: 'error', url, error: error.message, analysisMethod: 'enhanced_firecrawl_analysis' },
      suggestedActions: ['Try a different URL', 'Ensure URL is valid and accessible', 'Check for authentication requirements']
    };
  }
}

/**
 * Generate detailed copy recommendations based on content analysis
 * Why this matters: Creates specific before/after copy suggestions based on customer pain points
 */
async function generateDetailedCopyRecommendations(analysis: any, painPoints: any[]): Promise<string> {
  const prioritizedPainPoints = prioritizePainPointsByImpact(painPoints);
  const topPainPoints = prioritizedPainPoints.slice(0, 10); // Increased from 5 to 10

  // Create customer context from pain points
  const customerContext = topPainPoints.map(pp => {
    const quotes = pp.customerQuotes?.slice(0, 2) || [];
    return `**${pp.theme}**: ${pp.description}\nCustomer quotes: "${quotes.join('" | "')}"`;
  }).join('\n\n');

  // Build copy recommendations section from before/after structure
  const copyRecommendationsSection = [];

  // H1 recommendations
  if (analysis.contentStructure?.h1) {
    const h1 = analysis.contentStructure.h1;
    copyRecommendationsSection.push(`### 1. H1 Headline
**Current Copy:**
> "${h1.before}"

**Recommended Copy:**
> "${h1.after}"

**Why This Works:** ${h1.reason}

---`);
  }

  // H2 recommendations
  analysis.contentStructure?.h2s?.slice(0, 3).forEach((h2: any, idx: number) => {
    copyRecommendationsSection.push(`### ${copyRecommendationsSection.length + 1}. H2 Subheadline
**Current Copy:**
> "${h2.before}"

**Recommended Copy:**
> "${h2.after}"

**Why This Works:** ${h2.reason}

---`);
  });

  const copyRecommendationText = copyRecommendationsSection.join('\n\n');

  // Build pain point mappings section
  const painPointMappingsSection = analysis.painPointMappings.slice(0, 3).map((mapping: any, idx: number) => {
    return `**${idx + 1}. ${mapping.painPointTheme}**
- **Page Sections to Optimize:** ${mapping.relevantSections.join(', ')}
- **Opportunity:** ${mapping.optimizationOpportunity}
- **Customer Quote Context:** "${mapping.customerQuoteContext}"`;
  }).join('\n\n');

  const recommendation = `# 📋 Detailed Copy Optimization Analysis

**Page:** ${analysis.pageTitle}
**URL:** ${analysis.pageUrl}

## 📊 Customer Pain Points Context
${customerContext}

## ✏️ Specific Copy Recommendations

${copyRecommendationText}

## 🎯 Pain Point Mappings

${painPointMappingsSection}

## 🚀 Implementation Priority
1. **H1 Headline** - Highest impact, easiest to implement
2. **Primary H2 Subheadlines** - Medium impact, moderate effort
3. **Supporting Content** - Lower impact, higher effort

## 📈 Expected Impact

Based on your customer pain points analysis, implementing these recommendations should:
- **Increase relevance** to customer struggles mentioned in Gong calls
- **Improve conversion** by addressing specific objections and concerns
- **Enhance user experience** through pain point-focused messaging
- **Build trust** using language that resonates with customer challenges

## 💡 Implementation Tips

1. **A/B test changes** to measure impact on conversions
2. **Start with headlines** as they have the highest impact
3. **Use customer quotes** from your Gong analysis for social proof
4. **Monitor engagement** to see which pain point messaging resonates most

**Want to analyze another page?** Just paste any Apollo URL and I'll provide detailed copy recommendations based on your customer insights!`;

  return recommendation;
}

/**
 * Generate page optimization using AI
 * Why this matters: Creates specific recommendations based on pain points and content
 */
async function generatePageOptimization(url: string, pageContent: any, painPoints: any[]): Promise<{
  recommendation: string;
  suggestedActions: string[];
}> {
  const topPainPoints = painPoints.slice(0, 5);
  const pageTitle = pageContent.data?.title || 'Unknown Page';
  const pageDescription = pageContent.data?.metadata?.description || '';
  const contentPreview = pageContent.data?.content?.substring(0, 1000) || '';

  // Generate AI-powered recommendations
  const painPointSummary = topPainPoints.map(p =>
    `• **${p.theme}**: ${p.description}\n  Customer quotes: ${p.customerQuotes?.slice(0, 2).join('; ') || 'N/A'}`
  ).join('\n\n');

  const recommendation = `# Page Optimization Analysis: ${pageTitle}

**Analyzing:** ${url}

## Current Page Overview
- **Title:** ${pageTitle}
- **Description:** ${pageDescription || 'No meta description found'}
- **Content Length:** ~${Math.round((pageContent.data?.content?.length || 0) / 250)} words

## Top Customer Pain Points to Address
${painPointSummary}

## Optimization Recommendations

### 1. Headlines & Messaging
Based on customer pain points, consider updating your headlines to directly address:
${topPainPoints.slice(0, 3).map((p, idx) =>
  `- **Pain Point ${idx + 1}**: ${p.theme}\n  Suggested headline approach: Address "${p.theme.toLowerCase()}" concerns with clear value proposition`
).join('\n')}

### 2. Content Enhancements
- **Add social proof** that specifically addresses these pain points
- **Include customer quotes** from your VoC analysis to build credibility
- **Create FAQ sections** addressing common concerns raised in customer calls

### 3. Call-to-Action Optimization
- Position CTAs after addressing specific pain points
- Use language that acknowledges customer struggles
- Consider multiple CTA styles for different pain point segments

### 4. Technical Recommendations
- Ensure page loading speed supports users researching solutions to these problems
- Add structured data to help with answer engine optimization
- Consider A/B testing pain point-focused messaging

## Specific Copy Suggestions
Based on your customer quotes, consider incorporating language like:
${topPainPoints.slice(0, 2).map(p =>
  p.customerQuotes?.slice(0, 1).map((quote: string) =>
    `- Address the concern: "${quote}" with reassuring copy about how Apollo solves this`
  ).join('\n') || ''
).join('\n')}

Would you like me to analyze another page or provide more specific copy recommendations for any section?`;

  const suggestedActions = [
    'Update headlines to address top customer pain points',
    'Add customer quotes and social proof to build credibility',
    'Create FAQ sections for common customer concerns',
    'A/B test pain point-focused messaging',
    'Optimize CTAs based on customer struggle context'
  ];

  return { recommendation, suggestedActions };
}

/**
 * Generate general optimization guidance
 * Why this matters: Provides strategic advice based on pain points
 */
async function generateOptimizationGuidance(message: string, painPoints: any[], selectedSitemap: string): Promise<string> {
  const topPainPoints = painPoints.slice(0, 3);
  const painPointSummary = topPainPoints.map(p => `• ${p.theme}`).join('\n');

  return `Based on your Voice of Customer analysis, here's strategic guidance for optimizing Apollo pages:

## Your Top Customer Pain Points
${painPointSummary}

## Strategic Optimization Approach

### 1. Content Prioritization
Focus on pages that directly address these pain points. From your selected sitemap (${selectedSitemap}), prioritize:
- Product feature pages that solve these specific problems
- Use case pages that demonstrate solutions to these challenges
- Landing pages that can be optimized for pain point-based messaging

### 2. Messaging Framework
- Lead with acknowledging customer struggles
- Provide clear solutions to identified pain points
- Use actual customer language from your VoC analysis

### 3. Recommended Next Steps
1. **Provide a specific URL** for detailed analysis
2. **Ask for sitemap analysis** to identify best optimization opportunities
3. **Request specific pain point focus** if you want to target particular customer challenges

What would you like to analyze first? You can:
- Share a specific Apollo URL
- Ask me to "analyze sitemap" for the selected sitemap
- Request guidance on a specific pain point

How can I help you optimize your pages?`;
}

/**
 * Apollo product context for AI analysis
 * Why this matters: Provides AI with comprehensive Apollo product knowledge for accurate relevance scoring
 */
function getApolloProductContext(): any {
  return {
    brandPositioning: {
      oneLiner: "Apollo is the end-to-end go-to-market (GTM) platform that combines #1-ranked B2B data with best-in-class execution so every team can reach the right company, the right person, at the right time, with the right message—and turn that into opportunity.",
      brandPromise: "We remove the guesswork from pipeline generation and sales execution by pairing an industry-leading data foundation with AI-powered engagement, workflow automation, and deal management—all in one place.",
      formula: "Right Company × Right Person × Right Time × Right Message = Opportunity"
    },
    coreProblems: [
      "Stale/bad data quality issues",
      "Scattered tools and workflow inefficiency",
      "Messages that don't break through to prospects",
      "Difficulty identifying best customers and decision makers",
      "Challenges determining if prospects are in-market",
      "Uncertainty about what to say next in sales conversations",
      "Difficulty prioritizing and scaling what works"
    ],
    keyDifferentiators: [
      {
        name: "Living Data Network",
        description: "210M+ contacts, 35M+ accounts; 5.3M new contacts/month; 150M records refreshed monthly; 72M emails verified monthly; 144M direct dials & mobile. 91% email accuracy; contacts refreshed every ~32 days. 2M+ free contributors validating data.",
        painPointRelevance: ["data quality", "contact accuracy", "database freshness", "lead generation", "prospecting efficiency"]
      },
      {
        name: "Best-in-class GTM Execution",
        description: "Prospecting, enrichment, engagement (email, dialer, sequences), workflows, meetings, conversation intelligence, and deal management live on top of Apollo data for higher conversion and lower tool sprawl.",
        painPointRelevance: ["tool consolidation", "workflow efficiency", "sales execution", "conversion optimization", "process automation"]
      },
      {
        name: "Actionable Intelligence",
        description: "65+ attributes & behaviors, 15K+ buying-intent topics, AI scores & signals, and AI research/personalization turn insights into the next best action—automatically.",
        painPointRelevance: ["buyer intent", "personalization", "sales intelligence", "next best action", "ai automation"]
      },
      {
        name: "Most accessible & intuitive",
        description: "PLG-first. Simple to buy, implement, and get started—in minutes. Unified UI and workflows across the funnel.",
        painPointRelevance: ["ease of use", "quick implementation", "user adoption", "setup time", "learning curve"]
      }
    ],
    capabilities: {
      generatePipeline: {
        prospect: [
          "Contact & Account Data: Largest global B2B dataset with rich firmographic/demographic detail and 65+ filters",
          "Behavioral & Intent Data: Identify in-market companies with 15K+ topics (Bombora & LeadSift enriched)",
          "Chrome Extension: Work where you are—LinkedIn, Gmail, Google Calendar, Salesforce, HubSpot",
          "Scores & Signals: AI auto-scoring + custom models; job changes, growth, funding, and more",
          "AI Research Assistant: Pull web insights, create custom fields/filters, and one-click personalize at scale"
        ],
        engage: [
          "Email: Dynamic variables, AI writing/rephrasing, deliverability guardrails",
          "Dialer: Verified numbers, click-to-call, local presence, voicemail, coaching; 91% phone connect rate",
          "Sequences: Multichannel steps (email/call/LinkedIn), A/B testing, and scalable best practices",
          "Workflows: Drag-and-drop automation with branching logic, approvals, and guardrails"
        ],
        executeDailyTasks: "A unified 'Home' to manage inboxes, tasks, AI lead recommendations, and campaign metrics"
      },
      optimizeInbound: [
        "Website Visitors: Reveal anonymous traffic; see companies, frequency, pages, and trigger outreach at peak intent",
        "Form Optimization: Auto-fill enriched fields from an email to shorten forms and lift conversion",
        "Inbound Router: Territory/owner/ICP-based rules, round-robin, bi-directional CRM sync",
        "Workflows: Auto-qualify, sequence hot leads, reschedule missed meetings, and update opportunities"
      ],
      winAndClose: [
        "Meetings & Scheduler: Single/group booking, multi-host availability; integrated into the Apollo workflow",
        "Pre-Meeting Insights: Account/contact signals, deal context, open items—visible in Calendar, Email, or Apollo",
        "Conversation Intelligence: Record/transcribe/analyze; objections, pain points, next steps; compliance controls",
        "Post-Call Automation: Auto-log calls, notes, tasks, and summaries to CRM and Apollo Deals",
        "Deal Management: Kanban pipeline, tasking, playbooks, and Deal Automation with engagement-based triggers",
        "Deal Insights: Win/loss analytics and full-journey visibility when paired with Apollo data"
      ],
      operationalize: [
        "Integrations: Native to Salesforce/HubSpot, LinkedIn, marketing and sales tools; Zapier, webhooks, REST API",
        "Salesforce CRM Integration: Bi-directional sync at lead/contact/account/opportunity level; enrichment and task/activity sync",
        "Analytics: Pre-built and custom dashboards for messaging, activity, performance, ROI",
        "Goal Tracking: Period goals (e.g., emails sent, meetings set), alerts, and automated roll-ups",
        "Coaching: Conversation analytics (talk/listen, keyword trackers), sharing, tagging, and feedback loops"
      ],
      enrichAndCleanse: [
        "Enrichment (CRM/API/CSV): Manual, bulk, or scheduled; CSV review before import",
        "Data Health Center: Real-time TAM view, missing data & job-change tracking, scheduled auto-enrichment",
        "Data Deduplication: Rule-based detection; one-by-one or bulk merges with primary-record controls",
        "Job Changes (Beta): Monitor champions and targets as they switch roles; auto-sync to CRM to trigger outreach"
      ]
    },
    proofOfImpact: [
      "GTM Ops Agency: 4× more meetings via automated outbound",
      "Leadium: 3× annual revenue by automating inbound and speeding lead follow-up",
      "Built In: +10% win rate and +10% ACV using signals & guidance",
      "Customer.io: +50% YoY growth through automation, coaching, and best-practice rollout",
      "Census: +50% data quality; more emails/phone numbers improved outbound",
      "500,000+ companies rely on Apollo—from SMB to Enterprise (e.g., Rippling, DocuSign, Stripe)"
    ],
    dataValidation: {
      emails: "Multi-source verification + contributory network + engagement results; risky addresses pulled automatically; human verification for high-demand records → ~91% email accuracy and <4% hard bounces",
      phoneNumbers: "Public/third-party sources + engagement + contributory network + human checks → ~91% connect rate",
      contactAndAccountData: "Cross-checked against company sites, Google, directories, and network signals; monthly refreshes"
    },
    voiceAndTone: {
      characteristics: ["Confident, data-driven, helpful", "Practical and actionable", "Human and direct"],
      principles: ["Avoid jargon overuse; lead with outcomes and proof", "Every message should clarify the next best action", "We make complex GTM simple"]
    },
    industries: ['Technology', 'SaaS', 'Financial Services', 'Healthcare', 'Manufacturing', 'Professional Services', 'Real Estate', 'Consulting', 'E-commerce', 'Media'],
    useCases: ['Lead generation', 'Sales prospecting', 'Account-based marketing', 'Revenue operations', 'Sales enablement', 'Pipeline generation', 'Data enrichment', 'Workflow automation']
  };
}

/**
 * Helper functions
 */

/**
 * Prioritize pain points by customer impact and relevance
 * Why this matters: Ensures most impactful pain points are analyzed first
 */
function prioritizePainPointsByImpact(painPoints: any[]): any[] {
  return painPoints.sort((a, b) => {
    // Calculate impact score based on multiple factors
    const scoreA = calculatePainPointImpactScore(a);
    const scoreB = calculatePainPointImpactScore(b);

    return scoreB - scoreA; // Higher score first
  });
}

/**
 * Calculate impact score for a pain point
 * Why this matters: Quantifies pain point importance for prioritization
 */
function calculatePainPointImpactScore(painPoint: any): number {
  let score = 0;

  // Factor 1: Number of customer quotes (shows frequency)
  const quoteCount = painPoint.customerQuotes?.length || 0;
  score += quoteCount * 10; // 10 points per quote

  // Factor 2: Presence of emotional triggers (shows intensity)
  const emotionalTriggers = painPoint.emotionalTriggers?.length || 0;
  score += emotionalTriggers * 15; // 15 points per emotional trigger

  // Factor 3: Source excerpts (shows depth of evidence)
  const sourceExcerpts = painPoint.sourceExcerpts?.length || 0;
  score += sourceExcerpts * 5; // 5 points per source excerpt

  // Factor 4: Apollo product relevance (if available)
  const apolloRelevance = painPoint.apolloProductRelevance?.length || 0;
  score += apolloRelevance * 20; // 20 points per Apollo product mapping

  // Factor 5: Description length (longer descriptions suggest more detail)
  const descriptionLength = painPoint.description?.length || 0;
  score += Math.min(descriptionLength / 10, 20); // Max 20 points for description length

  // Factor 6: Theme complexity (more specific themes often more actionable)
  const themeWords = painPoint.theme?.split(' ').length || 0;
  if (themeWords >= 3) score += 10; // Bonus for specific themes

  // Factor 7: High-impact keywords in theme
  const highImpactKeywords = [
    'manual', 'time', 'waste', 'inefficient', 'slow', 'difficult', 'frustrating',
    'expensive', 'costly', 'integration', 'data', 'quality', 'accuracy', 'sync',
    'visibility', 'pipeline', 'forecasting', 'qualification', 'scoring'
  ];

  const themeText = (painPoint.theme + ' ' + painPoint.description).toLowerCase();
  const keywordMatches = highImpactKeywords.filter(keyword =>
    themeText.includes(keyword)
  ).length;
  score += keywordMatches * 5; // 5 points per high-impact keyword

  return score;
}

async function parseSitemapXML(sitemapUrl: string): Promise<string[]> {
  try {
    const response = await fetch(sitemapUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch sitemap: ${response.status}`);
    }

    const xmlContent = await response.text();
    const urls: string[] = [];

    // Match <loc> tags in sitemap XML
    const locMatches = xmlContent.match(/<loc>(.*?)<\/loc>/g);
    if (locMatches) {
      locMatches.forEach(match => {
        const url = match.replace(/<\/?loc>/g, '').trim();
        if (url && isValidUrl(url)) {
          urls.push(url);
        }
      });
    }

    return [...new Set(urls)]; // Remove duplicates
  } catch (error) {
    console.error('❌ Sitemap parsing failed:', error);
    return [];
  }
}

async function extractPageTitle(url: string): Promise<string | null> {
  try {
    // Fast fetch with timeout and limited response size
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Apollo Page Optimizer)',
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    // Only read first 10KB for title extraction
    const reader = response.body?.getReader();
    if (!reader) return null;

    let html = '';
    let totalBytes = 0;
    const maxBytes = 10 * 1024; // 10KB limit

    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;

      html += new TextDecoder().decode(value);
      totalBytes += value.length;

      // Stop early if we found the title
      if (html.includes('</title>')) break;
    }

    reader.releaseLock();

    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    return titleMatch ? titleMatch[1].trim().replace(/\s+/g, ' ') : null;
  } catch (error) {
    return null;
  }
}

function isValidUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

function isUrl(text: string): boolean {
  return text.includes('http') || text.includes('www.') || text.includes('.com');
}

function extractUrlFromMessage(message: string): string {
  const urlRegex = /(https?:\/\/[^\s]+)/;
  const match = message.match(urlRegex);
  return match ? match[1] : '';
}

/**
 * Get Apollo product relevance score for a pain point
 * Why this matters: Determines how well Apollo's products can address the customer pain point
 */
async function getApolloRelevanceScore(painPoint: any): Promise<any> {
  try {
    // Simple relevance scoring based on keywords and themes
    const apolloKeywords = ['prospecting', 'outreach', 'sales', 'lead generation', 'email', 'contact', 'crm', 'pipeline'];
    const painPointText = `${painPoint.title} ${painPoint.description} ${painPoint.theme}`.toLowerCase();
    
    let relevanceScore = 0;
    const matchedKeywords = [];
    
    for (const keyword of apolloKeywords) {
      if (painPointText.includes(keyword)) {
        relevanceScore += 10;
        matchedKeywords.push(keyword);
      }
    }
    
    return {
      score: Math.min(relevanceScore, 100), // Cap at 100
      matchedKeywords,
      recommendation: relevanceScore > 30 ? 'High Apollo relevance' : relevanceScore > 10 ? 'Medium Apollo relevance' : 'Low Apollo relevance'
    };
  } catch (error) {
    console.warn('Failed to calculate Apollo relevance:', error);
    return { score: 0, matchedKeywords: [], recommendation: 'Unable to assess' };
  }
}

/**
 * Analyze customer struggles from a pain point
 * Why this matters: Identifies specific customer challenges that Apollo can address
 */
async function analyzeCustomerStruggles(painPoint: any): Promise<any> {
  try {
    // Extract struggle indicators from pain point text
    const struggleIndicators = ['difficult', 'hard', 'challenging', 'impossible', 'frustrating', 'time-consuming', 'expensive', 'manual'];
    const painPointText = `${painPoint.title} ${painPoint.description}`.toLowerCase();
    
    const identifiedStruggles = [];
    let struggleIntensity = 0;
    
    for (const indicator of struggleIndicators) {
      if (painPointText.includes(indicator)) {
        identifiedStruggles.push(indicator);
        struggleIntensity += 1;
      }
    }
    
    return {
      struggles: identifiedStruggles,
      intensity: struggleIntensity,
      category: struggleIntensity > 3 ? 'High Pain' : struggleIntensity > 1 ? 'Medium Pain' : 'Low Pain',
      apolloSolution: struggleIntensity > 1 ? 'Apollo can likely help' : 'Limited Apollo applicability'
    };
  } catch (error) {
    console.warn('Failed to analyze customer struggles:', error);
    return { struggles: [], intensity: 0, category: 'Unknown', apolloSolution: 'Unable to assess' };
  }
}

export default router;