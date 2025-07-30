import { GongTranscript, GongCall, GongUser, ExtractedPainPoint, CustomerPhrase } from '../types';

interface ProcessedTranscript {
  callId: string;
  speakers: Array<{
    id: string;
    name?: string;
    role: 'prospect' | 'sales_rep' | 'unknown';
    statements: Array<{
      text: string;
      timestamp?: number;
      confidence: number;
    }>;
  }>;
  prospectStatements: string[];
  salesRepStatements: string[];
  rawTranscript: string;
}

interface SpeakerClassification {
  speakerId: string;
  role: 'prospect' | 'sales_rep' | 'unknown';
  confidence: number;
  reasoning: string;
}

/**
 * Service for processing Gong call transcripts and identifying speakers
 * Why this matters: We need to distinguish between prospect and sales rep statements
 * to extract pain points only from customer/prospect speech, not internal sales talk.
 */
class TranscriptProcessor {
  private gongUsers: GongUser[] = [];
  
  constructor() {
    console.log('🔧 Transcript processor initialized');
  }

  /**
   * Set Gong users for speaker identification
   * Why this matters: Knowing who works for the company helps classify speakers as sales reps vs prospects.
   */
  setGongUsers(users: GongUser[]): void {
    this.gongUsers = users;
    console.log(`👥 Loaded ${users.length} Gong users for speaker identification`);
  }

  /**
   * Classify speaker role based on available data
   * Why this matters: Pain point extraction should only focus on prospect statements, not sales rep talk.
   */
  private classifySpeaker(
    speakerId: string, 
    call: GongCall, 
    transcript: GongTranscript
  ): SpeakerClassification {
    
    // 1. Check if speaker is a known Gong user (sales rep)
    const gongUser = this.gongUsers.find(user => user.id === speakerId);
    if (gongUser) {
      return {
        speakerId,
        role: 'sales_rep',
        confidence: 0.95,
        reasoning: `Matched Gong user: ${gongUser.emailAddress}`
      };
    }

    // 2. Check if speaker is the primary user (call owner - likely sales rep)
    if (speakerId === call.primaryUserId) {
      return {
        speakerId,
        role: 'sales_rep', 
        confidence: 0.9,
        reasoning: 'Primary user (call owner)'
      };
    }

    // 3. Check call participants for more context
    const participant = call.participants.find(p => p.userId === speakerId);
    if (participant) {
      // If participant has a userId but not in our Gong users list, might be external
      if (participant.userId && !gongUser) {
        return {
          speakerId,
          role: 'prospect',
          confidence: 0.7,
          reasoning: 'External participant with userId'
        };
      }
      
      // If participant has email domain that might indicate company affiliation
      if (participant.emailAddress) {
        const emailDomain = participant.emailAddress.split('@')[1]?.toLowerCase();
        
        // Check if email domain matches any of our sales rep domains
        const salesRepDomains = this.gongUsers
          .map(user => user.emailAddress.split('@')[1]?.toLowerCase())
          .filter(domain => domain);
          
        if (salesRepDomains.includes(emailDomain)) {
          return {
            speakerId,
            role: 'sales_rep',
            confidence: 0.8,
            reasoning: `Email domain matches company domain: ${emailDomain}`
          };
        } else {
          return {
            speakerId,
            role: 'prospect',
            confidence: 0.75,
            reasoning: `External email domain: ${emailDomain}`
          };
        }
      }
    }

    // 4. Analyze speech patterns to infer role (last resort)
    const speakerTranscript = transcript.transcript.find(t => t.speakerId === speakerId);
    if (speakerTranscript) {
      const allText = speakerTranscript.sentences.map(s => s.text).join(' ').toLowerCase();
      
      // Sales rep indicators
      const salesRepIndicators = [
        'our platform', 'our solution', 'our company', 'our product',
        'i can show you', 'let me demonstrate', 'our pricing', 'our features',
        'we offer', 'we provide', 'we help', 'our team'
      ];
      
      // Prospect indicators  
      const prospectIndicators = [
        'our current process', 'we currently use', 'our challenge', 'our problem',
        'we need', 'we are looking for', 'our budget', 'our timeline',
        'can you help us', 'how does this work', 'what about'
      ];
      
      const salesRepScore = salesRepIndicators.filter(indicator => allText.includes(indicator)).length;
      const prospectScore = prospectIndicators.filter(indicator => allText.includes(indicator)).length;
      
      if (salesRepScore > prospectScore && salesRepScore > 0) {
        return {
          speakerId,
          role: 'sales_rep',
          confidence: Math.min(0.6 + (salesRepScore * 0.1), 0.8),
          reasoning: `Speech pattern analysis (sales indicators: ${salesRepScore})`
        };
      } else if (prospectScore > salesRepScore && prospectScore > 0) {
        return {
          speakerId,
          role: 'prospect', 
          confidence: Math.min(0.6 + (prospectScore * 0.1), 0.8),
          reasoning: `Speech pattern analysis (prospect indicators: ${prospectScore})`
        };
      }
    }

    // Default: unknown
    return {
      speakerId,
      role: 'unknown',
      confidence: 0.3,
      reasoning: 'Insufficient data for classification'
    };
  }

  /**
   * Process a single call transcript with speaker identification
   * Why this matters: Separates prospect pain points from sales rep statements for accurate analysis.
   */
  processTranscript(call: GongCall, transcript: GongTranscript): ProcessedTranscript {
    console.log(`🔍 Processing transcript for call ${call.id}: "${call.title}"`);
    
    const speakers: ProcessedTranscript['speakers'] = [];
    const prospectStatements: string[] = [];
    const salesRepStatements: string[] = [];
    const rawTranscriptParts: string[] = [];
    
    // Process each speaker in the transcript
    for (const transcriptPart of transcript.transcript) {
      const { speakerId, sentences } = transcriptPart;
      
      // Classify the speaker
      const classification = this.classifySpeaker(speakerId, call, transcript);
      
      // Get speaker name from call participants
      const participant = call.participants.find(p => p.userId === speakerId);
      const speakerName = participant?.name || `Speaker ${speakerId}`;
      
      // Extract all text from this speaker
      const statements = sentences.map(sentence => ({
        text: sentence.text,
        timestamp: sentence.start,
        confidence: classification.confidence
      }));
      
      const allText = sentences.map(s => s.text).join(' ');
      
      // Add to appropriate category based on role
      if (classification.role === 'prospect') {
        prospectStatements.push(allText);
      } else if (classification.role === 'sales_rep') {
        salesRepStatements.push(allText);
      }
      
      // Add to raw transcript
      rawTranscriptParts.push(`[${speakerName}]: ${allText}`);
      
      // Add speaker info
      speakers.push({
        id: speakerId,
        name: speakerName,
        role: classification.role,
        statements
      });
      
      console.log(`👤 Speaker ${speakerId} (${speakerName}) classified as: ${classification.role} (confidence: ${classification.confidence})`);
      console.log(`   Reasoning: ${classification.reasoning}`);
    }
    
    const prospectStatementCount = prospectStatements.length;
    const salesRepStatementCount = salesRepStatements.length;
    
    console.log(`✅ Processed transcript - ${prospectStatementCount} prospect statements, ${salesRepStatementCount} sales rep statements`);
    
    return {
      callId: call.id,
      speakers,
      prospectStatements,
      salesRepStatements,
      rawTranscript: rawTranscriptParts.join('\n\n')
    };
  }

  /**
   * Process multiple call transcripts in batch
   * Why this matters: Efficiently processes large volumes of call data for pain point analysis.
   */
  processMultipleTranscripts(
    callsWithTranscripts: Array<{call: GongCall, transcript: GongTranscript | null}>
  ): ProcessedTranscript[] {
    console.log(`🔄 Processing ${callsWithTranscripts.length} call transcripts...`);
    
    const results: ProcessedTranscript[] = [];
    
    for (const item of callsWithTranscripts) {
      if (item.transcript) {
        try {
          const processed = this.processTranscript(item.call, item.transcript);
          results.push(processed);
        } catch (error) {
          console.error(`❌ Failed to process transcript for call ${item.call.id}:`, error);
        }
      } else {
        console.log(`⚠️ Skipping call ${item.call.id} - no transcript available`);
      }
    }
    
    const totalProspectStatements = results.reduce((sum, r) => sum + r.prospectStatements.length, 0);
    const totalSalesRepStatements = results.reduce((sum, r) => sum + r.salesRepStatements.length, 0);
    
    console.log(`✅ Batch processing complete:`);
    console.log(`   📞 ${results.length} calls processed`);
    console.log(`   🗣️ ${totalProspectStatements} prospect statements extracted`);
    console.log(`   👔 ${totalSalesRepStatements} sales rep statements identified`);
    
    return results;
  }

  /**
   * Extract prospect-only statements for pain point analysis
   * Why this matters: Pain point analysis should focus only on customer/prospect concerns, not sales pitch.
   */
  extractProspectStatements(processedTranscripts: ProcessedTranscript[]): Array<{
    callId: string;
    callStatements: string[];
    combinedText: string;
  }> {
    return processedTranscripts.map(transcript => ({
      callId: transcript.callId,
      callStatements: transcript.prospectStatements,
      combinedText: transcript.prospectStatements.join(' ')
    }));
  }

  /**
   * Get processing statistics
   * Why this matters: Provides insights into data quality and speaker identification accuracy.
   */
  getProcessingStats(processedTranscripts: ProcessedTranscript[]) {
    const totalCalls = processedTranscripts.length;
    const totalSpeakers = processedTranscripts.reduce((sum, t) => sum + t.speakers.length, 0);
    
    let prospectCount = 0;
    let salesRepCount = 0;
    let unknownCount = 0;
    let highConfidenceCount = 0;
    
    processedTranscripts.forEach(transcript => {
      transcript.speakers.forEach(speaker => {
        if (speaker.role === 'prospect') prospectCount++;
        else if (speaker.role === 'sales_rep') salesRepCount++;
        else unknownCount++;
        
        const avgConfidence = speaker.statements.reduce((sum, s) => sum + s.confidence, 0) / speaker.statements.length;
        if (avgConfidence > 0.8) highConfidenceCount++;
      });
    });
    
    return {
      totalCalls,
      totalSpeakers,
      speakerClassification: {
        prospects: prospectCount,
        salesReps: salesRepCount,
        unknown: unknownCount
      },
      classificationAccuracy: {
        highConfidence: highConfidenceCount,
        percentage: Math.round((highConfidenceCount / totalSpeakers) * 100)
      }
    };
  }
}

export default TranscriptProcessor; 