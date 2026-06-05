# TODO - FigoAI login + UI/icons

## Step 1: Auth persistence
- [x] Update `client/src/Login.jsx` so successful login writes `figoai_auth` to `localStorage`.

- [x] Ensure `client/src/Router.jsx` reads and respects that same key.

## Step 2: AI connection flow
- [ ] Update `client/src/App.jsx` UI states so chat composer is disabled until server health check succeeds.
- [ ] Improve “Connecting/Offline” feedback.

## Step 3: UI consistency
- [ ] Remove or reduce inline `<style>` usage in `client/src/App.jsx`.
- [ ] Prefer `client/src/index.css` for shared styling.

## Step 4: Shared icons
- [ ] Create `client/src/icons.jsx` with a unified `Icons` export.
- [ ] Replace duplicate icon blocks in `client/src/Login.jsx` and `client/src/App.jsx` with imports.

## Step 5: Test
- [ ] Run backend `node server.js`
- [ ] Run frontend `cd client && npm run dev`
- [ ] Verify: login persists after refresh; AI only accessible after login; icons/UI consistent.

