# Roomify Frontend

Next.js app for **Roomify**: upload one photo of your room, review the furniture we detect, choose
what to keep, replace or remove, set a style and budget, and get a redesign plan, a visual concept of
your own room, shopping suggestions with cheaper alternatives and beginner DIY guides — all saved to
your account. *Redesign more, buy less.*

> **Live demo: <https://roomify-rooms.vercel.app>** (release v1.0.1, deployed on Vercel). Account,
> project, upload, detection, review and preference flows run for real. The OpenAI account had no
> usable credit at submission, so the plan, visual concept, suggestions and DIY guides come from the
> backend's demo library and are labelled "Demo" in the app; they have **not been run against the live
> OpenAI API**. The first request after a few idle minutes waits 10–20 s for the API to start. Photos
> over 4 MB are shrunk in the browser before upload (Vercel's 4.5 MB request limit).

Services: [roomify_backend](https://github.com/Bootcamp2Roomify/roomify_backend) (Spring Boot API) ·
[roomify_cv](https://github.com/Bootcamp2Roomify/roomify_cv) (furniture detection).

## Pages

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/register`, `/login` | Accounts |
| `/dashboard` | Saved rooms; resume any project |
| `/new-room` | Create project (name, room type, rental status) and upload a photo |
| `/projects/{id}/upload` | Add a photo to an existing project |
| `/projects/{id}/analyze` | Detection review: Keep / Replace / Remove / Unsure, rename, remove, add items |
| `/rooms/{id}` | Style, budget, colors, purpose, Rental-Friendly Mode, requirements |
| `/projects/{id}/design` | Redesign plan, budget, visual concept, suggestions, DIY guides |

The browser never talks to Spring directly and never sees the access token: route handlers under
`src/app/api/` keep it in an httpOnly cookie and forward it as a Bearer token. `src/middleware.ts`
sends signed-out visitors to `/login`.

## Stack

Next.js 15.5 (App Router) · React 19 · TypeScript 5.6 · Tailwind CSS 3.4 · GSAP · Vitest + Testing
Library · Playwright. Node **26.4.0** (`.nvmrc`); dependencies are exact versions in `package-lock.json`.

## Run locally

```bash
npm ci
cp .env.example .env.local     # ROOMIFY_API_URL=http://localhost:8080
npm run dev                    # http://localhost:3000
```

Use `http://localhost:3000` rather than `127.0.0.1`: Next normalizes `127.0.0.1` to `localhost` in
redirects, and the session cookie is per host.

| Variable | Purpose |
|---|---|
| `ROOMIFY_API_URL` | Spring backend base URL, read only by server-side route handlers (never exposed to the browser) |

## Test

```bash
npm run typecheck && npm run lint && npm test                 # unit (Vitest)
npx playwright install chromium
npx playwright test                                           # browser, API stubbed
npx playwright test -c playwright.integration.config.ts       # browser, fake Spring API via the Next bridge
npx playwright test -c playwright.live.config.ts              # full stack must be running (see below)
```

The live suite drives the real Postgres + CV + backend + `next start` stack. Set `LIVE_AI=1` when the
backend has an OpenAI key to also assert plan, concept, suggestions and DIY; `LIVE_CV_DOWN=1` with the
CV service stopped to check the manual-entry fallback. CI runs unit tests, the build and both stubbed
browser suites.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) · [LICENSE](LICENSE)
