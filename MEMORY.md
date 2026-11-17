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

## 2026-11-10 15:37:31

## EAS builds — four traps, in the order they bit (learned the hard way)

**1. The global `eas` on this machine is 12.3.0 — SDK 49 era. Do not use it.**
It bundles `@expo/prebuild-config@6.7.3` + `expo-modules-autolinking@1.11.2`, and
line 36 of its `importExpoModulesAutolinking.js` throws
"The 'expo-modules-autolinking' package has been found, but it seems to be
incompatible with '@expo/prebuild-config'" against this SDK 54 project.

The trap: `eas build --platform all` **queues the Android build, then dies on the
iOS half** — so you get a real Android build plus a confusing error, and no iOS
build at all. The message appears *before* upload, right after "Loaded env
configuration", which is the tell that it is a local CLI failure, not a build.

Workaround that works: `npx --yes eas-cli@latest build --platform ios ...`
Permanent fix: `npm install -g eas-cli@latest`.

**2. `babel-preset-expo` was never declared.** `babel.config.js` references it
but it survived only as a hoisted transitive copy. `npm dedupe` (needed for the
next trap) removed it, and every Metro bundle failed with
"Cannot find module 'babel-preset-expo'". Now declared at `~54.0.10`.

**3. Duplicate native module.** `expo-font` was installed twice (14.0.12 under
`node_modules/expo/node_modules/`, 14.0.11 at root). Native builds allow one
copy. `npm dedupe` fixes it.

**4. `expo-video@55.0.10` (SDK 55) sat inside an SDK 54 project.** Fixed to
`~3.0.16` via `npx expo install --fix` — which then fails at the very end with
"Cannot automatically write to dynamic config at app.config.js"; the version
fix still applies, only the cosmetic plugin step is skipped.

**Verification that works locally (no device, no queue):**
`npx expo export --platform android` / `--platform ios` reproduces the exact
"Bundle JavaScript" failure EAS reports. Do this before spending a 20-minute
build. `npx expo prebuild --platform android --no-install` reproduces the native
side (remember to `rm -rf android` and `git checkout -- .` afterwards).

**`eas build:view --json` is unsupported**; `eas build:list --json` works and is
the reliable way to poll status by id.

Builds at commit `f2853470`: Android `3706c899`, iOS `33d380d2`.

## 2026-11-10 19:15:52

## Two repos, two jobs — do not confuse them

- **`app-my-church`** = Next.js server at appmychurch.com. It hosts the **website** AND the **`/api/v1` REST API that the Expo apps call**. Editing it is not "editing the iframe"; it is editing the backend.
- **`app-my-church-global`** (this repo) and **`amc-central-community-church`** = the actual Expo apps. They talk to that API directly. `API_URL` is hardcoded to `https://appmychurch.com/api/v1` in ~12 files.
- EAS project `app-my-church-global`, bundle `com.amc.appmychurchglobal`, ascAppId `6736629497`.

## Signup bug — root cause and where the fix actually lives

The Expo signup screen is **`app/signup.tsx`** (this repo). Its guard was already correct: `if (!name || !email || !password)` and `if (birthDate && !isAtLeast13(birthDate))`. It sends `birth_date: birthDate ? formatDateForApi(birthDate) : ''` — an **empty string** when the date is skipped.

The server did `if (!name || !email || !password || !appId || !birth_date)` — `''` is falsy → 400 "Missing required fields", after OTP verify. That was the bug.

**Fixed server-side** (commit `629d6b1`, on `main`): dropped `birth_date` from the check, deleted the 13+ gate, kept a guarded parse. **The Expo client needed no change.** `components/appuser/Signup.tsx` (web form) was also patched — harmless, but not the path the mobile user hits.

## Deploy gap — the live blocker (as of 2026-11-10)

`main` is at `629d6b1` on GitHub, but **Vercel has not rebuilt**:
- `GET /api/v1/groups` → **404 with an HTML body** (Next 404 page, route absent)
- `GET /api/v1/app/:id` → `groups_enabled` **absent**
- homepage response header `age` ≈ 1,815,555s (~3 weeks)

Consequences while undeployed: the app sees no flag, so **no Groups tab and no bell** (correct behaviour against old server). And the deployed `/posts` predates `group_id`, so a group post **leaks into the church home feed** — verified live with the "Device test" post. Check the Vercel project for a failed build on `629d6b1`; I cannot see it from here.

## 2026-11-10 22:03:55

## Age gate reversed: 13+ is mandatory again (2026-11-10)

The earlier decision to REMOVE the 13+ gate is reversed. Apple now requires age assurance for apps with social/UGC features ("Declared Age Range API called before enabling social media features"), so the owner asked for age to be required and under-13 signups refused.

**Shipped:**
- `app-my-church` `a2dc850`: `/api/v1/signup` rejects a missing birth date (400) and a real date under 13 (403). Check is elapsed-ms based (`13 * 365.25 * 86400000`), not calendar-year subtraction, so a leap day cannot move the boundary. `isAtLeast13` helper is local to that route.
- `app-my-church-global` `416501a`: `app/signup.tsx` requires the date, labels it `Birth Date *`, and re-checks at the OTP step (which also narrows `Date | null` for the payload).
- `app-my-church-global` `c93ff73`: `lib/ageRange.ts` + `com.apple.developer.declared-age-range` entitlement.

**NOT yet enforced:** `app/api/registerChurchUser` (web signup) still writes `birth_date` straight through with no gate, and `components/appuser/Signup.tsx` still treats the field as optional. Anyone signing up on the website can still be under 13.

**expo-age-range on SDK 54 — the open risk.** The package is versioned with Expo SDKs; `58.0.2` is what npm installs today and there is NO SDK 54 line (first release postdates it). Installed anyway because its podspec pins no Expo version, its iOS code is plain `ExpoModulesCore` + `AsyncFunction`, and it guards the framework with `#available(iOS 26.0, *)` returning an empty response below that. Prebuild resolves it cleanly. **The native compile has never run** — CocoaPods is not installed on this machine (`pod: command not found`), so `pod install`/xcodebuild could not be attempted locally. Only an EAS build can settle it.

**Entitlement signing risk:** adding `ios.entitlements` forces EAS to regenerate the provisioning profile. If the App ID lacks the Declared Age Range capability, the build fails at signing rather than at compile. Expect that as the first failure mode, not a Swift error.

**Local toolchain:** Xcode 27.2 (27B52) is installed; CocoaPods is not. `npx expo prebuild --platform ios --no-install` works in a scratch copy with `node_modules` symlinked.

## 2026-11-10 22:42:46

## expo-age-range on SDK 54 — three walls, two solved, one not

Apple's App Store requirement (age assurance) forces `expo-age-range` (Declared Age Range). It is versioned **58.x for SDK 58**; this app is on SDK 54. Forcing it in failed on both platforms in build 1.3.0, each for a different reason.

**Android wall 1 — schema.** `expo-age-range/expo-module.config.json` has `android.publication` with no `version`. SDK 54's expo-module gradle plugin treats that field as REQUIRED and throws while evaluating settings.gradle, before compiling anything. EAS reports only "Gradle build failed with unknown error". Real text:

```
Field 'version' is required for type with serial name
'expo.modules.plugin.configuration.Publication',
but it was missing at path: $.modules[1].projects[0].publication
```

**Android wall 2 — AAR metadata.** After adding `version`, the next failure is that the AAR is built against API 37 while SDK 54 compiles against 35:

```
requires libraries and applications that depend on it to compile against
version 37 or later of the Android APIs
```

**Resolution (committed `a560e02`).** `scripts/patch-expo-age-range.js` runs from `postinstall` and rewrites the config to `platforms: ["apple"]`, deleting the android block. Verified: local `./gradlew :app:assembleRelease` → BUILD SUCCESSFUL, 488 tasks. Declared Age Range is an App Store requirement, Play Age Signals is irrelevant to Apple review, and `lib/ageRange.ts` returns 'unknown' on Android before importing — so nothing is lost. **The postinstall is essential**: EAS does not upload node_modules, it reinstalls on the builder, and without the script the patch vanishes and the build fails again.

**iOS wall — the provisioning profile, not the code.** Adding `ios.entitlements` in app.json makes the build fail:

```
Provisioning profile "*[expo] com.amc.appmychurchglobal AppStore 2024-10-07T16:32:32.424Z"
doesn't include the com.apple.developer.declared-age-range entitlement
```

The profile dates from **2024-10-07** — still valid, so EAS reuses it forever. Enabling the capability on the App ID does NOT regenerate it. `eas credentials` is interactive-only (no non-interactive removal): run it, Production → Provisioning Profile → Remove, then rebuild.

**Unverified:** the Swift has never compiled. No CocoaPods here (system Ruby 2.6, no Homebrew, brew install needs sudo). The API surface checks out — `AsyncFunction`, `Field`, `Module`, `ModuleDefinition`, `Record` all exist in SDK 54's expo-modules-core, and the podspec pins no Expo version — but that is inspection, not compilation.

**Also:** `eas.json` build images were pinned to `macos-sequoia-15.6-xcode-26.2` because `import DeclaredAgeRange` needs the iOS 26 SDK. Xcode 16 images cannot compile it.

**EAS log access:** `~/.expo/state.json` sessionSecret is rejected by api.expo.dev (`AUTHENTICATION_ERROR`); `build:view --json` fails too. There is no programmatic way to read a failed build's Gradle log from here — reproduce locally instead (Android SDK is at `~/Library/Android/sdk`, Xcode 27.2 is installed).

## 2026-11-17 19:20:00

## 1.4.0 — "Church App", plans, the locked screen

- **Home Screen name is "Church App"** (`expo.name`). Slug, scheme, bundle id, Android package, owner and EAS project id are unchanged. The store listings are being renamed to "Church App by App My Church" by hand in App Store Connect and the Play Console.
- **The app must never mention plans, prices, upgrading, unlocking or paying, and must link to nothing that sells.** The app stores do not allow an app to steer people to a purchase outside the store. The one outside link is the button on the church search screen, "Create a Church Group at AppMyChurch.com", which opens the FREE sign-up page `https://appmychurch.com/Signup` in the phone's browser. A church is created and paid for on the website only.
- The server (repo `app-my-church`, see its `CLAUDE.md` → "Plans") decides everything. The app reads four optional fields on the church object (`GET /app/:appId` at the top level, `GET /user` inside `app`): `plan`, `features` ({groups, videos, events}), `locked`, `lock_message`. A missing `features` value means the tab shows. `plan` is never shown to anyone.
- `context/AuthContext.tsx` sends **`X-AMC-Client: <platform>/<version>` on every request to our API** (an axios request interceptor scoped to `API_URL`). `GET /user` depends on it: for a locked church the server answers 401 without the header (older versions sign out) and 200 with `app.locked = true` with it. Never remove the header.
- `app/locked.tsx` shows the server's `lock_message`, "Try again" (`refreshChurch()`) and "Log out". `(tabs)/_layout.tsx` redirects there when signed in and locked. The church is re-read when the app returns to the foreground (at most every 30 s) and at once when any API call is refused with `403 { code: "church_locked" }` (a response interceptor).
- Not verified on a device: the locked screen, tab hiding and the foreground refresh were checked by `tsc`, both `expo export` bundles and against the live API's answers, not by running the app.
- The CC Church app (`amc-central-community-church`) has none of this. Its church is on Pro, so nothing changes for it.
