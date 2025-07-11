// utils/webScraper.js
const puppeteer = require("puppeteer");

async function scrapeWebsite(url) {
  try {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    // Set headers to avoid 403 errors
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Extract main content (based on longest text block in <article> or <main>)
    const content = await page.evaluate(() => {
      const selectors = ["article", "main", "section", "body"];
      let bestText = "";

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const text = el.innerText.trim();
          if (text.length > bestText.length) {
            bestText = text;
          }
        }
      }

      // Clean extra newlines and trim
      return bestText.replace(/\n{2,}/g, "\n").trim();
    });

    await browser.close();
    return content;
  } catch (err) {
    console.error("❌ Web scraping error:", err.message);
    return "";
  }
}

module.exports = { scrapeWebsite };
