import { useCallback, useEffect, useRef, useState } from "react";
import { postChat, ChatApiError, type Product } from "../lib/api";
import { decodeServerText } from "../lib/text";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { WelcomePanel } from "./WelcomePanel";

interface ChatMessage {
  id: string;
  role: "customer" | "assistant";
  content: string;
  products?: Product[];
}

interface ChatError {
  message: string;
  /** The message that failed, so it can be retried without being echoed twice. */
  retry: string;
}

let messageSeq = 0;
const nextMessageId = () => `m${(messageSeq += 1)}`;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function TypingIndicator() {
  return (
    <div className="turn turn--assistant">
      <p className="turn__meta">Musafir</p>
      <div className="bubble typing" aria-hidden="true">
        <span className="typing__dot" />
        <span className="typing__dot" />
        <span className="typing__dot" />
      </div>
      <span className="sr-only">Musafir is replying…</span>
    </div>
  );
}

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);

  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const inFlightRef = useRef(false);

  const runRequest = useCallback(
    async (raw: string, echo: boolean) => {
      const message = raw.trim();
      if (!message || inFlightRef.current) return;

      inFlightRef.current = true;
      nearBottomRef.current = true;
      setPending(true);
      setError(null);

      if (echo) {
        setMessages((prev) => [
          ...prev,
          { id: nextMessageId(), role: "customer", content: message },
        ]);
        setValue("");
      }

      try {
        const data = await postChat({
          message,
          conversationId,
          groundingMode: "retrieval_validation",
        });
        setConversationId(data.conversation_id);
        setMessages((prev) => [
          ...prev,
          {
            id: nextMessageId(),
            role: "assistant",
            content: decodeServerText(data.reply),
            products: data.products.length > 0 ? data.products : undefined,
          },
        ]);
      } catch (cause) {
        const detail =
          cause instanceof ChatApiError
            ? cause.message
            : "Something went wrong while contacting the assistant. Please try again.";
        setError({ message: detail, retry: message });
      } finally {
        inFlightRef.current = false;
        setPending(false);
      }
    },
    [conversationId]
  );

  const handleSubmit = useCallback((text: string) => void runRequest(text, true), [runRequest]);
  const handleSuggestion = useCallback((query: string) => void runRequest(query, true), [runRequest]);
  const handleRetry = useCallback(() => {
    if (error) void runRequest(error.retry, false);
  }, [error, runRequest]);

  // Follow the conversation only while the reader is already at the bottom.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !nearBottomRef.current) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [messages, pending, error]);

  function handleScroll() {
    const container = scrollRef.current;
    if (!container) return;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    nearBottomRef.current = distance < 96;
  }

  return (
    <>
      <div className="conversation" ref={scrollRef} onScroll={handleScroll}>
        <div className="conversation__inner">
          <div role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation">
            {messages.length === 0 && !error && <WelcomePanel onSelect={handleSuggestion} />}
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                role={message.role}
                content={message.content}
                products={message.products}
              />
            ))}
            {pending && <TypingIndicator />}
            {error && (
              <div className="turn turn--assistant">
                <p className="turn__meta">Musafir</p>
                <div className="notice" role="alert">
                  <p className="notice__title">Message not sent</p>
                  <p className="notice__text">{error.message}</p>
                  <button type="button" className="notice__action" onClick={handleRetry}>
                    Try again
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <ChatInput value={value} onChange={setValue} onSubmit={handleSubmit} pending={pending} />
    </>
  );
}
