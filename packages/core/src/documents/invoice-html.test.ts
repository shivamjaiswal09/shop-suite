import { describe, expect, it } from 'vitest';
import { invoiceHtml } from './invoice-html.ts';

/**
 * Asserted against the HTML rather than the rendered bytes.
 *
 * Everything worth checking — which figures print, which tax columns appear,
 * that nothing says "undefined" — is decided here; Chromium only paints it. A
 * byte- or pixel-level assertion would break on a browser upgrade without any
 * of these facts having changed, and would need a Chromium download in CI.
 */

const line = {
  name: 'Tyre Apollo 295/90R20 LD(s)',
  hsnCode: '4011',
  qty: 24,
  unitPrice: 17966.1,
  taxRate: 18,
  taxableValue: 431186.44,
  taxAmount: 77613.56,
  lineTotal: 508800,
};

const entity = {
  legalName: 'S.M. TRADERS',
  gstin: '08ARCPM6091L1ZC',
  pan: 'ARCPM6091L',
  addressLine: 'Opposite Roadways Bus Stand, DHOLPUR (Raj.)-328001',
  phones: ['9414268807', '9461696933'],
};

const invoice = {
  number: 'INV-ST-JYN-000042',
  createdAt: new Date('2026-03-27T10:00:00Z').toISOString(),
  customerName: 'M/s AUTOEXIM HOUSE LLP',
  customerGstin: '08ABEFA1194J1ZE',
  interState: false,
  lines: [line, { ...line, hsnCode: '4013', name: 'Tube Apollo 295/90R20' }],
  totals: { taxableValue: 467796.61, taxTotal: 84203.39, roundOff: 0, grandTotal: 552000 },
};

describe('invoiceHtml', () => {
  it('prints what makes the document a tax invoice', () => {
    const html = invoiceHtml(invoice, entity, ['original']);
    expect(html).toContain('INV-ST-JYN-000042');
    expect(html).toContain('08ARCPM6091L1ZC'); // supplier
    expect(html).toContain('08ABEFA1194J1ZE'); // recipient
    expect(html).toContain('4011');
    expect(html).toContain('4013');
    expect(html).toContain('27/03/2026');
    expect(html).toContain('5,52,000.00');
    expect(html).toContain('FIVE LAKH FIFTY TWO THOUSAND RUPEES ONLY');
  });

  it('names the copy, because three of these go to three different places', () => {
    expect(invoiceHtml(invoice, entity, ['original'])).toContain('Original');
    expect(invoiceHtml(invoice, entity, ['duplicate'])).toContain('Duplicate');
    expect(invoiceHtml(invoice, entity, ['triplicate'])).toContain('Triplicate');
  });

  it('puts two copies on one sheet, the customer\'s above the shop\'s', () => {
    // The default, because this is what a counter needs: one to hand over and
    // one to keep, off a single sheet of A4.
    const html = invoiceHtml(invoice, entity);
    expect(html.match(/class="half"/g)?.length).toBe(2);
    expect(html.indexOf('Original')).toBeLessThan(html.indexOf('Duplicate'));
    // Both halves carry the whole bill — a copy missing its total is not a copy.
    expect(html.match(/Amount Payable/g)?.length).toBe(2);
    expect(html.match(/INV-ST-JYN-000042/g)?.length).toBe(2);
  });

  it('splits the tax into CGST and SGST within the state', () => {
    const html = invoiceHtml(invoice, entity, ['original']);
    expect(html).toContain('CGST');
    expect(html).toContain('SGST');
    expect(html).not.toContain('IGST');
    // 18% billed as 9% + 9%, and the two halves re-sum to the line's tax.
    expect(html).toContain('>9%<');
    expect(html.match(/38,806\.78/g)?.length).toBe(4); // two halves on each of two lines
  });

  it('charges IGST across a state border and drops the halves', () => {
    const html = invoiceHtml(
      { ...invoice, interState: true, customerGstin: '27ABEFA1194J1ZE' },
      entity,
      ['original'],
    );
    expect(html).toContain('IGST');
    expect(html).not.toContain('CGST');
    expect(html).not.toContain('SGST');
    expect(html).toContain('>18%<');
    expect(html).toContain('MAHARASHTRA');
  });

  it('pads a short bill so a stack of them files to the same depth', () => {
    const short = invoiceHtml({ ...invoice, lines: [line] }, entity, ['original']);
    expect(short.match(/class="blank"/g)?.length).toBe(4);

    const long = invoiceHtml(
      { ...invoice, lines: Array.from({ length: 40 }, () => line) },
      entity,
      ['original'],
    );
    expect(long).not.toContain('class="blank"');
  });

  it('closes the bill once however many pages it runs to', () => {
    // The table continues across pages; the totals and the signatory must not.
    const long = invoiceHtml(
      { ...invoice, lines: Array.from({ length: 40 }, () => line) },
      entity,
      ['original'],
    );
    expect(long.match(/Amount Payable/g)?.length).toBe(1);
    expect(long.match(/Authorised Signatory/g)?.length).toBe(1);
    expect(long.match(/Amount \(in words\)/g)?.length).toBe(1);
  });

  it('leaves a missing HSN blank rather than printing undefined', () => {
    const html = invoiceHtml(
      { ...invoice, lines: [{ ...line, hsnCode: undefined }] },
      entity,
      ['original'],
    );
    expect(html).not.toContain('undefined');
  });

  it('escapes a name someone typed, rather than letting it become markup', () => {
    const html = invoiceHtml(
      { ...invoice, customerName: 'Sharma & Sons <script>alert(1)</script>' },
      entity,
      ['original'],
    );
    expect(html).toContain('Sharma &amp; Sons');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('still prints when there is no billing entity configured', () => {
    // A shop that has not filled in Masters yet should get a bill, not a crash.
    const html = invoiceHtml({ ...invoice, customerGstin: undefined }, null, ['original']);
    expect(html).toContain('INV-ST-JYN-000042');
    expect(html).not.toContain('undefined');
  });

  it('prints the supplier the bill was issued under, not the renamed one', () => {
    // A reprint must say what the original said. The entity is today's record;
    // the snapshot is what the document asserted on the day it was raised.
    const html = invoiceHtml(
      {
        ...invoice,
        billFrom: { legalName: 'OLD TRADERS', gstin: '08OLD0000001ZC', phones: ['9000000000'] },
      },
      { ...entity, legalName: 'RENAMED TRADERS' },
      ['original'],
    );
    expect(html).toContain('OLD TRADERS');
    expect(html).not.toContain('RENAMED TRADERS');
  });

  it('falls back to the entity for a bill raised before Bill From existed', () => {
    const html = invoiceHtml(invoice, entity, ['original']);
    expect(html).toContain('S.M. TRADERS');
    expect(html).toContain('9414268807');
  });

  it('falls back to the snapshot on the invoice when the entity is gone', () => {
    const html = invoiceHtml(
      {
        ...invoice,
        billFrom: { legalName: 'OLD TRADERS', gstin: '08OLD0000001ZC', phones: ['9000000000'] },
      },
      null,
      ['original'],
    );
    expect(html).toContain('OLD TRADERS');
    expect(html).toContain('08OLD0000001ZC');
    expect(html).toContain('9000000000');
  });

  it('prints the rate before tax, and the amount as quantity times it', () => {
    // The line below is priced inclusive: ₹2,100 a unit with 5% inside it. The
    // bill must show 2,000.00 and 36,000.00, not the sticker price beside a
    // taxable amount it does not multiply out to.
    const html = invoiceHtml(
      {
        ...invoice,
        lines: [
          {
            name: 'Tyre Ceat 3.00-17',
            hsnCode: '4011',
            qty: 18,
            unitPrice: 2100,
            taxRate: 5,
            taxableValue: 36000,
            taxAmount: 1800,
            lineTotal: 37800,
          },
        ],
      },
      entity,
      ['original'],
    );
    expect(html).toContain('2,000.00');
    expect(html).toContain('36,000.00');
    // The inclusive unit price has no column on a GST invoice.
    expect(html).not.toContain('2,100.00');
  });

  it('gives each copy a whole page when the bill is too long to share one', () => {
    // Squeezing a long bill into half a page clipped the terms and the
    // signatory off the bottom, which is worse than spending a second sheet.
    const long = { ...invoice, lines: Array.from({ length: 12 }, () => line) };
    const html = invoiceHtml(long, entity);
    expect(html).not.toContain('class="half"');
    expect(html.match(/class="solo"/g)?.length).toBe(2);
    expect(html.match(/Authorised Signatory/g)?.length).toBe(2);
  });

  it('keeps a bill at the limit on one sheet', () => {
    const atLimit = { ...invoice, lines: Array.from({ length: 8 }, () => line) };
    expect(invoiceHtml(atLimit, entity).match(/class="half"/g)?.length).toBe(2);
  });
});
