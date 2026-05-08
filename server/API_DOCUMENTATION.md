# Samadiyyah Backend API Documentation

This document describes the REST API exposed by the backend server in `server/` for use by the frontend. All endpoints are prefixed with `/api`.

Authentication
- Use the Supabase access token (JWT) in the `Authorization` header when the endpoint requires user identity.
- Header format: `Authorization: Bearer <access_token>`
- The server uses the Supabase `service_role` key to perform writes; the frontend must never include that key.

Common response wrapper
- Successful responses return JSON bodies as shown per endpoint. On error, the server returns HTTP status codes and a body like:

```
{ "error": "message describing the error" }
```

Endpoints

**GET /api/health**
- Description: Health check
- Auth: none
- Response 200:

```
{ "ok": true }
```

**GET /api/pools**
- Description: List published pools (public)
- Auth: none
- Response 200: array of `public_pools` view rows

Example response:

```
[
  {
    "id": "11111111-1111-1111-1111-111111111111",
    "title": "Ramadan Samadiyyah",
    "description": "Community pool",
    "share_token": "22222222-2222-2222-2222-222222222222",
    "status": "published",
    "goal_amount": "100000.00",
    "total_amount": "250.00",
    "created_at": "2026-05-08T10:00:00.000Z",
    "updated_at": "2026-05-08T10:05:00.000Z",
    "published_at": "2026-05-08T10:00:00.000Z",
    "photo_url": "https://...",
    "photo_path": "pools/.../photo.jpg",
    "progress_percent": "0.25",
    "remaining_amount": "99750.00"
  }
]
```

Fields description (from `public_pools` view)
- `id`: pool UUID
- `title`, `description`: text
- `share_token`: UUID used in share links
- `status`: `published` for public pools
- `goal_amount`: always 100000.00
- `total_amount`: current aggregated total
- `photo_url`: public URL for the pool image, if uploaded
- `photo_path`: storage path for the uploaded image
- `progress_percent`: percent towards goal (0-100)
- `remaining_amount`: goal - total

**GET /api/pools/share/:shareToken**
- Description: Get a published pool by its share token (public)
- Auth: none
- Response 200: single pool object (same shape as above)
- Response 404: `{ "error": "Public pool not found" }`

Example request:
GET /api/pools/share/22222222-2222-2222-2222-222222222222

**GET /api/pools/:id**
- Description: Get pool by id. If the pool is `published` it is returned publicly. If not published, only the owner may fetch it.
- Auth: optional — owner must include `Authorization` header
- Response 200: pool object (columns from `pools` table)
- Response 403: `{ "error": "Forbidden" }` when not owner and pool not published

**POST /api/pools**
- Description: Create a new pool (authenticated users only)
- Auth: required — `Authorization: Bearer <access_token>`
- Request JSON:

```
{
  "title": "My Samadiyyah",
  "description": "optional",
  "status": "draft"  // optional - 'draft'|'published'|'archived'
}
```
- Response 200: the created `pools` row (including `share_token`, `id`, timestamps)
- Errors: 400 when title missing or invalid

Example response:

```
{
  "id": "33333333-3333-3333-3333-333333333333",
  "owner_id": "user-uuid",
  "title": "My Samadiyyah",
  "description": "optional",
  "share_token": "44444444-4444-4444-4444-444444444444",
  "status": "draft",
  "goal_amount": "100000.00",
  "total_amount": "0.00",
  "created_at": "2026-05-08T11:00:00.000Z",
  "updated_at": "2026-05-08T11:00:00.000Z",
  "published_at": null
}
```

**GET /api/pools/mine**
- Description: List pools owned by the authenticated user
- Auth: required
- Response 200: array of `pools` rows

**POST /api/pools/share/:shareToken/join**
- Description: Join (contribute to) a published pool using the share token.
- Auth: optional. If `Authorization` header is provided and valid, the contribution will be recorded as that user; otherwise `submitted_by` will be null.
- Request JSON (application/json):

```
{
  "amount": 250.00,
  "contributor_label": "Optional display name",
  "note": "Optional message"
}
```
- Validations: `amount` must be > 0
- Response 200: `{ "contribution": <pool_contributions row>, "pool": <updated pools row> }`

Example response:

```
{
  "contribution": {
    "id": "55555555-5555-5555-5555-555555555555",
    "pool_id": "33333333-3333-3333-3333-333333333333",
    "submitted_by": null,
    "contributor_label": "Anonymous",
    "amount": "250.00",
    "note": "Thank you",
    "created_at": "2026-05-08T12:00:00.000Z"
  },
  "pool": {
    "id": "33333333-3333-3333-3333-333333333333",
    "owner_id": "user-uuid",
    "title": "My Samadiyyah",
    "total_amount": "250.00",
    "goal_amount": "100000.00",
    "updated_at": "2026-05-08T12:00:00.000Z",
    "published_at": "2026-05-08T11:00:00.000Z"
  }
}
```

Errors:
- 400: missing or invalid `amount`
- 404: `Published pool not found` when share token invalid or pool not published

**POST /api/pools/:id/photo**
- Description: Upload or replace the image for a pool. Owner only.
- Auth: required — `Authorization: Bearer <access_token>`
- Content-Type: `multipart/form-data`
- Form field: `photo` (image file)
- Limits: image only, up to 5 MB
- Response 200:

```
{
  "pool": { "...": "updated pool row including photo_url and photo_path" },
  "photo_url": "https://...",
  "photo_path": "pools/<pool-id>/<timestamp>-file.jpg"
}
```
- Errors:
  - 400: missing photo file or non-image upload
  - 401: unauthorized
  - 403: not pool owner
  - 404: pool not found

Client usage notes
- Auth: Use Supabase client in the frontend to sign users in. Pass the returned `access_token` as `Authorization: Bearer <token>` when calling protected endpoints.
- Listing pools: use `GET /api/pools` for the public index and `GET /api/pools/mine` for the user's pools.
- Joining: call `POST /api/pools/share/:shareToken/join` with `amount` and optional `contributor_label`.

Security & operational notes
- Never expose the Supabase `service_role` key to the frontend. Store it only in server env.
- The server attributes `submitted_by` automatically when a valid `Authorization` token is provided.
- The database trigger updates `pools.total_amount` whenever a `pool_contributions` row is inserted. The API returns the updated pool after insert.

File reference
- Server routes implemented in `server/src/routes/pools.js` and supabase RPC in `supabase/migrations/20260508122902_join_pool_rpc.sql`.
