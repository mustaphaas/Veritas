# Cloudflare backend operations

## Resources

The Worker expects these bindings from `wrangler.jsonc`:

| Binding | Product | Purpose |
|---|---|---|
| `DB` | D1 | Users, sessions, projects, assignments, reports, and audit history |
| `EVIDENCE` | R2 | Private inspection photos and videos |
| `ASSETS` | Workers Static Assets | Built React SPA |

`BOOTSTRAP_TOKEN` and `OPENAI_API_KEY` are secrets. Set them with `wrangler
secret put`; never add real values to `wrangler.jsonc`, `.env`,
`.dev.vars.example`, or GitHub.

## First deployment

Authenticate Wrangler and verify the active account:

```bash
wrangler login
wrangler whoami
```

Wrangler can provision bindings declared without resource IDs. If the account
requires explicit provisioning, create them and copy the returned D1 ID into
the `DB` entry:

```bash
wrangler d1 create veritas
wrangler r2 bucket create veritas-evidence
```

Set secrets, apply migrations, build, and deploy:

```bash
wrangler secret put BOOTSTRAP_TOKEN
wrangler secret put OPENAI_API_KEY
npm run db:migrate:remote
npm run deploy
```

Create the first administrator through `POST /api/setup/bootstrap`. The route
stops working after the first user exists. The administrator should then create
consultant and field accounts from the application.

After bootstrap, rotate or remove `BOOTSTRAP_TOKEN`. If a real credential has
ever been committed, rotate it because deleting the file does not remove it
from Git history.

## API surface

| Method | Route | Roles |
|---|---|---|
| `POST` | `/api/setup/bootstrap` | One-time bootstrap token |
| `POST` | `/api/auth/login` | Public, rate limited |
| `POST` | `/api/auth/logout` | Signed-in user |
| `GET` | `/api/auth/session` | Signed-in user |
| `POST` | `/api/auth/change-password` | Signed-in user |
| `GET`, `POST` | `/api/users` | REA; consultant can create/list field users |
| `PATCH` | `/api/users/:id/status` | REA; consultant for field users |
| `GET`, `POST` | `/api/contractors` | REA, consultant |
| `GET` | `/api/projects` | All roles |
| `POST` | `/api/projects` | REA, consultant |
| `GET` | `/api/workflow` | All roles; field data is assignment-scoped |
| `POST` | `/api/assignments` | REA, consultant |
| `POST` | `/api/assignments/:id/route` | Assigned field user |
| `POST` | `/api/assignments/:id/arrival` | Assigned field user |
| `PUT` | `/api/assignments/:id/report` | Assigned field user |
| `POST` | `/api/assignments/:id/evidence` | Assigned field user |
| `POST` | `/api/assignments/:id/submit` | Assigned field user |
| `POST` | `/api/assignments/:id/consultant-review` | Consultant |
| `POST` | `/api/assignments/:id/rea-review` | REA |
| `GET` | `/api/evidence/:id` | Authorized workflow user |
| `POST` | `/api/rea-assistant` | REA |

## Workflow invariants

The server, rather than the browser, enforces:

- field users can only access their own assignments;
- GPS arrival must be inside the assignment geofence;
- arrival must be recent before a report is saved or submitted;
- reports require uploaded R2 evidence and both signatures before submission;
- consultant review only accepts `Submitted` reports;
- REA verification only accepts consultant-`Approved` reports;
- rejected or submitted reports are locked against field edits;
- every important transition appends an immutable audit event.

## GitHub deployment

The validation workflow runs on pushes and pull requests. A production workflow
can run `npm run db:migrate:remote` followed by `npm run deploy` after the
repository has these encrypted GitHub secrets:

- `CLOUDFLARE_API_TOKEN` with Workers, D1, and R2 deployment permissions;
- `CLOUDFLARE_ACCOUNT_ID` for the target account.

Keep migration and deploy jobs serialized so a newer deployment cannot race an
older database migration.
