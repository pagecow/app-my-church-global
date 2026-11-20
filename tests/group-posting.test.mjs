// Who may post inside a group (lib/group-permissions.ts). Run with `npm test`.
// The same file is in both phone apps.
//
// Every member of a group may post in it, even when the church has turned off
// "All app users can post in the app" (that setting is only for the Home feed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canPostInGroup } from '../lib/group-permissions.ts';

const active = (my_role) => ({ membership_state: 'active', my_role });

test('every active member may post in the group, whatever their role', () => {
  assert.equal(canPostInGroup(active('member')), true);
  assert.equal(canPostInGroup(active('admin')), true);
  assert.equal(canPostInGroup(active('owner')), true);
});

test('an archived group takes no new posts, so nobody is offered the post box', () => {
  // The server answers 400 "This group is archived", so the box is not shown at all.
  assert.equal(canPostInGroup({ membership_state: 'active', status: 'archived', my_role: 'owner' }), false);
  assert.equal(canPostInGroup({ membership_state: 'active', status: 'archived', my_role: 'member' }), false);
  assert.equal(canPostInGroup({ membership_state: 'active', status: 'active', my_role: 'member' }), true);
});

test('someone who has not joined may not post', () => {
  assert.equal(canPostInGroup({ membership_state: 'none' }), false);
  assert.equal(canPostInGroup({ membership_state: 'pending' }), false);
  assert.equal(canPostInGroup({ membership_state: 'invited' }), false);
  assert.equal(canPostInGroup({}), false);
  assert.equal(canPostInGroup(null), false);
  assert.equal(canPostInGroup(undefined), false);
});

test('the group screen shows the post box by that rule and never reads the church setting', () => {
  const screen = readFileSync(new URL('../app/group/[id]/index.tsx', import.meta.url), 'utf8');
  const code = screen.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.match(code, /canPostInGroup\(group\)/);
  assert.doesNotMatch(code, /canAllUsersPost/);
  // The old rule: only the group's owner and admins (and church admins) saw the box.
  const line = code.split('\n').find((l) => /const canPost\b/.test(l)) ?? '';
  assert.doesNotMatch(line, /my_role|is_admin/);
});

test('the composer lets a group post through when the church setting is off', () => {
  const composer = readFileSync(new URL('../app/create-post.tsx', import.meta.url), 'utf8');
  // The church-wide gate is skipped for a group post, which goes to its own route.
  assert.match(composer, /if \(!canPost && !groupId\)/);
  assert.match(composer, /\$\{API_URL\}\/groups\/\$\{groupId\}\/posts/);
});
