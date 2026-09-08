# Veritas Field Officer Mobile

Native React Native/Expo Android application for Veritas field officers. It is a separate project and does not modify or embed the REA or Consultant Admin dashboards.

## Included

- Field-officer-only authentication and navigation
- Assigned-project overview, inspections and dedicated drafts
- Component-specific Grid Extension, Mini Grid and SAS forms
- Automatic on-device draft persistence
- GPS arrival verification with a 250 m project geofence
- Google Maps navigation
- Camera evidence stamped with project, time, GPS, inspector and device metadata
- Locked submitted/approved/verified reports
- Offline queue with sequential synchronization state
- Preview APK and production AAB build profiles

## Run

```bash
cd field-officer-mobile
npm install
npx expo start
```

The included demo field-officer account is:

- Email: `field.officer@demo.ng`
- Password: `Field2024!`

## Build Android

Connect the folder to an Expo project first, which replaces the placeholder `extra.eas.projectId` in `app.json`:

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

The current Veritas browser dashboard stores demo workflow records in browser local storage and does not expose a field-assignment synchronization API. This native app therefore ships with persistent on-device demo data and an API base URL ready for the production field endpoints. The app's `syncNow` transition must be connected to those endpoints when the shared backend is introduced.
