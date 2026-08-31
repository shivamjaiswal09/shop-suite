# @shop/mobile

The Android till app. React Native via Expo SDK 54, sharing `@shop/core`,
`@shop/data` and `@shop/state` with the web app — the business logic lives in
those packages, and this app is the phone's view of it.

## Day-to-day development

You do **not** rebuild an APK to change the app. Metro serves the JavaScript
over wifi and the phone reloads on save. An APK build is only for releasing, or
for the rare native change (see [Native changes](#native-changes)).

### One-time setup

1. Install **Expo Go** from the Play Store on the phone.
2. Put the phone on the **same wifi** as this Mac.

That is the whole setup. Expo Go ships the native runtime this project needs,
so nothing has to be compiled or installed on the phone.

### Running

Two modes, and most UI work wants the first:

```bash
pnpm --filter @shop/mobile start:mock   # mock data, no API, no database
pnpm --filter @shop/mobile start        # live API on this machine
```

Then in Expo Go choose **Enter URL manually** and type the `exp://` address
Metro prints — `exp://<your-lan-ip>:8081`.

#### `start:mock` — for UI work

`lib/repositories.ts` falls back to `createMockRepositories()` whenever
`EXPO_PUBLIC_API_URL` is empty, and the mocks in `@shop/data` cover the full
repository surface. Nothing can reach the database, so no amount of tapping
around creates an invoice or moves stock. It also starts faster and does not
care whether the API is running.

The mocks deliberately cannot answer for authentication — password changes throw
rather than pretend — so anything touching sessions, permissions or throttling
needs the live API below.

#### `start` — for API work

Needs the API running in another terminal:

```bash
pnpm --filter @shop/api dev
```

`.env.development.local` points the app at this machine's LAN address. It has to
be the LAN address and not `localhost`, because on the phone `localhost` is the
phone. **That address changes when you join a different network**, so if the app
suddenly cannot reach the API, check `ipconfig getifaddr en0` against the file.

The file is `.env.development.local` rather than `.env` on purpose: Expo only
loads it when `NODE_ENV` is development, so a release build cannot accidentally
ship an APK pointing at somebody's laptop.

> The local API talks to the **production Supabase database**. Writes are real.
> Prefer signing in to one of the test companies over a live one, or use
> `start:mock` where the question is layout rather than data.

### What reloads, and what does not

| Change | What to do |
| --- | --- |
| `app/`, `components/`, `lib/`, any `@shop/*` package | Saves and reloads itself |
| `app.json`, `metro.config.js`, a new dependency | Restart with `--clear` |
| Native module, permission, `expo-build-properties`, SDK upgrade | Rebuild the APK |

`--clear` matters more than it looks: `EXPO_PUBLIC_*` values are inlined into
the transformed modules, so switching between mock and live without clearing
leaves the old value baked in. `start:mock` passes it already.

## Native changes

Expo Go can only run the native modules it ships with. Adding a library with its
own native code — a barcode scanner, a Bluetooth receipt printer — means Expo Go
can no longer run this project, and you switch to a **development build**: a
one-off APK carrying your native modules, installed once, after which the same
hot-reload loop continues.

```bash
npx eas-cli build -p android --profile development
```

## Building a release APK

### On EAS (no local toolchain)

```bash
npx eas-cli build -p android --profile preview
```

Produces the installable APK the `/download` page serves. Free-tier builds queue
behind everyone else's — half an hour is not unusual.

### Locally

Requires JDK 17 and the Android SDK, with `JAVA_HOME` and `ANDROID_HOME` set.
Unqueued, and quick after the first run warms the Gradle cache.

```bash
npx eas-cli build -p android --profile preview --local
```

This reads `credentials.json` for signing. **Do not** configure signing by
editing `android/app/build.gradle`: that directory is generated and gitignored,
and `expo prebuild --clean` rewrites it, so the setting would vanish and the
next release would come out debug-signed.

Signing is not a formality here. Android refuses to upgrade an installed app
with one signed by a different key — it fails outright and needs an uninstall
first, on every phone. The keystore on the Expo account signed the APK the shops
have, so local builds must use the same one. Download it once with
`npx eas-cli credentials -p android`, save it under `credentials/`, and record
its passwords in `credentials.json`. Both are gitignored, and both are secrets.

## Releasing

The APK is committed to `apps/web/public/shop-suite.apk` and served from a fixed
URL, so releasing is a file replacement and the address given to the shops never
changes. `apps/web/public/README.md` has the procedure and the size check that
catches a build whose native libraries did not link.

### Version numbers

`eas.json` sets `appVersionSource: "local"`, meaning the version comes from
`app.json` and nothing increments it automatically. **Bump `android.versionCode`
in `app.json` before every release build.** Android compares that integer to
decide whether an APK is an upgrade; ship two builds with the same value and
phones will refuse the second.

## Configuration

| Where | What it sets |
| --- | --- |
| `.env.development.local` | Dev-only API URL. Gitignored, never in a release build |
| `eas.json` → `build.*.env` | The API URL compiled into cloud builds |
| `app.json` | Package name, version, icons, native plugin config |
| `credentials.json` | Keystore path and passwords for local release builds. Gitignored |

`EXPO_PUBLIC_*` variables are inlined by Metro at build time. They are constants
in the bundle, not runtime configuration, and anyone with the APK can read them
— which is why only the public API URL lives there.
