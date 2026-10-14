/** Squad helpers for the app. The server owns the rules (name, size, goal); this only tidies what a person types and builds the invite text. */

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** What the join box accepts: upper case, only the characters a code can have, at most `length` of them. */
export function normalizeSquadCode(raw: string, length = 6): string {
  return [...raw.toUpperCase()].filter((c) => ALPHABET.includes(c)).slice(0, length).join('');
}

/** The text a person shares to bring a friend into their squad. */
export function squadInviteMessage(name: string, code: string): string {
  return `Join my Bluvfi squad "${name}" and pool Shar toward our weekly goal. In the app open Daily Spark, then Squad, and enter the code ${code}.`;
}
