/**
 * A code for an item whose onboarder did not type one.
 *
 * Derived from the name rather than a bare counter: the code is printed on
 * every bill and typed at the till to search, so "TYREAPO-2" is worth more to
 * a shopkeeper than "ITEM-000147". Uniqueness is settled by the caller, which
 * is the only place that knows what is already taken.
 */
const SLUG_LENGTH = 8;

const slugOf = (name: string): string => {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, SLUG_LENGTH);
  // Every character was punctuation or a script this strips — a Hindi name,
  // for instance. A generic stem still beats refusing to create the item.
  return slug || 'ITEM';
};

/**
 * The first candidate not already taken.
 *
 * `taken` is matched case-insensitively, because the uniqueness check that
 * ultimately rejects a duplicate is itself case-insensitive.
 */
export function generateItemCode(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((code) => code.trim().toUpperCase()));
  const stem = slugOf(name);
  if (!used.has(stem)) return stem;
  // Bounded rather than open-ended: a shop with 9999 items of one name has a
  // naming problem, not a code-generation problem.
  for (let suffix = 2; suffix <= 9999; suffix += 1) {
    const candidate = `${stem}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error(`Could not generate a code for ${name} — too many alike`);
}
