import { describe, expect, it } from 'vitest';
import { amountInWords } from './amount-in-words.ts';

describe('amountInWords', () => {
  it('writes whole rupees', () => {
    expect(amountInWords(0)).toBe('Zero Rupees Only');
    expect(amountInWords(1)).toBe('One Rupee Only');
    expect(amountInWords(552000)).toBe('Five Lakh Fifty Two Thousand Rupees Only');
  });

  it('uses lakh and crore, not million', () => {
    // A bill printed in Dholpur reading "five hundred fifty-two thousand" is
    // wrong in the way that makes a customer distrust the rest of the page.
    expect(amountInWords(100000)).toBe('One Lakh Rupees Only');
    expect(amountInWords(10000000)).toBe('One Crore Rupees Only');
    expect(amountInWords(12345678)).toContain('Crore');
  });

  it('handles the teens and tens that trip naive implementations', () => {
    expect(amountInWords(11)).toBe('Eleven Rupees Only');
    expect(amountInWords(15)).toBe('Fifteen Rupees Only');
    expect(amountInWords(19)).toBe('Nineteen Rupees Only');
    expect(amountInWords(20)).toBe('Twenty Rupees Only');
    expect(amountInWords(90)).toBe('Ninety Rupees Only');
  });

  it('adds paise only when there are any', () => {
    expect(amountInWords(1234.5)).toBe(
      'One Thousand Two Hundred Thirty Four Rupees and Fifty Paise Only',
    );
    expect(amountInWords(5.01)).toBe('Five Rupees and One Paisa Only');
    expect(amountInWords(100)).not.toContain('Paise');
  });

  it('groups the Indian way — two digits above the thousand', () => {
    // 12,34,567 rather than 1,234,567.
    expect(amountInWords(1234567)).toBe(
      'Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven Rupees Only',
    );
  });

  it('reads a negative amount as a negative, rather than silently dropping it', () => {
    expect(amountInWords(-50)).toBe('Minus Fifty Rupees Only');
  });
});
