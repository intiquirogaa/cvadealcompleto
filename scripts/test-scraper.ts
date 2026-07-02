import { fetchDuckDuckGo, parseDuckDuckGoHTML, extractValidProfile } from '../lib/scraper';

async function main() {
  const name = "Mark Zuckerberg"; // Testing with a known name
  const query = `"${name}" site:linkedin.com OR site:instagram.com OR site:facebook.com`;
  
  console.log(`Querying: ${query}`);
  const html = await fetchDuckDuckGo(query);
  console.log('Fetched HTML length:', html.length);
  
  const { urls, snippets } = parseDuckDuckGoHTML(html);
  console.log('Extracted URLs:', urls.length);
  
  const profile = extractValidProfile(urls, snippets, name);
  console.log('Profile:', JSON.stringify(profile, null, 2));
}

main().catch(console.error);
