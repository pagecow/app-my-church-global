// Where a notification leads: a row on the Notifications screen and a tapped
// push must open the same place. Run with `npm test`.
// Keep this file identical in both phone apps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationTarget, parsePushData } from '../lib/notifications.ts';

test('"you were added to a group" opens that group', () => {
  // The exact data the server sends (app/api/v1/groups/[groupId]/invites).
  const target = notificationTarget({ type: 'group_added', groupId: 'g1', inviteId: 'i1' });
  assert.deepEqual(target, { pathname: '/group/[id]', params: { id: 'g1' } });
});

test('the older group invite still opens the group, and passes its invite on', () => {
  assert.deepEqual(notificationTarget({ type: 'group_invite', groupId: 'g1', inviteId: 'i1' }), {
    pathname: '/group/[id]',
    params: { id: 'g1', inviteId: 'i1' },
  });
  assert.deepEqual(notificationTarget({ type: 'group_invite', groupId: 'g1' }), {
    pathname: '/group/[id]',
    params: { id: 'g1' },
  });
});

test('a request to join opens the group\'s requests', () => {
  assert.deepEqual(notificationTarget({ type: 'group_request', groupId: 'g1' }), {
    pathname: '/group/[id]/requests',
    params: { id: 'g1' },
  });
});

test('a group notice without a group id opens nothing', () => {
  assert.equal(notificationTarget({ type: 'group_added' }), null);
  assert.equal(notificationTarget({ type: 'group_request', groupId: '' }), null);
});

test('a new post opens the post without its comments', () => {
  assert.deepEqual(notificationTarget({ postId: 'p1' }), {
    pathname: '/notification-thread',
    params: { postId: 'p1', openComments: '0' },
  });
});

test('a comment or a reply opens the post with its comments', () => {
  assert.deepEqual(notificationTarget({ postId: 'p1', comment: 'Amen', commentId: 'c1' }), {
    pathname: '/notification-thread',
    params: { postId: 'p1', commentId: 'c1', openComments: '1' },
  });
  // A reply points at the comment it answers.
  assert.deepEqual(notificationTarget({ postId: 'p1', reply: 'Yes', parentId: 'c1', commentId: 'c2' }), {
    pathname: '/notification-thread',
    params: { postId: 'p1', commentId: 'c1', openComments: '1' },
  });
});

test('a post inside a group keeps its group', () => {
  assert.deepEqual(notificationTarget({ postId: 'p1', groupId: 'g1' }), {
    pathname: '/notification-thread',
    params: { postId: 'p1', groupId: 'g1', openComments: '0' },
  });
});

test('a plain message opens nothing', () => {
  assert.equal(notificationTarget({}), null);
  assert.equal(notificationTarget(null), null);
  assert.equal(notificationTarget(undefined), null);
  assert.equal(notificationTarget({ title: 'Service moved to 11' }), null);
  assert.equal(notificationTarget('not json'), null);
  assert.equal(notificationTarget(['group_added']), null);
});

test('the data is read whether it comes as an object, as JSON text, or nested', () => {
  const want = { pathname: '/group/[id]', params: { id: 'g1' } };
  assert.deepEqual(notificationTarget('{"type":"group_added","groupId":"g1"}'), want);
  assert.deepEqual(notificationTarget({ pushData: { type: 'group_added', groupId: 'g1' } }), want);
  assert.deepEqual(notificationTarget({ pushData: '{"type":"group_added","groupId":"g1"}' }), want);
  assert.deepEqual(notificationTarget({ body: { type: 'group_added', groupId: 'g1' } }), want);
  // A number is accepted as an id; it is passed on as text.
  assert.deepEqual(notificationTarget({ postId: 42 }), {
    pathname: '/notification-thread',
    params: { postId: '42', openComments: '0' },
  });
});

test('parsePushData never throws and always gives an object', () => {
  for (const value of [undefined, null, '', '{', 7, true, [], 'null', '[1,2]']) {
    assert.deepEqual(parsePushData(value), {});
  }
  assert.deepEqual(parsePushData({ reply: 'Hi', postId: 'p1' }), { reply: 'Hi', postId: 'p1' });
});
