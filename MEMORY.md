# Project memory

Durable lessons recorded by coding agents working in this project. The engine reads this file at the start of every session and shows it to the next agent — append anything the next session should know.


## 2026-11-09 21:29:38

## Groups feature — app side implemented (backend still missing)

**The backend is NOT in this repo.** The app talks to `https://appmychurch.com/api/v1` (hardcoded `API_URL` in ~12 files). No backend source is present in any known project folder. So the plan's "Groups 1 · Schema & API" and most of "Groups 2 · Push Wiring" cannot be written from here — they need the server repo.

**Built here (Groups 3 + the flag):**
- `lib/groups.ts` — typed client for the agreed contract (`/groups`, `/groups/:id/members|invites|requests|posts`). Calls 404 until the backend lands.
- `hooks/usePaginatedPosts.ts` — the pagination state machine extracted from Home. Home and the group feed now share it. Three behaviours are load-bearing: `canLoadMoreOnEndReachedRef` (FlatList fires onEndReached on mount — without it the feed prefetches to the end), dedupe-by-id (offset shift duplicates a row), and the 5-minute AppState background refresh.
- Screens: `app/(tabs)/groups.tsx`, `app/group/create.tsx`, `app/group/[id]/{index,members,requests,settings}.tsx`.
- Route shape: `app/group/[id]/index.tsx` (folder + index) rather than `app/group/[id].tsx`, to avoid a file/directory collision with the nested screens.

**Rollout flag:** everything is gated on `appData.groups_enabled` (added as optional to `AppData`). When false the Groups tab is `href: null`, the Notifications tab keeps its old slot, and the Navbar bell is hidden — so the release is inert for church 23468 etc. The server must actually start sending the field.

**Pre-existing bug fixed:** `app/create-post.tsx` had `as const` on a ternary (`bucket: (cond ? 'a' : 'b') as const`), which is TS1355 and broke `tsc --noEmit` for the whole project. Replaced with the union it intended.

**Verification done:** `npx tsc --noEmit` clean; `npx expo export --platform ios` bundles (4.39 MB hbc). NOT verified: any live API behaviour — no endpoint exists yet. Do not claim end-to-end works until the backend ships.

## 2026-11-09 21:33:48

## Supabase IS the App My Church database (connected 2026-11-09)

Project: **ddxltcnayzszuxnyabqj** ("App My Church", us-west-2, PG 17), org `thbgiczxhafvdaslkcsd` (McCarty Ventures). 32 tables matching the app exactly (`apps`, `church_users`, `posts`, `post_media`, `likes`, `comments`, …).

**But there are ZERO Edge Functions.** The HTTP layer at `https://appmychurch.com/api/v1` is a separate service that is NOT in this repo and NOT in Supabase. So Supabase gives the DATABASE only — the endpoint work in "Groups 1 · Schema & API" (cards 2-7) and "Groups 2 · Push Wiring" still has no codebase here. Writing them as Supabase Edge Functions would be a new architecture decision, not a refactor.

**Schema conventions (match these in any new migration):** ids are `text` with no default (server supplies); `app_id` = the church (Native Notify's "app" means 23936, this app's means a church); `timestamp without time zone`; snake_case. `apps` already carries per-church `native_notify_app_id` + `native_notify_app_token`, so push credentials ARE server-side already — the problem is only the client's `FALLBACK_NN_APP_TOKEN`.

**Applied:** `supabase/migrations/20261109000000_groups.sql` — groups, group_members, group_invites, group_join_requests + `posts.group_id` + `idx_posts_group` (partial, `where group_id is not null`). Verified after: 4 tables at 0 rows, posts still 1476, `posts_with_group` = 0, so every existing post stayed church-wide. No data touched.

**Critical, unresolved:** RLS is DISABLED on all 32 public tables (Supabase advisory `rls_disabled`, level ERROR), including `users` and `church_users` which hold password columns. Do NOT run the remediation `ALTER TABLE … ENABLE ROW LEVEL SECURITY` blindly — with no policies it blocks everything, and if the API server connects with the anon key rather than service_role it would take the whole app down. This needs a deliberate decision, not a lint fix.

## 2026-11-10 14:21:45

## Groups device-test church (created 2026 — delete when done)

A dedicated throwaway church exists so the Groups push test never touches a live church.

```
app id          736377ff-419e-42ac-8713-5eac8ee8bb44   ("Groups Test")
church_user id  70ea7758-55c5-4cb6-8bea-b2f0e478a099
email           tj+groups@nativenotify.com
password        GroupsTest123            (stored as sha256 hex)
indie id        c20645a4-307a-48f3-8bfc-8cdc42449ff4
Native Notify   23936  (classic)
groups_enabled  true   <- the ONLY app with the flag on
```

- `POST /api/v1/login` verified live: 200 + JWT for these credentials.
- Password hashing is `SHA256(password).toString()` from crypto-js (lowercase hex) — `encode(sha256('X'::bytea),'hex')` in Postgres produces the same value.
- `apps.userId` is NOT NULL and references `public.users.id`, so a church needs three rows: users -> apps -> church_users.
- AppMyChurch.com (`6a41a4c6…`) had the flag for the first attempt; it is now OFF and its test group `c6599e00…` is deleted. Native Notify topic `grp-c6599e00…` may still exist server-side.
- Cleanup: delete church_users, then apps, then users for that app id; drop any groups rows.

## 2026-11-10 14:48:56

## Native Notify classic topic subscribe — the field is `followerSubID`

Verified live against app 23936 (2026-11-10).

```
POST https://app.nativenotify.com/api/post/follower
{ "appId": 23936, "appToken": "...", "followerSubID": "<indie id>", "masterSubID": "grp-<groupId>" }
→ 201 "Follower Indie ID posted!"
```

**Trap:** sending `subID` instead of `followerSubID` is silently ignored and answers
`201 "Follower sub id already exists"`. The topic does NOT gain the subscriber — count stays
at its previous value while the response reads like success. Always confirm with
`GET /api/topic/group/<topic>/<appId>/<appToken>` and compare `topic_group_sub_count` to the
active member count. Never trust the subscribe response.

`lib/groups/native-notify.ts` in `app-my-church` already uses the correct field name, so this
only bites hand-rolled probes.

Topic created by `POST /api/post/follow/master` with `isTopicGroup: true` + `masterSubID`
automatically includes the creator as the first subscriber.
