import { describe, expect, it } from 'vitest';
import { GST_STATE_NAMES, stateNameOf } from './state-codes.ts';

describe('stateNameOf', () => {
  it('names the codes a bill prints', () => {
    expect(stateNameOf('08')).toBe('RAJASTHAN');
    expect(stateNameOf('27')).toBe('MAHARASHTRA');
    expect(stateNameOf('29')).toBe('KARNATAKA');
  });

  it('returns nothing rather than throwing on an unknown code', () => {
    // A wrong code is a data-entry problem; the bill should still print.
    expect(stateNameOf('99')).toBeUndefined();
    expect(stateNameOf(undefined)).toBeUndefined();
    expect(stateNameOf('')).toBeUndefined();
  });

  it('covers every code it claims to know', () => {
    for (const [code, name] of Object.entries(GST_STATE_NAMES)) {
      expect(code).toMatch(/^\d{2}$/);
      expect(name).toBe(name.toUpperCase());
      expect(stateNameOf(code)).toBe(name);
    }
  });

  it('skips 25 and 28, which were merged away', () => {
    // Daman and Diu folded into 26; Andhra Pradesh moved to 37. Listing them
    // would offer a code no GSTIN issued today carries.
    expect(stateNameOf('25')).toBeUndefined();
    expect(stateNameOf('28')).toBeUndefined();
  });
});
