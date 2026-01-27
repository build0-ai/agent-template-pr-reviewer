/**
 * Normalize newlines in AI-generated text.
 * Sometimes the AI outputs literal \n characters instead of actual newlines.
 */
export function normalizeNewlines(text: string): string {
  return text.replace(/\\n/g, "\n");
}
