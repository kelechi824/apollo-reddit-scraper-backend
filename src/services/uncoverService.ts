import { UncoverRequest, UncoverResponse, UncoverCategory, UncoverCommunity, RedditPost, AnalyzedPost } from '../types';
import { redditServiceOptimized as redditService } from './redditServiceOptimized';
import openaiService from './openaiService';

/**
 * UncoverService - Discovers categorized posts from Reddit communities
 * Why this matters: Provides intelligent post discovery based on behavioral patterns
 * rather than just keyword matching, enabling more targeted community engagement.
 */
class UncoverService {
  
  // Available communities with their subreddit mappings - organized by business function
  private readonly communities: UncoverCommunity[] = [
    {
      id: 'b2b_sales',
      name: 'B2B Sales',
      description: 'Sales professionals, techniques, and business development',
      subreddits: [
        'sales', 'techsales', 'salestechniques', 'b2b_sales', 'salesdevelopment'
      ]
    },
    {
      id: 'crm',
      name: 'CRM',
      description: 'Customer Relationship Management systems and tools',
      subreddits: [
        'crm', 'CRMSoftware', 'hubspot', 'salesforce', 'Zoho', 'gohighlevel', 'GoHighLevelCRM'
      ]
    },
    {
      id: 'prospecting_leadgen',
      name: 'Prospecting & Lead Gen',
      description: 'Lead generation, prospecting, and outreach strategies',
      subreddits: [
        'prospecting', 'coldemail', 'coldcalling', 'salestechniques', 'leadgeneration', 'leadgen'
      ]
    },
    {
      id: 'marketing',
      name: 'Marketing',
      description: 'Digital marketing, automation, and growth strategies',
      subreddits: [
        'coldemail', 'emailmarketing', 'leadgeneration', 'leadgen', 'marketingautomation', 
        'b2bmarketing', 'marketing', 'marketingmentor', 'marketingresearch', 'seo', 
        'digitalmarketing', 'growthhacking'
      ]
    },
    {
      id: 'artificial_intelligence',
      name: 'Artificial Intelligence',
      description: 'AI tools, agents, and automation platforms',
      subreddits: [
        'chatgpt', 'openai', 'anthropic', 'ai_agents', 'GeminiAI', 'GoogleGeminiAI'
      ]
    },
    {
      id: 'saas_general',
      name: 'SaaS (General)',
      description: 'Software as a Service platforms and strategies',
      subreddits: [
        'saas', 'b2bsaas', 'microsaas', 'SaaSMarketing', 'Cloud'
      ]
    },
    {
      id: 'saas_tools',
      name: 'SaaS (Tools)',
      description: 'Specific SaaS tools and platforms',
      subreddits: [
        'Notion', 'n8n', 'Slack', 'shopify', 'Klaviyo', 'hubspot', 'salesforce', 
        'Zoho', 'gohighlevel', 'GoHighLevelCRM', 'MailChimp'
      ]
    },
    {
      id: 'startups',
      name: 'Startups',
      description: 'Startup resources, ideas, and entrepreneurship',
      subreddits: [
        'startups', 'Startup_Ideas', 'startup_resources', 'Entrepreneur', 'Entrepreneurs', 
        'Entrepreneurship', 'shopify'
      ]
    }
  ];

  // Search patterns for each category
  private readonly categoryPatterns: Record<UncoverCategory, string[]> = {
    solution_request: [
      'I need help with',
      'Looking for a tool',
      'What software',
      'Need recommendations',
      'Best tool for',
      'Help me find',
      'Anyone know of',
      'Suggestions for',
      'What do you use for',
      'Need a solution',
      'Looking for software',
      'Tool recommendations',
      'Platform suggestions',
      'Service recommendations',
      'Does anyone use'
    ],
    advice_request: [
      'How do I',
      'How does',
      'Tips for',
      'Best practices',
      'Need advice',
      'How to',
      'What should I',
      'Any tips',
      'Advice needed',
      'How would you',
      'What would you do',
      'Strategies for',
      'Help with',
      'Guide me',
      'Best way to'
    ],
    pain_anger: [
      'I hate',
      'Can\'t stand',
      'So frustrated',
      'This sucks',
      'Terrible experience',
      'Worst',
      'Annoying',
      'Fed up',
      'Sick of',
      'Problem with',
      'Issues with',
      'Struggling with',
      'Disappointed',
      'Awful',
      'Horrible'
    ],
    ideas: [
      'Here\'s how I',
      'Pro tip',
      'Life hack',
      'Try this',
      'What works for me',
      'My approach',
      'Here\'s what I do',
      'Suggestion:',
      'Tip:',
      'Trick:',
      'Method that works',
      'Strategy I use',
      'Technique:',
      'My solution',
      'Found a way'
    ]
  };

  /**
   * Get community by ID
   * Why this matters: Validates community selection and provides subreddit list
   */
  private getCommunity(communityId: string): UncoverCommunity | null {
    return this.communities.find(c => c.id === communityId) || null;
  }

  /**
   * Get search patterns for category
   * Why this matters: Provides the specific phrases to search for based on category
   */
  private getSearchPatterns(category: UncoverCategory): string[] {
    return this.categoryPatterns[category] || [];
  }

  /**
   * Filter posts by category patterns
   * Why this matters: Uses AI-powered content analysis to determine if posts match the category
   * instead of simple keyword matching for better accuracy
   */
  private async filterPostsByCategory(
    posts: RedditPost[], 
    category: UncoverCategory, 
    patterns: string[]
  ): Promise<RedditPost[]> {
    console.log(`🔍 Filtering ${posts.length} posts for category: ${category}`);
    
    // For now, use pattern matching. In the future, we could use AI classification
    const filteredPosts = posts.filter(post => {
      const content = `${post.title} ${post.content}`.toLowerCase();
      
      // Check if any pattern matches the content
      return patterns.some(pattern => 
        content.includes(pattern.toLowerCase())
      );
    });

    console.log(`✅ Filtered to ${filteredPosts.length} posts matching ${category} patterns`);
    return filteredPosts;
  }

  /**
   * Discover posts for a specific category and community
   * Why this matters: Main service method that orchestrates the discovery process
   * with optimized search and fast categorization for minimal latency
   */
  async discoverPosts(request: UncoverRequest): Promise<UncoverResponse> {
    const startTime = Date.now();
    console.log(`🎯 Starting uncover discovery for category: ${request.category}, community: ${request.community}`);

    try {
      // Validate community
      const community = this.getCommunity(request.community);
      if (!community) {
        throw new Error(`Unknown community: ${request.community}`);
      }

      // Get search patterns for the category
      const searchPatterns = this.getSearchPatterns(request.category);
      if (searchPatterns.length === 0) {
        throw new Error(`No search patterns defined for category: ${request.category}`);
      }

      console.log(`📋 Using ${searchPatterns.length} search patterns for ${request.category}`);
      console.log(`🏘️ Searching ${community.subreddits.length} subreddits in ${community.name}`);

      // Search Reddit using the first few patterns as keywords
      // Why this matters: We use the most common patterns as search terms to find relevant posts quickly
      const searchKeywords = searchPatterns.slice(0, 5); // Use top 5 patterns as search terms
      
      const redditSearchRequest = {
        keywords: searchKeywords,
        subreddits: community.subreddits,
        limit: Math.min(request.limit || 10, 25), // Cap at 25 for performance
        timeframe: request.timeframe || 'recent',
        sort: 'relevance' as const
      };

      // Search Reddit posts
      const redditResults = await redditService.searchPosts(redditSearchRequest);
      console.log(`📊 Reddit search returned ${redditResults.posts.length} posts`);

      if (redditResults.posts.length === 0) {
        return {
          success: true,
          posts: [],
          total_found: 0,
          category_used: request.category,
          community_used: community.name,
          subreddits_searched: community.subreddits,
          search_patterns_used: searchPatterns,
          workflow_id: `uncover-${Date.now()}`,
          completed_at: new Date().toISOString()
        };
      }

      // Filter posts by category patterns
      const filteredPosts = await this.filterPostsByCategory(
        redditResults.posts, 
        request.category, 
        searchPatterns
      );

      if (filteredPosts.length === 0) {
        console.log(`⚠️ No posts matched ${request.category} patterns after filtering`);
        return {
          success: true,
          posts: [],
          total_found: 0,
          category_used: request.category,
          community_used: community.name,
          subreddits_searched: community.subreddits,
          search_patterns_used: searchPatterns,
          workflow_id: `uncover-${Date.now()}`,
          completed_at: new Date().toISOString()
        };
      }

      // Limit to requested number of posts
      const limitedPosts = filteredPosts.slice(0, request.limit || 5);

      // Analyze posts with OpenAI for business insights
      console.log(`🧠 Analyzing ${limitedPosts.length} posts with AI`);
      const analyzedPosts = await openaiService.analyzePosts({
        posts: limitedPosts,
        keywords_used: `${request.category} posts`,
        subreddits_used: community.subreddits.join(', ')
      });

      const processingTime = Date.now() - startTime;
      console.log(`✅ Uncover discovery completed in ${processingTime}ms`);

      return {
        success: true,
        posts: analyzedPosts,
        total_found: filteredPosts.length,
        category_used: request.category,
        community_used: community.name,
        subreddits_searched: community.subreddits,
        search_patterns_used: searchPatterns,
        workflow_id: `uncover-${Date.now()}`,
        completed_at: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Uncover discovery failed:', error);
      throw error;
    }
  }

  /**
   * Get available communities
   * Why this matters: Provides frontend with list of available communities
   */
  getAvailableCommunities(): UncoverCommunity[] {
    return this.communities;
  }

  /**
   * Get available categories
   * Why this matters: Provides frontend with list of available categories and their descriptions
   */
  getAvailableCategories(): Array<{
    id: UncoverCategory;
    name: string;
    description: string;
    patterns: string[];
  }> {
    return [
      {
        id: 'solution_request',
        name: 'Solution Request',
        description: 'Posts of people asking for tools & solutions',
        patterns: this.categoryPatterns.solution_request
      },
      {
        id: 'advice_request',
        name: 'Advice Request',
        description: 'Posts of people asking for advice & resources',
        patterns: this.categoryPatterns.advice_request
      },
      {
        id: 'pain_anger',
        name: 'Pain & Anger',
        description: 'People expressing pain & frustration',
        patterns: this.categoryPatterns.pain_anger
      },
      {
        id: 'ideas',
        name: 'Ideas',
        description: 'People suggesting ideas & sharing tips',
        patterns: this.categoryPatterns.ideas
      }
    ];
  }
}

// Export singleton instance
export const uncoverService = new UncoverService();
export default uncoverService;
