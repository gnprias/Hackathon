import { locationTokenScore, nameMatchScore, verdictFromScore, type MatchVerdict } from './name-match';

export interface WebsiteRelevanceInput {
  facilityName: string;
  city?: string | null;
  state?: string | null;
  url: string;
  finalUrl?: string | null;
  pageTitle?: string | null;
  metaDescription?: string | null;
  visibleText?: string | null;
  httpStatus?: number | null;
  fetchError?: string | null;
}

export interface WebsiteRelevanceResult {
  verdict: MatchVerdict | 'unreachable' | 'skipped';
  score: number;
  nameScore: number;
  locationScore: number;
  pageTitle: string | null;
  finalUrl: string | null;
  suspiciousDomain: boolean;
  suspiciousReason: string | null;
  summary: string;
}

const GOVERNMENT_DOMAIN_PATTERNS = [
  /\.gov(\.|$)/i,
  /\.nic\.in$/i,
  /finance\./i,
  /treasury\./i,
  /department\./i,
  /government\./i,
];

function isSuspiciousDomain(url: string): { suspicious: boolean; reason: string | null } {
  try {
    const host = new URL(url).hostname.toLowerCase();
    for (const pattern of GOVERNMENT_DOMAIN_PATTERNS) {
      if (pattern.test(host)) {
        return {
          suspicious: true,
          reason: `Domain looks like a government or department site (${host})`,
        };
      }
    }
  } catch {
    return { suspicious: false, reason: null };
  }
  return { suspicious: false, reason: null };
}

export function assessWebsiteRelevance(input: WebsiteRelevanceInput): WebsiteRelevanceResult {
  if (!input.url.trim()) {
    return {
      verdict: 'skipped',
      score: 0,
      nameScore: 0,
      locationScore: 0,
      pageTitle: null,
      finalUrl: null,
      suspiciousDomain: false,
      suspiciousReason: null,
      summary: 'No website URL on record.',
    };
  }

  if (input.fetchError || input.httpStatus == null || input.httpStatus >= 400) {
    return {
      verdict: 'unreachable',
      score: 0,
      nameScore: 0,
      locationScore: 0,
      pageTitle: input.pageTitle ?? null,
      finalUrl: input.finalUrl ?? input.url,
      suspiciousDomain: false,
      suspiciousReason: null,
      summary: input.fetchError ?? `Website returned HTTP ${input.httpStatus ?? 'error'}.`,
    };
  }

  const combinedText = [input.pageTitle, input.metaDescription, input.visibleText]
    .filter(Boolean)
    .join(' ');

  const nameScore = nameMatchScore(input.facilityName, combinedText);
  const locationScore = locationTokenScore(input.city, input.state, combinedText);
  const score = Math.min(1, nameScore * 0.75 + locationScore * 0.25);

  const finalUrl = input.finalUrl ?? input.url;
  const domainCheck = isSuspiciousDomain(finalUrl);

  let verdict = verdictFromScore(score);
  if (domainCheck.suspicious && nameScore < 0.35) {
    verdict = 'likely_mismatch';
  }

  const summary = buildWebsiteSummary({
    verdict,
    nameScore,
    locationScore,
    pageTitle: input.pageTitle ?? null,
    suspiciousReason: domainCheck.reason,
  });

  return {
    verdict,
    score,
    nameScore,
    locationScore,
    pageTitle: input.pageTitle ?? null,
    finalUrl,
    suspiciousDomain: domainCheck.suspicious,
    suspiciousReason: domainCheck.reason,
    summary,
  };
}

function buildWebsiteSummary(args: {
  verdict: MatchVerdict;
  nameScore: number;
  locationScore: number;
  pageTitle: string | null;
  suspiciousReason: string | null;
}): string {
  const namePct = Math.round(args.nameScore * 100);
  const parts: string[] = [];

  if (args.verdict === 'likely_match') {
    parts.push(`Page content aligns with the facility name (${namePct}% name token match).`);
  } else if (args.verdict === 'weak_match') {
    parts.push(`Page is reachable but only partially matches the facility name (${namePct}%).`);
  } else {
    parts.push(`Page is reachable but does not appear to be this facility (${namePct}% name match).`);
  }

  if (args.pageTitle) {
    parts.push(`Page title: "${args.pageTitle}".`);
  }
  if (args.suspiciousReason) {
    parts.push(args.suspiciousReason);
  }
  if (args.locationScore > 0) {
    parts.push('City or state appears on the page.');
  }

  return parts.join(' ');
}
