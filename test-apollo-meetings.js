const FirecrawlService = require('./dist/src/services/firecrawlService.js').default;
require('dotenv').config();

async function crawlApolloMeetings() {
  try {
    console.log('🔍 Crawling Apollo Meetings product page...');

    const firecrawl = new FirecrawlService();
    const result = await firecrawl.extractArticleContent('https://www.apollo.io/product/meetings');

    if (result.success && result.data) {
      console.log('\n=== PAGE CONTENT EXTRACTED ===');
      console.log('📄 Title:', result.data.title);
      console.log('📊 Word Count:', result.data.wordCount);
      console.log('📝 Description:', result.data.metadata?.description || 'No description');

      // Extract all heading levels and content structure
      console.log('\n=== ALL HEADINGS & CONTENT STRUCTURE ===');

      if (result.data.structure && result.data.structure.headings) {
        const headings = result.data.structure.headings;

        // Group headings by level
        const headingsByLevel = {};
        for (let i = 1; i <= 6; i++) {
          headingsByLevel[i] = headings.filter(h => h.level === i);
        }

        // Display all heading levels
        for (let level = 1; level <= 6; level++) {
          const levelHeadings = headingsByLevel[level];
          if (levelHeadings.length > 0) {
            const emoji = level === 1 ? '🎯' : level === 2 ? '📋' : level === 3 ? '📝' :
                         level === 4 ? '🔸' : level === 5 ? '🔹' : '🏷️';
            console.log(`\n${emoji} H${level} HEADINGS:`);
            levelHeadings.forEach(h => console.log(`  • ${h.text}`));
          }
        }

        console.log('\n📊 HEADING SUMMARY:');
        for (let i = 1; i <= 6; i++) {
          console.log(`  H${i}s found: ${headingsByLevel[i].length}`);
        }

        // Show paragraph structure if available
        if (result.data.structure.paragraphs) {
          console.log('\n📄 PARAGRAPH STRUCTURE:');
          console.log('  Total paragraphs:', result.data.structure.paragraphs.length);

          const paragraphsByType = {};
          result.data.structure.paragraphs.forEach(p => {
            if (!paragraphsByType[p.type]) paragraphsByType[p.type] = [];
            paragraphsByType[p.type].push(p);
          });

          Object.keys(paragraphsByType).forEach(type => {
            console.log(`  ${type} paragraphs: ${paragraphsByType[type].length}`);
          });
        }

      } else {
        console.log('❌ No structured headings found in Firecrawl analysis');
      }

      // Enhanced manual extraction from raw content
      console.log('\n=== ENHANCED MANUAL EXTRACTION ===');
      const markdownContent = result.data.rawMarkdown || '';
      const htmlContent = result.data.rawHtml || '';

      // Extract all heading levels from markdown
      const headingPatterns = [
        { level: 1, pattern: /^# (.+)$/gm, emoji: '🎯' },
        { level: 2, pattern: /^## (.+)$/gm, emoji: '📋' },
        { level: 3, pattern: /^### (.+)$/gm, emoji: '📝' },
        { level: 4, pattern: /^#### (.+)$/gm, emoji: '🔸' },
        { level: 5, pattern: /^##### (.+)$/gm, emoji: '🔹' },
        { level: 6, pattern: /^###### (.+)$/gm, emoji: '🏷️' }
      ];

      headingPatterns.forEach(({ level, pattern, emoji }) => {
        const matches = [];
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(markdownContent)) !== null) {
          matches.push(match[1].trim());
        }

        if (matches.length > 0) {
          console.log(`\n${emoji} MANUAL H${level} EXTRACTION:`);
          matches.forEach(h => console.log(`  • ${h}`));
        }
      });

      // Extract HTML elements with classes if HTML is available
      if (htmlContent) {
        console.log('\n=== HTML ELEMENT EXTRACTION ===');

        // Extract H6 with classes from HTML
        const h6Pattern = /<h6[^>]*class="([^"]*)"[^>]*>([^<]+)<\/h6>/gi;
        const h6WithClasses = [];
        let h6Match;

        while ((h6Match = h6Pattern.exec(htmlContent)) !== null) {
          h6WithClasses.push({
            text: h6Match[2].trim(),
            classes: h6Match[1]
          });
        }

        if (h6WithClasses.length > 0) {
          console.log('\n🏷️ H6 ELEMENTS WITH CLASSES:');
          h6WithClasses.forEach(h => {
            console.log(`  • "${h.text}" (class: "${h.classes}")`);
          });
        }

        // Extract paragraphs with classes from HTML
        const pPattern = /<p[^>]*class="([^"]*)"[^>]*>([^<]+)<\/p>/gi;
        const paragraphsWithClasses = [];
        let pMatch;

        while ((pMatch = pPattern.exec(htmlContent)) !== null) {
          paragraphsWithClasses.push({
            text: pMatch[2].trim(),
            classes: pMatch[1]
          });
        }

        if (paragraphsWithClasses.length > 0) {
          console.log('\n📄 PARAGRAPHS WITH CLASSES:');
          paragraphsWithClasses.forEach((p, index) => {
            if (index < 10) { // Limit to first 10 paragraphs
              console.log(`  • "${p.text}" (class: "${p.classes}")`);
            }
          });
          if (paragraphsWithClasses.length > 10) {
            console.log(`  ... and ${paragraphsWithClasses.length - 10} more paragraphs`);
          }
        }

        // Extract any H6 without class attribute too
        const h6SimplePattern = /<h6[^>]*>([^<]+)<\/h6>/gi;
        const simpleH6s = [];
        let simpleH6Match;

        while ((simpleH6Match = h6SimplePattern.exec(htmlContent)) !== null) {
          const text = simpleH6Match[1].trim();
          // Avoid duplicates from the class-based extraction
          if (!h6WithClasses.some(h => h.text === text)) {
            simpleH6s.push(text);
          }
        }

        if (simpleH6s.length > 0) {
          console.log('\n🏷️ H6 ELEMENTS WITHOUT CLASSES:');
          simpleH6s.forEach(h => console.log(`  • "${h}"`));
        }
      }

      // Show detailed section extraction to prove we got the specific content
      console.log('\n=== DETAILED SECTION EXTRACTION ===');

      // Look for the specific "LEAD QUALIFICATION & ROUTING" section
      const leadQualSection = markdownContent.match(
        /LEAD QUALIFICATION & ROUTING\s*\n\n### Qualify and route leads like nobody's business\s*\n\n(.*?)(?=\n\n[A-Z\s&]+\n|$)/s
      );

      if (leadQualSection) {
        console.log('🎯 FOUND LEAD QUALIFICATION SECTION:');
        console.log('├─ Section Label: "LEAD QUALIFICATION & ROUTING"');
        console.log('├─ H3 Heading: "Qualify and route leads like nobody\'s business"');
        console.log('└─ Content: "' + leadQualSection[1].trim() + '"');
      } else {
        console.log('❌ Could not find lead qualification section with regex');
      }

      // Extract all content in structured order as it appears on page
      console.log('\n=== PAGE CONTENT IN STRUCTURED ORDER ===');

      // Split content into logical sections
      const sections = markdownContent.split(/\n\n(?=[A-Z\s&]+\n|### )/);

      sections.forEach((section, index) => {
        if (section.trim()) {
          const lines = section.trim().split('\n');

          // Identify section type
          if (lines[0].match(/^[A-Z\s&]+$/)) {
            console.log(`\n📋 SECTION ${index + 1}: FEATURE SECTION`);
            console.log(`├─ Label: "${lines[0]}"`);

            if (lines[1] && lines[1].startsWith('###')) {
              console.log(`├─ H3 Heading: "${lines[1].replace(/^### /, '')}"`);
            }

            // Find the descriptive paragraph
            const contentLines = lines.slice(2).filter(line => line.trim() && !line.startsWith('#'));
            if (contentLines.length > 0) {
              console.log(`└─ Description: "${contentLines.join(' ').trim()}"`);
            }

          } else if (lines[0].startsWith('###')) {
            console.log(`\n📝 SECTION ${index + 1}: HEADING SECTION`);
            console.log(`├─ H3: "${lines[0].replace(/^### /, '')}"`);

            const contentLines = lines.slice(1).filter(line => line.trim());
            if (contentLines.length > 0) {
              console.log(`└─ Content: "${contentLines.join(' ').trim()}"`);
            }
          }
        }
      });

      // Search specifically for the target paragraph
      console.log('\n=== PROOF OF TARGET PARAGRAPH EXTRACTION ===');
      const targetText = 'Ensure only qualified leads are booking meetings automatically with an inbound router that takes only minutes to set up. Choose to assign leads by CRM contact owner, or round-robin them to your reps based on availability or even distribution.';

      const foundInMarkdown = markdownContent.includes('Ensure only qualified leads are booking');
      const foundInContent = result.data.content.includes('Ensure only qualified leads are booking');

      console.log('🔍 SEARCHING FOR TARGET PARAGRAPH:');
      console.log('├─ Target: "Ensure only qualified leads are booking meetings automatically..."');
      console.log('├─ Found in Markdown: ' + (foundInMarkdown ? '✅ YES' : '❌ NO'));
      console.log('├─ Found in Clean Content: ' + (foundInContent ? '✅ YES' : '❌ NO'));

      if (foundInMarkdown) {
        const contextStart = markdownContent.indexOf('Ensure only qualified leads') - 100;
        const contextEnd = markdownContent.indexOf('distribution.') + 20;
        const context = markdownContent.substring(Math.max(0, contextStart), contextEnd);

        console.log('└─ EXTRACTED WITH CONTEXT:');
        console.log('   ' + context.replace(/\n/g, '\n   '));
      }

      // Show raw markdown sample for debugging
      console.log('\n=== RAW MARKDOWN SAMPLE (first 1200 chars) ===');
      console.log(markdownContent.substring(0, 1200));

    } else {
      console.log('\n❌ EXTRACTION FAILED');
      console.log('Error:', result.error);
    }

  } catch (error) {
    console.error('\n💥 CRAWLING FAILED');
    console.error('Error:', error.message);
  }
}

crawlApolloMeetings();