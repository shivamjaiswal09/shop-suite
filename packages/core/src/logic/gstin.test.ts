import { describe, expect, it } from 'vitest';
import { gstinProblem } from './gstin.ts';
import { isInterState } from './pricing.ts';

describe('gstinProblem', () => {
  it('passes a well-formed GSTIN whose checksum agrees', () => {
    // Real numbers, each computing its own final character.
    expect(gstinProblem('08ARCPM6091L1ZC')).toBeUndefined();
    expect(gstinProblem('08ABEFA1194J1ZE')).toBeUndefined();
    expect(gstinProblem('24AAACC1206D1ZM')).toBeUndefined();
  });

  it('accepts one that is padded or lower-cased, as a cashier types it', () => {
    expect(gstinProblem('  08ARCPM6091L1ZC  ')).toBeUndefined();
    expect(gstinProblem('08arcpm6091l1zc')).toBeUndefined();
  });

  it('says nothing about an empty field', () => {
    // Nothing typed is not a complaint. The field is optional.
    expect(gstinProblem('')).toBeUndefined();
    expect(gstinProblem('   ')).toBeUndefined();
    expect(gstinProblem(undefined)).toBeUndefined();
    expect(gstinProblem(null)).toBeUndefined();
  });

  it('reports a bad final character as a checksum problem', () => {
    // Right shape, wrong check digit — the single most common typo.
    expect(gstinProblem('08ARCPM6091L1ZX')).toBe('checksum');
    expect(gstinProblem('24AAACC1206D1ZA')).toBe('checksum');
  });

  it('reports the wrong shape as a format problem', () => {
    expect(gstinProblem('08ARCPM6091L1Z')).toBe('format'); // too short
    expect(gstinProblem('08ARCPM6091L1ZCC')).toBe('format'); // too long
    expect(gstinProblem('8ARCPM6091L1ZC0')).toBe('format'); // state code not two digits
    expect(gstinProblem('08ARCPM6091L1YC')).toBe('format'); // the fixed Z is not a Z
    expect(gstinProblem('08ARCP16091L1ZC')).toBe('format'); // digit inside the PAN letters
    expect(gstinProblem('NOT-A-GSTIN-XYZ')).toBe('format');
  });

  it('prefers the format complaint when both are wrong', () => {
    // A number that is not even the right shape has no meaningful check digit,
    // so telling a cashier to check the last character would mislead.
    expect(gstinProblem('hello')).toBe('format');
  });
});

describe('validity and the tax rule', () => {
  it('leaves the inter-state decision to the prefix alone', () => {
    // A typo in the check digit must not silently flip a bill from IGST to
    // CGST plus SGST — that would be a worse failure than the typo.
    const supplier = '08ARCPM6091L1ZC';
    const customerWithBadCheckDigit = '27AABCU9603R1ZX';

    expect(gstinProblem(customerWithBadCheckDigit)).toBe('checksum');
    expect(isInterState(supplier, customerWithBadCheckDigit)).toBe(true);
  });
});
