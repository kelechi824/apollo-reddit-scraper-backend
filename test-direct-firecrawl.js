// Direct test of Firecrawl service
require('dotenv').config(); // Load environment variables

const FirecrawlService = require('./dist/src/services/firecrawlService.js').default;

async function testDirectFirecrawl() {
    console.log('🔍 Testing Direct Firecrawl for https://www.apollo.io/roles/staff-directory');
    console.log('🔑 Using API Key:', process.env.FIRECRAWL_API_KEY ? 'Present' : 'Missing');

    try {
        const firecrawlService = new FirecrawlService();

        console.log('📡 Starting direct Firecrawl extraction...');

        // Test with enhanced Firecrawl that detects visual headers
        console.log('🔍 Testing with ENHANCED configuration (visual header detection)...');
        const result = await firecrawlService.extractArticleContent('https://www.apollo.io/roles/staff-directory');

        console.log('✅ Firecrawl extraction completed');
        console.log('\n📊 EXTRACTION RESULTS:');
        console.log('======================');
        console.log('Success:', result.success);

        if (result.success && result.data) {
            console.log('📄 URL:', result.data.url);
            console.log('📝 Title:', result.data.title);
            console.log('📊 Word Count:', result.data.wordCount);

            console.log('\n🔍 CONTENT PREVIEW (first 500 chars):');
            console.log('======================================');
            console.log(result.data.content.substring(0, 500) + '...');

            // Look for staff directory specific content
            const content = result.data.content.toLowerCase();
            console.log('\n🎯 STAFF DIRECTORY ANALYSIS:');
            console.log('============================');
            console.log('Contains "staff":', content.includes('staff'));
            console.log('Contains "directory":', content.includes('directory'));
            console.log('Contains "employee":', content.includes('employee'));
            console.log('Contains "team":', content.includes('team'));
            console.log('Contains "contact":', content.includes('contact'));

            // Check for structure
            if (result.data.structure) {
                console.log('\n📋 CONTENT STRUCTURE:');
                console.log('=====================');
                console.log('Total paragraphs:', result.data.structure.totalParagraphs);
                console.log('Headings found:', result.data.structure.headings.length);

                if (result.data.structure.headings.length > 0) {
                    console.log('\n🎯 HEADINGS FOUND:');
                    console.log('==================');
                    result.data.structure.headings.slice(0, 10).forEach((heading, index) => {
                        console.log(`${index + 1}. H${heading.level}: "${heading.text}"`);
                    });
                    if (result.data.structure.headings.length > 10) {
                        console.log(`... and ${result.data.structure.headings.length - 10} more headings`);
                    }
                } else {
                    console.log('❌ No headings found');
                }
            }

            // Check raw content for HTML structure if available
            if (result.data.rawHtml) {
                console.log('\n🔍 COMPLETE PAGE STRUCTURE ANALYSIS:');
                console.log('===================================');

                // Count all heading levels
                const allHeadings = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(tag => {
                    const matches = result.data.rawHtml.match(new RegExp(`<${tag}[^>]*>(.*?)<\/${tag}>`, 'gi'));
                    return {
                        tag: tag.toUpperCase(),
                        count: matches ? matches.length : 0,
                        content: matches ? matches.slice(0, 5).map(m => m.replace(/<[^>]*>/g, '').trim()) : []
                    };
                });

                allHeadings.forEach(heading => {
                    if (heading.count > 0) {
                        console.log(`${heading.tag}: ${heading.count} found`);
                        heading.content.forEach((text, i) => {
                            console.log(`  ${i + 1}. "${text}"`);
                        });
                        if (heading.count > 5) console.log(`  ... and ${heading.count - 5} more`);
                    }
                });

                // Look for key sections mentioned in screenshots
                console.log('\n🎯 KEY SECTIONS SEARCH:');
                console.log('======================');
                const searchTerms = [
                    'Staff Contacts',
                    'Find Staff Contact Details Fast',
                    'Verified contact details',
                    'Filter by role',
                    'Export to CRM',
                    'Unlock Staff Outreach Opportunities',
                    'Connect Staff'
                ];

                searchTerms.forEach(term => {
                    const found = result.data.content.toLowerCase().includes(term.toLowerCase()) ||
                                 (result.data.rawHtml && result.data.rawHtml.toLowerCase().includes(term.toLowerCase()));
                    console.log(`"${term}": ${found ? '✅ Found' : '❌ Missing'}`);
                });

                // Check for <p> tags and their classes
                console.log('\n📝 PARAGRAPH ANALYSIS:');
                console.log('======================');
                const pMatches = result.data.rawHtml.match(/<p[^>]*class="[^"]*"[^>]*>(.*?)<\/p>/gi);
                if (pMatches && pMatches.length > 0) {
                    console.log(`Found ${pMatches.length} <p> tags with classes`);
                    pMatches.slice(0, 10).forEach((p, index) => {
                        const classMatch = p.match(/class="([^"]*)"/);
                        const content = p.replace(/<[^>]*>/g, '').trim();
                        const className = classMatch ? classMatch[1] : 'no-class';
                        if (content) {
                            console.log(`${index + 1}. Class: "${className}"`);
                            console.log(`   Content: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`);
                        }
                    });
                } else {
                    console.log('❌ No <p> tags with classes found');
                }

                // Check if we're missing the section structure - look for specific headings that should be H2
                console.log('\n🔍 MISSING SECTION HEADERS CHECK:');
                console.log('=================================');

                // These should likely be H2 tags but might be in other elements
                const expectedH2s = [
                    'Staff Contacts',
                    'Connect Staff',
                    'Unlock Staff Outreach Opportunities'
                ];

                expectedH2s.forEach(heading => {
                    // Check if it exists anywhere in HTML, even if not as proper heading
                    const regex = new RegExp(`[^a-zA-Z]${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-zA-Z]`, 'i');
                    const foundInHtml = result.data.rawHtml && regex.test(result.data.rawHtml);
                    const foundInContent = regex.test(result.data.content);

                    console.log(`"${heading}": ${foundInHtml || foundInContent ? '✅ Found in content' : '❌ Missing entirely'}`);

                    if (foundInHtml) {
                        // Try to find what element it's actually in
                        const elementMatch = result.data.rawHtml.match(new RegExp(`<([^>\\s]+)[^>]*>[^<]*${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^<]*<\/\\1>`, 'i'));
                        if (elementMatch) {
                            console.log(`   Found in: <${elementMatch[1]}> tag`);
                        }
                    }
                });
            }

            // Check markdown content for headings
            if (result.data.rawMarkdown) {
                console.log('\n🔍 MARKDOWN H1 ANALYSIS:');
                console.log('========================');
                const mdH1Matches = result.data.rawMarkdown.match(/^# (.+)$/gm);
                if (mdH1Matches && mdH1Matches.length > 0) {
                    mdH1Matches.forEach((h1, index) => {
                        console.log(`${index + 1}. Markdown H1: "${h1}"`);
                    });
                } else {
                    console.log('❌ No H1 headings found in markdown');

                    // Also check for any level headings
                    const anyHeadings = result.data.rawMarkdown.match(/^#{1,6} (.+)$/gm);
                    if (anyHeadings && anyHeadings.length > 0) {
                        console.log('\n📋 ALL MARKDOWN HEADINGS:');
                        console.log('=========================');
                        anyHeadings.slice(0, 15).forEach((heading, index) => {
                            console.log(`${index + 1}. ${heading}`);
                        });
                    }
                }
            }

        } else {
            console.log('❌ Extraction failed');
            console.log('Error:', result.error);
        }

    } catch (error) {
        console.error('💥 Error during direct Firecrawl test:', error);
        console.error('Error details:', error.message);
    }
}

// Run the test
testDirectFirecrawl();