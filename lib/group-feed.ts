import type { Group } from './groups';

/**
 * The address of a group's feed, or `null` when the person cannot read it.
 *
 * Only a member can read a group's posts, so for anyone else there is no address and no
 * request is made (the server would answer 403). The church comes from the group itself:
 * the server has already checked that it is the person's own church, and it does not depend
 * on a value the phone stored earlier. `appId` is only a fallback for a server that sends no
 * `church_id`.
 *
 * The feed hook adds `&page=` and `&limit=`, so the address already carries a `?`.
 *
 * A plain module (no React Native imports) so `npm test` can run it.
 */
export function groupFeedEndpoint({
  apiUrl,
  token,
  groupId,
  appId,
  group,
}: {
  apiUrl: string;
  token: string | null | undefined;
  groupId: string;
  appId?: string | null;
  group: Pick<Group, 'membership_state'> & Partial<Pick<Group, 'church_id'>> | null | undefined;
}): string | null {
  if (!token || !groupId || !group) return null;
  if (group.membership_state !== 'active') return null;
  const church = group.church_id || appId;
  if (!church) return null;
  return `${apiUrl}/groups/${groupId}/posts?appId=${encodeURIComponent(church)}`;
}
