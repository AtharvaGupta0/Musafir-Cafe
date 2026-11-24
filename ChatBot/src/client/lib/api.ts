/**
 * Client-side API access for the MUSAFIR Café assistant.
 *
 * In production the client is served by the same Worker as the API, so the
 * base is empty and requests stay same-origin. During local development the
 * Vite server (5173) talks to the Worker (8787) instead. Either way the
 * Gemini credentials remain server-side.
 */

export interface Product {
  id: number;
  category?: string;
  name: string;
  description: string;
  price_cents: number;
  price_inr?: string;
  available: boolean;
  dietary_classification: string;
  ingredients: string[];
  allergens: Array<{ name: string; verified: boolean }>;
}

export interface ChatResponse {
  reply: string;
  conversation_id: string;
  grounding_mode: string;
  used_tools: string[];
  products: Product[];
}

const configuredBase = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const API_BASE = (
  configuredBase ?? (import.meta.env.DEV ? "http://localhost:8787" : "")
).replace(/\/+$/, "");

export class ChatApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatApiError";
  }
}

async function describeFailure(response: Response): Promise<string> {
  const fallback = `The assistant could not respond (status ${response.status}). Please try again.`;
  const raw = await response.text().catch(() => "");
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as { message?: unknown; error?: unknown };
    const message =
      typeof parsed.message === "string"
        ? parsed.message
        : typeof parsed.error === "string"
          ? parsed.error
          : "";
    return message || fallback;
  } catch {
    // Never surface raw HTML or unbounded server output to the customer.
    return raw.length <= 200 && !raw.includes("<") ? raw : fallback;
  }
}

export async function postChat({
  message,
  conversationId,
  groundingMode,
}: {
  message: string;
  conversationId?: string;
  groundingMode?: string;
}): Promise<ChatResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
        grounding: groundingMode || "retrieval_validation",
      }),
    });
  } catch {
    throw new ChatApiError(
      "Couldn't reach the café assistant. Check your connection and try again."
    );
  }

  if (!response.ok) {
    throw new ChatApiError(await describeFailure(response));
  }

  return response.json();
}

export async function fetchHealth(): Promise<{ status: string }> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/health`);
  } catch {
    throw new ChatApiError("Couldn't reach the café assistant service.");
  }
  if (!response.ok) throw new ChatApiError(`Health check failed (${response.status})`);
  return response.json();
}
