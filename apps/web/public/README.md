# apps/web/public

Files here are copied verbatim into `dist/` by Vite and served from the site
root. `public/shop-suite.apk` becomes `https://shop-suite.vercel.app/shop-suite.apk`.

## Shipping a new Android build

The `/download` page links to `/shop-suite.apk` at a fixed path, so releasing is
a file replacement — the URL you gave your shops never changes.

```
cd apps/mobile
npx expo prebuild --clean -p android
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
cp app/build/outputs/apk/release/app-release.apk ../../web/public/shop-suite.apk
```

Then commit and push; Vercel redeploys and the new build is live.

**Check the size before you commit it.** A working React Native release APK for
one architecture is roughly 20–25 MB. If it is under 5 MB the native libraries
did not make it in, and the app will install and then crash on launch — that has
happened here once already, producing a 958 KB artifact that looked fine to
Gradle. Anything over 100 MB will not deploy at all; that is a hard Vercel limit
on individual files.

`vercel.json` sets `must-revalidate` on this path, so phones pick up a
replacement immediately rather than serving a cached copy of the old build.

## Why the APK is public

`/download` is deliberately reachable without a session: a new cashier cannot
sign in until the app is on their phone, so gating it behind the login wall
would be circular. The binary is an unprivileged client — it authenticates
against the API before it shows anything, and the only configuration baked into
it is the public API URL.
