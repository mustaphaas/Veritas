# Veritas Field Officer Android

Android Studio-compatible shell for the Veritas Field Officer workspace.

## What it does

- Opens the production Field Officer route directly.
- Keeps Veritas authentication/session storage inside the app WebView.
- Supports GPS/geolocation prompts used for site-arrival verification.
- Supports camera, video/audio permission requests and evidence file upload.
- Opens external map, telephone, mail and non-Veritas web links in the appropriate Android app.
- Restricts in-app Veritas navigation to `/login` and `/field-officer/*`.
- Shows a branded offline screen when the production site cannot be reached.

## Android Studio

Open the `android-field-officer` folder as a project in Android Studio. The project targets Android 15 / API 35, uses Java 17 and has a minimum Android version of Android 8.0 / API 26.

The GitHub APK workflow generates a Gradle wrapper before building. If Android Studio asks for a Gradle distribution on first open, select Gradle 8.11.1 or let Android Studio use a compatible installed distribution.

## Build

From the project directory with Android SDK + Gradle installed:

```bash
gradle wrapper --gradle-version 8.11.1
./gradlew :app:assembleDebug
```

The APK is created at:

`app/build/outputs/apk/debug/app-debug.apk`

## Production URL

The native shell currently points to:

`https://veritas.mustaphaaliyu236.workers.dev/field-officer`

Change `APP_URL` and `APP_HOST` in `MainActivity.java` if the production domain changes.

## Signing

The automated artifact is a debug-signed APK for testing and field trials. A Play Store / production APK or AAB should be signed with an organization-controlled release keystore and versioned through a secure CI secret.
