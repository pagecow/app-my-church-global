/**
 * Where a notification leads.
 *
 * The same answer is used in two places: a row on the Notifications screen, and
 * a push notification the person taps on their lock screen. Nothing in this file
 * knows about React or the network, so it is tested on its own
 * (tests/notifications.test.mjs, run with `npm test`).
 *
 * Keep this file identical in both phone apps (app-my-church-global and
 * amc-central-community-church).
 */

/** A screen to open, in the shape `router.push` takes. */
export type NotificationTarget =
  | { pathname: '/group/[id]'; params: { id: string; inviteId?: string } }
  | { pathname: '/group/[id]/requests'; params: { id: string } }
  | {
      pathname: '/notification-thread';
      params: { postId: string; commentId?: string; groupId?: string; openComments: '0' | '1' };
    };

const text = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
};

/**
 * The data that came with a notification, as a plain object.
 *
 * The server's list sends it as an object or as JSON text. A tapped push hands
 * over an object, and some phones nest the real data one level down under
 * `pushData` or `body`. Anything unreadable becomes an empty object.
 */
export function parsePushData(raw: unknown): Record<string, any> {
  let data: unknown = raw;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return {};
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const outer = data as Record<string, any>;
  if (outer.type || outer.postId || outer.groupId) return outer;
  for (const key of ['pushData', 'body']) {
    const inner = parsePushData(outer[key]);
    if (inner.type || inner.postId || inner.groupId) return inner;
  }
  return outer;
}

/**
 * The screen a notification opens, or `null` when it is only a message.
 *
 * - "You were added to a group" (`group_added`, and the older `group_invite`)
 *   opens that group.
 * - "Someone asked to join" (`group_request`) opens the group's requests.
 * - Anything about a post opens the post, with its comments when the
 *   notification is about a comment or a reply.
 */
export function notificationTarget(raw: unknown): NotificationTarget | null {
  const data = parsePushData(raw);
  const groupId = text(data.groupId);

  // Group notices carry no post, so they are settled first.
  if ((data.type === 'group_added' || data.type === 'group_invite') && groupId) {
    // Membership is created when the person is added, so `group_added` has
    // nothing to accept. Only the older `group_invite` passes its invite on.
    const inviteId = data.type === 'group_invite' ? text(data.inviteId) : undefined;
    return { pathname: '/group/[id]', params: inviteId ? { id: groupId, inviteId } : { id: groupId } };
  }
  if (data.type === 'group_request' && groupId) {
    return { pathname: '/group/[id]/requests', params: { id: groupId } };
  }

  const postId = text(data.postId);
  if (!postId) return null;
  const commentId = text(data.parentId) || text(data.commentId);
  const openComments = Boolean(data.comment || data.reply || commentId);
  return {
    pathname: '/notification-thread',
    params: {
      postId,
      ...(commentId ? { commentId } : {}),
      ...(groupId ? { groupId } : {}),
      openComments: openComments ? '1' : '0',
    },
  };
}
