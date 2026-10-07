/**
 * Example requests for providers: a JSON object people see on a provider's page and that "Try it" sends. Kept in its own file
 * (no React) so the rules can be tested; they mirror the server's rules in src/lib/provider-network-rules.ts.
 */

export const EXAMPLE_MAX = 1500;

/** The example request as a person edits it: pretty-printed when it's valid JSON, as-is otherwise, empty when there is none. */
export function prettyExample(text: string | null | undefined): string {
  if (!text) return '';
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** Null when the text is empty or a JSON object; otherwise what to tell the person. */
export function exampleProblem(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (t.length > EXAMPLE_MAX) return `Too long. Keep it under ${EXAMPLE_MAX} characters.`;
  try {
    const v = JSON.parse(t);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return 'It should be a JSON object, like {"city": "Lagos"}.';
    return null;
  } catch {
    return 'That isn’t valid JSON yet.';
  }
}
