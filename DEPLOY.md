# Deploying IMMapp

One host, one `docker compose` stack, two containers (`frontend`, `document-ai-backend`). Both start together and both come back automatically after a reboot -- no manual "start the backend, then start the frontend" step.

## One-time server setup

1. Install Docker + the Compose plugin (e.g. on Ubuntu: `curl -fsSL https://get.docker.com | sh`, which also enables and starts the `docker` systemd service).
2. Make sure the Docker daemon starts on boot -- this is what actually makes "fully start on server start" true, not `docker compose` itself:
   ```
   sudo systemctl enable docker
   ```
   (Already the default on most VPS providers' Docker install scripts, but confirm it.)
3. Clone the repo onto the server and `cd` into it.
4. `cp .env.example .env` and fill in every value -- see the comments in that file for where each one comes from (Supabase, Stripe, Groq, Resend). Never commit this file.

## Start it

```
docker compose up -d --build
```

That's the whole deploy. `-d` runs both containers in the background; `--build` (only needed the first time, or after a code change) rebuilds the images from the current source.

## Why it survives a reboot

Both services in `docker-compose.yml` are `restart: unless-stopped`. Combined with the Docker daemon itself being enabled at boot (step 2 above), Docker brings both containers back up automatically whenever the host restarts -- crash, `apt upgrade`, power loss, whatever. You never SSH in to manually start anything again after the first `docker compose up -d`.

To stop everything on purpose: `docker compose down`. To see logs: `docker compose logs -f`.

## Current limitations (by design, not oversight)

- **No domain or TLS yet.** The frontend is reachable at `http://<server-ip>:8082`, the Document AI backend directly at `:8000`. Once there's a real domain, the next step is a reverse proxy (Caddy is the simplest option -- automatic HTTPS with a two-line Caddyfile) in front of both, so everything sits behind one HTTPS origin instead of two raw ports.
- **`VITE_DOCUMENT_AI_BACKEND_URL` must be a URL the *browser* can reach**, not the Docker-internal service name (`document-ai-backend` won't resolve outside the compose network). Until there's a reverse proxy unifying both under one origin, set it to `http://<server-ip>:8000`.
- **The Document AI backend runs on CPU** (`LAYOUTXLM_DEVICE: cpu` in `docker-compose.yml`), matching the existing local dev setup -- inference will be slower than a GPU host, but needs no separate GPU provisioning.
