import type { ClientInput, SearchResult, SocialProfile } from '../types';
import { normalizeText, scoreDataPoint } from '../utils/evidence-ranking';

export interface SocialResearchResult {
  profiles: SocialProfile[];
}

export function extractSocialProfiles(
  client: ClientInput,
  evidence: SearchResult[]
): SocialResearchResult {
  const normFirstName = normalizeText(client.firstName);
  const normLastName = normalizeText(client.lastName);
  
  const platforms = [
    { key: 'linkedin', domains: ['linkedin.com/in', 'linkedin.com/pub'] },
    { key: 'instagram', domains: ['instagram.com'] },
    { key: 'facebook', domains: ['facebook.com'] },
    { key: 'twitter', domains: ['twitter.com', 'x.com'] },
    { key: 'github', domains: ['github.com'] },
    { key: 'youtube', domains: ['youtube.com'] },
    { key: 'tiktok', domains: ['tiktok.com'] },
  ];

  const profiles: SocialProfile[] = [];
  const foundPlatforms = new Set<string>();

  for (const res of evidence) {
    const text = normalizeText(res.title + ' ' + res.snippet);
    const urlLower = res.url.toLowerCase();

    // Check if the URL belongs to a known platform
    let matchedPlatform: any = null;
    for (const p of platforms) {
      if (p.domains.some(d => urlLower.includes(d))) {
        matchedPlatform = p;
        break;
      }
    }

    if (matchedPlatform && !foundPlatforms.has(matchedPlatform.key)) {
      // Basic validation: the name must be in the title or snippet
      if (text.includes(normFirstName) || text.includes(normLastName)) {
        
        // Ensure it's not a generic page by demanding more exact match for common names
        const isExactMatch = text.includes(`${normFirstName} ${normLastName}`);
        const hasCompany = client.company && text.includes(normalizeText(client.company));
        const hasCity = client.locality && text.includes(normalizeText(client.locality));
        
        if (isExactMatch || hasCompany || hasCity) {
          foundPlatforms.add(matchedPlatform.key);
          
          const matchReasons = [];
          if (isExactMatch) matchReasons.push('Nombre exacto');
          if (hasCompany) matchReasons.push('Empresa coincidente');
          if (hasCity) matchReasons.push('Ciudad coincidente');

          profiles.push({
            platform: matchedPlatform.key as any,
            url: scoreDataPoint(res.url, res.url, client, evidence, 70), // Base 70 for social profiles
            displayName: res.title.split('-')[0].trim(),
            bio: res.snippet,
            matchReasons
          });
        }
      }
    }
  }

  return { profiles };
}
