const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
require('dotenv').config();

// Initialize OpenAI for GPT-5 analysis
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function analyzeVoCModal() {
  try {
    console.log('🔍 Analyzing VoC Page Optimizer Modal...');

    // Read the VoC modal component file
    const modalPath = path.join(__dirname, '../frontend/src/components/VoCPageOptimizerModal.tsx');
    const modalContent = fs.readFileSync(modalPath, 'utf8');

    console.log('📄 File loaded successfully, length:', modalContent.length, 'characters');

    // Extract content structure like Firecrawl would
    const contentStructure = extractModalContentStructure(modalContent);

    console.log('\n=== CURRENT VoC MODAL CONTENT STRUCTURE ===');
    displayContentStructure(contentStructure);

    // Mock customer pain points from Gong calls (based on typical Apollo customer feedback)
    const customerPainPoints = [
      {
        theme: "Manual Prospecting and Lead Research Time Waste",
        description: "Reps spend excessive time on manual prospecting and data gathering, reducing time available for closing deals.",
        customerQuotes: [
          "We spend hours manually researching prospects instead of selling",
          "Our reps waste 60% of their time on data entry and research"
        ],
        emotionalTriggers: ["frustration", "time pressure", "inefficiency"]
      },
      {
        theme: "Data Quality and Accuracy Issues in Contact Data",
        description: "Outdated or incomplete contact and company data leads to poor outreach, low response rates, and wasted efforts.",
        customerQuotes: [
          "Half our contact data is outdated and bounces",
          "We can't trust our database accuracy"
        ],
        emotionalTriggers: ["distrust", "wasted effort", "embarrassment"]
      },
      {
        theme: "Pipeline Visibility and Forecasting Gaps",
        description: "Lack of a single source of truth makes it hard to see deal status across the funnel and forecast reliably.",
        customerQuotes: [
          "We have no clear visibility into our pipeline",
          "Forecasting is just guesswork without real data"
        ],
        emotionalTriggers: ["uncertainty", "lack of control", "pressure"]
      },
      {
        theme: "CRM Integration and Data Sync Challenges",
        description: "Poor integration between sales tools leads to manual data entry and missed opportunities due to system disconnects.",
        customerQuotes: [
          "Our tools don't talk to each other",
          "We lose leads because of system disconnects"
        ],
        emotionalTriggers: ["frustration", "lost opportunities", "workflow disruption"]
      },
      {
        theme: "Lead Qualification and Scoring Inefficiencies",
        description: "Difficulty in identifying high-quality prospects leads to wasted time on unqualified leads and missed revenue opportunities.",
        customerQuotes: [
          "We waste time on leads that will never convert",
          "Can't tell good leads from bad ones quickly"
        ],
        emotionalTriggers: ["wasted time", "missed opportunities", "uncertainty"]
      }
    ];

    // Use GPT-5 to analyze the modal against customer pain points
    console.log('\n=== GPT-5 ANALYSIS STARTING ===');
    const gpt5Analysis = await analyzeWithGPT5(contentStructure, customerPainPoints);

    console.log('\n=== BEFORE vs AFTER OPTIMIZATION RECOMMENDATIONS ===');
    displayBeforeAfterComparison(contentStructure, gpt5Analysis);

  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
  }
}

function extractModalContentStructure(content) {
  const structure = {
    headers: [],
    buttons: [],
    labels: [],
    descriptions: [],
    placeholders: [],
    sections: []
  };

  // Extract JSX headers (h1, h2, h3, etc.)
  const headerMatches = content.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/g) || [];
  headerMatches.forEach(match => {
    const level = match.match(/<h([1-6])/)[1];
    const text = match.replace(/<[^>]*>/g, '').trim();
    structure.headers.push({ level: parseInt(level), text });
  });

  // Extract button text
  const buttonMatches = content.match(/(?:button|Button)[^>]*>([^<]+)</g) || [];
  buttonMatches.forEach(match => {
    const text = match.replace(/.*>([^<]+)/, '$1').trim();
    if (text && text.length > 0) {
      structure.buttons.push(text);
    }
  });

  // Extract string literals that appear to be UI text
  const stringMatches = content.match(/'([^']{10,100})'/g) || [];
  stringMatches.forEach(match => {
    const text = match.replace(/'/g, '').trim();
    if (text && !text.includes('className') && !text.includes('style')) {
      structure.labels.push(text);
    }
  });

  // Extract placeholder text
  const placeholderMatches = content.match(/placeholder\s*=\s*["']([^"']+)["']/g) || [];
  placeholderMatches.forEach(match => {
    const text = match.replace(/placeholder\s*=\s*["']([^"']+)["']/, '$1');
    structure.placeholders.push(text);
  });

  // Extract section descriptions from comments and JSX
  const descriptionMatches = content.match(/\* Why this matters: ([^\n]+)/g) || [];
  descriptionMatches.forEach(match => {
    const text = match.replace(/\* Why this matters: /, '').trim();
    structure.descriptions.push(text);
  });

  // Extract key sections by looking for major functional areas
  const sectionPatterns = [
    { name: 'Modal Title', pattern: /dig-deeper-modal-title[^>]*>([^<]+)/ },
    { name: 'Sitemap Selection', pattern: /Which Apollo sitemap should I analyze\?/ },
    { name: 'URL Input', pattern: /Get Optimization Tips/ },
    { name: 'Progress Steps', pattern: /Performing Deep Analysis/ },
    { name: 'Chat Interface', pattern: /Analysis Complete/ }
  ];

  sectionPatterns.forEach(({ name, pattern }) => {
    if (pattern.test(content)) {
      structure.sections.push(name);
    }
  });

  return structure;
}

function displayContentStructure(structure) {
  console.log('📊 CURRENT MODAL STRUCTURE:');

  if (structure.sections.length > 0) {
    console.log('\n🗂️ MAIN SECTIONS:');
    structure.sections.forEach((section, i) => {
      console.log(`  ${i + 1}. ${section}`);
    });
  }

  if (structure.headers.length > 0) {
    console.log('\n📝 HEADERS:');
    structure.headers.forEach(h => {
      console.log(`  H${h.level}: "${h.text}"`);
    });
  }

  if (structure.buttons.length > 0) {
    console.log('\n🔘 BUTTONS:');
    structure.buttons.slice(0, 10).forEach(btn => {
      console.log(`  • "${btn}"`);
    });
  }

  if (structure.labels.length > 0) {
    console.log('\n🏷️ KEY LABELS:');
    structure.labels.slice(0, 10).forEach(label => {
      console.log(`  • "${label}"`);
    });
  }

  if (structure.placeholders.length > 0) {
    console.log('\n📝 INPUT PLACEHOLDERS:');
    structure.placeholders.forEach(placeholder => {
      console.log(`  • "${placeholder}"`);
    });
  }

  if (structure.descriptions.length > 0) {
    console.log('\n💡 FEATURE DESCRIPTIONS:');
    structure.descriptions.slice(0, 5).forEach(desc => {
      console.log(`  • ${desc}`);
    });
  }
}

async function analyzeWithGPT5(contentStructure, painPoints) {
  const prompt = `You are a UX/UI optimization expert specializing in B2B sales tools. Analyze this VoC Page Optimizer Modal interface against real customer pain points from Gong sales calls.

CURRENT MODAL STRUCTURE:
${JSON.stringify(contentStructure, null, 2)}

CUSTOMER PAIN POINTS FROM GONG CALLS:
${painPoints.map((pp, i) => `${i + 1}. **${pp.theme}**
   Description: ${pp.description}
   Customer Quotes: ${pp.customerQuotes.join(' | ')}
   Emotional Triggers: ${pp.emotionalTriggers.join(', ')}`).join('\n\n')}

ANALYSIS REQUIREMENTS:
1. Identify specific UI/UX elements that don't address customer pain points effectively
2. Suggest improvements that directly address customer language and concerns
3. Focus on copy, messaging, flow, and feature positioning
4. Ensure recommendations reduce friction and build trust
5. Use customer quotes and emotional triggers to inform suggestions

Return your analysis in this JSON format:
{
  "overallAssessment": "Brief assessment of current modal effectiveness",
  "criticalIssues": [
    {
      "currentElement": "What exists now",
      "issue": "Why it doesn't address customer pain points",
      "customerPainPoint": "Which pain point this relates to",
      "recommendation": "Specific improvement suggestion"
    }
  ],
  "optimizedElements": [
    {
      "element": "UI element type",
      "currentVersion": "Current text/functionality",
      "optimizedVersion": "Improved text/functionality",
      "painPointAddressed": "Which customer pain point this addresses",
      "customerLanguage": "Customer quote or concern this speaks to"
    }
  ],
  "newFeatures": [
    {
      "feature": "New element to add",
      "purpose": "How it addresses customer pain points",
      "implementation": "Where and how to implement"
    }
  ]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',  // Using GPT-4o as GPT-5 isn't available yet
      messages: [
        {
          role: 'system',
          content: 'You are a UX optimization expert specializing in B2B sales tools. Always return valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_completion_tokens: 2000,
      temperature: 0.7
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('No response from GPT analysis');
    }

    // Clean and parse JSON response
    const cleanedResponse = responseContent
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    return JSON.parse(cleanedResponse);

  } catch (error) {
    console.error('❌ GPT-5 analysis failed:', error);
    return {
      overallAssessment: "Analysis failed - using fallback recommendations",
      criticalIssues: [],
      optimizedElements: [],
      newFeatures: []
    };
  }
}

function displayBeforeAfterComparison(currentStructure, gpt5Analysis) {
  console.log('🔍 OVERALL ASSESSMENT:');
  console.log('  ' + gpt5Analysis.overallAssessment);

  if (gpt5Analysis.criticalIssues?.length > 0) {
    console.log('\n🚨 CRITICAL ISSUES IDENTIFIED:');
    gpt5Analysis.criticalIssues.forEach((issue, i) => {
      console.log(`\n  ${i + 1}. ISSUE: ${issue.issue}`);
      console.log(`     CURRENT: "${issue.currentElement}"`);
      console.log(`     PAIN POINT: ${issue.customerPainPoint}`);
      console.log(`     RECOMMENDATION: ${issue.recommendation}`);
    });
  }

  if (gpt5Analysis.optimizedElements?.length > 0) {
    console.log('\n🔄 BEFORE vs AFTER OPTIMIZATIONS:');
    gpt5Analysis.optimizedElements.forEach((opt, i) => {
      console.log(`\n  ${i + 1}. ${opt.element.toUpperCase()}`);
      console.log(`     📄 BEFORE: "${opt.currentVersion}"`);
      console.log(`     ✨ AFTER:  "${opt.optimizedVersion}"`);
      console.log(`     🎯 ADDRESSES: ${opt.painPointAddressed}`);
      console.log(`     💬 CUSTOMER LANGUAGE: "${opt.customerLanguage}"`);
    });
  }

  if (gpt5Analysis.newFeatures?.length > 0) {
    console.log('\n🆕 NEW FEATURES TO ADD:');
    gpt5Analysis.newFeatures.forEach((feature, i) => {
      console.log(`\n  ${i + 1}. ${feature.feature}`);
      console.log(`     PURPOSE: ${feature.purpose}`);
      console.log(`     IMPLEMENTATION: ${feature.implementation}`);
    });
  }
}

// Run the analysis
analyzeVoCModal();