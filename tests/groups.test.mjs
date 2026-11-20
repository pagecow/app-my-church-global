// The Groups screens' rules, and the age shown on a join request. Run with `npm test`.
// The same file is in both phone apps.
//
// Written after a group the person had not joined (a "More groups" row) opened on a spinner
// that never stopped: the posts feed had nothing to load, and nothing said so.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { feedHasNothingToLoad } from '../lib/feed-state.ts';
import { groupFeedEndpoint } from '../lib/group-feed.ts';
import { canLeaveGroup, groupNotice, joinActionFor, leaveGroupMessage } from '../lib/group-permissions.ts';
import { ageFromBirthDate } from '../lib/groups.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const API = 'https://appmychurch.com/api/v1';
const member = { membership_state: 'active', my_role: 'member', status: 'active', visibility: 'private' };

// ---------------------------------------------------------------- the feed

test('a group you have not joined has no feed to read', () => {
  for (const membership_state of ['none', 'pending', 'invited']) {
    const endpoint = groupFeedEndpoint({
      apiUrl: API,
      token: 't',
      groupId: 'g1',
      appId: 'church-1',
      group: { membership_state, church_id: 'church-1' },
    });
    assert.equal(endpoint, null, membership_state);
  }
});

test('a member reads the feed of the group\'s own church, with or without a stored church id', () => {
  const group = { membership_state: 'active', church_id: 'church-1' };
  const expected = `${API}/groups/g1/posts?appId=church-1`;
  assert.equal(groupFeedEndpoint({ apiUrl: API, token: 't', groupId: 'g1', appId: null, group }), expected);
  assert.equal(groupFeedEndpoint({ apiUrl: API, token: 't', groupId: 'g1', appId: 'church-1', group }), expected);
  // The group's church wins over whatever was stored on the phone.
  assert.equal(groupFeedEndpoint({ apiUrl: API, token: 't', groupId: 'g1', appId: 'other', group }), expected);
  // A server that sent no church falls back to the stored one, and with neither there is no feed.
  const bare = { membership_state: 'active' };
  assert.equal(
    groupFeedEndpoint({ apiUrl: API, token: 't', groupId: 'g1', appId: 'church-2', group: bare }),
    `${API}/groups/g1/posts?appId=church-2`
  );
  assert.equal(groupFeedEndpoint({ apiUrl: API, token: 't', groupId: 'g1', appId: null, group: bare }), null);
});

test('the address already has a "?", because the feed adds &page= and &limit=', () => {
  const endpoint = groupFeedEndpoint({
    apiUrl: API,
    token: 't',
    groupId: 'g1',
    group: { membership_state: 'active', church_id: 'a b' },
  });
  assert.equal(endpoint, `${API}/groups/g1/posts?appId=a%20b`);
});

test('no sign-in, no group id or no group means no feed', () => {
  const group = { membership_state: 'active', church_id: 'c' };
  assert.equal(groupFeedEndpoint({ apiUrl: API, token: null, groupId: 'g1', group }), null);
  assert.equal(groupFeedEndpoint({ apiUrl: API, token: 't', groupId: '', group }), null);
  assert.equal(groupFeedEndpoint({ apiUrl: API, token: 't', groupId: 'g1', group: null }), null);
});

test('a feed that is ready but has nothing to read is not "loading"', () => {
  // The bug: ready (the group had loaded), no endpoint (not a member) -> the spinner stayed on.
  assert.equal(feedHasNothingToLoad({ enabled: true, endpoint: null, token: 't' }), true);
  assert.equal(feedHasNothingToLoad({ enabled: true, endpoint: `${API}/posts?appId=c`, token: null }), true);
  // Not ready yet: still loading, so a screen does not flash an empty list.
  assert.equal(feedHasNothingToLoad({ enabled: false, endpoint: null, token: null }), false);
  // Something to read: it loads as before.
  assert.equal(feedHasNothingToLoad({ enabled: true, endpoint: `${API}/posts?appId=c`, token: 't' }), false);
});

test('the posts hook and the group screen use that rule', () => {
  const hook = code('hooks/usePaginatedPosts.ts');
  assert.match(hook, /feedHasNothingToLoad\(\{ enabled, endpoint, token \}\)/);
  // What the screen sees is never "loading" while there is nothing to load.
  assert.match(hook, /isPostsLoading:\s*isPostsLoading && !nothingToLoad/);
  // A refresh with no endpoint ends, instead of spinning forever.
  const fetchPosts = hook.slice(hook.indexOf('const fetchPosts'), hook.indexOf('// Initial load'));
  assert.match(fetchPosts, /if \(!url\) \{[\s\S]*?setIsRefreshing\(false\);[\s\S]*?return;/);

  const screen = code('app/group/[id]/index.tsx');
  assert.match(screen, /enabled:\s*!groupLoading/);
  assert.match(screen, /groupFeedEndpoint\(/);
  assert.match(screen, /isMember && isPostsLoading && !isRefreshing/);
});

// ------------------------------------------------------- join, leave, notices

test('the join button: "Join group" for a public group, "Ask to join" for a private one', () => {
  assert.deepEqual(joinActionFor({ membership_state: 'none', visibility: 'public', status: 'active' }), {
    label: 'Join group',
    kind: 'primary',
  });
  assert.deepEqual(joinActionFor({ membership_state: 'none', visibility: 'private', status: 'active' }), {
    label: 'Ask to join',
    kind: 'tinted',
  });
  assert.equal(joinActionFor({ membership_state: 'invited', visibility: 'private' })?.label, 'Ask to join');
});

test('no join button when there is nothing to press', () => {
  assert.equal(joinActionFor(member), null);
  assert.equal(joinActionFor({ membership_state: 'pending', visibility: 'private' }), null);
  assert.equal(joinActionFor({ membership_state: 'none', visibility: 'private', has_pending_request: true }), null);
  assert.equal(joinActionFor({ membership_state: 'none', visibility: 'public', status: 'archived' }), null);
  assert.equal(joinActionFor(null), null);
  assert.equal(joinActionFor(undefined), null);
});

test('the note at the top of a group says what is true', () => {
  assert.equal(groupNotice(member), null);
  assert.match(groupNotice({ ...member, status: 'archived' }), /archived/);
  assert.match(groupNotice({ membership_state: 'pending', visibility: 'private' }), /waiting for approval/);
  assert.match(groupNotice({ membership_state: 'none', visibility: 'private' }), /private group/);
  assert.match(groupNotice({ membership_state: 'none', visibility: 'public' }), /Join this group/);
  assert.match(groupNotice({ membership_state: 'none', visibility: 'public', status: 'archived' }), /archived/);
  assert.equal(groupNotice(null), null);
});

test('only someone in the group is offered "Leave group"', () => {
  assert.equal(canLeaveGroup(member), true);
  for (const membership_state of ['none', 'pending', 'invited']) {
    assert.equal(canLeaveGroup({ membership_state }), false, membership_state);
  }
  assert.equal(canLeaveGroup(null), false);
});

test('leaving: what a member, an owner and a lone owner are told', () => {
  const plain = leaveGroupMessage({ ...member, my_role: 'member', visibility: 'private' });
  assert.equal(plain.blocked, false);
  assert.match(plain.message, /ask to join again/);
  assert.match(leaveGroupMessage({ ...member, visibility: 'public' }).message, /join again any time/);

  const owner = leaveGroupMessage({ ...member, my_role: 'owner', member_count: 5 });
  assert.equal(owner.blocked, false);
  assert.match(owner.message, /Another member will become the owner/);

  // A group whose only member is its owner would be left empty: point to Delete instead.
  const lone = leaveGroupMessage({ ...member, my_role: 'owner', member_count: 1 });
  assert.equal(lone.blocked, true);
  assert.match(lone.message, /delete it/);
  // An unknown count is not a reason to refuse.
  assert.equal(leaveGroupMessage({ ...member, my_role: 'owner' }).blocked, false);
});

test('the screens use those rules', () => {
  const screen = code('app/group/[id]/index.tsx');
  assert.match(screen, /joinActionFor\(group\)/);
  assert.match(screen, /groupsApi\.requestToJoin\(token, group\.id\)/);
  assert.match(screen, /groupsApi\.leaveGroup\(token, group\.id\)/);
  assert.match(screen, /Leave group/);

  // The list shows what the server answered: a public group is joined, not "Requested".
  const tab = code('app/(tabs)/groups.tsx');
  assert.match(tab, /answer\.status === 'approved'/);
});

// ------------------------------------------------------------------- ages

test('a birth date is a day: the same age on every phone, on and around the birthday', () => {
  // The server sends midnight UTC of the day. Read in a US time zone that is the day before,
  // which made the age go up a day early. This file runs under several time zones.
  const born = '1990-05-20T00:00:00.000Z';
  assert.equal(ageFromBirthDate(born, new Date(2026, 4, 19, 12)), 35);
  assert.equal(ageFromBirthDate(born, new Date(2026, 4, 20, 12)), 36);
  assert.equal(ageFromBirthDate(born, new Date(2026, 4, 21, 12)), 36);

  const newYear = '1990-01-01T00:00:00.000Z';
  assert.equal(ageFromBirthDate(newYear, new Date(2025, 11, 31, 23, 30)), 35);
  assert.equal(ageFromBirthDate(newYear, new Date(2026, 0, 1, 0, 30)), 36);
});

test('an unusable birth date gives no age', () => {
  assert.equal(ageFromBirthDate(null), null);
  assert.equal(ageFromBirthDate(undefined), null);
  assert.equal(ageFromBirthDate(''), null);
  assert.equal(ageFromBirthDate('not a date'), null);
  // In the future, or impossibly old.
  assert.equal(ageFromBirthDate('2030-01-01T00:00:00.000Z', new Date(2026, 4, 20)), null);
  assert.equal(ageFromBirthDate('1800-01-01T00:00:00.000Z', new Date(2026, 4, 20)), null);
});
