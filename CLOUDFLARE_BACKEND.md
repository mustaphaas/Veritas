# Veritas Cloudflare backend

The production backend runs in Cloudflare Pages Functions. It uses D1 for users, sessions, projects, assignments, reports, evidence metadata, and audit events; R2 stores the evidence files themselves.

## Cloudflare resources

Create one D1 database and one private R2 bucket, then bind them to the Pages project with these exact names:

| Binding | Resource |
| --- | --- |
| `VERITAS_DB` | D1 database |
| `EVIDENCE_BUCKET` | Private R2 bucket |

Add these encrypted production secrets in **Workers & Pages → Veritas → Settings → Variables and Secrets**:

- `BOOTSTRAP_ADMIN_EMAIL`: first REA administrator email
- `BOOTSTRAP_ADMIN_PASSWORD`: a unique password of at least 12 characters
- `OPENAI_API_KEY`: optional; required only for the REA assistant
- `OPENAI_MODEL`: optional; defaults to `gpt-5-mini`
- `SESSION_TTL_SECONDS`: optional; defaults to 12 hours and is capped at 7 days

Never commit `.env`, `.dev.vars`, passwords, API keys, D1 exports, or R2 credentials.

## First deployment

1. Install dependencies with `npm ci`.
2. Generate binding/runtime types with `npx wrangler@latest types`.
3. Apply the migration to production with `npx wrangler@latest d1 migrations apply VERITAS_DB --remote`.
4. Build the existing frontend with `npm run build:client`.
5. Deploy `dist/spa` through the connected Cloudflare Pages project.
6. Sign in using `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`. The first successful matching login creates the initial REA account; afterwards those secrets are not used to create more accounts.
7. Rotate or remove `BOOTSTRAP_ADMIN_PASSWORD` after the first login.

If bindings are configured in `wrangler.jsonc`, add the actual D1 `database_id` and R2 `bucket_name`. If they are configured in the Cloudflare dashboard, redeploy after creating or changing them.

## Local development

Copy `.dev.vars.example` to `.dev.vars`, use test-only values, then run:

```sh
npm run build:client
npx wrangler@latest d1 migrations apply VERITAS_DB --local
npx wrangler@latest pages dev dist/spa
```

## API routes

| Route | Purpose |
| --- | --- |
| `GET /api/health` | D1-backed health check |
| `POST /api/auth/login` | Sign in and create an HttpOnly session |
| `GET/DELETE /api/auth/session` | Read or end the current session |
| `GET/POST /api/users` | REA user administration |
| `PATCH /api/users/:id/status` | Enable or disable a user |
| `GET/POST /api/projects` | List or create projects |
| `GET/POST /api/assignments` | Scoped assignment list or REA creation |
| `POST /api/assignments/:id/actions/:action` | Enforce workflow transitions and review |
| `POST /api/assignments/:id/evidence` | Stream authorized evidence to R2 |
| `GET /api/evidence/:id` | Authorized private evidence download |
| `GET /api/dashboard` | Role-scoped operational counts |
| `POST /api/rea-assistant` | D1-grounded AI summary for REA/consultants |

The accepted workflow is `Assigned → En route → Arrived → Draft → Submitted → Approved → Verified`, with explicit rejection and re-inspection paths.
