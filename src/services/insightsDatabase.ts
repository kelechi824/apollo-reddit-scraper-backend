import { ExtractedPainPoint, CustomerPhrase, CallAnalysisResult } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface DatabaseStats {
  totalCalls: number;
  totalPainPoints: number;
  totalCustomerPhrases: number;
  lastSyncDate: string;
  categoryCounts: { [category: string]: number };
}

interface PainPointQuery {
  category?: string;
  emotionalTrigger?: string;
  minConfidence?: number;
  limit?: number;
  sortBy?: 'frequency' | 'confidence' | 'date';
}

interface CustomerPhraseQuery {
  minFrequency?: number;
  category?: string;
  context?: string;
  limit?: number;
  sortBy?: 'frequency' | 'callCount' | 'recent';
}

/**
 * Service for managing dynamic customer insights database
 * Why this matters: Provides persistent storage and retrieval of extracted pain points 
 * and customer language patterns for CRO and ad copy generation.
 */
class InsightsDatabase {
  private painPoints: Map<string, ExtractedPainPoint> = new Map();
  private customerPhrases: Map<string, CustomerPhrase> = new Map();
  private callAnalyses: Map<string, CallAnalysisResult> = new Map();
  private phraseFrequency: Map<string, number> = new Map();
  
  constructor() {
    console.log('🗄️ Insights database initialized');
  }

  /**
   * Store a complete call analysis result
   * Why this matters: Centralizes all customer insights from a call for easy retrieval and aggregation.
   */
  storeCallAnalysis(analysis: CallAnalysisResult): void {
    console.log(`💾 Storing analysis for call ${analysis.callId}: "${analysis.callTitle}"`);
    
    // Store the complete analysis
    this.callAnalyses.set(analysis.callId, analysis);
    
    // Store individual pain points
    analysis.painPoints.forEach(painPoint => {
      this.painPoints.set(painPoint.id, painPoint);
    });
    
    // Store and aggregate customer phrases
    analysis.customerPhrases.forEach(phrase => {
      const existingPhrase = this.customerPhrases.get(phrase.phrase);
      
      if (existingPhrase) {
        // Update existing phrase - merge call IDs and frequency
        existingPhrase.frequency += phrase.frequency;
        existingPhrase.callIds = [...new Set([...existingPhrase.callIds, ...phrase.callIds])];
      } else {
        // Store new phrase
        this.customerPhrases.set(phrase.phrase, phrase);
      }
      
      // Update phrase frequency tracking
      const currentFreq = this.phraseFrequency.get(phrase.phrase) || 0;
      this.phraseFrequency.set(phrase.phrase, currentFreq + phrase.frequency);
    });
    
    console.log(`✅ Stored ${analysis.painPoints.length} pain points and ${analysis.customerPhrases.length} phrases from call ${analysis.callId}`);
  }

  /**
   * Store multiple call analyses in batch
   * Why this matters: Efficiently processes large volumes of call data for comprehensive insights.
   */
  storeBatchAnalyses(analyses: CallAnalysisResult[]): void {
    console.log(`📦 Batch storing ${analyses.length} call analyses...`);
    
    analyses.forEach(analysis => {
      this.storeCallAnalysis(analysis);
    });
    
    const totalPainPoints = analyses.reduce((sum, a) => sum + a.painPoints.length, 0);
    const totalPhrases = analyses.reduce((sum, a) => sum + a.customerPhrases.length, 0);
    
    console.log(`✅ Batch storage complete: ${totalPainPoints} pain points, ${totalPhrases} phrases`);
  }

  /**
   * Query pain points with filtering options
   * Why this matters: Enables targeted retrieval of specific types of customer pain points for CRO analysis.
   */
  queryPainPoints(query: PainPointQuery = {}): ExtractedPainPoint[] {
    const {
      category,
      emotionalTrigger,
      minConfidence = 0,
      limit = 100,
      sortBy = 'frequency'
    } = query;
    
    let results = Array.from(this.painPoints.values());
    
    // Apply filters
    if (category) {
      results = results.filter(pp => pp.category === category);
    }
    
    if (emotionalTrigger) {
      results = results.filter(pp => pp.emotionalTrigger === emotionalTrigger);
    }
    
    if (minConfidence > 0) {
      results = results.filter(pp => pp.confidence >= minConfidence);
    }
    
    // Sort results
    switch (sortBy) {
      case 'confidence':
        results.sort((a, b) => b.confidence - a.confidence);
        break;
      case 'frequency':
        results.sort((a, b) => b.frequency - a.frequency);
        break;
      case 'date':
        // Sort by call date if available
        results.sort((a, b) => {
          const callA = this.callAnalyses.get(a.callId);
          const callB = this.callAnalyses.get(b.callId);
          if (callA && callB) {
            return new Date(callB.callDate).getTime() - new Date(callA.callDate).getTime();
          }
          return 0;
        });
        break;
    }
    
    return results.slice(0, limit);
  }

  /**
   * Query customer phrases with filtering options
   * Why this matters: Retrieves specific customer language patterns for ad copy and content generation.
   */
  queryCustomerPhrases(query: CustomerPhraseQuery = {}): CustomerPhrase[] {
    const {
      minFrequency = 1,
      category,
      context,
      limit = 50,
      sortBy = 'frequency'
    } = query;
    
    let results = Array.from(this.customerPhrases.values());
    
    // Apply filters
    if (minFrequency > 1) {
      results = results.filter(cp => cp.frequency >= minFrequency);
    }
    
    if (category) {
      results = results.filter(cp => cp.category.toLowerCase().includes(category.toLowerCase()));
    }
    
    if (context) {
      results = results.filter(cp => cp.context === context);
    }
    
    // Sort results
    switch (sortBy) {
      case 'frequency':
        results.sort((a, b) => b.frequency - a.frequency);
        break;
      case 'callCount':
        results.sort((a, b) => b.callIds.length - a.callIds.length);
        break;
      case 'recent':
        // Sort by most recent call appearance
        results.sort((a, b) => {
          const latestCallA = Math.max(...a.callIds.map(id => {
            const call = this.callAnalyses.get(id);
            return call ? new Date(call.callDate).getTime() : 0;
          }));
          const latestCallB = Math.max(...b.callIds.map(id => {
            const call = this.callAnalyses.get(id);
            return call ? new Date(call.callDate).getTime() : 0;
          }));
          return latestCallB - latestCallA;
        });
        break;
    }
    
    return results.slice(0, limit);
  }

  /**
   * Get top pain points by category
   * Why this matters: Identifies the most common customer concerns for prioritized CRO improvements.
   */
  getTopPainPointsByCategory(): Array<{
    category: string;
    count: number;
    avgConfidence: number;
    examples: string[];
  }> {
    const categoryMap: { [key: string]: { 
      count: number; 
      confidences: number[]; 
      examples: string[] 
    } } = {};
    
    Array.from(this.painPoints.values()).forEach(pp => {
      if (!categoryMap[pp.category]) {
        categoryMap[pp.category] = { count: 0, confidences: [], examples: [] };
      }
      
      categoryMap[pp.category].count++;
      categoryMap[pp.category].confidences.push(pp.confidence);
      categoryMap[pp.category].examples.push(pp.text);
    });
    
    return Object.entries(categoryMap)
      .map(([category, data]) => ({
        category,
        count: data.count,
        avgConfidence: data.confidences.reduce((sum, c) => sum + c, 0) / data.confidences.length,
        examples: data.examples.slice(0, 3) // Top 3 examples
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get trending customer phrases
   * Why this matters: Identifies language patterns that appear frequently across multiple calls.
   */
  getTrendingPhrases(limit: number = 20): Array<{
    phrase: string;
    frequency: number;
    callCount: number;
    trend: 'rising' | 'stable' | 'declining';
  }> {
    const phrases = Array.from(this.customerPhrases.values())
      .map(cp => ({
        phrase: cp.phrase,
        frequency: cp.frequency,
        callCount: cp.callIds.length,
        trend: 'stable' as const // TODO: Implement trend calculation
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit);
      
    return phrases;
  }

  /**
   * Get database statistics
   * Why this matters: Provides insights into data quality and coverage for monitoring.
   */
  getStats(): DatabaseStats {
    const categoryCounts: { [category: string]: number } = {};
    
    Array.from(this.painPoints.values()).forEach(pp => {
      categoryCounts[pp.category] = (categoryCounts[pp.category] || 0) + 1;
    });
    
    return {
      totalCalls: this.callAnalyses.size,
      totalPainPoints: this.painPoints.size,
      totalCustomerPhrases: this.customerPhrases.size,
      lastSyncDate: new Date().toISOString(),
      categoryCounts
    };
  }

  /**
   * Get insights for CRO recommendations
   * Why this matters: Provides targeted pain points and phrases for landing page optimization.
   */
  getCROInsights(targetCategory?: string): {
    topPainPoints: ExtractedPainPoint[];
    relevantPhrases: CustomerPhrase[];
    emotionalTriggers: { [trigger: string]: number };
  } {
    // Get high-confidence pain points
    const painPointQuery: PainPointQuery = {
      minConfidence: 0.7,
      limit: 10,
      sortBy: 'confidence'
    };
    
    if (targetCategory) {
      painPointQuery.category = targetCategory;
    }
    
    const topPainPoints = this.queryPainPoints(painPointQuery);
    
    // Get high-frequency customer phrases
    const relevantPhrases = this.queryCustomerPhrases({
      minFrequency: 2,
      limit: 15,
      sortBy: 'frequency'
    });
    
    // Count emotional triggers
    const emotionalTriggers: { [trigger: string]: number } = {};
    topPainPoints.forEach(pp => {
      emotionalTriggers[pp.emotionalTrigger] = (emotionalTriggers[pp.emotionalTrigger] || 0) + 1;
    });
    
    return {
      topPainPoints,
      relevantPhrases,
      emotionalTriggers
    };
  }

  /**
   * Get insights for ad copy generation
   * Why this matters: Provides customer language and pain points for compelling ad copy creation.
   */
  getAdCopyInsights(searchIntent?: string): {
    painPointsForAds: ExtractedPainPoint[];
    customerLanguage: CustomerPhrase[];
    emotionalHooks: string[];
  } {
    // Get diverse pain points that work well in ads
    const painPointsForAds = this.queryPainPoints({
      minConfidence: 0.6,
      limit: 8,
      sortBy: 'frequency'
    });
    
    // Get short, punchy customer phrases
    const allPhrases = this.queryCustomerPhrases({
      minFrequency: 2,
      limit: 25
    });
    
    // Filter for ad-friendly phrases (shorter, more impactful)
    const customerLanguage = allPhrases.filter(phrase => {
      return phrase.phrase.length <= 50 && // Shorter phrases work better in ads
             !phrase.phrase.includes('um') && // Remove filler words
             !phrase.phrase.includes('uh');
    });
    
    // Extract emotional hooks from high-impact pain points
    const emotionalHooks = painPointsForAds
      .filter(pp => pp.emotionalTrigger !== 'neutral')
      .map(pp => pp.text)
      .slice(0, 5);
    
    return {
      painPointsForAds,
      customerLanguage: customerLanguage.slice(0, 10),
      emotionalHooks
    };
  }

  /**
   * Search insights by keyword
   * Why this matters: Enables quick lookup of relevant customer insights for specific topics.
   */
  searchInsights(keyword: string): {
    matchingPainPoints: ExtractedPainPoint[];
    matchingPhrases: CustomerPhrase[];
  } {
    const lowerKeyword = keyword.toLowerCase();
    
    const matchingPainPoints = Array.from(this.painPoints.values())
      .filter(pp => pp.text.toLowerCase().includes(lowerKeyword))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);
    
    const matchingPhrases = Array.from(this.customerPhrases.values())
      .filter(cp => cp.phrase.toLowerCase().includes(lowerKeyword))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);
    
    return {
      matchingPainPoints,
      matchingPhrases
    };
  }

  /**
   * Clear all data (for testing or reset)
   * Why this matters: Allows clean slate for testing and development.
   */
  clearAll(): void {
    this.painPoints.clear();
    this.customerPhrases.clear();
    this.callAnalyses.clear();
    this.phraseFrequency.clear();
    
    console.log('🗑️ All insights data cleared');
  }

  /**
   * Export data for backup or analysis
   * Why this matters: Enables data portability and external analysis.
   */
  exportData(): {
    painPoints: ExtractedPainPoint[];
    customerPhrases: CustomerPhrase[];
    callAnalyses: CallAnalysisResult[];
    exportDate: string;
  } {
    return {
      painPoints: Array.from(this.painPoints.values()),
      customerPhrases: Array.from(this.customerPhrases.values()),
      callAnalyses: Array.from(this.callAnalyses.values()),
      exportDate: new Date().toISOString()
    };
  }
}

// Singleton instance
const insightsDatabase = new InsightsDatabase();

export default insightsDatabase; 