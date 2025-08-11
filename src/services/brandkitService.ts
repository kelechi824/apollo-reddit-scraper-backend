interface BrandKitVariable {
  key: string;
  value: string;
  description?: string;
  category?: string;
}

interface BrandKit {
  id: string;
  name: string;
  variables: BrandKitVariable[];
  created_at: string;
  updated_at: string;
}

interface ProcessedContent {
  content: string;
  variables_used: string[];
  processing_metadata: {
    total_variables_processed: number;
    successful_replacements: number;
    failed_replacements: string[];
    timestamp: string;
  };
}

class BrandkitService {
  private readonly VARIABLE_PATTERN = /\{\{\s*([^}]+)\s*\}\}/g;
  private readonly DEFAULT_APOLLO_VARIABLES = {
    url: 'https://www.apollo.io',
    about_brand: 'Apollo is the leading sales intelligence and engagement platform, trusted by over 500,000+ sales professionals worldwide to find, contact, and close their ideal prospects.',
    ideal_customer_profile: 'B2B sales teams, sales development representatives (SDRs), account executives (AEs), sales managers, and revenue operations professionals at fast-growing companies.',
    value_proposition: 'Apollo helps sales teams find accurate contact data, engage prospects at scale, and accelerate revenue growth through intelligent sales automation.',
    key_features: 'Contact database with 270M+ profiles, sales engagement platform, conversation intelligence, deal management, and sales automation.',
    target_industries: 'Technology, SaaS, professional services, financial services, healthcare, manufacturing, and fast-growing B2B companies.',
    company_size: 'Apollo serves companies from startups to enterprises, with particular strength in mid-market and enterprise segments.',
    mission: 'To help every sales professional reach their full potential by providing the data, insights, and tools they need to build meaningful relationships and drive revenue growth.'
  };

  /**
   * Load brand kit from various sources (localStorage simulation for backend processing)
   * Why this matters: Provides consistent brand kit loading that matches frontend behavior,
   * ensuring brand variables are available for content personalization.
   */
  async loadBrandKit(brandKitData?: any): Promise<BrandKit> {
    // If brand kit data is provided directly, use it
    if (brandKitData && typeof brandKitData === 'object') {
      return this.normalizeBrandKit(brandKitData);
    }

    // Default Apollo brand kit if none provided
    const defaultBrandKit: BrandKit = {
      id: 'apollo-default',
      name: 'Apollo Default Brand Kit',
      variables: Object.entries(this.DEFAULT_APOLLO_VARIABLES).map(([key, value]) => ({
        key,
        value,
        description: `Default Apollo ${key.replace(/_/g, ' ')} variable`,
        category: 'brand'
      })),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log(`✅ Loaded default Apollo brand kit with ${defaultBrandKit.variables.length} variables`);
    return defaultBrandKit;
  }

  /**
   * Process content by replacing brand kit variables with their values
   * Why this matters: Enables dynamic content personalization using brand variables,
   * allowing generated content to include brand-specific information automatically.
   */
  async processContentVariables(content: string, brandKit?: BrandKit): Promise<ProcessedContent> {
    if (!content || content.trim().length === 0) {
      throw new Error('Content is required for variable processing');
    }

    console.log(`🔄 Processing content variables (${content.length} characters)`);

    // Load brand kit if not provided
    const activeBrandKit = brandKit || await this.loadBrandKit();
    
    // Create variable lookup map with defensive programming
    const variableMap = new Map<string, string>();
    
    // Map brand kit properties to variables (handle both formats)
    // Format 1: Direct properties from BrandKitPage (treat as any to handle dynamic structure)
    const kit = activeBrandKit as any;
    if (kit) {
      // Standard brand kit properties - support both camelCase and snake_case
      if (kit.url) variableMap.set('url', kit.url);
      
      // About brand (check both formats)
      const aboutBrand = kit.aboutBrand || kit.about_brand;
      if (aboutBrand) variableMap.set('about_brand', aboutBrand);
      
      // Ideal customer profile
      const idealCustomerProfile = kit.idealCustomerProfile || kit.ideal_customer_profile;
      if (idealCustomerProfile) variableMap.set('ideal_customer_profile', idealCustomerProfile);
      
      // Competitors
      if (kit.competitors) variableMap.set('competitors', kit.competitors);
      
      // Brand point of view
      const brandPointOfView = kit.brandPointOfView || kit.brand_point_of_view;
      if (brandPointOfView) variableMap.set('brand_point_of_view', brandPointOfView);
      
      // Author persona
      const authorPersona = kit.authorPersona || kit.author_persona;
      if (authorPersona) variableMap.set('author_persona', authorPersona);
      
      // Tone of voice
      const toneOfVoice = kit.toneOfVoice || kit.tone_of_voice;
      if (toneOfVoice) variableMap.set('tone_of_voice', toneOfVoice);
      
      // Header case type
      const headerCaseType = kit.headerCaseType || kit.header_case_type;
      if (headerCaseType) variableMap.set('header_case_type', headerCaseType);
      
      // Writing rules
      const writingRules = kit.writingRules || kit.writing_rules;
      if (writingRules) variableMap.set('writing_rules', writingRules);
      
      // CTA text
      const ctaText = kit.ctaText || kit.cta_text;
      if (ctaText) variableMap.set('cta_text', ctaText);
      
      // CTA destination
      const ctaDestination = kit.ctaDestination || kit.cta_destination;
      if (ctaDestination) variableMap.set('cta_destination', ctaDestination);
      
      // Writing sample properties
      if (kit.writingSample) {
        if (kit.writingSample.url) variableMap.set('writing_sample_url', kit.writingSample.url);
        if (kit.writingSample.title) variableMap.set('writing_sample_title', kit.writingSample.title);
        if (kit.writingSample.body) variableMap.set('writing_sample_body', kit.writingSample.body);
        if (kit.writingSample.outline) variableMap.set('writing_sample_outline', kit.writingSample.outline);
      }
      
      // Custom variables
      if (kit.customVariables && typeof kit.customVariables === 'object') {
        Object.entries(kit.customVariables).forEach(([key, value]) => {
          if (typeof value === 'string' && value.trim() !== '') {
            // Store the actual value (not liquid syntax)
            variableMap.set(key.toLowerCase(), value);
          }
        });
      }
    }
    
    // Format 2: Legacy variables array (if it exists)
    const variables = activeBrandKit?.variables;
    if (variables && Array.isArray(variables)) {
      variables.forEach(variable => {
        if (variable && variable.key && variable.value) {
          variableMap.set(variable.key.toLowerCase(), variable.value);
        }
      });
    }
    
    if (variableMap.size === 0) {
      console.warn('⚠️ No brand kit variables found for processing');
    } else {
      console.log(`📊 Loaded ${variableMap.size} brand kit variables for processing`);
      // Log the first few variables for debugging
      const entries = Array.from(variableMap.entries()).slice(0, 5);
      entries.forEach(([key, value]) => {
        console.log(`  - ${key}: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`);
      });
    }

    // Track processing metadata
    const variablesUsed: string[] = [];
    const failedReplacements: string[] = [];
    let successfulReplacements = 0;
    let totalVariablesFound = 0;

    // Process content by replacing variables
    const processedContent = content.replace(this.VARIABLE_PATTERN, (match, variableKey) => {
      totalVariablesFound++;
      let cleanKey = variableKey.trim().toLowerCase();

      // Support namespaced variables like {{ brand_kit.cta_text }} or {{ apollo.url }}
      // by taking the last segment after a dot
      if (cleanKey.includes('.')) {
        const parts = cleanKey.split('.').map((p: string) => p.trim()).filter(Boolean);
        cleanKey = parts[parts.length - 1];
      }
      
      if (variableMap.has(cleanKey)) {
        const value = variableMap.get(cleanKey)!;
        variablesUsed.push(cleanKey);
        successfulReplacements++;
        console.log(`✅ Replaced variable: {{${variableKey}}} → ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`);
        return value;
      } else {
        failedReplacements.push(variableKey);
        console.log(`❌ Variable not found: {{${variableKey}}}`);
        return match; // Return original if variable not found
      }
    });

    const processingResult: ProcessedContent = {
      content: processedContent,
      variables_used: [...new Set(variablesUsed)], // Remove duplicates
      processing_metadata: {
        total_variables_processed: totalVariablesFound,
        successful_replacements: successfulReplacements,
        failed_replacements: failedReplacements,
        timestamp: new Date().toISOString()
      }
    };

    console.log(`✅ Variable processing complete: ${successfulReplacements}/${totalVariablesFound} variables replaced`);
    
    if (failedReplacements.length > 0) {
      console.log(`⚠️ Missing variables: ${failedReplacements.join(', ')}`);
    }

    return processingResult;
  }

  /**
   * Get available variables from brand kit
   * Why this matters: Provides API access to available brand variables for frontend integration,
   * allowing users to see what variables they can use in their content.
   */
  async getAvailableVariables(brandKit?: BrandKit): Promise<BrandKitVariable[]> {
    const activeBrandKit = brandKit || await this.loadBrandKit();
    return activeBrandKit.variables;
  }

  /**
   * Search for variables by query
   * Why this matters: Enables variable discovery and search functionality similar to
   * the Variables Menu in ContentCreationModal and PlaybookGenerationModal.
   */
  async searchVariables(query: string, brandKit?: BrandKit): Promise<BrandKitVariable[]> {
    if (!query || query.trim().length === 0) {
      return this.getAvailableVariables(brandKit);
    }

    const activeBrandKit = brandKit || await this.loadBrandKit();
    const searchTerm = query.toLowerCase().trim();

    return activeBrandKit.variables.filter(variable => 
      variable.key.toLowerCase().includes(searchTerm) ||
      variable.value.toLowerCase().includes(searchTerm) ||
      (variable.description && variable.description.toLowerCase().includes(searchTerm))
    );
  }

  /**
   * Generate variable suggestions for content
   * Why this matters: Suggests relevant brand variables that could enhance the content,
   * helping users discover personalization opportunities.
   */
  async suggestVariablesForContent(content: string, brandKit?: BrandKit): Promise<{
    suggested_variables: BrandKitVariable[];
    existing_variables: string[];
    recommendations: string[];
  }> {
    const activeBrandKit = brandKit || await this.loadBrandKit();
    
    // Find existing variables in content
    const existingVariables: string[] = [];
    const matches = content.matchAll(this.VARIABLE_PATTERN);
    for (const match of matches) {
      existingVariables.push(match[1].trim());
    }

    // Suggest relevant variables based on content analysis
    const contentLower = content.toLowerCase();
    const suggestedVariables = activeBrandKit.variables.filter(variable => {
      // Don't suggest variables that are already used
      if (existingVariables.includes(variable.key)) {
        return false;
      }

      // Suggest based on content relevance
      const relevantTerms = [
        variable.key.replace(/_/g, ' '),
        ...variable.key.split('_')
      ];

      return relevantTerms.some(term => 
        contentLower.includes(term.toLowerCase())
      );
    });

    // Generate recommendations
    const recommendations = [
      'Consider using {{url}} to link to your website',
      'Add {{about_brand}} to establish brand context',
      'Include {{value_proposition}} to highlight key benefits',
      'Use {{ideal_customer_profile}} to define target audience'
    ].filter(rec => {
      const variableInRec = rec.match(this.VARIABLE_PATTERN)?.[1];
      return variableInRec && !existingVariables.includes(variableInRec);
    });

    return {
      suggested_variables: suggestedVariables.slice(0, 5), // Top 5 suggestions
      existing_variables: [...new Set(existingVariables)],
      recommendations: recommendations.slice(0, 3) // Top 3 recommendations
    };
  }

  /**
   * Normalize brand kit data from various sources
   * Why this matters: Ensures consistent brand kit structure regardless of source format,
   * providing reliable data structure for variable processing.
   */
  private normalizeBrandKit(brandKitData: any): BrandKit {
    // Handle different potential structures
    if (Array.isArray(brandKitData)) {
      // If it's an array of variables
      return {
        id: 'custom-brandkit',
        name: 'Custom Brand Kit',
        variables: brandKitData.map((item: any) => this.normalizeVariable(item)),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    }

    if (brandKitData.variables && Array.isArray(brandKitData.variables)) {
      // If it's already a proper brand kit structure
      return {
        id: brandKitData.id || 'custom-brandkit',
        name: brandKitData.name || 'Custom Brand Kit',
        variables: brandKitData.variables.map((item: any) => this.normalizeVariable(item)),
        created_at: brandKitData.created_at || new Date().toISOString(),
        updated_at: brandKitData.updated_at || new Date().toISOString()
      };
    }

    // If it's a simple key-value object
    return {
      id: 'simple-brandkit',
      name: 'Simple Brand Kit',
      variables: Object.entries(brandKitData).map(([key, value]) => ({
        key,
        value: String(value),
        description: `Custom ${key} variable`,
        category: 'custom'
      })),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Normalize individual variable data
   * Why this matters: Ensures consistent variable structure for reliable processing.
   */
  private normalizeVariable(item: any): BrandKitVariable {
    if (typeof item === 'string') {
      return {
        key: item,
        value: '',
        description: `Variable: ${item}`
      };
    }

    return {
      key: item.key || item.name || 'unknown',
      value: item.value || item.content || '',
      description: item.description || item.desc || undefined,
      category: item.category || item.type || 'custom'
    };
  }

  /**
   * Get service status for monitoring
   */
  getServiceStatus(): { available_variables: number; default_variables: number } {
    return {
      available_variables: Object.keys(this.DEFAULT_APOLLO_VARIABLES).length,
      default_variables: Object.keys(this.DEFAULT_APOLLO_VARIABLES).length
    };
  }
}

// Export singleton instance
export const brandkitService = new BrandkitService();
export default brandkitService; 