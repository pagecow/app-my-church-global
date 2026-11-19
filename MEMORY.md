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
password        (removed from this file on 2026-11-19: this repo is public. Ask T.J.)
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
- **The app must never mention plans, prices, upgrading, unlocking or paying, and must link to nothing that sells.** The app stores do not allow an app to steer people to a purchase outside the store. The one outside link is the button on the church search screen, "Create a Church App" with an external-link icon (one line; it was "Create a Church Group at AppMyChurch.com" in the unreleased 1.4.0 build, which T.J. found ugly), which opens the FREE sign-up page `https://appmychurch.com/Signup` in the phone's browser. A church is created and paid for on the website only.
- The server (repo `app-my-church`, see its `CLAUDE.md` → "Plans") decides everything. The app reads four optional fields on the church object (`GET /app/:appId` at the top level, `GET /user` inside `app`): `plan`, `features` ({groups, videos, events}), `locked`, `lock_message`. A missing `features` value means the tab shows. `plan` is never shown to anyone.
- `context/AuthContext.tsx` sends **`X-AMC-Client: <platform>/<version>` on every request to our API** (an axios request interceptor scoped to `API_URL`). `GET /user` depends on it: for a locked church the server answers 401 without the header (older versions sign out) and 200 with `app.locked = true` with it. Never remove the header.
- `app/locked.tsx` shows the server's `lock_message`, "Try again" (`refreshChurch()`) and "Log out". `(tabs)/_layout.tsx` redirects there when signed in and locked. The church is re-read when the app returns to the foreground (at most every 30 s) and at once when any API call is refused with `403 { code: "church_locked" }` (a response interceptor).
- Not verified on a device: the locked screen, tab hiding and the foreground refresh were checked by `tsc`, both `expo export` bundles and against the live API's answers, not by running the app.
- The CC Church app (`amc-central-community-church`) has none of this. Its church is on Pro, so nothing changes for it.

## 2026-11-19 09:15:00

## 1.5.0 — what shipped, and how it was built and submitted from this Mac (no EAS Build, no EAS Submit)

**This file is in a PUBLIC GitHub repo (`pagecow/app-my-church-global`).** Never write a password, key, token, Key ID, Issuer ID or service-account address in it. Those are kept outside git: see "Where the private details are" below.

### Where 1.5.0 stands (2026-11-19)
- Built from commit `13b1566` on `main`. `app.json`: version 1.5.0, iOS build "1.5.0", Android versionCode 26.
- **Google Play** (`com.amc.appmychurchglobal`): 1.5.0 (26) put on the **production** track on 2026-11-19 (production had 25). Google reviews it before it goes live; that status cannot be read from the terminal.
- **Apple** ("App My Church", Apple id 6736629497, bundle `com.amc.appmychurchglobal`): 1.5.0 sent for App Review on 2026-11-19 at 14:58 UTC, set to release by itself when approved. 1.4.2 had been waiting for review since 2026-11-18; with T.J.'s OK it was withdrawn and the same version record was turned into 1.5.0. **1.4.2 was never released on iPhone** (the live iPhone version was 1.3.3). 1.5.0 contains everything 1.4.0 to 1.4.2 had.
- "What's New" used (T.J. approved the wording): `- fresh new look` / `- events can repeat weekly or monthly` / `- bug fixes`.
- Not checked by an AI on a signed-in phone: reactions on comments, uploads, video, push, and Android behind the login. T.J. tests these himself.

### What 1.5.0 changed
- **Expo SDK 58** (expo 58.0.26, React Native 0.88.1, expo-router 58, React 19.3, TypeScript 6). It needs Xcode 26.4 or newer and supports iOS 16.4 or newer. This Mac has Xcode 27.2, which cannot build the old SDK 54 project, so the upgrade is what made local builds possible. `.env` sets `EXPO_PUBLIC_USE_RN_FETCH=1` (keeps React Native's own fetch for photo and video uploads); `.npmrc` has `legacy-peer-deps=true`.
- **New look**, matching the website: every colour, text size and shape comes from `lib/theme.ts`, and screens are built from the parts in `components/ui.tsx`. A colour written directly in a screen is a mistake.
- **Events** has an Upcoming list and a Calendar, and an event can repeat weekly, every two weeks, monthly or yearly. The date rules are in `lib/events.ts`. Event times are stored as typed, with no time zone (read them from the UTC fields). No RSVP on a repeating event.
- **Like, love and pray fill in the moment they are tapped**, on posts, comments and replies. The rule is in `lib/reactions.ts`: show at once, tell the server in the background, one request at a time per reaction, the last tap wins, go back if the server refuses. Before this, comments waited 1 to 2 seconds and a second tap counted the member twice.
- **The praying-hands icon is three ready-coloured pictures** (`assets/pray-*.png`). Never recolour an image with `tintColor`: on iPhone the icon vanished when it changed and did not draw at all in the comments sheet.
- **"Didn't get your code?"** card under the code box on sign-up and forgot-password (`CodeHelp` in `components/ui.tsx`): it shows the typed address again in bold, has a "Fix My Email" button that goes back with everything still filled in, and says to look in spam. Reason: people mistype their email (`gmail.coom`), never get the code, and phone him thinking the app is broken. Back on the code step now returns to the form too.
- Home has a "Share App" button in words, and the thumbs-up is the plain Material one (`thumb-up`).

### Checks before a build
- `npx tsc --noEmit` and `npm test` must pass. `npm test` runs the Events date rules in three time zones and the reaction rules (`tests/events.test.mjs`, `tests/reactions.test.mjs`).
- **These files are the same in both phone apps and must stay the same:** `lib/theme.ts`, `components/ui.tsx`, `lib/events.ts`, `lib/reactions.ts`, `components/PostCard.tsx`, `components/EventFormSheet.tsx`, `components/EventDetailSheet.tsx`, and the two test files. Change one app, copy to the other, check with `diff -q`.
- To try a change on the iPhone simulator (Expo Go can no longer open the project since SDK 58): from the app folder, `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo run:ios --configuration Release --no-bundler --device <simulator udid>`. It makes a git-ignored `ios/` folder and installs a real build. Reinstalling keeps the sign-in.
- Nobody but T.J. signs in on the simulator: an AI must not type a password. Screens before the login (church search, login, sign-up, the code screen) can be checked without one. To reach the sign-up code screen without emailing a real person, use the mail service's test address `delivered@resend.dev` on the Example Church, stop at the code screen, and delete the `church_user_otp` row afterwards.

### Build the store files on this Mac
- Bump `version`, `ios.buildNumber` and `android.versionCode` in `app.json` first (`eas.json` has `appVersionSource: local`). The Android versionCode must be higher than the one on Play production.
- Commit and push, then from this app's folder:
  ```
  export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 EAS_BUILD_NO_EXPO_GO_WARNING=true
  eas build --platform ios --profile production --local --non-interactive --output <folder>/church-app-<version>.ipa
  GOOGLE_SERVICES_JSON=$PWD/google-services.json eas build --platform android --profile production --local --non-interactive --output <folder>/church-app-<version>.aab
  ```
- Each takes about 5 to 15 minutes. An iPhone build and an Android build can run side by side. Run them detached (`nohup ... &`) and wait on a status file; `tmp/store-submit/build-all.sh` in the projects folder builds all four files for both apps this way.
- **`LANG` and `LC_ALL` must be UTF-8** or CocoaPods crashes ("Unicode Normalization not appropriate for ASCII-8BIT") and fastlane complains.
- `eas` here is the globally installed CLI (27.10.0 on 2026-11-19). `--local` builds on this Mac but still reads the signing certificates stored in the Expo account, so `eas whoami` must show a signed-in account. No cloud build minutes are used.
- The Android build of this app fails without `GOOGLE_SERVICES_JSON` (the file is git-ignored here).
- Before uploading, check the file really holds the new code: unzip it and search `main.jsbundle` (ipa) or `base/assets/index.android.bundle` (aab) for a string you added.

### Submit to Google Play (production)
Run from a folder that has no Fastfile, with the UTF-8 settings above:
```
fastlane supply --aab <file>.aab --track production --package_name com.amc.appmychurchglobal --json_key <this repo>/google-account.json --skip_upload_metadata true --skip_upload_images true --skip_upload_screenshots true --skip_upload_changelogs true
```
- Check afterwards (read-only): `fastlane run google_play_track_version_codes package_name:com.amc.appmychurchglobal track:production json_key:<path>` and `google_play_track_release_names`.
- The key file belongs to a Google service account that T.J. invited in Play Console on 2026-11-19 with release permission for both apps. "The caller does not have permission" means that invite is missing for the app.
- On 2026-11-19 build 26 first went to the internal track and was then promoted (`--track internal --track_promote_to production --version_code 26 --skip_upload_aab true`). That detour is not wanted: upload straight to production.

### Submit to Apple (upload, then send for review)
1. Upload: `xcrun altool --upload-app -f <file>.ipa -t ios --api-key <KEY ID> --api-issuer <ISSUER ID>`. It prints "UPLOAD SUCCEEDED" and a delivery id; `xcrun altool --build-status --delivery-id <id> ...` shows when Apple has finished processing (a few minutes).
2. Send for review through the App Store Connect API with the same key (scripts in `tmp/store-submit/` in the projects folder): `POST /v1/appStoreVersions` (platform IOS, versionString, releaseType AFTER_APPROVAL, with the app and the build) → `PATCH /v1/appStoreVersionLocalizations/{id}` to set `whatsNew` → `POST /v1/reviewSubmissions` → `POST /v1/reviewSubmissionItems` (the submission plus the version) → `PATCH /v1/reviewSubmissions/{id}` with `submitted: true`. The version then reads WAITING_FOR_REVIEW.
3. If a version is already waiting for review, Apple takes no second one. With T.J.'s OK: `PATCH /v1/reviewSubmissions/{id}` with `canceled: true`, wait about 10 seconds until the version reads DEVELOPER_REJECTED, then rename it (`PATCH /v1/appStoreVersions/{id}`, `versionString`), give it the new build (`PATCH /v1/appStoreVersions/{id}/relationships/build`) and submit again.
- The key is an **App Store Connect API team key** named "Mac upload" (App Manager), made by T.J. on 2026-11-19. Its file is `~/.appstoreconnect/private_keys/AuthKey_<KEY ID>.p8`, where `altool` finds it by itself.
- `~/Documents/APN-Key-Native-Notify/AuthKey_*.p8` is a different thing: the push-notification key Native Notify uses. App Store Connect answers 401 to it. Leave that file where it is.
- The builds declare `usesNonExemptEncryption=false`, so Apple asks no export question.

### Where the private details are
- The Apple Key ID and Issuer ID, the Google service account's address, and the full log of this release: `/Users/thetjmccarty/Documents/app-my-church-projects/MEMORY.md` (the projects folder is not a git repo) and `tmp/store-submit/` beside it.
- Keys themselves: `~/.appstoreconnect/private_keys/` (Apple) and `google-account.json` in this repo (Google; git-ignored here). Never print their contents.

### T.J.'s rules for a release
- **Submit straight to production.** No internal-testing or TestFlight-only step: "i always just want submission to be to production ... i test locally and you do, i'll just test again in production."
- **Ask T.J. first** before writing the App Store "What's New" text (it is public) and before pulling anything he already submitted. Sending the build itself needs no question.
- His "What's New" style is one to three short dash lines, for example `- Groups design upgrades`.
- Commit and push before building, so what is in the stores is always in git.
- Buttons members use are labelled with words, not only icons, and a screen where an ordinary mistake can leave someone stuck says in words what to check (many members are older; they phone T.J. when stuck).
- The app never mentions plans, prices, upgrading or paying, and links to nothing that sells.

## 2026-11-19 10:30:00

## 1.5.1 — the notifications bell, tapped push notifications, the Home header (replaced 1.5.0 in both stores)

T.J. found in TestFlight that the bell did nothing, so 1.5.0 was replaced the same day before it was released.

### Where 1.5.1 stands (2026-11-19)
- Built from commit `0dd05a4`. `app.json`: version 1.5.1, iOS build "1.5.1", Android versionCode 27.
- **Google Play** (`com.amc.appmychurchglobal`): 1.5.1 (27) uploaded straight to the **production** track (it had 26, which was still in Google's review).
- **Apple** (Apple id 6736629497): 1.5.0 was withdrawn from review and the same version record was turned into 1.5.1 with the new build. State: WAITING_FOR_REVIEW, releases by itself when approved. **1.5.0 was never released on iPhone.** "What's New" is unchanged from 1.5.0 (T.J. approved that wording for this release).
- How the resubmission was done: `node asc-replace-in-review.mjs 6736629497 1.5.1` in `tmp/store-submit/` of the projects folder (after `xcrun altool --upload-app` and a few minutes of processing). For Google, uploading a higher versionCode to production replaces the release that is in review.

### What was wrong, and the rule to keep
- **A hidden tab cannot be opened any more.** Notifications was a tab with `href: null` (no button in the tab bar), opened by the bell with `router.push('/notifications')`. That worked on Expo SDK 54. On SDK 58 the router treats `href: null` as "hidden" and redirects to the first tab: a spinner, then Home again. **A screen that must be reachable but is not a tab belongs outside `app/(tabs)/`**, as a screen of the root stack (`app/notifications.tsx`, listed in `app/_layout.tsx`), like Profile. `href: null` is still right for a tab the church does not have (Groups, Videos, Events on some plans): those must not be reachable.
- **Tapping a push notification opened nothing.** The server's group push says "Tap to open the group", but no code listened for the tap. `components/PushTapHandler.tsx` (mounted in `app/_layout.tsx`, inside the sign-in provider) now opens the target, both while the app runs and when the tap starts it. It forgets the tap once handled, so a normal launch lands on Home.
- **One rule for where a notification leads:** `lib/notifications.ts` (`notificationTarget`), used by the rows of the Notifications screen and by the push tap, with tests in `tests/notifications.test.mjs`. "Added to a group" (`group_added`, older `group_invite`) opens `/group/[id]`; `group_request` opens the group's requests; anything with a `postId` opens `/notification-thread`. On iPhone the data of a push is the APNs payload's `body` object (`content.data`).
- **Home header** (`components/Navbar.tsx`): the church's icon shows only when the church uploaded a logo, never an initials box. The church name is sized by measuring it once at full size out of sight (`ChurchName`), not with `adjustsFontSizeToFit`: that shrank the letters inside a full-height line and left the name 3 points below the middle of the row.
- The same three files as before stay identical in both apps, plus `lib/notifications.ts`, `components/PushTapHandler.tsx`, `app/notifications.tsx` and `tests/notifications.test.mjs`.

### How it was checked
- On the iPhone simulator, signed in by T.J.: the bell opens Notifications; the row "… added you to <group>" opens the group; Back returns to Notifications, then Home; the header was measured on a screenshot (capital letters level with the bell).
- **A pretend push on the simulator:** write a file like `{"aps":{"alert":{"title":"…","body":"…"}},"body":{"type":"group_added","groupId":"<a real group id>"}}` and run `xcrun simctl push <udid> <bundle id> <file>`. Nothing is sent by the server. The banner only shows if the simulator has notification permission, and the app never asks for it on a simulator (Native Notify registers real devices only). To get the prompt once, add `Notifications.requestPermissionsAsync()` to a throwaway build, tap Allow, and remove the line again before committing. Tested this way: tap with the app open, tap with the app fully closed, then a normal launch.
- Not checked: the push tap on Android, and a real push from the server on a real phone.
- `npx expo run:ios` reuses the git-ignored `ios/` folder, so the simulator copy keeps the version number it was first made with. Delete `ios/` to refresh it. Store builds are not affected.

### From T.J., same day
- "Always make sure you're git commit and push after making updates." Commit and push every change without being asked.
