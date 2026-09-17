import { amountInWords, roundMoney, stateCodeOf, stateNameOf, taxableRateOf } from '@shop/core';

/**
 * The GST invoice as an A4 page.
 *
 * A ruled table rather than a styled document: this is the layout a shop's
 * customers and its accountant both already recognise, and deviating from it
 * makes the bill look unofficial however pretty it is.
 */

/**
 * What the page needs, rather than the whole domain invoice.
 *
 * Structural on purpose: the route hands over its own projection, and coupling
 * the renderer to the entity schema would mean every field added there has to
 * be threaded through here whether the page prints it or not.
 */
export interface InvoicePage {
  number: string;
  createdAt: string;
  customerName?: string;
  customerGstin?: string;
  interState: boolean;
  lines: Array<{
    name: string;
    hsnCode?: string;
    qty: number;
    unitPrice: number;
    taxRate: number;
    taxableValue: number;
    taxAmount: number;
    lineTotal: number;
  }>;
  totals: { taxableValue: number; taxTotal: number; roundOff: number; grandTotal: number };
  billFrom?: { legalName: string; gstin?: string; pan?: string; addressLine?: string; phones: string[] };
}

interface Entity {
  legalName: string;
  gstin: string | null;
  pan: string | null;
  addressLine: string | null;
  phones: string[];
}

/** HTML-escaped. Every value on this page came from somebody typing it. */
const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (n: number): string =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const qty = (n: number): string => (Number.isInteger(n) ? String(n) : String(n));

/** Short enough to keep a one-line date beside the invoice number. */
const shortDate = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/**
 * Rows are padded to a fixed count so a three-line bill and a six-line bill
 * print to the same depth — which is what makes a stack of them look uniform in
 * a file, and keeps the fold between the two copies in the same place.
 *
 * Sized for half an A4 rather than a whole one: each copy now gets 140mm, not
 * 281mm.
 */
const MIN_ROWS = 5;

/**
 * How many lines fit in half an A4 alongside the header, totals, terms and the
 * signatory — measured from a rendered sheet, not guessed.
 *
 * A bill longer than this gets a full page per copy instead of sharing one.
 * Two copies still print; they just take two sheets rather than one.
 */
const MAX_LINES_PER_HALF = 8;

export function invoiceHtml(
  invoice: InvoicePage,
  entity: Entity | null,
  /** Top half first, bottom half second. */
  copies: readonly Copy[] = ['original', 'duplicate'],
): string {
  // The snapshot wins over the live entity. A tax invoice asserts who issued
  // it on the day it was issued; if the shop is renamed or its GSTIN changes
  // next year, a reprint of an old bill must still say what the original said.
  // The live entity is the fallback for bills raised before Bill From existed.
  const seller = invoice.billFrom ?? entity ?? null;
  const sellerPhones = invoice.billFrom?.phones?.length
    ? invoice.billFrom.phones
    : (entity?.phones ?? []);
  const buyerState = stateCodeOf(invoice.customerGstin);
  const interState = invoice.interState;

  const twoUp = invoice.lines.length <= MAX_LINES_PER_HALF;
  const blankRows = Math.max(0, MIN_ROWS - invoice.lines.length);
  const taxColumns = interState ? 1 : 2;

  const lineRows = invoice.lines
    .map((line, index) => {
      // The rate a GST invoice prints is the taxable rate — what one unit costs
      // before tax. `unitPrice` is not that whenever the tax is inclusive: it is
      // then the sticker price with GST inside it, so printing it beside a
      // taxable amount gave a bill whose own multiplication did not work.
      const rate = taxableRateOf(line);
      // Derived from the printed rate rather than copied from the line, so a
      // customer multiplying the two columns on the page arrives at the figure
      // between them. The paise this can differ from the stored taxable value
      // are never summed on the page — the totals block prints tax-inclusive
      // figures — so nothing on the bill disagrees with anything else.
      const amount = roundMoney(rate * line.qty);
      const half = line.taxRate / 2;
      const taxCells = interState
        ? `<td class="c">${line.taxRate}%</td><td class="r">${money(line.taxAmount)}</td>`
        : `<td class="c">${half}%</td><td class="r">${money(line.taxAmount / 2)}</td>` +
          `<td class="c">${half}%</td><td class="r">${money(line.taxAmount - line.taxAmount / 2)}</td>`;
      return `<tr>
        <td class="c">${esc(line.hsnCode ?? '')}</td>
        <td class="c">${index + 1}</td>
        <td>${esc(line.name)}</td>
        <td class="c">${qty(line.qty)}</td>
        <td class="r">${money(rate)}</td>
        <td class="r">${money(amount)}</td>
        ${taxCells}
        <td class="r">${money(line.lineTotal)}</td>
      </tr>`;
    })
    .join('');

  const filler = Array.from(
    { length: blankRows },
    () => `<tr class="blank">${'<td></td>'.repeat(7 + taxColumns * 2)}</tr>`,
  ).join('');

  // One invoice, rendered as a fragment so the sheet below can hold two of them.
  const copyHtml = (copy: Copy): string => `<div class="copy">${label(copy)}</div>

<div class="sheet">
  <div class="head">
    <div class="seller">
      <div class="name">${esc(seller?.legalName ?? '')}</div>
      <div class="kv">${esc(seller?.addressLine ?? '')}</div>
      ${sellerPhones.length ? `<div>Mob : ${esc(sellerPhones.join(', '))}</div>` : ''}
      ${seller?.gstin ? `<div>GSTIN : ${esc(seller.gstin)}</div>` : ''}
      ${seller?.pan ? `<div>PAN&nbsp;&nbsp; : ${esc(seller.pan)}</div>` : ''}
    </div>
    <div class="title">GST INVOICE</div>
    <div class="buyer">
      <div class="name">${esc(invoice.customerName ?? 'Walk-in Customer')}</div>
      ${buyerState ? `<div>State : ${esc(buyerState)} ${esc(stateNameOf(buyerState) ?? '')}</div>` : ''}
      ${invoice.customerGstin ? `<div>GSTIN : ${esc(invoice.customerGstin)}</div>` : ''}
      <div><b>Inv No: ${esc(invoice.number)}</b></div>
      <div>Date: ${esc(shortDate(invoice.createdAt))}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th rowspan="2">HSN CODE</th>
        <th rowspan="2">S.No.</th>
        <th rowspan="2">PARTICULARS</th>
        <th rowspan="2">Qty</th>
        <th rowspan="2">RATE</th>
        <th rowspan="2">AMOUNT</th>
        ${interState ? '<th colspan="2">IGST</th>' : '<th colspan="2">CGST</th><th colspan="2">SGST</th>'}
        <th rowspan="2">Net Amount</th>
      </tr>
      <tr>
        <th>%</th><th>Amount</th>
        ${interState ? '' : '<th>%</th><th>Amount</th>'}
      </tr>
    </thead>
    <tbody>${lineRows}${filler}</tbody>
  </table>

  <table class="totals">
    <tr>
      <td style="width:66%">
        <b>Amount (in words):</b> ${esc(amountInWords(invoice.totals.grandTotal).toUpperCase())}
      </td>
      <td>
        <table>
          <tr><td>Total</td><td class="r">${money(invoice.totals.taxableValue + invoice.totals.taxTotal)}</td></tr>
          <tr><td>Round Off</td><td class="r">${money(invoice.totals.roundOff)}</td></tr>
          <tr><td><b>Amount Payable</b></td><td class="r"><b>${money(invoice.totals.grandTotal)}</b></td></tr>
        </table>
      </td>
    </tr>
  </table>

  <div class="foot">
    <div class="terms">
      <b><u>Terms &amp; Conditions:</u></b>
      <div>1. Goods once sold will not be taken back.</div>
      <div>2. Payment is due within the agreed credit period.</div>
      <div>3. All disputes subject to local jurisdiction only.</div>
    </div>
    <div class="sign">
      <div class="for">For ${esc(seller?.legalName ?? '')}</div>
      <div class="sig-line">(Authorised Signatory)</div>
    </div>
  </div>
</div>`;

  return `<style>
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", Times, serif; font-size: 11px; margin: 0; color: #000; }
  .copy { font-style: italic; margin-bottom: 2px; }
  table { border-collapse: collapse; width: 100%; }
  .sheet { border: 1.5px solid #000; }
  .head { display: flex; border-bottom: 1.5px solid #000; }
  .head > div { padding: 6px 8px; }
  .seller { flex: 1.35; border-right: 1.5px solid #000; }
  .title { flex: 0.8; text-align: center; font-weight: bold; font-size: 15px;
           letter-spacing: 0.5px; text-decoration: underline; padding-top: 14px;
           border-right: 1.5px solid #000; }
  .buyer { flex: 1; }
  .name { font-size: 20px; font-weight: bold; color: #1a3d8f; letter-spacing: 0.5px; }
  .buyer .name { font-size: 14px; color: #000; }
  .kv { white-space: pre-line; }
  th, td { border: 1px solid #000; padding: 3px 4px; vertical-align: top; }
  thead th { text-align: center; font-weight: bold; }
  .c { text-align: center; }
  .r { text-align: right; }
  .blank td { height: 16px; }
  tfoot td { border: none; }
  .totals td { padding: 2px 6px; }
  .foot { display: flex; border-top: 1.5px solid #000; }
  .terms { flex: 1; padding: 6px 8px; border-right: 1.5px solid #000; }
  .sign { width: 34%; padding: 6px 8px; text-align: center; }
  .sign .for { text-align: right; font-weight: bold; }
  .sig-line { margin-top: 34px; border-top: 1px solid #000; display: inline-block;
              padding-top: 2px; min-width: 60%; }
  .bank { padding: 4px 8px; border-top: 1.5px solid #000; }
  /* Repeat the column headings when a long bill continues onto another page. */
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  /* Two copies to an A4 sheet: the shop keeps one, the customer takes the
     other, and nobody has to print twice or cut a second sheet down. Each half
     is a fixed fraction of the printable height rather than being left to flow,
     so the fold is always in the same place across a stack of bills. */
  .pair { height: 281mm; display: flex; flex-direction: column; }
  .half { height: 50%; padding-bottom: 4mm; }
  /* The fold line. Printed rather than implied, because a bill cut freehand
     down the middle of a table looks like a mistake. */
  .half:first-child { border-bottom: 1px dashed #999; }
  /* A bill with too many lines for half a page takes a whole one per copy.
     Squeezing it would clip the terms and the signatory off the bottom, and a
     bill nobody signed is not a document. */
  .solo { height: 281mm; }
  .solo + .solo { page-break-before: always; }
</style>

${
  twoUp
    ? `<div class="pair">${copies.map((copy) => `<div class="half">${copyHtml(copy)}</div>`).join('')}</div>`
    : copies.map((copy) => `<div class="solo">${copyHtml(copy)}</div>`).join('')
}
`;
}

/** Which of the three GST copies a half-sheet is. */
export type Copy = 'original' | 'duplicate' | 'triplicate';

const label = (copy: Copy): string => copy.charAt(0).toUpperCase() + copy.slice(1);
