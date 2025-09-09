import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

interface RedditComment {
  id: string;
  content: string;
  author: string;
  score: number;
  created_utc: number;
  permalink: string;
  replies?: RedditComment[];
}

/**
 * Fetch comments for a Reddit post
 * Why this matters: Provides actual Reddit comments for Uncover posts so users can engage with them
 */
router.post('/fetch-comments', async (req: Request, res: Response): Promise<any> => {
  try {
    const { post_id, subreddit, permalink, limit = 50 } = req.body;

    if (!post_id || !subreddit) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: post_id and subreddit'
      });
    }

    console.log(`🔍 Fetching comments for post ${post_id} in r/${subreddit}`);

    // Construct Reddit JSON API URL
    let redditUrl: string;
    if (permalink) {
      // Use permalink if provided
      redditUrl = permalink.startsWith('http') 
        ? `${permalink}.json?limit=${limit}&sort=top`
        : `https://reddit.com${permalink}.json?limit=${limit}&sort=top`;
    } else {
      // Fallback to constructing URL from post_id and subreddit
      redditUrl = `https://reddit.com/r/${subreddit}/comments/${post_id}.json?limit=${limit}&sort=top`;
    }

    console.log(`📡 Fetching from Reddit API: ${redditUrl}`);

    // Fetch from Reddit API
    const response = await axios.get(redditUrl, {
      headers: {
        'User-Agent': 'Apollo Reddit Scraper 1.0'
      },
      timeout: 30000
    });

    if (!response.data || !Array.isArray(response.data) || response.data.length < 2) {
      console.log('❌ Invalid Reddit API response structure');
      return res.json({
        success: true,
        comments: []
      });
    }

    // Reddit API returns an array where [0] is the post and [1] is the comments
    const commentsData = response.data[1]?.data?.children || [];

    /**
     * Parse Reddit comment data recursively
     * Why this matters: Converts Reddit's nested comment structure into a flat array
     */
    const parseComment = (commentData: any): RedditComment | null => {
      if (!commentData?.data || commentData.kind !== 't1') {
        return null;
      }

      const data = commentData.data;
      
      // Skip deleted/removed comments
      if (data.body === '[deleted]' || data.body === '[removed]' || !data.body) {
        return null;
      }

      const comment: RedditComment = {
        id: data.id,
        content: data.body,
        author: data.author || '[deleted]',
        score: data.score || 0,
        created_utc: data.created_utc,
        permalink: `https://reddit.com${data.permalink}`,
        replies: []
      };

      // Parse replies recursively
      if (data.replies && data.replies.data && data.replies.data.children) {
        const replies = data.replies.data.children
          .map(parseComment)
          .filter((reply: RedditComment | null) => reply !== null);
        comment.replies = replies;
      }

      return comment;
    };

    // Parse all comments
    const comments: RedditComment[] = commentsData
      .map(parseComment)
      .filter((comment: RedditComment | null) => comment !== null);

    console.log(`✅ Successfully parsed ${comments.length} comments`);

    return res.json({
      success: true,
      comments: comments
    });

  } catch (error) {
    console.error('❌ Error fetching Reddit comments:', error);
    
    let errorMessage = 'Failed to fetch comments';
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        errorMessage = 'Post not found on Reddit';
      } else if (error.response?.status === 429) {
        errorMessage = 'Rate limited by Reddit. Please try again later.';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Request timed out. Reddit may be slow to respond.';
      }
    }

    return res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
});

export default router;
