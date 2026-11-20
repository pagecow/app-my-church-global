import type { Group } from './groups';

/**
 * What the person using the app may do in a group, and what the group screen says.
 *
 * The server decides every one of these for real; this file only decides what is shown.
 * A plain module (no React Native imports) so `npm test` can run it. The same file is in
 * both phone apps.
 */

/** The few things about a group these rules read. */
type GroupFacts = Partial<
  Pick<Group, 'membership_state' | 'status' | 'visibility' | 'my_role' | 'member_count' | 'has_pending_request'>
>;

const isMember = (group: GroupFacts | null | undefined) => group?.membership_state === 'active';
const isArchived = (group: GroupFacts | null | undefined) => group?.status === 'archived';
const hasPendingRequest = (group: GroupFacts | null | undefined) =>
  group?.membership_state === 'pending' || Boolean(group?.has_pending_request);

/**
 * May the person post inside this group?
 *
 * Yes for every active member: owner, group admin and plain member alike. The church's
 * own "All app users can post in the app" setting (`appData.canAllUsersPost`) only decides
 * who may post on the Home feed, so a church that keeps it off still has its members
 * posting inside the groups they belong to. An archived group takes no new posts (the
 * server answers 400), so it is not offered. The server enforces the same rule
 * (`canPostInGroup` on the website's `/api/v1/groups/:id/posts`).
 */
export function canPostInGroup(group: GroupFacts | null | undefined): boolean {
  return isMember(group) && !isArchived(group);
}

/**
 * The button that lets someone who is not in the group in: "Join group" for a public one
 * (the server lets them in at once) and "Ask to join" for a private one (an owner or admin
 * approves). `null` when there is nothing to press: they are already in, they already asked,
 * or the group is archived and takes no new members.
 */
export function joinActionFor(
  group: GroupFacts | null | undefined
): { label: string; kind: 'primary' | 'tinted' } | null {
  if (!group || isMember(group) || isArchived(group) || hasPendingRequest(group)) return null;
  return group.visibility === 'private'
    ? { label: 'Ask to join', kind: 'tinted' }
    : { label: 'Join group', kind: 'primary' };
}

/** The grey note at the top of a group, or `null` when there is nothing to say. */
export function groupNotice(group: GroupFacts | null | undefined): string | null {
  if (!group) return null;
  if (isMember(group)) {
    return isArchived(group) ? 'This group is archived. It no longer takes new posts or new members.' : null;
  }
  if (isArchived(group)) return 'This group is archived and no longer takes new members.';
  if (hasPendingRequest(group)) return 'Your request to join is waiting for approval.';
  return group.visibility === 'private'
    ? 'This is a private group. Ask to join to see the feed.'
    : 'Join this group to see the feed.';
}

/** Whether the group screen offers "Leave group": only to someone who is in the group. */
export function canLeaveGroup(group: GroupFacts | null | undefined): boolean {
  return isMember(group);
}

/**
 * What to tell someone who taps "Leave group". The server hands the group to another member
 * when its owner leaves, but a group whose only member is its owner would be left empty, so
 * that owner is pointed to "Delete group" in the settings instead.
 */
export function leaveGroupMessage(group: GroupFacts | null | undefined): { blocked: boolean; message: string } {
  const again =
    group?.visibility === 'private' ? 'You will need to ask to join again.' : 'You can join again any time.';
  if (group?.my_role === 'owner') {
    if (typeof group.member_count === 'number' && group.member_count <= 1) {
      return {
        blocked: true,
        message: 'You are the only member. To close this group, delete it in the group settings.',
      };
    }
    return { blocked: false, message: `Another member will become the owner. ${again}` };
  }
  return { blocked: false, message: `You will stop getting this group's posts. ${again}` };
}
