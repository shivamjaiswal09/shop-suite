import { describe, expect, it } from 'vitest';
import type { BillFieldConfig } from '../entities/bill-field.ts';
import { missingRequiredFields, splitBillFields } from './bill-fields.ts';

const field = (over: Partial<BillFieldConfig>): BillFieldConfig => ({
  id: 'f1',
  companyId: 'c1',
  builtin: null,
  key: 'vehicle_number',
  label: 'Vehicle number',
  scope: 'sale',
  type: 'text',
  required: false,
  sortOrder: 0,
  active: true,
  ...over,
});

describe('splitBillFields', () => {
  it('sends each value to the side its field declares', () => {
    const fields = [
      field({ id: 'f1', builtin: 'phone', key: 'phone', label: 'Phone', scope: 'customer' }),
      field({ id: 'f2', key: 'vehicle_number', scope: 'sale' }),
    ];
    expect(splitBillFields(fields, { phone: '9845011111', vehicle_number: 'KA01AB1234' })).toEqual({
      customer: { phone: '9845011111' },
      sale: { vehicle_number: 'KA01AB1234' },
    });
  });

  it('ignores a value whose field is inactive', () => {
    // Deactivating a field must stop it being captured, without disturbing the
    // bills that already carry it.
    const fields = [field({ active: false })];
    expect(splitBillFields(fields, { vehicle_number: 'KA01AB1234' })).toEqual({
      customer: {},
      sale: {},
    });
  });

  it('drops a value with no field behind it', () => {
    // A stale form, or a key removed between load and submit.
    expect(splitBillFields([], { vehicle_number: 'KA01AB1234' })).toEqual({
      customer: {},
      sale: {},
    });
  });

  it('drops blanks rather than storing empty strings', () => {
    const fields = [field({})];
    expect(splitBillFields(fields, { vehicle_number: '   ' })).toEqual({ customer: {}, sale: {} });
  });

  it('trims what it keeps', () => {
    const fields = [field({})];
    expect(splitBillFields(fields, { vehicle_number: ' KA01AB1234 ' }).sale).toEqual({
      vehicle_number: 'KA01AB1234',
    });
  });
});

describe('missingRequiredFields', () => {
  it('names the required fields left empty', () => {
    const fields = [
      field({
        id: 'f1',
        key: 'phone',
        builtin: 'phone',
        label: 'Phone',
        scope: 'customer',
        required: true,
      }),
      field({ id: 'f2', key: 'vehicle_number', required: true }),
    ];
    expect(missingRequiredFields(fields, { phone: '9845011111' }).map((f) => f.key)).toEqual([
      'vehicle_number',
    ]);
  });

  it('treats whitespace as empty', () => {
    const fields = [field({ required: true })];
    expect(missingRequiredFields(fields, { vehicle_number: '  ' })).toHaveLength(1);
  });

  it('never blocks on an inactive field', () => {
    // Otherwise deactivating a required field would make billing impossible
    // rather than simply stop asking for it.
    const fields = [field({ required: true, active: false })];
    expect(missingRequiredFields(fields, {})).toHaveLength(0);
  });

  it('is satisfied by a company with no configuration', () => {
    expect(missingRequiredFields([], {})).toHaveLength(0);
  });
});
