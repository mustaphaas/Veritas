# Veritas

Veritas is the Rural Electrification Agency project-monitoring workspace for
REA administrators, consultant administrators, and field officers. The React
SPA and API run as one Cloudflare Worker.

## Architecture

- Cloudflare Workers serves the SPA and all `/api/*` routes.
- Cloudflare D1 stores users, opaque sessions, projects, assignments, reports,
  workflow transitions, and audit events.
- Cloudflare R2 stores private photo and video evidence. Files are streamed
  only through authenticated API routes.
- Passwords are salted with PBKDF2-SHA256. Browsers receive an HttpOnly,
  SameSite session cookie; raw session tokens are never stored in D1.

## Local development

```bash
npm ci
npm run cf:typegen
npm run db:migrate:local
npm run dev
```

Create `.dev.vars` from `.env.example` and replace the bootstrap token with a
long random value. Then create the first REA administrator exactly once:

```bash
curl -X POST http://localhost:5173/api/setup/bootstrap \
  -H 'Content-Type: application/json' \
  -H 'X-Bootstrap-Token: YOUR_LOCAL_BOOTSTRAP_TOKEN' \
  --data '{"name":"REA Administrator","email":"admin@example.gov.ng","password":"Replace-With-A-Strong-Password!2026"}'
```

## Checks

```bash
npm run typecheck
npm test
npm run build
npm run cf:check
```

See [docs/cloudflare-backend.md](docs/cloudflare-backend.md) for provisioning,
deployment, API, security, and operational guidance.
