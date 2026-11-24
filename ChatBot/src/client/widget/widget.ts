/**
 * MUSAFIR Café embeddable chat widget.
 *
 * Framework-independent vanilla Web Component. The host page only needs to
 * load this script and insert <cafe-chatbot api-base="...">.
 *
 * All styling is encapsulated in shadow DOM so it cannot conflict with the
 * host site's styles. Inference credentials never reach the browser; all AI
 * calls go through the backend.
 *
 * The widget starts closed behind an accessible launcher. It can be opened or
 * closed programmatically via the element's open()/close() methods, by the
 * launcher/close buttons, or with the keyboard (Enter/Space on the launcher,
 * Escape to close).
 *
 * Brand tokens are imported from ../theme.css — the same file the standalone
 * app uses — and re-scoped from :root to :host so there is a single source of
 * truth for colour and type.
 */

import tokensCss from "../theme.css?inline";
import { SUGGESTIONS } from "../lib/suggestions";

const shadowTokens = tokensCss.replace(/:root/g, ":host");

interface WidgetProduct {
  id: number;
  category?: string;
  name: string;
  description: string;
  price_cents: number;
  price_inr?: string;
  available: boolean;
  dietary_classification: string;
  allergens: Array<{ name: string; verified: boolean }>;
}

interface ChatPayload {
  conversation_id?: string;
  reply?: string;
  products?: WidgetProduct[];
}

const STYLES = `
  /* Inherited properties stop at the shadow boundary only if we set them here;
     without this, host-page colour and font rules leak in. */
  :host {
    position: fixed;
    right: 0;
    bottom: 0;
    width: 0;
    height: 0;
    z-index: 2147483647;
    color: var(--m-text);
    font-family: var(--m-font-sans);
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  *, *::before, *::after { box-sizing: border-box; }
  [hidden] { display: none !important; }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
  button { font: inherit; color: inherit; }
  button:focus-visible { outline: 2px solid var(--m-accent); outline-offset: 2px; }

  #launcher {
    position: fixed;
    right: 20px;
    bottom: calc(20px + env(safe-area-inset-bottom));
    display: inline-flex;
    align-items: center;
    gap: 9px;
    padding: 11px 14px;
    background: var(--m-surface);
    border: 1px solid var(--m-border-strong);
    border-radius: var(--m-radius);
    color: var(--m-text);
    font: 600 13px/1 var(--m-font-sans);
    letter-spacing: 0.01em;
    cursor: pointer;
    transition: transform 120ms ease, box-shadow 120ms ease;
  }
  #launcher:hover { transform: translate(-2px, -2px); box-shadow: var(--m-shadow-hard); }
  #launcher:active { transform: translate(0, 0); box-shadow: none; }
  #launcher svg { flex: none; color: var(--m-accent); }

  #wrap {
    position: fixed;
    right: 20px;
    bottom: calc(20px + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    width: 380px;
    height: min(600px, calc(100dvh - 40px - env(safe-area-inset-top) - env(safe-area-inset-bottom)));
    background: var(--m-bg);
    border: 1px solid var(--m-border);
    border-top: 2px solid var(--m-accent);
    border-radius: var(--m-radius);
    overflow: hidden;
  }

  #header {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
    padding: 11px 12px;
    background: var(--m-surface);
    border-bottom: 1px solid var(--m-border);
  }
  .brand { display: flex; align-items: center; gap: 9px; min-width: 0; }
  .brand__mark {
    display: grid; place-items: center; flex: none;
    width: 30px; height: 30px;
    border: 1px solid var(--m-border-strong);
    color: var(--m-accent);
    font-family: var(--m-font-serif);
    font-size: 14px; line-height: 1;
  }
  .brand__name {
    margin: 0;
    font-family: var(--m-font-serif);
    font-size: 15px; font-weight: 600; line-height: 1.1;
    white-space: nowrap;
  }
  .brand__name em { color: var(--m-accent-soft); font-style: italic; font-weight: 500; }
  .brand__tagline {
    margin: 2px 0 0;
    color: var(--m-text-muted);
    font-family: var(--m-font-mono);
    font-size: 8.5px; letter-spacing: 0.18em; text-transform: uppercase;
  }
  #close {
    display: grid; place-items: center; flex: none;
    width: 30px; height: 30px; margin-left: auto;
    background: transparent;
    border: 1px solid var(--m-border);
    border-radius: var(--m-radius);
    color: var(--m-text-secondary);
    cursor: pointer;
  }
  #close:hover { border-color: var(--m-border-strong); color: var(--m-text); }

  #messages {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 14px;
    padding: 14px 12px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--m-border) transparent;
  }

  #welcome { display: flex; flex-direction: column; gap: 10px; }
  .welcome__eyebrow {
    margin: 0;
    color: var(--m-accent);
    font-family: var(--m-font-mono);
    font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase;
  }
  .welcome__title {
    margin: 0;
    font-family: var(--m-font-serif);
    font-size: 1.35rem; font-weight: 600; line-height: 1.15;
  }
  .welcome__title em { color: var(--m-accent-soft); font-style: italic; }
  .welcome__text { margin: 0; color: var(--m-text-secondary); font-size: 13px; line-height: 1.55; }
  .suggestions { display: flex; flex-direction: column; gap: 6px; margin-top: 2px; }
  .suggestion {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 10px;
    background: var(--m-surface);
    border: 1px solid var(--m-border);
    border-radius: var(--m-radius);
    color: var(--m-text);
    font-size: 13px; text-align: left;
    cursor: pointer;
    transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
  }
  .suggestion:hover {
    border-color: var(--m-border-strong);
    box-shadow: var(--m-shadow-hard);
    transform: translate(-1px, -1px);
  }
  .suggestion__num {
    color: var(--m-text-muted);
    font-family: var(--m-font-mono);
    font-size: 9px; letter-spacing: 0.14em;
  }
  .suggestion__label { flex: 1 1 auto; }
  .suggestion__arrow { color: var(--m-accent); font-size: 12px; }

  .turn { display: flex; flex-direction: column; }
  .turn--customer { align-items: flex-end; }
  .turn__meta {
    margin: 0 0 5px;
    color: var(--m-text-muted);
    font-family: var(--m-font-mono);
    font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase;
  }
  .msg {
    max-width: 88%;
    padding: 9px 12px;
    background: var(--m-surface);
    border: 1px solid var(--m-border);
    border-radius: var(--m-radius);
    font-size: 13.5px; line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .msg.customer { background: var(--m-surface-raised); border-color: var(--m-border-strong); }
  .msg.error { border-color: var(--m-accent-soft); border-style: dashed; color: var(--m-text-secondary); }

  .typing {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 88%;
    padding: 12px;
    background: var(--m-surface);
    border: 1px solid var(--m-border);
    border-radius: var(--m-radius);
  }
  .typing__dot {
    width: 5px; height: 5px;
    background: var(--m-text-muted);
    animation: typing-pulse 1.4s ease-in-out infinite;
  }
  .typing__dot:nth-child(2) { animation-delay: 0.18s; }
  .typing__dot:nth-child(3) { animation-delay: 0.36s; }
  @keyframes typing-pulse {
    0%, 100% { opacity: 0.25; }
    50% { opacity: 1; }
  }

  .cards { display: flex; flex-direction: column; gap: 6px; width: 100%; margin-top: 8px; }
  .card {
    padding: 10px 12px;
    background: var(--m-surface);
    border: 1px solid var(--m-border);
    border-radius: var(--m-radius);
  }
  .card__top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .card__category {
    color: var(--m-text-muted);
    font-family: var(--m-font-mono);
    font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase;
  }
  .card__price {
    flex: none;
    color: var(--m-accent);
    font-family: var(--m-font-serif);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .card__name {
    margin: 2px 0 3px;
    font-family: var(--m-font-serif);
    font-size: 15px; font-weight: 600; line-height: 1.2;
  }
  .card__desc { margin: 0 0 7px; color: var(--m-text-secondary); font-size: 12px; line-height: 1.5; }
  .card__tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .tag {
    padding: 1px 5px;
    border: 1px solid var(--m-border);
    border-radius: var(--m-radius);
    color: var(--m-text-muted);
    font-family: var(--m-font-mono);
    font-size: 8.5px; letter-spacing: 0.08em; text-transform: uppercase;
  }
  .tag--available { border-color: var(--m-border-strong); color: var(--m-accent); }
  .tag--unavailable, .tag--allergen { border-color: var(--m-accent-soft); color: var(--m-accent-soft); }
  .tag--uncertain { border-style: dashed; color: var(--m-text-secondary); }

  #composer {
    flex: none;
    padding: 9px 10px calc(8px + env(safe-area-inset-bottom));
    background: var(--m-surface);
    border-top: 1px solid var(--m-border);
  }
  .field {
    display: flex;
    align-items: stretch;
    background: var(--m-bg);
    border: 1px solid var(--m-border);
    border-radius: var(--m-radius);
    transition: border-color 120ms ease, box-shadow 120ms ease;
  }
  .field:focus-within { border-color: var(--m-accent); box-shadow: inset 0 0 0 1px var(--m-accent); }
  #input {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 44px;
    max-height: 110px;
    padding: 10px 11px;
    background: transparent;
    border: 0;
    border-radius: var(--m-radius);
    color: var(--m-text);
    font: inherit;
    font-size: 14px;
    line-height: 1.45;
    outline: none;
    resize: none;
  }
  #input::placeholder { color: var(--m-text-muted); }
  #send {
    display: grid; place-items: center; flex: none;
    width: 44px;
    background: var(--m-accent);
    border: 0;
    border-left: 1px solid var(--m-border-strong);
    color: #1b1206;
    cursor: pointer;
  }
  #send:hover:not(:disabled) { background: #f6c286; }
  #send:disabled {
    background: var(--m-surface-raised);
    border-left-color: var(--m-border);
    color: var(--m-text-muted);
    cursor: not-allowed;
  }
  #status {
    margin: 5px 2px 0;
    color: var(--m-text-muted);
    font-family: var(--m-font-mono);
    font-size: 9px;
    letter-spacing: 0.08em;
  }
  #status:empty { display: none; }

  @media (max-width: 460px) {
    #wrap {
      right: 10px;
      left: 10px;
      bottom: calc(10px + env(safe-area-inset-bottom));
      width: auto;
      height: calc(100dvh - 20px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    }
    #launcher { right: 12px; bottom: calc(12px + env(safe-area-inset-bottom)); }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
    }
    #launcher:hover, .suggestion:hover { transform: none; }
  }
`;

const TEMPLATE = `
<style>${shadowTokens}\n${STYLES}</style>

<button id="launcher" type="button" aria-expanded="false" aria-controls="wrap">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="1.8" stroke-linecap="square" aria-hidden="true">
    <path d="M4 8h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" />
    <path d="M16 9h2a2.5 2.5 0 0 1 0 5h-2" />
    <path d="M7 3v2M11 3v2M15 3v2" />
  </svg>
  <span>Musafir Assistant</span>
</button>

<section id="wrap" role="dialog" aria-label="Musafir Café assistant" hidden>
  <header id="header">
    <div class="brand">
      <span class="brand__mark" aria-hidden="true">M</span>
      <div>
        <p class="brand__name">Musafir <em>Café</em></p>
        <p class="brand__tagline">Coffee for the dreamer</p>
      </div>
    </div>
    <button id="close" type="button" aria-label="Close assistant">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"
           stroke-width="1.6" aria-hidden="true">
        <path d="M1 1l10 10M11 1L1 11" />
      </svg>
    </button>
  </header>

  <div id="messages" role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation">
    <div id="welcome">
      <p class="welcome__eyebrow">Bidholi · Foothills of Mussoorie</p>
      <p class="welcome__title">Welcome to <em>Musafir Café.</em></p>
      <p class="welcome__text">Find your next favourite coffee, explore our menu, or ask for a recommendation.</p>
      <div class="suggestions" role="group" aria-label="Suggested questions"></div>
    </div>
  </div>

  <form id="composer">
    <label class="sr-only" for="input">Your message</label>
    <div class="field">
      <textarea id="input" rows="1" placeholder="Ask about the menu…" autocomplete="off"
                enterkeyhint="send"></textarea>
      <button id="send" type="submit" aria-label="Send message">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" aria-hidden="true">
          <path d="M12 19V5M5 12l7-7 7 7" stroke-linecap="square" />
        </svg>
      </button>
    </div>
    <p id="status" role="status" aria-live="polite"></p>
  </form>
</section>
`;

/** Display string for a product price. The backend already formats INR. */
function priceLabel(product: WidgetProduct): string {
  return product.price_inr ?? `₹${(product.price_cents / 100).toFixed(2)}`;
}

/** "dairy_free" → "dairy free"; the kitchen's own classification only. */
function dietaryLabel(classification: string): string | null {
  const normalised = classification.trim().toLowerCase();
  if (!normalised || normalised === "none") return null;
  return normalised.replace(/_/g, " ");
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export class CafeChatbot extends HTMLElement {
  static get observedAttributes() {
    return ["api-base"];
  }

  private readonly root: ShadowRoot;
  private apiBase: string;
  private conversationId: string | null = null;
  private isOpen = false;
  private sending = false;
  private typingEl: HTMLElement | null = null;

  private readonly wrapEl: HTMLElement;
  private readonly messagesEl: HTMLElement;
  private readonly welcomeEl: HTMLElement;
  private readonly suggestionsEl: HTMLElement;
  private readonly inputEl: HTMLTextAreaElement;
  private readonly sendEl: HTMLButtonElement;
  private readonly statusEl: HTMLElement;
  private readonly launcherEl: HTMLButtonElement;
  private readonly formEl: HTMLFormElement;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.root.innerHTML = TEMPLATE;
    this.apiBase = (this.getAttribute("api-base") || "http://localhost:8787").replace(/\/+$/, "");

    this.wrapEl = this.root.getElementById("wrap")!;
    this.messagesEl = this.root.getElementById("messages")!;
    this.welcomeEl = this.root.getElementById("welcome")!;
    this.suggestionsEl = this.welcomeEl.querySelector(".suggestions") as HTMLElement;
    this.inputEl = this.root.getElementById("input") as HTMLTextAreaElement;
    this.sendEl = this.root.getElementById("send") as HTMLButtonElement;
    this.statusEl = this.root.getElementById("status")!;
    this.launcherEl = this.root.getElementById("launcher") as HTMLButtonElement;
    this.formEl = this.root.getElementById("composer") as HTMLFormElement;

    this.renderSuggestions();

    this.launcherEl.addEventListener("click", () => this.open());
    this.root.getElementById("close")!.addEventListener("click", () => this.close());
    this.formEl.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.send(this.inputEl.value);
    });
    this.inputEl.addEventListener("input", () => this.syncComposer());
    this.inputEl.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      this.formEl.requestSubmit();
    });
    this.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.isOpen) {
        event.stopPropagation();
        this.close();
      }
    });
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null) {
    if (name === "api-base" && value) this.apiBase = value.replace(/\/+$/, "");
  }

  connectedCallback() {
    // Always start closed without stealing focus from the host page.
    this.isOpen = false;
    this.wrapEl.hidden = true;
    this.launcherEl.hidden = false;
    this.launcherEl.setAttribute("aria-expanded", "false");
    this.syncComposer();
  }

  /** Open the chat panel and move focus to the message input. */
  open(): void {
    if (this.isOpen) {
      this.inputEl.focus();
      return;
    }
    this.isOpen = true;
    this.wrapEl.hidden = false;
    this.launcherEl.hidden = true;
    this.launcherEl.setAttribute("aria-expanded", "true");
    this.inputEl.focus();
    this.dispatchEvent(new CustomEvent("cafe-chatbot-open", { bubbles: true }));
  }

  /** Close the chat panel and return focus to the launcher. */
  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.wrapEl.hidden = true;
    this.launcherEl.hidden = false;
    this.launcherEl.setAttribute("aria-expanded", "false");
    this.launcherEl.focus();
    this.dispatchEvent(new CustomEvent("cafe-chatbot-close", { bubbles: true }));
  }

  private renderSuggestions() {
    for (const [index, suggestion] of SUGGESTIONS.entries()) {
      const button = element("button", "suggestion");
      button.type = "button";

      const num = element("span", "suggestion__num");
      num.textContent = String(index + 1).padStart(2, "0");

      const label = element("span", "suggestion__label");
      label.textContent = suggestion.label;

      const arrow = element("span", "suggestion__arrow");
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";

      button.appendChild(num);
      button.appendChild(label);
      button.appendChild(arrow);
      button.addEventListener("click", () => {
        void this.send(suggestion.query);
        this.inputEl.focus();
      });
      this.suggestionsEl.appendChild(button);
    }
  }

  private async send(raw: string) {
    const text = raw.trim();
    if (!text || this.sending) return;

    this.sending = true;
    this.welcomeEl.hidden = true;
    this.inputEl.value = "";
    this.syncComposer();
    this.appendMessage("customer", text);
    this.setTyping(true);
    this.setStatus("Sending…");

    try {
      const payload: Record<string, unknown> = {
        message: text,
        grounding: "retrieval_validation",
      };
      // The API expects an optional UUID; sending `null` would fail validation.
      if (this.conversationId) payload.conversation_id = this.conversationId;

      const response = await fetch(`${this.apiBase}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);

      const data = (await response.json()) as ChatPayload;
      this.conversationId = data.conversation_id ?? this.conversationId;
      this.setTyping(false);
      this.appendMessage("assistant", data.reply || "(no reply)", data.products);
      this.setStatus("");
    } catch {
      this.setTyping(false);
      this.appendMessage(
        "assistant",
        "Sorry, I couldn't reach Musafir Café right now. Please try again.",
        undefined,
        true
      );
      this.setStatus("");
    } finally {
      this.sending = false;
      this.syncComposer();
      if (this.isOpen) this.inputEl.focus();
    }
  }

  private appendMessage(
    role: "customer" | "assistant",
    text: string,
    products?: WidgetProduct[],
    isError = false
  ) {
    const stick = this.isNearBottom();

    const turn = element("div", `turn turn--${role}`);
    const meta = element("p", "turn__meta");
    meta.textContent = isError ? "Notice" : role === "customer" ? "You" : "Musafir";

    // textContent (never innerHTML) keeps model/user output inert: no XSS.
    const bubble = element("div", `msg ${role}${isError ? " error" : ""}`);
    bubble.textContent = text;
    if (isError) bubble.setAttribute("role", "alert");

    turn.appendChild(meta);
    turn.appendChild(bubble);
    if (products && products.length > 0) turn.appendChild(this.buildCards(products));
    this.messagesEl.appendChild(turn);

    if (stick) this.scrollToLatest();
  }

  private buildCards(products: WidgetProduct[]): HTMLElement {
    const list = element("div", "cards");

    for (const product of products) {
      const card = element("article", "card");

      const top = element("div", "card__top");
      const category = element("span", "card__category");
      category.textContent = product.category ?? "Menu";
      const price = element("span", "card__price");
      price.textContent = priceLabel(product);
      top.appendChild(category);
      top.appendChild(price);

      const name = element("p", "card__name");
      name.textContent = product.name;

      const description = element("p", "card__desc");
      description.textContent = product.description;

      const tags = element("div", "card__tags");
      const availability = element(
        "span",
        product.available ? "tag tag--available" : "tag tag--unavailable"
      );
      availability.textContent = product.available ? "Available" : "Currently unavailable";
      tags.appendChild(availability);

      const dietary = dietaryLabel(product.dietary_classification);
      if (dietary) {
        const tag = element("span", "tag");
        tag.textContent = dietary;
        tags.appendChild(tag);
      }

      const verified = product.allergens
        .filter((allergen) => allergen.verified)
        .map((allergen) => allergen.name);
      if (verified.length > 0) {
        const tag = element("span", "tag tag--allergen");
        tag.textContent = `Contains: ${verified.join(", ")}`;
        tags.appendChild(tag);
      }
      if (product.allergens.some((allergen) => !allergen.verified)) {
        const tag = element("span", "tag tag--uncertain");
        tag.textContent = "Allergen data unverified";
        tags.appendChild(tag);
      }

      card.appendChild(top);
      card.appendChild(name);
      card.appendChild(description);
      card.appendChild(tags);
      list.appendChild(card);
    }

    return list;
  }

  private setTyping(active: boolean) {
    if (active) {
      if (this.typingEl) return;
      const stick = this.isNearBottom();

      const turn = element("div", "turn turn--assistant");
      const meta = element("p", "turn__meta");
      meta.textContent = "Musafir";

      const bubble = element("div", "bubble typing");
      bubble.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 3; i += 1) bubble.appendChild(element("span", "typing__dot"));

      const announcement = element("span", "sr-only");
      announcement.textContent = "Musafir is replying…";

      turn.appendChild(meta);
      turn.appendChild(bubble);
      turn.appendChild(announcement);
      this.messagesEl.appendChild(turn);
      this.typingEl = turn;

      if (stick) this.scrollToLatest();
      return;
    }

    this.typingEl?.remove();
    this.typingEl = null;
  }

  private syncComposer() {
    this.sendEl.disabled = this.sending || this.inputEl.value.trim().length === 0;
    this.inputEl.style.height = "auto";
    this.inputEl.style.height = `${Math.min(this.inputEl.scrollHeight, 110)}px`;
  }

  private setStatus(text: string) {
    this.statusEl.textContent = text;
  }

  private isNearBottom(): boolean {
    const el = this.messagesEl;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 64;
  }

  private scrollToLatest() {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }
}

if (!customElements.get("cafe-chatbot")) {
  customElements.define("cafe-chatbot", CafeChatbot);
}

declare global {
  interface HTMLElementTagNameMap {
    "cafe-chatbot": CafeChatbot;
  }
}
