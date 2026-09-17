/**
 * What is wrong with a GSTIN, when something is.
 *
 * Two codes rather than a boolean because the two read differently at a
 * counter: a number of the wrong shape is a mistyped number, while a good
 * shape with a bad final character is almost always one transposed digit.
 */
export type GstinProblem = 'format' | 'checksum';

/**
 * Two-digit state code, five PAN letters, four PAN digits, the PAN check
 * letter, an entity number, a fixed Z, and the check character.
 */
const GSTIN_FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Values 0-35, the base the check character is computed in. */
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * The final character the first fourteen imply, by the mod-36 weighted sum the
 * GST system uses: each position counts once or twice by turns, and every
 * product is folded back into a digit sum before being totalled.
 */
const checkCharacter = (gstin: string): string => {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const product = ALPHABET.indexOf(gstin[i]!) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / ALPHABET.length) + (product % ALPHABET.length);
  }
  return ALPHABET[(ALPHABET.length - (sum % ALPHABET.length)) % ALPHABET.length]!;
};

/**
 * Whether a GSTIN looks wrong, and how — advisory only.
 *
 * Nothing reads this to decide tax. The inter-state rule stays on the two-digit
 * prefix, so a typo in the check character cannot silently move a bill between
 * IGST and CGST plus SGST; and an empty field is no complaint at all, because
 * capturing a GSTIN is optional and a walk-in has none.
 *
 * Format is reported ahead of checksum: a number that is not the right shape
 * has no meaningful check character, and pointing a cashier at the last
 * character would send them looking in the wrong place.
 */
export const gstinProblem = (gstin?: string | null): GstinProblem | undefined => {
  const value = (gstin ?? '').trim().toUpperCase();
  if (!value) return undefined;
  if (!GSTIN_FORMAT.test(value)) return 'format';
  return value[14] === checkCharacter(value) ? undefined : 'checksum';
};
