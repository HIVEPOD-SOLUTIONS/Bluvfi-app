/**
 * The screens only provider creators get: Shar rewards, Activity, and Help & FAQ. Every way in (the profile rows, the Home card, links the
 * assistant writes, cards in the chat) checks this, and the screens themselves send anyone else back Home.
 */
export const CREATOR_ONLY_ROUTES: readonly string[] = ['/shar', '/activity', '/faq'];

/** True for a path (or a { pathname } target) that only creators may open. */
export function isCreatorOnlyRoute(target: string | { pathname: string }): boolean {
  const path = typeof target === 'string' ? target : target.pathname;
  return CREATOR_ONLY_ROUTES.includes(path.split('?')[0].replace(/\/+$/, '') || '/');
}
