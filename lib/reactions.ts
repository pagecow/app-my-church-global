/**
 * Like, love and pray.
 *
 * A reaction shows on screen the moment it is tapped, and the server is told in
 * the background. This file holds the rules for that. Nothing in it knows about
 * React or the network, so it is tested on its own (tests/reactions.test.mjs,
 * run with `npm test`).
 *
 * Keep this file identical in both phone apps (app-my-church-global and
 * amc-central-community-church).
 */

/** What is known about one reaction by this member: their like on a post, their pray on a comment. */
export interface ReactionState {
  /** A request is on its way to the server. */
  busy: boolean;
  /** What the member last asked for. This is what the screen shows. */
  want: boolean;
  /** What the server has. */
  have: boolean;
}

/** Every reaction touched on one post, by a name such as "post:like" or "comment:<id>:pray". */
export type ReactionBook = Record<string, ReactionState>;

export interface ReactionServer {
  /** Turns the reaction on. Must be safe to call when it is already on. */
  add: () => Promise<unknown>;
  /** Turns the reaction off. Must be safe to call when it is already off. */
  remove: () => Promise<unknown>;
}

/**
 * Flips one reaction.
 *
 * `shown` is what the screen shows now. `show` is called at once with the new
 * state, before anything is sent.
 *
 * Only one request runs at a time for a reaction. Taps made while one is running
 * only change what is wanted, and when it finishes the server is brought to the
 * last thing asked for. So tapping quickly several times can never count one
 * person twice, and the last tap wins.
 *
 * If the server does not take it, `show` is called again with what the server
 * really has.
 */
export function toggleReaction(
  book: ReactionBook,
  key: string,
  shown: boolean,
  server: ReactionServer,
  show: (on: boolean) => void
): void {
  const state = book[key] || (book[key] = { busy: false, want: shown, have: shown });
  // With nothing on its way to the server, what is on screen is what the server has.
  if (!state.busy) {
    state.want = shown;
    state.have = shown;
  }
  state.want = !state.want;
  show(state.want);
  if (state.busy) return;

  state.busy = true;
  void (async () => {
    try {
      while (state.have !== state.want) {
        const target = state.want;
        if (target) await server.add();
        else await server.remove();
        state.have = target;
      }
    } catch {
      const showing = state.want;
      state.want = state.have;
      if (showing !== state.have) show(state.have);
    } finally {
      state.busy = false;
    }
  })();
}

/**
 * Puts one member's reaction on a comment or a reply, or takes it off.
 *
 * The API sends each reaction as a list with one entry per member (`field` is
 * "comment_likes", "comment_hearts" or "comment_praying"). The member's own
 * entry is always removed first, so one person only ever counts once.
 */
export function setMemberReaction<T extends Record<string, any>>(
  item: T,
  field: string,
  memberId: string,
  on: boolean
): T {
  const all: any[] = Array.isArray(item[field]) ? item[field] : [];
  const others = all.filter((entry) => entry?.church_userId !== memberId);
  return { ...item, [field]: on ? [...others, { church_userId: memberId }] : others };
}

/**
 * The same, for a comment that is either the one meant or holds the reply that
 * is meant. Any other comment is returned untouched.
 */
export function setReactionInThread<T extends Record<string, any>>(
  comment: T,
  targetId: string,
  field: string,
  memberId: string,
  on: boolean
): T {
  if (comment.id === targetId) return setMemberReaction(comment, field, memberId, on);
  const replies: any[] | undefined = Array.isArray(comment.replies) ? comment.replies : undefined;
  if (replies && replies.some((reply) => reply?.id === targetId)) {
    return {
      ...comment,
      replies: replies.map((reply) =>
        reply?.id === targetId ? setMemberReaction(reply, field, memberId, on) : reply
      ),
    };
  }
  return comment;
}
