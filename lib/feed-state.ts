/**
 * Is there nothing for a paginated feed to load?
 *
 * `usePaginatedPosts` starts out "loading" and only a finished fetch ends that. A caller that
 * is ready (`enabled`) but has no feed to read, such as a group the person has not joined, would
 * therefore show its spinner forever. This is the one rule that says so: the caller is ready,
 * and it has no endpoint or no sign-in to read it with. While the caller is not ready, the feed
 * is still "loading" as before, so a screen does not flash an empty list while it works out
 * what to read.
 *
 * A plain module (no React Native imports) so `npm test` can run it.
 */
export function feedHasNothingToLoad({
  enabled,
  endpoint,
  token,
}: {
  enabled: boolean;
  endpoint: string | null | undefined;
  token: string | null | undefined;
}): boolean {
  return enabled && (!endpoint || !token);
}
