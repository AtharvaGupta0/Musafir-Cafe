/**
 * The backend HTML-escapes assistant replies before serialising them
 * (defence in depth for consumers that render markup). This client always
 * renders reply text with `textContent`, so the escaped entities would show
 * up literally — `I&#039;m` instead of `I'm`.
 *
 * Decode exactly the entities the server produces. A single pass never
 * re-decodes its own output, and the result is still inserted as text, so no
 * markup can become live.
 */
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#039;": "'",
};

export function decodeServerText(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#039);/g, (match) => ENTITIES[match] ?? match);
}
