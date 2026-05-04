/**
 * Bilingual field type — stored in Firestore as { en: string, ar: string }.
 * The resolver `bl()` also handles legacy string values for backward compat.
 */
export type BilingualField = { en: string; ar: string };

/**
 * Resolve a bilingual field to a string based on active language.
 * Handles both old (string) and new ({ en, ar }) Firestore formats.
 * Falls back to English if the Arabic value is empty.
 */
export function bl(value: string | BilingualField | undefined, lang: string): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const l = lang as 'en' | 'ar';
  return (value[l] || value.en || '');
}

/**
 * Normalize any value into a BilingualField for the editor form.
 * Converts legacy strings to { en: value, ar: '' }.
 */
export function toBilingual(value: string | BilingualField | undefined): BilingualField {
  if (!value) return { en: '', ar: '' };
  if (typeof value === 'string') return { en: value, ar: '' };
  return { en: value.en || '', ar: value.ar || '' };
}
