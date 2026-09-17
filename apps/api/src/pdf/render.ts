import type { Browser } from 'puppeteer-core';

/**
 * Turns HTML into a PDF.
 *
 * A real browser rather than a PDF library, because the invoice is a ruled
 * table that CSS already knows how to draw and page breaks are a solved problem
 * there. The cost is a binary this function has to carry and a cold start
 * measured in seconds.
 */

/**
 * One browser per warm container, not one per request.
 *
 * Launching Chromium costs seconds; a till reprinting three copies of a bill
 * should pay that once. Vercel reuses a warm function across invocations, so
 * the second request through the same container skips it entirely.
 */
let shared: Promise<Browser> | null = null;

/**
 * Where to find a browser.
 *
 * `@sparticuz/chromium` ships a Linux binary for the serverless runtime and
 * cannot execute anywhere else, so a developer on a Mac gets the Chrome they
 * already have. `CHROME_PATH` overrides both, for a machine with neither.
 */
async function executablePath(): Promise<string> {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.env.VERCEL === '1') {
    const { default: chromium } = await import('@sparticuz/chromium');
    return chromium.executablePath();
  }
  const local = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  const { existsSync } = await import('node:fs');
  const found = local.find((path) => existsSync(path));
  if (!found) {
    throw new Error(
      'No Chrome found for rendering. Set CHROME_PATH, or install Chrome to print locally.',
    );
  }
  return found;
}

async function launch(): Promise<Browser> {
  // Imported here rather than at the top of the file: puppeteer and the
  // Chromium binary are tens of megabytes, and a till that logs in and sells
  // all day should not pay for them on every cold start to print one bill.
  const { default: puppeteer } = await import('puppeteer-core');
  // Chromium's flags are tuned for a read-only serverless filesystem;
  // locally the defaults are right.
  const args = process.env.VERCEL === '1' ? (await import('@sparticuz/chromium')).default.args : [];
  return puppeteer.launch({ args, executablePath: await executablePath(), headless: true });
}

async function browser(): Promise<Browser> {
  if (!shared) {
    shared = launch();
    // A launch that fails must not poison every later request with a rejected
    // promise nobody can retry past.
    shared.catch(() => {
      shared = null;
    });
  }
  return shared;
}

export async function renderPdf(html: string): Promise<Buffer> {
  const page = await (await browser()).newPage();
  try {
    // The HTML is ours today and user-authored once templates land, and a
    // sandbox is far harder to retrofit than to include from the start.
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      // Only the document itself. Nothing reaches out — no fonts, no images,
      // no beacons — so a template cannot phone home with a customer's bill.
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        void request.continue();
      } else {
        void request.abort();
      }
    });

    await page.setContent(html, { waitUntil: 'load', timeout: 15_000 });
    const pdf = await page.pdf({
      format: 'a4',
      printBackground: true,
      margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
