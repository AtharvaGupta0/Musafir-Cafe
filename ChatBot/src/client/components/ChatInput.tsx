import { useEffect, useRef } from "react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  pending: boolean;
}

export function ChatInput({ value, onChange, onSubmit, pending }: ChatInputProps) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const canSubmit = value.trim().length > 0 && !pending;

  // Restore focus on first mount and whenever a request settles.
  useEffect(() => {
    if (!pending) textRef.current?.focus();
  }, [pending]);

  // Grow with the message, bounded by the CSS max-height.
  useEffect(() => {
    const field = textRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 160)}px`;
  }, [value]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit(value.trim());
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline; never submit mid-composition.
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    formRef.current?.requestSubmit();
  }

  return (
    <form className="composer" onSubmit={handleSubmit} ref={formRef}>
      <div className="composer__inner">
        <div className="composer__field">
          <label className="sr-only" htmlFor="composer-input">
            Your message
          </label>
          <textarea
            id="composer-input"
            ref={textRef}
            className="composer__input"
            rows={1}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the menu, prices or dietary needs…"
            autoComplete="off"
            enterKeyHint="send"
            aria-describedby="composer-hint"
          />
          <button
            type="submit"
            className="composer__send"
            disabled={!canSubmit}
            aria-label="Send message"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="square" />
            </svg>
          </button>
        </div>
        <p className="composer__hint" id="composer-hint">
          Enter to send · <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line
        </p>
      </div>
    </form>
  );
}
