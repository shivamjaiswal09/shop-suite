import { describe, expect, it } from 'vitest';
import { billFromFor, type BillFrom } from './bill-from.ts';

const entity = (over: Partial<BillFrom> & { id: string }): BillFrom => ({
  companyId: 'co_1',
  legalName: over.id,
  phones: [],
  locationIds: [],
  active: true,
  ...over,
});

describe('billFromFor', () => {
  it('offers every entity mapped to the counter, not just one', () => {
    // Two entities both billable from the same shop is the normal case for a
    // family business trading under more than one name.
    const options = billFromFor(
      [
        entity({ id: 'automobiles', locationIds: ['store_a', 'store_b'] }),
        entity({ id: 'traders', locationIds: ['store_a', 'store_b'] }),
      ],
      'store_a',
    );
    expect(options.map((e) => e.id)).toEqual(['automobiles', 'traders']);
  });

  it('leaves out an entity that does not name this store', () => {
    const options = billFromFor(
      [
        entity({ id: 'automobiles', locationIds: ['store_a'] }),
        entity({ id: 'traders', locationIds: ['store_b'] }),
      ],
      'store_a',
    );
    expect(options.map((e) => e.id)).toEqual(['automobiles']);
  });

  it('leaves out a deactivated entity even where it is mapped', () => {
    const options = billFromFor(
      [
        entity({ id: 'automobiles', locationIds: ['store_a'] }),
        entity({ id: 'traders', locationIds: ['store_a'], active: false }),
      ],
      'store_a',
    );
    expect(options.map((e) => e.id)).toEqual(['automobiles']);
  });

  it('offers nothing before a store is chosen, rather than everything', () => {
    expect(billFromFor([entity({ id: 'automobiles', locationIds: ['store_a'] })], undefined)).toEqual(
      [],
    );
  });
});
