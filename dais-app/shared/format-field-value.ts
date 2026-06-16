export const EMPTY_FIELD = 'n/a';

export function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return EMPTY_FIELD;
  const text = String(value).trim();
  if (text === '' || text === '—' || text.toLowerCase() === 'null') return EMPTY_FIELD;
  return text;
}

export function hasFieldValue(value: unknown): boolean {
  return formatFieldValue(value) !== EMPTY_FIELD;
}
