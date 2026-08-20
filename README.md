# Veritas

Veritas is the Rural Electrification Agency project-monitoring workspace for
REA administrators, consultant administrators, and field officers. It runs as
a React SPA on Firebase Hosting with a private Firebase Functions API.

## Architecture

- Firebase Authentication provides email/password accounts.
- Firebase Hosting serves the SPA and rewrites `/api/**` to the `api` Function.
- Cloud Functions for Firebase owns authentication, authorization, workflow
  transitions, validation, audit logging, and all privileged data access.
- Cloud Firestore stores profiles, projects, assignments, reports, and audit
  events. Client Security Rules deny direct reads and writes.
- Cloud Storage stores private evidence and signatures. Client Security Rules
  deny direct access; authenticated Function routes stream authorized files.
- The browser exchanges its Firebase ID token for an HttpOnly, Secure,
  SameSite=Strict `__session` cookie. The ID token is not persisted.

## Local development

Install both packages and configure the public web values:

```bash
npm ci
npm --prefix functions install
cp .env.example .env.local
cp functions/.secret.local.example functions/.secret.local
```

Set the local values, build, and start the Firebase Emulator Suite:

```bash
npm run emulators
```

Then create the first REA administrator exactly once through the Hosting
emulator:

```bash
curl -X POST http://127.0.0.1:5000/api/setup/bootstrap \
  -H 'Content-Type: application/json' \
  -H 'X-Bootstrap-Token: YOUR_LOCAL_BOOTSTRAP_TOKEN' \
  --data '{"name":"REA Administrator","email":"admin@example.gov.ng","password":"Replace-With-A-Strong-Password!2026"}'
```

## Checks

```bash
npm run typecheck
npm test
npm run test:functions
npm run build
```

See [docs/firebase-backend.md](docs/firebase-backend.md) for project setup,
deployment, security, recovery, and operational guidance.
