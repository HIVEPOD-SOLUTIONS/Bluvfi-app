/** What to tell the person when a voice message can't be turned into text. */

/** The transcription request was refused: the server's own words (they are written for people) and the status code, so failures can be told apart. */
export function voiceFailureMessage(status: number, serverMessage?: string): string {
  if (status === 429 && serverMessage) return serverMessage;
  if (status === 401) return 'Your session has expired. Log in again to use voice. (401)';
  const said = serverMessage?.trim() ? serverMessage.trim().replace(/[.!]*$/, '.') : "Couldn't transcribe that.";
  const ask = /try again/i.test(said) ? '' : ' Please try again.'; // the server's own wording often says it already
  return `${said}${ask} (${status})`;
}

/** The request never got an answer: no connection, a timeout, or the recording file couldn't be read. */
export function voiceNetworkMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  if (/network request failed|failed to fetch|timeout|timed out/i.test(text)) return "Couldn't reach Bluvfi. Check your connection and try again.";
  return "Couldn't send that recording. Please try again.";
}
