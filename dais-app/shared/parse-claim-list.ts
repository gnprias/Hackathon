/** Parse facility-reported claim fields (JSON array, comma-separated, or native arrays). */
export function parseClaimList(value: unknown): string[] {
  if (value == null) return [];

  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter((item) => item.trim() !== '');
  }

  const text = typeof value === 'string' ? value : String(value);
  if (text.trim() === '' || text.trim() === '[]') return [];

  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item)).filter((item) => item.trim() !== '');
    }
  } catch {
    // fall through to delimiter split
  }

  return text
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Remove duplicates within a category (case-insensitive, trimmed). */
export function dedupeClaimItems(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }

  return result;
}

export function parseDedupedClaimList(value: unknown): string[] {
  return dedupeClaimItems(parseClaimList(value));
}
