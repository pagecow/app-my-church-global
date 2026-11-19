// The rules for like, love and pray: a tap shows at once, the server is told in
// the background, and one person never counts twice. Run with `npm test`.
// Keep this file identical in both phone apps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setMemberReaction, setReactionInThread, toggleReaction } from '../lib/reactions.ts';

const ME = 'member-1';

/** Lets everything that is ready to run, run. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/**
 * A pretend server that only answers when the test says so, like a slow
 * connection. It is strict the way the real API is used: `add` and `remove`
 * are both safe to repeat.
 */
function slowServer() {
  const waiting = [];
  const server = { on: false, adds: 0, removes: 0, atOnce: 0, mostAtOnce: 0, offline: false };
  const call = (apply) =>
    new Promise((resolve, reject) => {
      server.atOnce += 1;
      server.mostAtOnce = Math.max(server.mostAtOnce, server.atOnce);
      waiting.push(() => {
        server.atOnce -= 1;
        if (server.offline) return reject(new Error('offline'));
        apply();
        resolve(undefined);
      });
    });
  return {
    server,
    api: {
      add: () => call(() => { server.adds += 1; server.on = true; }),
      remove: () => call(() => { server.removes += 1; server.on = false; }),
    },
    /** Answers every request, including the ones the answers set off. */
    async answerAll() {
      await settle();
      while (waiting.length > 0) {
        waiting.shift()();
        await settle();
      }
    },
  };
}

/** A pretend screen: the member's own icon and the number beside it. */
function screen(startOn = false, startCount = 0) {
  const state = { mine: startOn, count: startCount };
  return {
    state,
    show(on) {
      state.mine = on;
      state.count = Math.max(0, state.count + (on ? 1 : -1));
    },
  };
}

test('one tap fills the icon before the server has answered', async () => {
  const { server, api, answerAll } = slowServer();
  const ui = screen();
  const book = {};

  toggleReaction(book, 'comment:c1:pray', ui.state.mine, api, ui.show);
  assert.deepEqual(ui.state, { mine: true, count: 1 }, 'filled at once');
  assert.equal(server.on, false, 'the server has not answered yet');

  await answerAll();
  assert.equal(server.on, true);
  assert.deepEqual(ui.state, { mine: true, count: 1 });
  assert.equal(book['comment:c1:pray'].busy, false);
});

test('tapping three times quickly counts one person once', async () => {
  const { server, api, answerAll } = slowServer();
  const ui = screen();
  const book = {};

  for (let i = 0; i < 3; i += 1) toggleReaction(book, 'k', ui.state.mine, api, ui.show);
  assert.deepEqual(ui.state, { mine: true, count: 1 });

  await answerAll();
  assert.equal(server.on, true);
  assert.deepEqual(ui.state, { mine: true, count: 1 });
  assert.equal(server.mostAtOnce, 1, 'never two requests at once');
});

test('tapping twice quickly ends with nothing, on screen and on the server', async () => {
  const { server, api, answerAll } = slowServer();
  const ui = screen();
  const book = {};

  toggleReaction(book, 'k', ui.state.mine, api, ui.show);
  toggleReaction(book, 'k', ui.state.mine, api, ui.show);
  assert.deepEqual(ui.state, { mine: false, count: 0 });

  await answerAll();
  assert.equal(server.on, false);
  assert.deepEqual(ui.state, { mine: false, count: 0 });
  assert.equal(server.mostAtOnce, 1);
});

test('the screen follows every tap even when it is given an old value', async () => {
  // A fast double tap can arrive before the screen has redrawn, so the second
  // tap is told the icon is still empty. It must still turn the reaction off.
  const { server, api, answerAll } = slowServer();
  const ui = screen();
  const book = {};

  toggleReaction(book, 'k', false, api, ui.show);
  toggleReaction(book, 'k', false, api, ui.show);
  assert.deepEqual(ui.state, { mine: false, count: 0 });

  await answerAll();
  assert.equal(server.on, false);
});

test('with no connection the icon goes back', async () => {
  const { server, api, answerAll } = slowServer();
  server.offline = true;
  const ui = screen();
  const book = {};

  toggleReaction(book, 'k', ui.state.mine, api, ui.show);
  assert.equal(ui.state.mine, true);

  await answerAll();
  assert.deepEqual(ui.state, { mine: false, count: 0 });
  assert.equal(book.k.busy, false);

  // And it works again once the connection is back.
  server.offline = false;
  toggleReaction(book, 'k', ui.state.mine, api, ui.show);
  await answerAll();
  assert.equal(server.on, true);
  assert.deepEqual(ui.state, { mine: true, count: 1 });
});

test('a reaction that is already on can be taken off', async () => {
  const { server, api, answerAll } = slowServer();
  server.on = true;
  const ui = screen(true, 4);
  const book = {};

  toggleReaction(book, 'post:like', ui.state.mine, api, ui.show);
  assert.deepEqual(ui.state, { mine: false, count: 3 });

  await answerAll();
  assert.equal(server.on, false);
  assert.equal(server.removes, 1);
});

test('different reactions do not wait for each other', async () => {
  const { server, api, answerAll } = slowServer();
  const like = screen();
  const pray = screen();
  const book = {};

  toggleReaction(book, 'comment:c1:like', false, api, like.show);
  toggleReaction(book, 'comment:c1:pray', false, api, pray.show);
  assert.equal(like.state.mine, true);
  assert.equal(pray.state.mine, true);
  await settle();
  assert.equal(server.atOnce, 2);
  await answerAll();
});

test('setMemberReaction never lists one member twice', () => {
  const comment = { id: 'c1', comment_praying: [{ church_userId: 'someone-else' }] };

  const once = setMemberReaction(comment, 'comment_praying', ME, true);
  const twice = setMemberReaction(once, 'comment_praying', ME, true);
  assert.equal(twice.comment_praying.length, 2);
  assert.equal(twice.comment_praying.filter((entry) => entry.church_userId === ME).length, 1);

  const off = setMemberReaction(twice, 'comment_praying', ME, false);
  assert.deepEqual(off.comment_praying, [{ church_userId: 'someone-else' }]);
  assert.deepEqual(comment.comment_praying, [{ church_userId: 'someone-else' }], 'the original is not changed');
});

test('setMemberReaction starts a list the API left out', () => {
  const on = setMemberReaction({ id: 'c1' }, 'comment_likes', ME, true);
  assert.deepEqual(on.comment_likes, [{ church_userId: ME }]);
  const off = setMemberReaction({ id: 'c1' }, 'comment_likes', ME, false);
  assert.deepEqual(off.comment_likes, []);
});

test('setReactionInThread changes the comment, or the reply inside it, and nothing else', () => {
  const comment = {
    id: 'c1',
    comment_hearts: [],
    replies: [
      { id: 'r1', comment_hearts: [] },
      { id: 'r2', comment_hearts: [] },
    ],
  };

  const onComment = setReactionInThread(comment, 'c1', 'comment_hearts', ME, true);
  assert.equal(onComment.comment_hearts.length, 1);
  assert.equal(onComment.replies[0].comment_hearts.length, 0);

  const onReply = setReactionInThread(comment, 'r2', 'comment_hearts', ME, true);
  assert.equal(onReply.comment_hearts.length, 0);
  assert.equal(onReply.replies[0].comment_hearts.length, 0);
  assert.equal(onReply.replies[1].comment_hearts.length, 1);

  assert.equal(setReactionInThread(comment, 'not-here', 'comment_hearts', ME, true), comment);
  assert.equal(setReactionInThread({ id: 'c2' }, 'r1', 'comment_hearts', ME, true).replies, undefined);
});
