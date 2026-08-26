# TODO - FigoAI

## Step 1: Auth persistence
- [x] Update `client/src/login.jsx` so successful login writes `figoai_auth` to `localStorage`.
- [x] Ensure `client/src/Router.jsx` reads and respects that same key.

## Step 2: Real backend authentication
- [x] Add `users` table (MySQL via `mysql2`), password hashing (`bcrypt`), and JWT sessions (`jsonwebtoken`).
- [x] `POST /api/auth/register` (username + email + password), `POST /api/auth/login` (by username or email), `GET /api/auth/me`.
- [x] `POST /api/auth/change-password` (wired into Settings).
- [x] Protect `POST /api/chat` behind a valid session; scope conversation memory per user.
- [x] Update `Login.jsx` with a real sign-in/sign-up flow against the API, including email.
- [x] Verified live against XAMPP's MariaDB on 127.0.0.1:3306, database `figoai`: register, duplicate-username rejection, login by username, login by email, and change-password (wrong + correct current password) all confirmed working end-to-end.

## Step 3: AI connection flow
- [x] Chat composer disabled until server health check succeeds.
- [x] Distinct "Connecting…" / "Online" / "Offline" states, with automatic retry polling.

## Step 4: UI consistency
- [x] Remove inline `<style>` blocks from `App.jsx` and `login.jsx`; moved to `App.css` / `Login.css`.
- [x] Removed dead, conflicting rules from `index.css` left over from an earlier UI.

## Step 5: Shared icons
- [x] Create `client/src/icons.jsx` with a unified `Icons` export.
- [x] Replace duplicate icon blocks in `Login.jsx` and `App.jsx` with imports.

## Step 6: Test
- [x] Ran backend `node server.js` against XAMPP's MariaDB and frontend `npm run dev` — both boot clean, production build passes.
- [x] Verified register/login/change-password via curl against the live database.
- [x] Switched the AI provider from DeepSeek (account had $0 balance) to Groq's free tier (`llama-3.3-70b-versatile`). Server, api.js, and Settings model picker all updated.
- [ ] Get a free Groq API key at https://console.groq.com/keys and set `GROQ_API_KEY` in `.env` — the server refuses to start without it.
- [ ] Manually verify in-browser: register a new account, log out, log back in, refresh mid-session, and confirm chat history doesn't leak between accounts on the same browser.
