/**
 * JokesService - Provides entertaining sales and social media marketing jokes using OpenAI
 * Why this matters: Keeps users engaged and entertained during loading states with fresh,
 * AI-generated humor that's actually funny, improving user experience and reducing perceived wait time
 */

import OpenAI from 'openai';

export interface Joke {
  id: string;
  text: string;
  category: 'sales' | 'social_media' | 'marketing' | 'prospecting' | 'crm';
  tags: string[];
  generated_at: string;
}

class JokesService {
  private openai: OpenAI;
  private jokeCache: Map<string, Joke[]> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_DURATION = 2 * 60 * 1000; // 2 minutes - shorter for more variety

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    // Clear any existing cache on startup for fresh jokes
    this.jokeCache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * Generate a fresh joke using OpenAI GPT-4o-mini
   * Why this matters: Creates genuinely funny, random jokes like professional comedians would tell
   */
  private async generateJokeWithOpenAI(category: Joke['category'], context?: string): Promise<Joke> {
    try {
      const prompt = `Generate a genuinely hilarious, witty, and clever ${category.replace('_', ' ')} joke that would make sales and marketing professionals laugh out loud and want to share with their colleagues.

Style examples to match:
- "I love it when prospects say they're 'just looking.' So am I - looking for someone ready to buy."
- "Speaking of quarterly goals, how's your crystal ball working these days?"
- "I promise this email won't be as long as your last team meeting."
- "Our CRM says we have a 90% close rate. Our bank account suggests otherwise."

Requirements:
- Must be genuinely funny and clever (like the examples above)
- Should be relatable to ${category.replace('_', ' ')} professionals
- Use insider knowledge and real pain points
- Keep it clean and professional but edgy
- Include a relevant emoji at the end
- Make it unexpected and memorable
- Should be 1-2 sentences max
- Focus on real situations sales/marketing people face daily

Generate a completely random ${category.replace('_', ' ')} joke that's as funny as the examples above.

Return ONLY the joke text with emoji, nothing else.`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini', // Using gpt-4o-mini for cost efficiency
        messages: [
          {
            role: 'system',
            content: 'You are a brilliant stand-up comedian who specializes in sales and marketing humor. Your jokes are razor-sharp, relatable, and genuinely hilarious - the kind that make professionals spit out their coffee laughing. You understand the real daily struggles, frustrations, and absurdities of sales and marketing life. Your humor is clever, unexpected, and based on insider knowledge that only people in the industry would truly appreciate. You avoid cheesy puns and focus on witty observations about the reality of sales/marketing work.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 150,
        temperature: 0.9, // High creativity
        presence_penalty: 0.6, // Encourage novelty
        frequency_penalty: 0.3
      });

      const jokeText = completion.choices[0]?.message?.content?.trim();
      
      if (!jokeText) {
        throw new Error('No joke generated');
      }

      // Generate tags based on category and content
      const tags = this.generateTagsForCategory(category, jokeText);

      return {
        id: `ai_${category}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text: jokeText,
        category,
        tags,
        generated_at: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error generating joke with OpenAI:', error);
      // Fallback to a simple backup joke
      return this.getFallbackJoke(category);
    }
  }

  /**
   * Generate contextual tags based on category and joke content
   * Why this matters: Helps with joke categorization and future contextual matching
   */
  private generateTagsForCategory(category: Joke['category'], jokeText: string): string[] {
    const baseTags: Record<Joke['category'], string[]> = {
      sales: ['closing', 'pipeline', 'leads', 'quota', 'deals'],
      social_media: ['engagement', 'viral', 'algorithm', 'content', 'followers'],
      marketing: ['conversion', 'funnel', 'campaigns', 'roi', 'targeting'],
      prospecting: ['cold_calling', 'outreach', 'linkedin', 'networking', 'leads'],
      crm: ['data', 'contacts', 'automation', 'pipeline', 'integration']
    };

    const categoryTags = baseTags[category] || [];
    
    // Add contextual tags based on joke content
    const contextualTags: string[] = [];
    const lowerJoke = jokeText.toLowerCase();
    
    if (lowerJoke.includes('email')) contextualTags.push('email');
    if (lowerJoke.includes('phone') || lowerJoke.includes('call')) contextualTags.push('calling');
    if (lowerJoke.includes('meeting')) contextualTags.push('meetings');
    if (lowerJoke.includes('zoom') || lowerJoke.includes('video')) contextualTags.push('remote');
    if (lowerJoke.includes('ai') || lowerJoke.includes('artificial')) contextualTags.push('ai');
    
    return [...categoryTags.slice(0, 3), ...contextualTags].slice(0, 5);
  }

  /**
   * Get cached jokes or generate new ones - optimized for random humor with better variety
   * Why this matters: Balances freshness with performance and API costs while ensuring variety
   */
  private async getCachedOrGenerateJoke(category: Joke['category'], context?: string): Promise<Joke> {
    // Use category only for caching - ignore context for random jokes
    const cacheKey = `random_${category}`;
    const now = Date.now();
    
    // Check if we have valid cached jokes
    if (this.jokeCache.has(cacheKey) && this.cacheExpiry.has(cacheKey)) {
      const expiry = this.cacheExpiry.get(cacheKey)!;
      const cachedJokes = this.jokeCache.get(cacheKey)!;
      
      if (now < expiry && cachedJokes.length > 0) {
        // 50% chance to generate new joke even if cache exists (for more variety)
        if (Math.random() < 0.5 && cachedJokes.length >= 3) {
          const randomIndex = Math.floor(Math.random() * cachedJokes.length);
          return cachedJokes[randomIndex];
        }
      }
    }

    // Generate new joke and cache it (ignore context for random jokes)
    const newJoke = await this.generateJokeWithOpenAI(category);
    
    // Update cache
    const existingJokes = this.jokeCache.get(cacheKey) || [];
    const updatedJokes = [newJoke, ...existingJokes].slice(0, 5); // Keep fewer jokes for more freshness
    
    this.jokeCache.set(cacheKey, updatedJokes);
    this.cacheExpiry.set(cacheKey, now + this.CACHE_DURATION);
    
    return newJoke;
  }

  /**
   * Fallback jokes for when OpenAI fails
   * Why this matters: Ensures users always get entertainment even if AI generation fails
   */
  private getFallbackJoke(category: Joke['category']): Joke {
    const fallbackJokes: Record<Joke['category'], Joke> = {
      sales: {
        id: 'fallback_sales',
        text: "Why don't salespeople ever get lost? Because they always know how to find their way to a close! 🎯",
        category: 'sales',
        tags: ['closing', 'navigation'],
        generated_at: new Date().toISOString()
      },
      social_media: {
        id: 'fallback_social',
        text: "What's a social media manager's favorite type of coffee? Anything that goes viral! ☕",
        category: 'social_media',
        tags: ['viral', 'coffee'],
        generated_at: new Date().toISOString()
      },
      marketing: {
        id: 'fallback_marketing',
        text: "Why don't marketers ever get lost? They always have a clear customer journey map! 🗺️",
        category: 'marketing',
        tags: ['customer_journey', 'navigation'],
        generated_at: new Date().toISOString()
      },
      prospecting: {
        id: 'fallback_prospecting',
        text: "Why do prospectors make great comedians? They know how to work a cold audience! 🧊",
        category: 'prospecting',
        tags: ['cold_calling', 'audience'],
        generated_at: new Date().toISOString()
      },
      crm: {
        id: 'fallback_crm',
        text: "Why did the CRM go to the doctor? It had too many duplicate contacts! 🏥",
        category: 'crm',
        tags: ['duplicates', 'health'],
        generated_at: new Date().toISOString()
      }
    };

    return fallbackJokes[category];
  }

  /**
   * Get a random joke from all categories using AI generation
   * Why this matters: Provides fresh, genuinely funny content every time - completely random
   */
  async getRandomJoke(context?: string): Promise<Joke> {
    // Focus on the funniest categories - sales and social_media
    const categories: Joke['category'][] = ['sales', 'social_media', 'marketing', 'prospecting'];
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
    // Generate fresh joke every time - no caching
    return this.generateJokeWithOpenAI(randomCategory);
  }

  /**
   * Get a random joke from a specific category using AI generation
   * Why this matters: Allows targeting jokes to specific contexts with fresh AI-generated content
   */
  async getRandomJokeByCategory(category: Joke['category'], context?: string): Promise<Joke> {
    // Generate fresh joke every time - no caching
    return this.generateJokeWithOpenAI(category, context);
  }

  /**
   * Get multiple random jokes for longer loading periods using AI generation
   * Why this matters: Provides multiple fresh jokes for extended loading times
   */
  async getMultipleRandomJokes(count: number = 3, context?: string): Promise<Joke[]> {
    const categories: Joke['category'][] = ['sales', 'social_media', 'marketing', 'prospecting', 'crm'];
    const jokes: Joke[] = [];
    
    for (let i = 0; i < count; i++) {
      const randomCategory = categories[Math.floor(Math.random() * categories.length)];
      try {
        // Generate fresh joke every time - no caching
        const joke = await this.generateJokeWithOpenAI(randomCategory, context);
        jokes.push(joke);
      } catch (error) {
        console.error(`Error generating joke ${i + 1}:`, error);
        // Add fallback joke if generation fails
        jokes.push(this.getFallbackJoke(randomCategory));
      }
    }
    
    return jokes;
  }

  /**
   * Get jokes by tags using contextual AI generation
   * Why this matters: Allows matching jokes to specific contexts with AI understanding
   */
  async getJokesByTags(tags: string[], context?: string): Promise<Joke[]> {
    // Map tags to most relevant category
    const categoryMapping: Record<string, Joke['category']> = {
      'closing': 'sales',
      'pipeline': 'sales',
      'leads': 'prospecting',
      'cold_calling': 'prospecting',
      'crm': 'crm',
      'data': 'crm',
      'social_media': 'social_media',
      'viral': 'social_media',
      'engagement': 'social_media',
      'marketing': 'marketing',
      'conversion': 'marketing',
      'funnel': 'marketing'
    };

    // Find the most relevant category based on tags
    let targetCategory: Joke['category'] = 'sales'; // default
    for (const tag of tags) {
      if (categoryMapping[tag.toLowerCase()]) {
        targetCategory = categoryMapping[tag.toLowerCase()];
        break;
      }
    }

    // Generate contextual joke
    const contextWithTags = context ? `${context} (related to: ${tags.join(', ')})` : tags.join(', ');
    return [await this.getCachedOrGenerateJoke(targetCategory, contextWithTags)];
  }

  /**
   * Get a completely random joke - ignores keywords for maximum humor variety
   * Why this matters: Provides genuinely funny random content instead of forced contextual jokes
   */
  async getContextualJoke(keywords: string): Promise<Joke> {
    // Ignore keywords and just return a random funny joke
    return this.getRandomJoke();
  }

  /**
   * Get all available categories
   * Why this matters: Allows frontend to know what categories are available
   */
  getAvailableCategories(): Joke['category'][] {
    return ['sales', 'social_media', 'marketing', 'prospecting', 'crm'];
  }

  /**
   * Get total joke count for analytics (now includes generated jokes)
   * Why this matters: Helps track content availability and variety
   */
  getTotalJokeCount(): number {
    let totalCached = 0;
    for (const jokes of this.jokeCache.values()) {
      totalCached += jokes.length;
    }
    return totalCached + 5; // 5 fallback jokes + cached AI jokes
  }

  /**
   * Clear joke cache (useful for testing or forcing fresh content)
   * Why this matters: Allows manual cache refresh for testing or content updates
   */
  clearCache(): void {
    this.jokeCache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * Get cache statistics for monitoring
   * Why this matters: Helps monitor cache performance and API usage
   */
  getCacheStats(): { totalCached: number; cacheKeys: string[]; oldestExpiry: string | null } {
    const cacheKeys = Array.from(this.jokeCache.keys());
    let totalCached = 0;
    let oldestExpiry: number | null = null;

    for (const jokes of this.jokeCache.values()) {
      totalCached += jokes.length;
    }

    for (const expiry of this.cacheExpiry.values()) {
      if (oldestExpiry === null || expiry < oldestExpiry) {
        oldestExpiry = expiry;
      }
    }

    return {
      totalCached,
      cacheKeys,
      oldestExpiry: oldestExpiry ? new Date(oldestExpiry).toISOString() : null
    };
  }
}

export default new JokesService();
