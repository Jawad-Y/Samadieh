# Samadiyyah Backend API

This small Node/Express server wraps your Supabase backend and exposes simple REST endpoints your frontend can call.

Prerequisites

- A Supabase project with the migrations applied from the main repo.
- A `service_role` key (keep it secret).

Setup

1. Copy `.env.example` to `.env` and set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
2. Install dependencies and start the server:

```bash
cd server
npm install
npm run start
```

API Endpoints

- `GET /api/health` — health check
- `GET /api/pools` — list published pools
- `GET /api/pools/share/:shareToken` — get public pool by share token
- `POST /api/pools/share/:shareToken/join` — join a pool (body: `amount`, `contributor_label`, `note`). Optional `Authorization: Bearer <access_token>` header to identify contributor.
- `POST /api/pools` — create a pool (requires `Authorization: Bearer <access_token>`) body: `title`, `description`, `status`
- `GET /api/pools/mine` — list current user's pools (requires auth)
- `GET /api/pools/:id` — get pool by id (published or owner-only)

Security

This server uses the Supabase `service_role` key to perform writes on behalf of the frontend. The server verifies incoming user tokens for owner-specific operations and attributes contributions to users when a valid token is provided.
