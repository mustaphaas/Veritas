# Firebase backend operations

## Resource map

| Concern                 | Firebase resource      | Access model                                            |
| ----------------------- | ---------------------- | ------------------------------------------------------- |
| Web app                 | Hosting                | Public SPA; `/api/**` rewrites to `api`                 |
| Accounts                | Authentication         | Email/password; Admin-only provisioning                 |
| API                     | 2nd-gen HTTPS Function | Same-origin cookie, App Check, role and resource checks |
| Application data        | Cloud Firestore        | Admin SDK only; client rules deny all                   |
| Evidence and signatures | Cloud Storage          | Admin SDK only; client rules deny all                   |
| Server secrets          | Secret Manager         | Bound only to the Function                              |

The Firestore collections are `users`, `system`, `contractors`, `projects`,
`assignments`, `reports`, `evidence`, and `auditEvents`. Storage objects are
kept below `evidence/{assignmentId}/` and `signatures/{assignmentId}/`.

## Create the Firebase project

1. Create a Firebase project on a billing plan that supports 2nd-generation
   Functions.
2. In Authentication, enable the Email/Password sign-in provider. Do not enable
   public self-registration in the application; Veritas accounts are created
   by authorized administrators through the API.
3. Create Firestore in the region closest to the users. Create the default
   Storage bucket in a compatible region.
4. Register a Web app and copy its API key, project ID, and app ID into the
   build environment using the names in `.env.example`.
5. Copy `.firebaserc.example` to `.firebaserc` and replace the project ID.

Firebase Web API keys identify a project and are expected in frontend code.
Restrict the key to the Identity Toolkit API and approved web referrers in
Google Cloud. Never put Admin credentials or Secret Manager values in Vite
variables.

## Configure secrets and parameters

Generate a bootstrap token with at least 32 random characters and set both
Function secrets:

```bash
npx firebase-tools functions:secrets:set BOOTSTRAP_TOKEN
npx firebase-tools functions:secrets:set OPENAI_API_KEY
```

Non-secret parameters have safe defaults:

| Parameter           | Default        | Purpose                                    |
| ------------------- | -------------- | ------------------------------------------ |
| `ENFORCE_APP_CHECK` | `false`        | Reject missing/invalid App Check tokens    |
| `SESSION_TTL_HOURS` | `8`            | Session-cookie lifetime, capped at 14 days |
| `MAX_UPLOAD_BYTES`  | `10485760`     | Evidence limit, capped at 25 MB            |
| `OPENAI_MODEL`      | `gpt-4.1-mini` | REA assistant model                        |

Firebase prompts for parameter values on deployment and can persist them in a
project-specific environment file. Do not commit environment files.

## App Check

Register the Hosting domains with App Check and a reCAPTCHA Enterprise
provider. Set `VITE_FIREBASE_APP_CHECK_SITE_KEY` during the SPA build and set
`ENFORCE_APP_CHECK=true` for the deployed Function after verifying tokens in a
staging environment. The browser sends tokens in `X-Firebase-AppCheck`.

Health, one-time bootstrap, and authenticated binary evidence/signature GETs
are exempt from App Check because ordinary image/video element requests cannot
attach custom headers. Authentication and resource authorization still protect
the binary routes.

## Local emulators

```bash
npm ci
npm --prefix functions install
cp .env.example .env.local
cp functions/.secret.local.example functions/.secret.local
npm run emulators
```

The SPA is served at `http://127.0.0.1:5000`. Emulator cookies intentionally
omit `Secure`; production cookies always include it. Use the bootstrap request
from the root README to create the first REA profile.

## Deploy

Authenticate the Firebase CLI and select the intended project, then run:

```bash
npm run deploy
```

This builds both packages and deploys Hosting, the Function, Firestore rules
and indexes, and Storage rules. After the first successful deployment:

1. Call `/api/setup/bootstrap` once through the Hosting origin.
2. Confirm the REA user can sign in and create the remaining managed accounts.
3. Rotate `BOOTSTRAP_TOKEN`; the `system/bootstrap` record also prevents reuse.
4. Enable enforced App Check after staging verification.

## Session and authorization model

The browser submits email/password to Firebase Authentication and receives an
ID token in memory. It posts that token to `/api/auth/session-login`; the Admin
SDK verifies recent authentication and creates the `__session` cookie. Firebase
Hosting forwards that reserved cookie name to the Function. The Function
verifies revocation and reloads the active Firestore profile on every request.

`rea`, `consultant`, and `field` roles are stored in the profile and mirrored to
custom claims. Firestore is authoritative so status and role changes apply
without waiting for a client token refresh. Field users can access only their
own assignments and files. Consultant and REA workflow transitions are checked
server-side.

## Backups, monitoring, and recovery

- Enable Firestore scheduled exports to a separate protected bucket and apply
  a retention policy suitable for REA records.
- Enable Cloud Storage object versioning or retention as required by the
  evidence policy.
- Alert on Function 5xx rates, latency, rejected App Check requests, Auth
  anomalies, and Storage growth.
- Treat `auditEvents` as append-only; administrative changes and workflow
  mutations write an event.
- To suspend a compromised account, use the Veritas user-status API. It disables
  the Firebase Auth user and revokes refresh tokens.
- Restore into a non-production project first and verify collection/file
  consistency before a production recovery.

## Security checklist

- Keep `firestore.rules` and `storage.rules` default-deny.
- Keep the API on the same Hosting origin; do not enable broad CORS.
- Restrict Firebase/Google Cloud IAM to least privilege and require MFA for
  administrators.
- Rotate bootstrap and OpenAI secrets, and never commit `.env`, `.firebaserc`
  with sensitive environment choices, service-account keys, or credentials.
- Review package and Functions runtime updates regularly.
- Test role boundaries, file authorization, geofencing, and workflow transitions
  before every production release.
