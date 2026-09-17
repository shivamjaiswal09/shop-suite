const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
] as const;

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
] as const;

/** Under a thousand. The teens are a lookup rather than a rule, because they are. */
function underThousand(n: number): string[] {
  const words: string[] = [];
  if (n >= 100) {
    words.push(ONES[Math.floor(n / 100)]!, 'Hundred');
    n %= 100;
  }
  if (n >= 20) {
    words.push(TENS[Math.floor(n / 10)]!);
    n %= 10;
  }
  if (n > 0) words.push(ONES[n]!);
  return words;
}

/**
 * Indian grouping: crore, lakh, thousand, then the last three digits.
 *
 * Deliberately not the short scale. A bill printed in Dholpur reading "five
 * hundred fifty-two thousand" is wrong in the way that makes a customer
 * distrust the rest of the page.
 */
function wholeInWords(n: number): string[] {
  if (n === 0) return ['Zero'];
  const words: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;

  if (crore > 0) words.push(...wholeInWords(crore), 'Crore');
  if (lakh > 0) words.push(...underThousand(lakh), 'Lakh');
  if (thousand > 0) words.push(...underThousand(thousand), 'Thousand');
  if (rest > 0) words.push(...underThousand(rest));
  return words;
}

/**
 * The amount a bill prints beneath its total, in words.
 *
 * Paise appear only when there are any, matching how a round figure is printed
 * as plain rupees rather than "and Zero Paise".
 */
export function amountInWords(amount: number): string {
  const negative = amount < 0;
  const absolute = Math.abs(amount);
  // Rounded to paise first, so 0.005 does not become "Zero Rupees and Zero
  // Paise" through a floating-point tail.
  const paise = Math.round(absolute * 100) % 100;
  const rupees = Math.floor(Math.round(absolute * 100) / 100);

  const words: string[] = [];
  if (negative) words.push('Minus');
  words.push(...wholeInWords(rupees), rupees === 1 ? 'Rupee' : 'Rupees');
  if (paise > 0) {
    words.push('and', ...underThousand(paise), paise === 1 ? 'Paisa' : 'Paise');
  }
  words.push('Only');
  return words.join(' ');
}
