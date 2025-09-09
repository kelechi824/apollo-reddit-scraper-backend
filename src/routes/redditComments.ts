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
    console.log(`📊 Request body received:`, { post_id, subreddit, permalink, limit });

    // Construct Reddit JSON API URL
    let redditUrl: string;
    if (permalink) {
      // Clean up permalink - remove trailing slashes and ensure proper format
      const cleanPermalink = permalink.replace(/\/$/, '');
      redditUrl = cleanPermalink.startsWith('http') 
        ? `${cleanPermalink}.json?limit=${limit}&sort=top`
        : `https://www.reddit.com${cleanPermalink}.json?limit=${limit}&sort=top`;
    } else {
      // Fallback to constructing URL from post_id and subreddit
      redditUrl = `https://www.reddit.com/r/${subreddit}/comments/${post_id}.json?limit=${limit}&sort=top`;
    }

    console.log(`📡 Fetching from Reddit API: ${redditUrl}`);

    // Try to fetch from Reddit API with retry logic and exponential backoff
    let response;
    let attemptedUrls = [redditUrl];
    
    // Helper function for exponential backoff retry
    const fetchWithRetry = async (url: string, maxRetries: number = 3): Promise<any> => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🔄 Attempt ${attempt}/${maxRetries} for URL: ${url}`);
          
          const result = await axios.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br',
              'Referer': 'https://www.reddit.com/',
              'Sec-Fetch-Dest': 'empty',
              'Sec-Fetch-Mode': 'cors',
              'Sec-Fetch-Site': 'same-origin'
            },
            timeout: 30000,
            validateStatus: function (status) {
              return status < 500; // Accept 4xx errors to handle them gracefully
            }
          });
          
          // If we get a successful response or a client error (4xx), return it
          if (result.status < 400 || result.status >= 500) {
            return result;
          }
          
          // For 4xx errors, don't retry - they're likely permanent
          if (result.status >= 400 && result.status < 500) {
            return result;
          }
          
        } catch (error: any) {
          console.log(`❌ Attempt ${attempt} failed:`, error.message);
          
          // Don't retry on certain errors
          if (error.response?.status === 404 || error.response?.status === 403) {
            throw error;
          }
          
          // If this is the last attempt, throw the error
          if (attempt === maxRetries) {
            throw error;
          }
          
          // Wait with exponential backoff before retrying
          const waitTime = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s...
          console.log(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    };
    
    try {
      response = await fetchWithRetry(redditUrl);
    } catch (error) {
      // If permalink failed and we have post_id and subreddit, try fallback URL
      if (permalink && post_id && subreddit) {
        const fallbackUrl = `https://www.reddit.com/r/${subreddit}/comments/${post_id}.json?limit=${limit}&sort=top`;
        console.log(`🔄 Permalink failed, trying fallback URL: ${fallbackUrl}`);
        attemptedUrls.push(fallbackUrl);
        
        try {
          response = await fetchWithRetry(fallbackUrl);
        } catch (fallbackError) {
          throw error; // Throw original error if fallback also fails
        }
      } else {
        throw error;
      }
    }

    console.log(`📊 Reddit API response status: ${response.status}`);
    console.log(`📊 Reddit API response headers:`, response.headers);
    console.log(`📊 Reddit API response data type:`, typeof response.data);
    
    // Log more details for debugging production issues
    if (response.status >= 400) {
      console.log(`❌ Reddit API error details:`, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data
      });
    }
    
    if (response.status === 404) {
      console.log('❌ Reddit post not found (404)');
      return res.json({
        success: true,
        comments: [],
        message: `Post not found on Reddit. Tried URLs: ${attemptedUrls.join(', ')}. The post may have been deleted.`
      });
    }
    
    if (response.status === 403) {
      console.log('❌ Reddit API access forbidden (403)');
      return res.json({
        success: true,
        comments: [],
        message: 'Unable to access Reddit comments. The subreddit may be private or restricted.'
      });
    }
    
    if (response.status >= 400) {
      console.log(`❌ Reddit API error: ${response.status} - ${response.statusText}`);
      return res.json({
        success: true,
        comments: [],
        message: `Reddit API returned error ${response.status}. Comments may not be available.`
      });
    }

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
