/**
 * Browser-level end-to-end checks for the admin dashboard and embeddable widget.
 *
 * Playwright is intentionally not a project dependency: this script expects a
 * Playwright installation supplied through PLAYWRIGHT_MODULE, e.g.
 *
 *   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs \
 *   E2E_ADMIN_TOKEN=... node tests/browser/e2e.mjs
 *
 * It starts a tiny static server for the fixtures on :5199 and expects the
 * Worker dev server (with demo AI provider, SEED_DEMO_DATA=true and CORS
 * allowing http://127.0.0.1:5199) on :8787.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8787";
const HOST = process.env.HOST_URL || "http://127.0.0.1:5199";
const TOKEN = process.env.E2E_ADMIN_TOKEN || "";
const FIXTURES = fileURLToPath(new URL("../fixtures/", import.meta.url));

let failures = 0;
function check(condition, label, detail = "") {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function waitForHttp(url, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

if (!TOKEN) {
  console.error("E2E_ADMIN_TOKEN is required");
  process.exit(2);
}

const staticServer = spawn(
  "python3",
  ["-m", "http.server", "5199", "--bind", "127.0.0.1", "--directory", FIXTURES],
  { stdio: "ignore" }
);

const browser = await chromium.launch({ headless: true });

try {
  await waitForHttp(`${HOST}/widget-host.html`);

  // ---------------------------------------------------------------- admin UI
  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const adminPage = await adminContext.newPage();
  const consoleErrors = [];
  adminPage.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await adminPage.goto(`${BASE}/admin/`, { waitUntil: "domcontentloaded" });
  await adminPage.getByPlaceholder("Enter admin token").waitFor({ timeout: 15_000 });
  check(true, "admin dashboard loads at /admin/");
  check(
    await adminPage.getByText("Café Fernweh Admin").first().isVisible(),
    "admin login screen renders"
  );

  const preLoginCookies = await adminContext.cookies();
  check(
    !preLoginCookies.some((cookie) => cookie.name === "cafe_session"),
    "no session cookie before login"
  );

  await adminPage.getByPlaceholder("Enter admin token").fill(TOKEN);
  await adminPage.getByText("Menu Management").waitFor({ timeout: 15_000 });
  check(true, "login succeeds and dashboard loads");

  const cookies = await adminContext.cookies();
  const sessionCookie = cookies.find((cookie) => cookie.name === "cafe_session");
  const csrfCookie = cookies.find((cookie) => cookie.name === "csrf_token");
  check(Boolean(sessionCookie), "session cookie is set");
  check(sessionCookie?.httpOnly === true, "session cookie is HttpOnly");
  check(sessionCookie?.sameSite === "Lax", "session cookie is SameSite=Lax");
  check(Boolean(csrfCookie), "CSRF cookie is set");
  check(csrfCookie?.httpOnly === false, "CSRF cookie is JS-readable for double submit");

  const rowCount = await adminPage.locator("table tr").count();
  check(rowCount >= 20, "authenticated dashboard loads menu rows", `rows=${rowCount}`);

  const badCsrfStatus = await adminPage.evaluate(async () => {
    const response = await fetch("/admin/menu", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": "not-the-token" },
      body: JSON.stringify({
        category_id: 1,
        name: "CSRF should reject this",
        description: "test",
        price_cents: 1,
      }),
    });
    return response.status;
  });
  check(badCsrfStatus === 403, "state-changing API rejects an invalid CSRF token", `status=${badCsrfStatus}`);

  const goodCsrfStatus = await adminPage.evaluate(async () => {
    const csrf = document.cookie
      .split("; ")
      .find((part) => part.startsWith("csrf_token="))
      ?.split("=")[1];
    const response = await fetch("/admin/menu", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf || "" },
      body: JSON.stringify({
        category_id: 1,
        name: `Browser Test ${Date.now()}`,
        description: "created by the browser test",
        price_cents: 123,
      }),
    });
    return response.status;
  });
  check(goodCsrfStatus === 200, "state-changing API accepts the session-bound CSRF token", `status=${goodCsrfStatus}`);

  await adminPage.reload({ waitUntil: "domcontentloaded" });
  await adminPage.getByText("Menu Management").waitFor({ timeout: 15_000 });
  check(true, "dashboard stays authenticated across a reload");

  const scriptSources = await adminPage.evaluate(() =>
    Array.from(document.scripts)
      .map((script) => script.src)
      .filter(Boolean)
  );
  let bundlesContainSecrets = false;
  for (const source of scriptSources) {
    const response = await adminPage.request.get(source);
    const body = await response.text();
    if (/AIza[0-9A-Za-z_-]{20,}|GEMINI_API_KEY|GEMINI_API_KEY=/.test(body)) {
      bundlesContainSecrets = true;
    }
  }
  check(!bundlesContainSecrets, "admin JS bundles contain no Gemini credentials");

  await adminPage.getByRole("button", { name: "Sign out" }).click();
  await adminPage.getByPlaceholder("Enter admin token").waitFor({ timeout: 10_000 });
  const afterLogoutStatus = await adminPage.evaluate(async () => {
    const response = await fetch("/admin/menu");
    return response.status;
  });
  check(afterLogoutStatus === 401, "logout invalidates the session", `status=${afterLogoutStatus}`);

  const afterLogoutCookies = await adminContext.cookies();
  check(
    !afterLogoutCookies.some((cookie) => cookie.name === "cafe_session" && cookie.value),
    "logout clears the session cookie"
  );

  const unexpectedConsole = consoleErrors.filter(
    (line) => !line.includes("favicon") && !line.includes("Failed to load resource")
  );
  check(unexpectedConsole.length === 0, "admin page has no unexpected console errors", unexpectedConsole.join(" | "));

  await adminContext.close();

  // ------------------------------------------------------- standalone chat UI
  const mockChat = {
    reply:
      "The Espresso is the most affordable coffee on the menu. The Mocha is currently unavailable.",
    conversation_id: "11111111-1111-4111-8111-111111111111",
    grounding_mode: "retrieval_validation",
    used_tools: ["filter_products"],
    products: [
      {
        id: 1,
        category_id: 1,
        category: "Coffee",
        name: "Espresso",
        description: "A concentrated shot of arabica coffee, served black.",
        price_cents: 9000,
        price_inr: "₹90.00",
        available: true,
        dietary_classification: "vegan",
        ingredients: ["espresso"],
        allergens: [{ name: "milk", verified: false }],
      },
      {
        id: 6,
        category_id: 1,
        category: "Coffee",
        name: "Mocha",
        description: "Espresso, chocolate and steamed milk.",
        price_cents: 19000,
        price_inr: "₹190.00",
        available: false,
        dietary_classification: "none",
        ingredients: ["espresso", "chocolate", "milk"],
        allergens: [{ name: "milk", verified: true }],
      },
    ],
  };

  const uiContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const uiPage = await uiContext.newPage();
  const uiConsoleErrors = [];
  uiPage.on("console", (message) => {
    if (message.type() === "error") uiConsoleErrors.push(message.text());
  });

  let chatRequests = 0;
  const chatBodies = [];
  await uiPage.route("**/chat", async (route) => {
    chatRequests += 1;
    chatBodies.push(JSON.parse(route.request().postData() || "{}"));
    // Keep the pending state observable without relying on real inference.
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockChat),
    });
  });

  await uiPage.goto(`${BASE}/client/`, { waitUntil: "domcontentloaded" });
  await uiPage
    .getByRole("heading", { name: /Welcome to Musafir Café/i })
    .waitFor({ timeout: 15_000 });
  check(true, "standalone chat renders the branded welcome state");

  for (const label of [
    "Explore the menu",
    "Recommend a coffee",
    "Something under ₹200",
    "Popular favourites",
  ]) {
    check(await uiPage.getByRole("button", { name: label }).isVisible(), `suggestion control: ${label}`);
  }

  const composer = uiPage.getByLabel("Your message");
  await uiPage.getByRole("button", { name: "Something under ₹200" }).click();
  check(await uiPage.locator(".typing").isVisible(), "typing indicator shows while the reply is pending");
  check(
    ((await uiPage.locator(".turn--customer .bubble").first().textContent()) ?? "").includes(
      "under ₹200"
    ),
    "clicking a suggestion submits its customer query"
  );

  await uiPage.locator(".product").first().waitFor({ timeout: 10_000 });
  check(
    chatBodies[0]?.message === "What can I get for under ₹200?",
    "suggestion sends a real query payload",
    JSON.stringify(chatBodies[0])
  );
  check(
    (await uiPage.locator(".product").count()) === 2,
    "structured product cards render from the response"
  );
  check(
    ((await uiPage.locator(".product__price").first().textContent()) ?? "").includes("₹90.00"),
    "product prices render in INR"
  );

  const unavailableCard = (await uiPage.locator(".product").nth(1).textContent()) ?? "";
  check(unavailableCard.includes("Currently unavailable"), "unavailable products are marked");
  check(
    unavailableCard.includes("Contains: milk"),
    "verified allergens are shown on the product card"
  );
  check(
    !unavailableCard.includes("Allergen data unverified"),
    "verified allergen data is not flagged as unverified"
  );
  const veganCard = (await uiPage.locator(".product").first().textContent()) ?? "";
  check(
    veganCard.includes("Allergen data unverified"),
    "unverified allergen data is flagged, never assumed safe"
  );

  await uiPage
    .waitForFunction(() => document.activeElement?.id === "composer-input", null, { timeout: 5000 })
    .catch(() => {});
  const composerFocus = await uiPage.evaluate(() => document.activeElement?.id);
  check(
    composerFocus === "composer-input",
    "focus returns to the composer after a reply",
    String(composerFocus)
  );

  await composer.fill("Do you have a decaf option?");
  await composer.press("Enter");
  check((await composer.inputValue()) === "", "Enter submits and the composer clears immediately");
  await uiPage.locator(".turn--assistant .bubble").nth(1).waitFor({ timeout: 10_000 });
  check(chatRequests === 2, "Enter submits exactly one request", `requests=${chatRequests}`);

  await composer.fill("first line");
  await composer.press("Shift+Enter");
  await composer.type("second line");
  check((await composer.inputValue()).includes("\n"), "Shift+Enter inserts a newline");
  check(chatRequests === 2, "Shift+Enter does not submit", `requests=${chatRequests}`);

  await composer.fill("");
  check(
    await uiPage.getByRole("button", { name: "Send message" }).isDisabled(),
    "empty submissions are blocked"
  );
  await composer.press("Enter");
  check(chatRequests === 2, "empty Enter does not submit", `requests=${chatRequests}`);

  check(
    (await uiPage.locator('[role="log"][aria-live="polite"]').count()) === 1,
    "assistant replies are announced through an aria-live log"
  );

  const uiOverflow = await uiPage.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  check(
    uiOverflow.scroll <= uiOverflow.viewport,
    "standalone has no horizontal overflow at desktop width",
    JSON.stringify(uiOverflow)
  );

  const uiScripts = await uiPage.evaluate(() =>
    Array.from(document.scripts)
      .map((script) => script.src)
      .filter(Boolean)
  );
  let uiSecrets = false;
  for (const source of uiScripts) {
    const body = await (await uiPage.request.get(source)).text();
    if (/AIza[0-9A-Za-z_-]{20,}|GEMINI_API_KEY/.test(body)) uiSecrets = true;
  }
  check(!uiSecrets, "standalone JS bundle contains no API credentials");

  const uiConsole = uiConsoleErrors.filter((line) => !line.includes("favicon"));
  check(uiConsole.length === 0, "standalone page has no console errors", uiConsole.join(" | "));
  await uiContext.close();

  // ------------------------------------------------------ standalone mobile
  const mobileUiContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobileUiPage = await mobileUiContext.newPage();
  await mobileUiPage.goto(`${BASE}/client/`, { waitUntil: "domcontentloaded" });
  await mobileUiPage
    .getByRole("heading", { name: /Welcome to Musafir Café/i })
    .waitFor({ timeout: 15_000 });
  const mobileOverflow = await mobileUiPage.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  check(
    mobileOverflow.scroll <= mobileOverflow.viewport,
    "standalone has no horizontal overflow at 390px",
    JSON.stringify(mobileOverflow)
  );
  const suggestionBox = await mobileUiPage
    .getByRole("button", { name: "Explore the menu" })
    .boundingBox();
  check(
    Boolean(suggestionBox) && suggestionBox.height >= 44,
    "suggestion controls meet a 44px touch target",
    JSON.stringify(suggestionBox)
  );
  await mobileUiContext.close();

  // -------------------------------------------------------------- widget UI
  const widgetContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const widgetPage = await widgetContext.newPage();
  await widgetPage.goto(`${HOST}/widget-host.html`, { waitUntil: "domcontentloaded" });
  await widgetPage.locator("#launcher").waitFor({ timeout: 10_000 });

  const defined = await widgetPage.evaluate(async () => {
    await customElements.whenDefined("cafe-chatbot");
    const element = document.querySelector("cafe-chatbot");
    return Boolean(element && element.shadowRoot);
  });
  check(defined, "widget script registers <cafe-chatbot> with a shadow root");

  const hostProbeColor = await widgetPage
    .locator("#host-probe")
    .evaluate((element) => getComputedStyle(element).color);
  check(hostProbeColor === "rgb(255, 0, 0)", "host page CSS still applies to the host", hostProbeColor);

  const widgetBackground = await widgetPage
    .locator("#wrap")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  check(
    widgetBackground !== "rgb(255, 255, 0)",
    "host page CSS does not leak into the widget shadow DOM",
    widgetBackground
  );

  check(await widgetPage.locator("#launcher").isVisible(), "launcher is visible on load");
  check(!(await widgetPage.locator("#wrap").isVisible()), "chat panel is closed on load");
  check(
    /Musafir Assistant/.test((await widgetPage.locator("#launcher").textContent()) ?? ""),
    "widget launcher carries the Musafir label"
  );

  await widgetPage.locator("#launcher").click();
  check(await widgetPage.locator("#wrap").isVisible(), "launcher opens the chat panel");
  check(
    await widgetPage.getByText("Welcome to Musafir Café.").isVisible(),
    "widget welcome state is branded"
  );
  check(
    (await widgetPage.locator(".suggestion").count()) === 4,
    "widget welcome shows four suggestion controls"
  );
  const inputFocused = await widgetPage.evaluate(() => {
    const root = document.querySelector("cafe-chatbot")?.shadowRoot;
    return root?.activeElement?.id === "input";
  });
  check(inputFocused, "opening the panel focuses the message input");

  const chatResponse = widgetPage.waitForResponse(
    (response) => response.url().endsWith("/chat") && response.request().method() === "POST"
  );
  await widgetPage.locator("#input").fill("What is the cheapest cold drink?");
  await widgetPage.locator("#input").press("Enter");
  const response = await chatResponse;
  check(response.status() === 200, "widget reaches the chat API", `status=${response.status()}`);
  await widgetPage.locator(".msg.assistant").first().waitFor({ timeout: 20_000 });
  const replyText = (await widgetPage.locator(".msg.assistant").first().textContent()) ?? "";
  check(replyText.trim().length > 0, "assistant reply renders in the panel");

  await widgetPage
    .locator("#input")
    .fill('<img src=x onerror="window.__widgetXss = true">');
  await widgetPage.locator("#input").press("Enter");
  await widgetPage.locator(".msg.customer").nth(1).waitFor({ timeout: 10_000 });
  const xssState = await widgetPage.evaluate(() => {
    const root = document.querySelector("cafe-chatbot")?.shadowRoot;
    return {
      flag: window.__widgetXss === true,
      images: root?.querySelectorAll("img").length ?? -1,
    };
  });
  check(!xssState.flag && xssState.images === 0, "message rendering is XSS-safe", JSON.stringify(xssState));

  await widgetPage.locator("#close").click();
  check(!(await widgetPage.locator("#wrap").isVisible()), "close button hides the chat panel");
  check(await widgetPage.locator("#launcher").isVisible(), "launcher reappears after closing");
  const focusReturned = await widgetPage.evaluate(() => {
    const root = document.querySelector("cafe-chatbot")?.shadowRoot;
    return root?.activeElement?.id === "launcher";
  });
  check(focusReturned, "closing returns focus to the launcher");

  await widgetPage.keyboard.press("Enter");
  check(await widgetPage.locator("#wrap").isVisible(), "keyboard activation opens the panel");
  await widgetPage.keyboard.press("Escape");
  check(!(await widgetPage.locator("#wrap").isVisible()), "Escape closes the panel");

  const widgetScript = await (await widgetPage.request.get(`${BASE}/widget/cafe-chatbot-widget.iife.js`)).text();
  check(!/AIza[0-9A-Za-z_-]{20,}|GEMINI_API_KEY/.test(widgetScript), "widget bundle contains no API credentials");

  await widgetContext.close();

  // ------------------------------------------------------------- mobile size
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${HOST}/widget-host.html`, { waitUntil: "domcontentloaded" });
  await mobilePage.locator("#launcher").waitFor({ timeout: 10_000 });
  await mobilePage.locator("#launcher").click();
  const box = await mobilePage.locator("#wrap").boundingBox();
  const fits =
    Boolean(box) &&
    box.x >= 0 &&
    box.y >= 0 &&
    box.x + box.width <= 390 &&
    box.y + box.height <= 844;
  check(fits, "mobile layout fits a 390x844 viewport", JSON.stringify(box));
  await mobileContext.close();

  // ----------------------------------------------------------- error handling
  const offlineContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const offlinePage = await offlineContext.newPage();
  await offlinePage.goto(`${HOST}/widget-host-offline.html`, { waitUntil: "domcontentloaded" });
  await offlinePage.locator("#launcher").waitFor({ timeout: 10_000 });
  await offlinePage.locator("#launcher").click();
  await offlinePage.locator("#input").fill("hello");
  await offlinePage.locator("#input").press("Enter");
  await offlinePage.locator(".msg.error").waitFor({ timeout: 15_000 });
  const errorText = (await offlinePage.locator(".msg.error").first().textContent()) ?? "";
  check(/couldn't reach/i.test(errorText), "widget shows a friendly error when the API is unreachable");
  await offlineContext.close();

  // ------------------------------------------------ widget product cards
  const mockContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const mockPage = await mockContext.newPage();
  await mockPage.route("**/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockChat),
    })
  );
  await mockPage.goto(`${HOST}/widget-host.html`, { waitUntil: "domcontentloaded" });
  await mockPage.locator("#launcher").click();
  await mockPage.locator("#input").fill("What is the cheapest coffee?");
  await mockPage.locator("#input").press("Enter");
  check((await mockPage.locator("#input").inputValue()) === "", "widget composer clears on submit");
  await mockPage.locator(".card").first().waitFor({ timeout: 10_000 });
  check(
    (await mockPage.locator(".card").count()) === 2,
    "widget renders structured product cards"
  );
  check(
    ((await mockPage.locator(".card__price").first().textContent()) ?? "").includes("₹90.00"),
    "widget product price renders in INR"
  );
  await mockContext.close();
} catch (error) {
  failures += 1;
  console.error(`FAIL  browser suite threw — ${error instanceof Error ? error.stack : String(error)}`);
} finally {
  await browser.close();
  staticServer.kill("SIGTERM");
}

if (failures > 0) {
  console.error(`\n${failures} browser check(s) failed`);
  process.exit(1);
}
console.log("\nAll browser checks passed");
