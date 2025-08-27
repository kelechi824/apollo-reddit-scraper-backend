/**
 * Simple UTM URL Generator for Contextual CTAs
 * Why this matters: Generates Apollo URLs with proper UTM parameters for tracking
 * contextual CTA performance in third-party analytics tools.
 */

/**
 * UTM Configuration for contextual CTAs
 * Why this matters: Simple structure for generating consistent UTM parameters
 */
export interface UTMConfig {
  targetKeyword: string; // For utm_term
  campaignType: 'blog_creator' | 'competitor_conquesting' | 'reddit_content_creator'; // For utm_campaign
  competitorName?: string; // For competitor conquesting campaigns
}

/**
 * UTM URL Result
 * Why this matters: Complete URL with UTM parameters ready for contextual CTA use
 */
export interface UTMUrlResult {
  originalUrl: string;
  utmUrl: string;
  utmParameters: {
    utm_campaign: string;
    utm_medium: string;
    utm_term: string;
  };
}

/**
 * Simple UTM URL Generator
 * Why this matters: Creates Apollo URLs with consistent UTM parameters for contextual CTA tracking
 * without complex parameter management - just simple URL generation for third-party analytics.
 */
class UTMUrlGenerator {
  
  constructor() {
    console.log('✅ UTM URL Generator initialized');
  }

  /**
   * Generate UTM URL for contextual CTA
   * Why this matters: Creates trackable Apollo URLs with proper UTM parameters
   * following the specified format from the requirements.
   */
  generateUTMUrl(apolloUrl: string, config: UTMConfig): UTMUrlResult {
    try {
      console.log(`🔗 Generating UTM URL for: ${apolloUrl}`);
      
      // Step 1: Generate UTM parameters based on campaign type
      const utmParameters = this.generateUTMParameters(config);
      
      // Step 2: Build the UTM URL
      const utmUrl = this.buildUTMUrl(apolloUrl, utmParameters);
      
      const result: UTMUrlResult = {
        originalUrl: apolloUrl,
        utmUrl,
        utmParameters
      };

      console.log(`✅ Generated UTM URL: ${utmUrl}`);
      return result;

    } catch (error) {
      console.error('❌ UTM URL generation failed:', error);
      throw new Error(`UTM URL generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate UTM parameters based on configuration
   * Why this matters: Creates the specific UTM parameters as defined in the requirements:
   * - utm_campaign: blog_creator or competitor_conquesting_[competitor]
   * - utm_medium: always "contextual_cta"
   * - utm_term: always the target keyword
   */
  private generateUTMParameters(config: UTMConfig): {
    utm_campaign: string;
    utm_medium: string;
    utm_term: string;
  } {
    let utm_campaign: string;

    // Generate campaign name based on type
    if (config.campaignType === 'blog_creator') {
      utm_campaign = 'blog_creator';
    } else if (config.campaignType === 'reddit_content_creator') {
      utm_campaign = 'reddit_content_creator';
    } else {
      // Competitor conquesting format: competitor_conquesting_[competitor]
      const competitor = config.competitorName?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'generic';
      utm_campaign = `competitor_conquesting_${competitor}`;
    }

    return {
      utm_campaign,
      utm_medium: 'contextual_cta', // Always contextual_cta as specified
      utm_term: config.targetKeyword.toLowerCase().replace(/\s+/g, '_') // Target keyword as specified
    };
  }

  /**
   * Build UTM URL by appending parameters
   * Why this matters: Creates the final trackable URL by properly appending UTM parameters
   */
  private buildUTMUrl(baseUrl: string, utmParameters: {
    utm_campaign: string;
    utm_medium: string;
    utm_term: string;
  }): string {
    const url = new URL(baseUrl);
    
    // Add UTM parameters
    url.searchParams.set('utm_campaign', utmParameters.utm_campaign);
    url.searchParams.set('utm_medium', utmParameters.utm_medium);
    url.searchParams.set('utm_term', utmParameters.utm_term);
    
    return url.toString();
  }

  /**
   * Generate multiple UTM URLs for different Apollo solutions
   * Why this matters: Batch generation for multiple contextual CTAs in the same content
   */
  generateMultipleUTMUrls(apolloUrls: string[], config: UTMConfig): UTMUrlResult[] {
    return apolloUrls.map(url => this.generateUTMUrl(url, config));
  }

  /**
   * Generate blog creator UTM URL
   * Why this matters: Convenience method for blog creator contextual CTAs
   */
  generateBlogCreatorUTMUrl(apolloUrl: string, targetKeyword: string): UTMUrlResult {
    return this.generateUTMUrl(apolloUrl, {
      targetKeyword,
      campaignType: 'blog_creator'
    });
  }

  /**
   * Generate competitor conquesting UTM URL
   * Why this matters: Convenience method for competitor conquesting contextual CTAs
   */
  generateCompetitorUTMUrl(apolloUrl: string, targetKeyword: string, competitorName: string): UTMUrlResult {
    return this.generateUTMUrl(apolloUrl, {
      targetKeyword,
      campaignType: 'competitor_conquesting',
      competitorName
    });
  }

  /**
   * Generate Reddit content creator UTM URL
   * Why this matters: Convenience method for Reddit content creation contextual CTAs
   */
  generateRedditContentUTMUrl(apolloUrl: string, targetKeyword: string): UTMUrlResult {
    return this.generateUTMUrl(apolloUrl, {
      targetKeyword,
      campaignType: 'reddit_content_creator'
    });
  }
}

export default UTMUrlGenerator;
