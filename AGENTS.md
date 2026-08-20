# Veritas

A production-ready full-stack React application deployed as a Cloudflare Worker, featuring React Router 6 SPA mode, TypeScript, Vitest, D1, R2, and Zod.

All privileged data access, authentication, workflow transitions, and private file operations belong in the Worker API. Do not add secrets or authorization logic to the browser.

## Tech Stack

- **Frontend**: React 18 + React Router 6 (spa) + TypeScript + Vite + TailwindCSS 3
- **Backend**: Cloudflare Worker with D1 and R2 bindings
- **Testing**: Vitest
- **UI**: Radix UI + TailwindCSS 3 + Lucide React icons

## Project Structure

```
client/                   # React SPA frontend
├── pages/                # Route components (Index.tsx = home)
├── components/ui/        # Pre-built UI component library
├── App.tsx                # App entry point and with SPA routing setup
└── global.css            # TailwindCSS 3 theming and global styles

worker/                   # Cloudflare Worker API
├── index.ts              # Router and API handlers
├── db.ts                 # D1 access and response mapping
└── crypto.ts             # Password and opaque-session primitives

migrations/               # Ordered D1 schema migrations

shared/                   # Types used by both client & server
└── api.ts                # Example of how to share api interfaces
```

## Key Features

## SPA Routing System

The routing system is powered by React Router 6:

- `client/pages/Index.tsx` represents the home page.
- Routes are defined in `client/App.tsx` using the `react-router-dom` import
- Route files are located in the `client/pages/` directory

For example, routes can be defined with:

```typescript
import { BrowserRouter, Routes, Route } from "react-router-dom";

<Routes>
  <Route path="/" element={<Index />} />
  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
  <Route path="*" element={<NotFound />} />
</Routes>;
```

### Styling System

- **Primary**: TailwindCSS 3 utility classes
- **Theme and design tokens**: Configure in `client/global.css` 
- **UI components**: Pre-built library in `client/components/ui/`
- **Utility**: `cn()` function combines `clsx` + `tailwind-merge` for conditional classes

```typescript
// cn utility usage
className={cn(
  "base-classes",
  { "conditional-class": condition },
  props.className  // User overrides
)}
```

### Cloudflare Worker Integration

- **Development**: Cloudflare Vite plugin serves frontend and Worker API
- **Storage**: D1 for relational data and R2 for private evidence
- **API endpoints**: Prefixed with `/api/`

#### Example API Routes
- `GET /api/health` - Service health
- `GET /api/workflow` - Role-scoped inspection workflow

### Shared Types
Import consistent types in both client and server:
```typescript
import { DemoResponse } from '@shared/api';
```

Path aliases:
- `@shared/*` - Shared folder
- `@/*` - Client folder

## Development Commands

```bash
npm run dev        # Start dev server (client + server)
npm run build      # Production build
npm run deploy     # Build and deploy the Worker
npm run cf:typegen # Regenerate binding types
npm run typecheck  # TypeScript validation
npm test          # Run Vitest tests
```

## Adding Features

### Add new colors to the theme

Open `client/global.css` and `tailwind.config.ts` and add new tailwind colors.

### New API Route
1. Add the request/response types to `shared/backend.ts` when the browser consumes them.

2. Add a Zod request schema to `worker/schemas.ts`:
```typescript
export const myRouteSchema = z.object({ message: z.string().min(1) });
```

3. Register the route in `worker/index.ts`, validate input, enforce role and resource access, and write an audit entry for mutations:
```typescript
if (request.method === "POST" && path === "/api/my-endpoint") {
  const actor = await authenticatedUser(request, env.DB);
  requireRole(actor, ["rea"]);
  const input = await readJson(request, myRouteSchema);
  return json({ message: input.message });
}
```

4. Use it in React with same-origin cookies:
```typescript
import { MyRouteResponse } from '@shared/api'; // Optional: for type safety

const response = await fetch('/api/my-endpoint');
const data: MyRouteResponse = await response.json();
```

### New Page Route
1. Create component in `client/pages/MyPage.tsx`
2. Add route in `client/App.tsx`:
```typescript
<Route path="/my-page" element={<MyPage />} />
```

## Production Deployment

- Run D1 migrations before the Worker deployment.
- Store `BOOTSTRAP_TOKEN` and `OPENAI_API_KEY` as Cloudflare secrets.
- Never commit `.env`, `.dev.vars`, passwords, API tokens, or resource credentials.

## Architecture Notes

- Single-worker deployment with the Cloudflare Vite plugin
- TypeScript throughout (client, server, shared)
- Full hot reload for rapid development
- Cloudflare Worker deployment configured through `wrangler.jsonc`
- Comprehensive UI component library included
- Type-safe API communication via shared interfaces
