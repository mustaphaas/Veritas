# Veritas Field Officer Mobile

Native React Native/Expo Android application for Veritas field officers. It is a separate project and does not modify or embed the REA or Consultant Admin dashboards.

## Included

- Immersive Android presentation with the official REA identity
- Field-officer-only authentication and navigation
- Assigned-project overview, inspections and dedicated drafts
- Grid Extension, Mini Grid and SAS forms aligned field-for-field with the Veritas dashboard
- Automatic on-device draft persistence after GPS verification
- GPS-gated forms with a 250 m project geofence and accuracy metadata
- Google Maps navigation
- Persistent photo and video evidence stamped with project, time, GPS, inspector, device and network metadata
- SHA-256 integrity hashes for evidence, submitted forms and signatories
- Android ID, device/app version, session and auditable workflow/sync metadata (never IMEI)
- Standard month/year selectors and naira-only project costs
- Locked submitted/approved/verified reports
- Offline queue with sequential synchronization state
- Preview APK and production AAB build profiles

## Run

```bash
cd field-officer-mobile
npm install
npx expo start
```

The included demo field-officer accounts are:

- Mustapha Aliyu: phone `08093822087`, password `siddiqa12`
- Amina Yusuf: email `field.officer@demo.ng`, password `Field2024!`

Mustapha's account includes `REA-FCT-MG-DEMO-001` at Durumi, Abuja (`9.0232043, 7.4518017`) for on-site GPS testing.

## Build Android

The folder is linked to the `@mustaphaas/veritas-field-officer` Expo project. To reconnect it under another account:

```bash
npx eas-cli@latest login
npx eas-cli@latest init
```

Create a directly installable test APK:

```bash
npx eas-cli@latest build --platform android --profile preview
```

Create a Google Play AAB:

```bash
npx eas-cli@latest build --platform android --profile production
```

## Backend boundary

The current Veritas browser dashboard stores demo workflow records in browser local storage and does not expose a field-assignment synchronization API. This native app therefore ships with persistent on-device demo data and an API base URL ready for the production field endpoints. The app's `syncNow` transition must be connected to those endpoints when the shared backend is introduced. Public IP, server record ID and server-received time are reserved fields that must come from that trusted API response; the app does not fabricate them.
