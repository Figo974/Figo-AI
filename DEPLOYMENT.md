# FigoAI deployment

The project is configured to run on a public Node.js host such as Render. The server binds to `0.0.0.0`, serves the built React application, and exposes `/api/health` for the host's health check.

## Run locally

1. Copy `.env.example` to `.env` and fill in the API, database, and Google OAuth values.
2. Install dependencies: `npm install` and `npm --prefix client install`.
3. Build the frontend: `npm run build`.
4. Start the server: `npm start`.
5. Open `http://localhost:3000`.

For development with Vite, use `npm run dev`. The Vite server binds to `0.0.0.0:5173` for LAN/device testing and proxies `/api` to the server on port 3000.

## Deploy publicly with Render

1. Push the project to a private GitHub repository. Do not commit `.env` or API keys.
2. In Render, create a new **Blueprint** and connect that repository. Render reads `render.yaml`.
3. In the Render service's Environment settings, enter `OPENROUTER_API_KEY`, `GROQ_VOICE_API_KEY`, database connection values, and Google OAuth values if Google login is enabled.
4. After the first deployment, copy the public `https://...onrender.com` service URL into both `CLIENT_URL` and `SERVER_URL`, then redeploy.
5. In Google OAuth settings, add the deployed domain to the authorized JavaScript origins and use the callback URL expected by `oauth.js` as an authorized redirect URI.
6. Check `https://YOUR-SERVICE.onrender.com/api/health` for the public health response.

The project files alone cannot create the public deployment: a hosting account, connected repository, database, and secrets are required. The Render free service may sleep after inactivity; the first request after sleeping can take longer.

## ZIP exports

When the Workspace is open, ask FigoAI to ZIP a folder or use **Create ZIP**. The project is packaged in the browser, uploaded to the running server, and appears as a public **Download ZIP** link in the Workspace header. The server removes the archive and expires its unguessable download URL after two hours. Links are lost earlier if the server restarts, is redeployed, or a free host spins the service down, because the temporary archive store is on the server's temporary filesystem. Render free web services can spin down after 15 minutes without traffic and lose local files when they spin down; use an always-on host plus durable file storage if ZIP downloads must remain available for the full two hours under all restart/idle conditions. `.env` files (except `.env.example`), private keys, and common dependency/cache directories are excluded from the archive.

## Language and speech notes

Kinyarwanda and Spanish are available as text reply-language options. The browser's speech engine is used for Spanish and Kinyarwanda playback when the device has a suitable voice installed. Browser voice availability varies by operating system and browser. Groq's documented TTS model choices currently cover English and Arabic, so the project does not claim Groq-native Kinyarwanda or Spanish speech output.

Kinyarwanda voice input is best-effort: native browser speech recognition may not offer it, and the Groq Whisper fallback may be less accurate for low-resource languages. Text input remains the reliable option. Spanish voice input continues to use the browser recognizer or Groq transcription depending on browser support.
