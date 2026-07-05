// ============================================================
// OSINT Platform — Shared Headless Browser Pool
// ============================================================
// A single Chromium instance, launched lazily and reused for the
// life of the process. Search-engine scraping (Bing, DuckDuckGo)
// uses this instead of raw fetch() because those sites serve
// generic/blocked content to non-browser requests — a real browser
// context is far less likely to be detected as a bot.
//
// Launching a new browser per query would be far too slow/expensive
// for an investigation that issues 15-30+ queries — so we keep one
// Browser alive and open a fresh BrowserContext (isolated cookies/
// storage) per request, always closed in a finally block.
// ============================================================

import type { Browser, BrowserContext, Page } from "playwright";
import { logger } from "../observability/logger";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
];

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export interface BrowserPageOptions {
  /** Max time to wait for the page to reach the given load state, in ms. */
  timeoutMs?: number;
  /** Defaults to "domcontentloaded" — cheaper than "networkidle" and enough for scraping rendered result markup. */
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
}

class BrowserPool {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private shuttingDown = false;

  private async getBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;
    if (this.launching) return this.launching;

    this.launching = (async () => {
      // playwright-extra + stealth: patches the common headless-detection
      // signals (navigator.webdriver, missing chrome runtime object, etc.)
      // that sites like DuckDuckGo check for before serving results.
      const { chromium } = await import("playwright-extra");
      const StealthPlugin = (await import("puppeteer-extra-plugin-stealth")).default;
      chromium.use(StealthPlugin());
      logger.info("Launching shared headless browser (stealth)");
      const browser = await chromium.launch({
        headless: true,
        // Required in most containers/VMs — no user namespace for Chrome's sandbox.
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });
      browser.on("disconnected", () => {
        logger.warn("Shared headless browser disconnected — will relaunch on next use");
        this.browser = null;
      });
      this.browser = browser;
      return browser;
    })();

    try {
      return await this.launching;
    } finally {
      this.launching = null;
    }
  }

  /**
   * Opens an isolated context+page, runs fn, and always closes the
   * context afterward (success or failure). Reuses the one shared
   * Browser process.
   */
  async withPage<T>(
    fn: (page: Page) => Promise<T>,
    options: BrowserPageOptions = {}
  ): Promise<T> {
    if (this.shuttingDown) {
      throw new Error("BrowserPool is shutting down, refusing new page requests");
    }

    const { timeoutMs = 15000 } = options;
    const browser = await this.getBrowser();

    let context: BrowserContext | null = null;
    try {
      context = await browser.newContext({
        userAgent: randomUserAgent(),
        viewport: { width: 1280, height: 800 },
        locale: "es-419",
      });
      context.setDefaultTimeout(timeoutMs);
      context.setDefaultNavigationTimeout(timeoutMs);

      const page = await context.newPage();
      return await fn(page);
    } finally {
      await context?.close().catch((err) => {
        logger.debug("Failed to close browser context", { error: String(err) });
      });
    }
  }

  /** Navigates to a URL and returns the rendered HTML — the common case. */
  async fetchRenderedHtml(url: string, options: BrowserPageOptions = {}): Promise<string> {
    const { waitUntil = "domcontentloaded", timeoutMs = 15000 } = options;
    return this.withPage(async (page) => {
      await page.goto(url, { waitUntil, timeout: timeoutMs });
      return page.content();
    }, options);
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}

export const browserPool = new BrowserPool();

let shutdownHooked = false;
function hookShutdown() {
  if (shutdownHooked) return;
  shutdownHooked = true;
  const closeAndExit = async () => {
    await browserPool.shutdown();
    // Registering a SIGTERM/SIGINT listener replaces Node's default
    // handler (which terminates the process) — without an explicit exit
    // here the process just keeps running once the browser is closed,
    // making `kill <pid>` silently ineffective (confirmed repeatedly:
    // workers survived SIGTERM and piled up across restarts).
    process.exit(0);
  };
  process.on("SIGTERM", closeAndExit);
  process.on("SIGINT", closeAndExit);
}
hookShutdown();
