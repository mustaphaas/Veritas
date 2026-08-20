# Veritas

A production-ready full-stack React application deployed on Firebase Hosting
and Cloud Functions for Firebase, featuring React Router 6 SPA mode,
TypeScript, Vitest, Firestore, Cloud Storage, Firebase Authentication, App
Check, and Zod.

All privileged data access, authorization, workflow transitions, and private
file operations belong in the Functions API. Do not add secrets, authorization
decisions, or direct Firestore/Storage access to the browser.

## Tech Stack

- **Frontend**: React 18 + React Router 6 SPA + TypeScript + Vite + TailwindCSS 3
- **Backend**: 2nd-generation HTTPS Function using Express and Firebase Admin
- **Identity**: Firebase Authentication email/password + Admin session cookies
- **Data**: Cloud Firestore
- **Files**: Cloud Storage for Firebase
- **Abuse protection**: Firebase App Check with reCAPTCHA Enterprise
- **Testing**: Vitest
- **UI**: Radix UI + TailwindCSS 3 + Lucide React icons

## Project Structure

```text
client/                   # React SPA frontend
functions/src/            # Firebase Functions API
shared/                   # Browser-shared TypeScript types
firestore.rules           # Default-deny client data rules
storage.rules             # Default-deny client file rules
firebase.json             # Hosting, Functions, rules, and emulator config
```

## Security Boundaries

- Browser login uses Firebase Auth REST, then immediately exchanges the ID
  token at `/api/auth/session-login`; never persist ID or refresh tokens.
- Protected routes call `requireUser`, then enforce role and resource scope.
- Mutations validate with Zod and write an audit event.
- Evidence and signatures remain private and are served by authenticated API
  endpoints only.
- Firestore and Storage client rules remain default-deny unless a reviewed
  feature explicitly requires a narrower client capability.
- Secrets belong in Firebase Secret Manager, never `.env` files committed to
  Git.

## API Development

1. Add browser-facing request/response types to `shared/backend.ts`.
2. Add a Zod schema to `functions/src/schemas.ts`.
3. Register the route in `functions/src/index.ts`.
4. Authenticate, enforce role/resource access, validate input, and audit every
   mutation.
5. Call it from React with `apiRequest`, which sends same-origin cookies and an
   App Check token when configured.

## Commands

```bash
npm run dev             # Frontend-only Vite development
npm run emulators       # Build and run Firebase emulators
npm run build           # Build SPA and Functions
npm run deploy          # Build and deploy Firebase resources
npm run typecheck       # Check SPA/shared and Functions
npm test                # Run SPA/shared tests
npm run test:functions  # Run Functions tests
```

## Production Deployment

- Create/select the Firebase project with `.firebaserc` (never commit a real
  project selection if environments should remain portable).
- Enable email/password Authentication, Firestore, Storage, Hosting, App Check,
  and Cloud Functions.
- Set `BOOTSTRAP_TOKEN` and `OPENAI_API_KEY` with Firebase Functions secrets.
- Configure public `VITE_FIREBASE_*` values at build time.
- Deploy rules, indexes, functions, and hosting together with `npm run deploy`.
- Bootstrap the first REA user once, then rotate the bootstrap secret.
