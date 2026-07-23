# FitNova — AI Fitness App

A full-stack fitness app: enter your stats and goal, get calculated BMI/BMR/calorie/water
targets, an AI-generated weekly workout + meal plan (via the Claude API), progress
tracking, reminders, and a downloadable report (PDF or plain text).

```
fitnova-app/
├── backend/          Express server — serves the frontend, calls Claude, saves your data
│   ├── server.js
│   ├── package.json
│   ├── .env.example
│   └── data/          (auto-created — one JSON file per user)
└── frontend/         Static HTML/CSS/JS — no build step required
    ├── index.html
    ├── style.css
    └── app.js
```

## 1. Prerequisites

- [Node.js](https://nodejs.org) 18 or newer
- An Anthropic API key — get one at https://console.anthropic.com

## 2. Install

```bash
cd backend
npm install
```

## 3. Configure your API key

```bash
cp .env.example .env
```

Open `backend/.env` and paste in your real key:

```
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
```

**Never commit `.env`** — it's already in `.gitignore`.

## 4. Run it

```bash
npm start
```

You should see:

```
FitNova running at http://localhost:3001
```

Open **http://localhost:3001** in your browser. The Express server serves the frontend
directly, so there's nothing else to start — one command, one URL.

## How it works

- **Frontend** (`frontend/`) is plain HTML/CSS/JS — no framework, no build step. It
  calculates BMI/BMR/TDEE/calorie target/water intake locally, then calls your backend
  for the AI plan and to save/load your data.
- **Backend** (`backend/server.js`):
  - `POST /api/plan` — takes your profile + calculated vitals, calls the Claude API
    server-side (your API key never reaches the browser), and returns a structured
    workout + meal plan as JSON.
  - `GET /api/data/:userId` / `POST /api/data/:userId` — simple per-user persistence.
    Each browser gets a random ID stored in `localStorage`; their data is saved as a
    JSON file under `backend/data/`. Good for local use and demos; swap for a real
    database (Postgres, Mongo, etc.) before putting this in front of real users.
  - Also serves the static frontend, so the whole app runs from one process/port.

## Moving this to production

This setup is intentionally simple so it runs locally with one command. Before deploying
for real users, you'll want to layer in:

- **A real database** (Postgres/Mongo) instead of per-user JSON files — swap out the
  two `/api/data` handlers in `server.js`; the rest of the app doesn't need to change.
- **Authentication** (e.g. email/password with sessions, or a provider like Auth0/Clerk)
  so accounts aren't just a random ID in `localStorage`.
- **HTTPS + a real host** (Render, Railway, Fly.io, a VPS, etc.) — set `ANTHROPIC_API_KEY`
  as an environment variable on the host, same as locally.
- **Rate limiting / usage caps** on `/api/plan` so one user can't rack up unbounded API
  costs — e.g. `express-rate-limit`, or a daily generation cap per user.
- **Real push notifications** for reminders — the current implementation only fires
  while the tab is open; a production version would need a scheduler (cron/queue) and
  either email, SMS, or web push with a service worker.
- **Input validation** on the backend (e.g. with `zod`) — the frontend validates form
  input, but the API endpoints currently trust the request body as-is.

## Troubleshooting

- **"ANTHROPIC_API_KEY is not set" warning on startup** — you haven't created `.env`,
  or it's missing the key. See step 3.
- **"Couldn't generate a plan"** — check the terminal running `npm start` for the real
  error; it's almost always an invalid/missing API key or an out-of-credit account.
- **Port already in use** — change `PORT` in `.env` and restart.
