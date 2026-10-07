/**
 * Lets a screen outside the tabs (the FAQ) ask the assistant a question. The chat sheet lives inside the tabs layout, so those
 * screens can't use `useChatSheet`; they call `askAssistant` and the tabs layout, which is listening, opens the sheet with it.
 */
type Listener = (prompt: string) => void;

let listener: Listener | null = null;
let waiting: string | null = null;

/** Ask the assistant. If the tabs aren't listening yet, the question waits for them. */
export function askAssistant(prompt: string): void {
  if (listener) listener(prompt);
  else waiting = prompt;
}

/** The tabs layout subscribes here. Returns the unsubscribe function. */
export function onAskAssistant(fn: Listener): () => void {
  listener = fn;
  if (waiting !== null) {
    const p = waiting;
    waiting = null;
    fn(p);
  }
  return () => {
    if (listener === fn) listener = null;
  };
}
