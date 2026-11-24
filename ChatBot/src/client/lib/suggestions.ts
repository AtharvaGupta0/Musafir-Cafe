/**
 * Suggested opening questions.
 *
 * Shared by the standalone interface and the embeddable widget so both entry
 * points send the same meaningful customer queries.
 */

export interface Suggestion {
  id: string;
  label: string;
  query: string;
}

export const SUGGESTIONS: readonly Suggestion[] = [
  { id: "menu", label: "Explore the menu", query: "What's on the menu?" },
  { id: "recommend", label: "Recommend a coffee", query: "Can you recommend a coffee?" },
  { id: "budget", label: "Something under ₹200", query: "What can I get for under ₹200?" },
  { id: "popular", label: "Popular favourites", query: "What are your most popular items?" },
];
