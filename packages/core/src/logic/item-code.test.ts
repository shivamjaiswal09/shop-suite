import { describe, expect, it } from 'vitest';
import { generateItemCode } from './item-code.ts';

describe('generateItemCode', () => {
  it('derives something a shopkeeper can type and recognise', () => {
    expect(generateItemCode('Tyre Apollo 295/90R20', [])).toBe('TYREAPOL');
    expect(generateItemCode('Amul Butter 100 g', [])).toBe('AMULBUTT');
  });

  it('steps past a code already in use', () => {
    expect(generateItemCode('Tata Salt', ['TATASALT'])).toBe('TATASALT-2');
    expect(generateItemCode('Tata Salt', ['TATASALT', 'TATASALT-2'])).toBe('TATASALT-3');
  });

  it('matches what is taken regardless of case or padding', () => {
    // The uniqueness check that would reject the duplicate is itself
    // case-insensitive, so generating one that differs only in case is useless.
    expect(generateItemCode('Tata Salt', [' tatasalt '])).toBe('TATASALT-2');
  });

  it('still yields a code when the name has nothing to slug', () => {
    // A name in a script this strips, or pure punctuation.
    expect(generateItemCode('टायर', [])).toBe('ITEM');
    expect(generateItemCode('—', ['ITEM'])).toBe('ITEM-2');
  });
});
