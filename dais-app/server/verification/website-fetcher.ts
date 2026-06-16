const MAX_HTML_BYTES = 512_000;
const FETCH_TIMEOUT_MS = 12_000;

export interface FetchedPage {
  finalUrl: string;
  httpStatus: number;
  pageTitle: string | null;
  metaDescription: string | null;
  visibleText: string | null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMetaContent(html: string, name: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const match = html.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? stripTags(match[1]).slice(0, 300) : null;
}

function extractVisibleText(html: string): string {
  const h1Matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map((match) => stripTags(match[1] ?? ''))
    .filter(Boolean);
  const body = stripTags(html);
  const combined = [...h1Matches, body].join(' ');
  return combined.slice(0, 8000);
}

export async function fetchWebsitePage(url: string): Promise<{ page: FetchedPage | null; error: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'DAIS-Virtue-Foundation-Verification/1.0 (+facility outreach review)',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return {
        page: {
          finalUrl: response.url,
          httpStatus: response.status,
          pageTitle: null,
          metaDescription: null,
          visibleText: null,
        },
        error: null,
      };
    }

    const buffer = await response.arrayBuffer();
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, MAX_HTML_BYTES));

    return {
      page: {
        finalUrl: response.url,
        httpStatus: response.status,
        pageTitle: extractTitle(html),
        metaDescription:
          extractMetaContent(html, 'description') ??
          extractMetaContent(html, 'og:description') ??
          extractMetaContent(html, 'twitter:description'),
        visibleText: extractVisibleText(html),
      },
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Website fetch failed';
    return { page: null, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export function pickWebsiteUrl(
  websiteWorkingUrl: string | null | undefined,
  officialWebsite: string | null | undefined,
): string | null {
  const candidate = websiteWorkingUrl?.trim() || officialWebsite?.trim();
  if (!candidate) return null;
  if (!candidate.startsWith('http://') && !candidate.startsWith('https://')) {
    return `https://${candidate}`;
  }
  return candidate;
}
