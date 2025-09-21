const puppeteer = require('puppeteer');

(async () => {
  const URL = process.env.URL || 'https://9385de82cb5a4de3918affb44cd315ce.elf.site/';
  const OUT = process.env.OUT || 'screenshot.png';

  // Tunables
  const QUIET_WINDOW_MS = parseInt(process.env.QUIET_MS || '1500', 10); // how long to wait with 0 inflight
  const GLOBAL_TIMEOUT_MS = parseInt(process.env.TIMEOUT || '60000', 10); // overall cap
  const VIEWPORT = { width: 2560, height: 1440, deviceScaleFactor: 1 };

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Be strict & deterministic
  page.setDefaultNavigationTimeout(GLOBAL_TIMEOUT_MS);
  page.setDefaultTimeout(GLOBAL_TIMEOUT_MS);
  await page.setCacheEnabled(false);
  await page.setViewport(VIEWPORT);

  // Track inflight XHR/fetch
  const inflight = new Set();
  const mark = (req) => {
    const rt = req.resourceType();
    if (rt === 'xhr' || rt === 'fetch') inflight.add(req._requestId || req.url());
  };
  const unmark = (req) => {
    inflight.delete(req._requestId || req.url());
  };

  page.on('request', mark);
  page.on('requestfinished', unmark);
  page.on('requestfailed', unmark);

  // Optional: console/network debugging
  if (process.env.DEBUG) {
    page.on('request', (r) => (r.resourceType() === 'xhr' || r.resourceType() === 'fetch') && console.log('➡️', r.method(), r.url()));
    page.on('requestfinished', (r) => (r.resourceType() === 'xhr' || r.resourceType() === 'fetch') && console.log('✅', r.method(), r.url()));
    page.on('requestfailed', (r) => (r.resourceType() === 'xhr' || r.resourceType() === 'fetch') && console.log('❌', r.method(), r.url(), r.failure()?.errorText));
    page.on('console', (msg) => console.log('🧠', msg.type(), msg.text()));
  }

  // Navigate: use a reasonable waitUntil but not solely rely on it
  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  // Fonts ready
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });

  // Images loaded
  await page.waitForFunction(() =>
    Array.from(document.images || []).every(img => img.complete && img.naturalWidth > 0)
  ).catch(() => {}); // tolerate pages without images

  // Wait for "network quiet" of XHR/fetch specifically
  const start = Date.now();
  while (true) {
    const now = Date.now();
    if (now - start > GLOBAL_TIMEOUT_MS) break;

    if (inflight.size === 0) {
      // No inflight right now — see if it stays quiet for QUIET_WINDOW_MS
      const t0 = Date.now();
      await new Promise(r => setTimeout(r, QUIET_WINDOW_MS));
      if (inflight.size === 0) break; // stayed quiet -> we're done
      // otherwise loop again
    } else {
      // Wait a moment before re-checking
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // Two RAFs to flush layout/animations, and scroll to top before clipping
  await page.evaluate(async () => {
    if (typeof document.getAnimations === 'function') {
      const anims = document.getAnimations();
      await Promise.allSettled(anims.map(a => a.finished?.catch(() => {})));
    }
    window.scrollTo(0, 0);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });

  // Hard guarantee of 1920x1080
  await page.screenshot({
    path: OUT,
    fullPage: false,
    clip: { x: 0, y: 0, width: 2560, height: 1440 }
  });

  await browser.close();
  console.log(`✅ Saved ${OUT}`);
})();
