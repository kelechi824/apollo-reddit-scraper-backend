import { Router, Request, Response } from 'express';
import jokesService, { Joke } from '../services/jokesService';

const router = Router();

/**
 * GET /api/jokes/random
 * Get a random joke from all categories
 * Why this matters: Provides entertainment during loading states to improve user experience
 */
router.get('/random', async (req: Request, res: Response): Promise<any> => {
  try {
    const { context } = req.query;
    const joke = await jokesService.getRandomJoke(context as string);
    
    return res.status(200).json({
      success: true,
      joke,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Random joke error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to get random joke',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/jokes/category/:category
 * Get a random joke from a specific category
 * Why this matters: Allows contextual jokes based on what the user is doing
 */
router.get('/category/:category', async (req: Request, res: Response): Promise<any> => {
  try {
    const { category } = req.params;
    const { context } = req.query;
    
    // Validate category
    const validCategories = jokesService.getAvailableCategories();
    if (!validCategories.includes(category as Joke['category'])) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Category',
        message: `Category must be one of: ${validCategories.join(', ')}`,
        available_categories: validCategories,
        timestamp: new Date().toISOString()
      });
    }

    const joke = await jokesService.getRandomJokeByCategory(category as Joke['category'], context as string);
    
    return res.status(200).json({
      success: true,
      joke,
      category,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Category joke error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to get category joke',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/jokes/multiple/:count
 * Get multiple random jokes for longer loading periods
 * Why this matters: Provides variety during extended loading times
 */
router.get('/multiple/:count', async (req: Request, res: Response): Promise<any> => {
  try {
    const { count } = req.params;
    const { context } = req.query;
    const jokeCount = parseInt(count, 10);
    
    // Validate count
    if (isNaN(jokeCount) || jokeCount < 1 || jokeCount > 10) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Count',
        message: 'Count must be a number between 1 and 10',
        timestamp: new Date().toISOString()
      });
    }

    const jokes = await jokesService.getMultipleRandomJokes(jokeCount, context as string);
    
    return res.status(200).json({
      success: true,
      jokes,
      count: jokes.length,
      requested_count: jokeCount,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Multiple jokes error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to get multiple jokes',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/jokes/by-tags
 * Get jokes by specific tags for contextual humor
 * Why this matters: Allows matching jokes to specific contexts like Reddit analysis, CRM, etc.
 */
router.post('/by-tags', async (req: Request, res: Response): Promise<any> => {
  try {
    const { tags } = req.body;
    
    // Validate tags
    if (!Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Tags',
        message: 'Tags must be a non-empty array of strings',
        timestamp: new Date().toISOString()
      });
    }

    // Validate each tag is a string
    const invalidTags = tags.filter(tag => typeof tag !== 'string');
    if (invalidTags.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Tag Types',
        message: 'All tags must be strings',
        invalid_tags: invalidTags,
        timestamp: new Date().toISOString()
      });
    }

    const jokes = await jokesService.getJokesByTags(tags);
    
    return res.status(200).json({
      success: true,
      jokes,
      count: jokes.length,
      searched_tags: tags,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Tags jokes error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to get jokes by tags',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/jokes/contextual
 * Get a contextual joke based on user's search keywords
 * Why this matters: Provides highly relevant humor based on what the user is analyzing
 */
router.post('/contextual', async (req: Request, res: Response): Promise<any> => {
  try {
    const { keywords } = req.body;
    
    // Validate keywords
    if (!keywords || typeof keywords !== 'string' || keywords.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Keywords',
        message: 'Keywords must be a non-empty string',
        timestamp: new Date().toISOString()
      });
    }

    const joke = await jokesService.getContextualJoke(keywords.trim());
    
    return res.status(200).json({
      success: true,
      joke,
      keywords: keywords.trim(),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Contextual joke error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to get contextual joke',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/jokes/categories
 * Get all available joke categories
 * Why this matters: Allows frontend to know what categories are available for filtering
 */
router.get('/categories', async (req: Request, res: Response): Promise<any> => {
  try {
    const categories = jokesService.getAvailableCategories();
    const totalJokes = jokesService.getTotalJokeCount();
    
    return res.status(200).json({
      success: true,
      categories,
      total_jokes: totalJokes,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Categories error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to get categories',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
