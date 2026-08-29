# Campus Marketplace — Backend Documentation

**Repo component:** `backend/` (Node.js / Express REST API)
**Companion:** `database/` (PostgreSQL schema, migrations, integrity tests — see `database/README.md`)

This document covers the backend API layer only: architecture, authentication, request/response contracts for every endpoint, and how each endpoint maps onto the database invariants already documented in `database/README.md`.

---

## 1. Architecture overview

```
Client
  │  Authorization: Bearer <Auth0 JWT>
  ▼
Express app (src/server.js)
  │
  ├─ CORS + JSON body parsing
  ├─ /api/health                      (no auth)
  ├─ /api/users        → userRoutes
  ├─ /api/listings     → listingRoutes
  ├─ /api/borrowings   → borrowingRoutes
  ├─ /api/purchase-requests → purchaseRequestRoutes
  ├─ /api/transactions → transactionRoutes
  ├─ /api/reviews      → reviewRoutes
  │
  └─ centralized error-handling middleware
```

Each resource follows the same three-layer pattern:

| Layer | Location | Responsibility |
|---|---|---|
| Route | `src/routes/*.js` | Wires an HTTP verb + path to a controller, attaches `requireAuth` and `multer` where needed |
| Controller | `src/controllers/*.js` | Parses/validates the request (types, required fields, id parsing), calls the service, shapes the HTTP response |
| Service | `src/services/*.js` | All SQL / business logic. Talks to Postgres via `src/db.js` (`pg` Pool), and to Supabase Storage via `src/supabase.js` for images |

There is no ORM — all queries are hand-written parameterized SQL (`pg`), consistent with the database layer's design decision documented in `database/README.md`.

### Request lifecycle
1. `express.json()` parses the body.
2. `requireAuth` (see §2) verifies the Auth0 token and resolves it to an internal `users` row, attached as `req.user`.
3. Controller validates input shape (400 on malformed input) and calls the matching service function.
4. Service executes SQL — either a single statement or, for multi-step operations, a manual `BEGIN`/`COMMIT`/`ROLLBACK` transaction via a checked-out `pool` client.
5. Controller maps the service result to an HTTP status: `200`/`201` on success, `404` when a service returns `null` (meaning "not found, or you're not authorized for it" — see §4), or forwards to the error handler.
6. The global error handler (bottom of `server.js`) maps Postgres error codes to HTTP statuses.

---

## 2. Authentication (`src/middleware/auth.js`)

Auth is delegated to **Auth0**, not implemented locally — no passwords are ever stored (matches `database/README.md`).

`requireAuth` does three things, in order:

1. **Verify the JWT** using `express-oauth2-jwt-bearer`, configured from `AUTH0_ISSUER_BASE_URL` / `AUTH0_AUDIENCE` (RS256). Invalid/missing/expired tokens fail here and are passed to the error handler.
2. **Fetch the Auth0 profile** by calling the issuer's `/userinfo` endpoint with the caller's own access token (`getAuth0User`).
3. **Resolve/create the local user** via `getOrCreateUser` (`userService.js`):
   - Requires `sub`, `email`, `name` (or `nickname`) to be present in the Auth0 profile.
   - **Enforces `@thapar.edu` campus emails** — any other domain gets a `403`.
   - Looks up an existing `users` row by `auth_user_id`; if none exists, inserts one (lazy just-in-time user provisioning — there is no separate "sign up" endpoint).

The resolved row is attached as `req.user` (fields: `user_id, auth_user_id, name, email, contact_info, created_at`) and used by every downstream controller as the authenticated identity — there is no separate "current user" lookup per request.

**Every route in the API requires `requireAuth` except `GET /api/health`.**

---

## 3. Error handling

A single error-handling middleware in `server.js` catches everything thrown or passed to `next(error)`:

```js
'22P02': 400,  // invalid input syntax (e.g. malformed UUID/int)
'23503': 400,  // foreign key violation
'23505': 409,  // unique violation
'23514': 400,  // check constraint violation
'23P01': 409   // exclusion constraint violation (e.g. overlapping booking)
```

Controllers/services can also throw `Object.assign(new Error(msg), { status })` to set an explicit status (used heavily for `400`/`403`/`409` business-rule errors). Anything unrecognized falls back to `500`. Every error response has the shape `{ "error": "<message>" }`.

This means most of the database's integrity guarantees (documented in `database/README.md` — status transition guards, exclusion constraints, etc.) surface to API clients as clean `400`/`409` responses rather than raw SQL errors, **without the backend needing to re-implement that validation in JS.**

---

## 4. Authorization pattern: "not found" doubles as "not allowed"

A recurring pattern across services: mutation queries embed the ownership/party check directly in the `WHERE` clause (e.g. `WHERE b.borrowing_id = $1 AND l.owner_id = $3 AND b.status = 'PENDING'`). If the row doesn't match — because it doesn't exist, belongs to someone else, or is in the wrong state — the query returns zero rows, and the controller responds `404` with a message that names all three possibilities (e.g. `"Pending borrow request not found or you are not the listing owner"`).

This is a deliberate simplification: it avoids leaking *which* of "doesn't exist" / "not yours" / "wrong state" is true (arguably a minor security-through-obscurity plus), and avoids a separate authorization query per request. Worth calling out to a reviewer because it explains why almost every mutating endpoint below returns `404` (not `403`) for ownership failures.

---

## 5. Environment variables (`src/config.js`)

Required at boot (process throws immediately if any are missing):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (used by `pg.Pool` in `db.js`) |
| `AUTH0_ISSUER_BASE_URL` | Auth0 tenant issuer, used for JWT verification and `/userinfo` |
| `AUTH0_AUDIENCE` | Expected JWT audience |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Supabase service-role key (server-side only, used for Storage uploads) |

Optional: `PORT` (defaults to `3000`).

## 6. Running it

```bash
cd backend
npm install
# .env with the variables above, plus a DATABASE_URL pointing at a database
# already migrated/seeded via database/ (see database/README.md)
npm run dev     # nodemon
# or
npm start
```

`GET /api/health` checks connectivity (`SELECT 1`) and returns `{status, database}`.

---

## 7. API reference

All endpoints are prefixed `/api` and require `Authorization: Bearer <token>` unless noted. All bodies/responses are JSON. IDs are positive integers; malformed IDs return `400`.

### 7.1 Users (`/api/users`)

| Method & path | Description | Body | Notes |
|---|---|---|---|
| `GET /me` | Current authenticated user | — | Returns `req.user` as resolved by `requireAuth` |
| `PATCH /me` | Update own `name` and/or `contact_info` | `{ name?, contact_info? }` | At least one field required; `contact_info` can be set to `null` to clear it. `contact_info` is the off-platform handle (phone/Instagram/etc.) revealed to the other party once a deal is accepted — see `database/README.md` |
| `GET /:id` | Public profile of any user | — | Includes `reviews` array (all reviews received) |

### 7.2 Listings (`/api/listings`)

| Method & path | Description | Body / Query | Notes |
|---|---|---|---|
| `GET /` | Browse **active** listings | Query: `query` (title/description search), `category_id`, `type` (`SELL`\|`BORROW`), `min_price`, `max_price` | `min_price`/`max_price` compare against `price` for SELL and `price_per_day` for BORROW listings |
| `GET /mine` | Listings owned by the caller (any status) | — | |
| `GET /:id` | Single listing by id, any status | — | `404` if not found |
| `POST /` | Create a listing | `{ category_id, title, type, description?, price?, price_per_day?, images? }` | `type` must be `SELL` or `BORROW`. `SELL` requires `price` and forbids `price_per_day`; `BORROW` requires `price_per_day` and forbids `price`. `images` (optional) is an array of URL strings inserted directly as `listing_images` rows in the same DB transaction as the listing insert — this is a separate path from the multipart upload endpoint below (see note in §8) |
| `PATCH /:id/status` | Soft-delete (remove) own listing | — | Only transitions `ACTIVE → REMOVED`; only the owner; controller name is `removeListingController` |
| `POST /:id/images` | Upload one image file to a listing | multipart `image` field (JPEG/PNG/WebP, ≤5MB) | Owner only. Uploads to Supabase Storage bucket `listing-images` under `listing-<id>/<uuid>.<ext>`, then inserts the resulting public URL into `listing_images`. Rolls back the storage upload if the DB insert fails |
| `DELETE /:id/images/:imageId` | Remove one listing image | — | Owner only. Deletes the DB row, then best-effort deletes the Supabase Storage object (a storage-delete failure is logged but does not fail the request) |

Listings are **immutable after creation** at the database level (title/description/category/price/type can't change) — enforced by a trigger, not by the API. The API only ever mutates `status` for listings.

### 7.3 Borrowings (`/api/borrowings`)

Implements the borrow side of the two-step request/accept workflow described in `database/README.md`.

| Method & path | Description | Body | Notes |
|---|---|---|---|
| `POST /` | Request to borrow a listing | `{ listing_id, start_time, end_time }` | Inserts as `PENDING`. `total_amount` is computed server-side by a DB trigger from `price_per_day × days`, never supplied by the client |
| `GET /mine` | Borrow requests made by the caller | — | |
| `GET /incoming` | Borrow requests received on the caller's listings | — | |
| `PATCH /:id/decision` | Owner accepts/rejects a `PENDING` request | `{ decision: "ACCEPT" \| "REJECT" }` | `ACCEPT → BOOKED`, `REJECT → REJECTED`. Only the listing owner, only while `PENDING`. This is the point where the DB's `no_overlapping_bookings` exclusion constraint can reject the accept with `409` |
| `PATCH /:id/activate` | Mark a `BOOKED` borrowing `ACTIVE` (handover happened) | — | Either the borrower or the owner can trigger it |
| `PATCH /:id/status` | Transition to `RETURNED` or `CANCELLED` | `{ status: "RETURNED" \| "CANCELLED" }` | `RETURNED` only from `ACTIVE`; `CANCELLED` only from `PENDING`/`BOOKED`. Either party. Any other value is rejected in the controller before hitting the DB |

Borrowing status machine enforced (redundantly, at both API and DB level): `PENDING → BOOKED/REJECTED/CANCELLED`, `BOOKED → ACTIVE/CANCELLED`, `ACTIVE → RETURNED`.

### 7.4 Purchase requests (`/api/purchase-requests`)

Implements the buy side of the two-step workflow — multiple buyers can express interest before the seller commits to one.

| Method & path | Description | Body | Notes |
|---|---|---|---|
| `POST /` | Express interest in a `SELL` listing | `{ listing_id }` | Inserted `PENDING` by the DB trigger, which also rejects requests on the requester's own listing or on a non-`ACTIVE`/non-`SELL` listing |
| `GET /mine` | Requests made by the caller | — | |
| `GET /incoming` | Requests received on the caller's listings | — | |
| `PATCH /:id/decision` | Seller accepts/rejects a `PENDING` request | `{ decision: "ACCEPT" \| "REJECT" }` | **`REJECT`** simply updates status. **`ACCEPT`** runs a full DB transaction (`acceptPurchaseRequestService`): re-checks the listing is still `ACTIVE`/`SELL` under a row lock (`FOR UPDATE`), creates a `transactions` row, and flips the listing to `SOLD` — all atomically. A DB trigger auto-rejects every other `PENDING` request on that listing the moment one is accepted. Returns `{ transaction }` (201) on accept, `{ purchase_request }` (200) on reject |
| `PATCH /:id/cancel` | Buyer withdraws their own `PENDING` request | — | |

### 7.5 Transactions (`/api/transactions`)

Transactions are created only as a side effect of accepting a purchase request (§7.4) — there is no `POST /` here.

| Method & path | Description | Notes |
|---|---|---|
| `GET /mine` | All transactions where the caller is buyer or seller | |
| `GET /:id` | Single transaction | Only visible to its buyer/seller; `404` otherwise |
| `PATCH /:id/complete` | Mark a `PENDING` transaction `COMPLETED` | Either party; represents payment/handoff having happened offline, per `database/README.md`'s "payments happen offline" model |

### 7.6 Reviews (`/api/reviews`)

| Method & path | Description | Body | Notes |
|---|---|---|---|
| `POST /` | Leave a review for a finished deal | `{ deal_type: "T" \| "B", transaction_id \| borrowing_id, rating (1-5), comment? }` | `T` = review tied to a `COMPLETED` transaction, `B` = review tied to a `RETURNED` borrowing. Service checks the deal is in the right terminal state and that the caller is one of its two real parties (`403` otherwise), then derives `reviewee_id` as "the other party" automatically |
| `GET /user/:id` | All reviews received by a user | — | |

---

## 8. Notes for the reviewer

- **DB integrity is the real source of truth.** Nearly every business rule in this document (valid status transitions, no double-booking, no self-purchase, immutable listings, one review per deal) is enforced twice: loosely in the controller (for a fast, friendly `400`) and strictly by a Postgres trigger/constraint (the actual guarantee). The concurrency behavior and trigger-level guarantees are covered in depth in `database/README.md`, including two worked concurrent-session examples (`database/queries/concurrency.sql`) and the full `npm run db:test` integrity suite output.
- **`POST /listings` `images` vs `POST /listings/:id/images`.** Listing creation accepts an optional `images` array of plain URL strings, inserted as-is — useful for seeding/demo data or externally-hosted images. The dedicated `/images` endpoint is the real upload path (multipart file → Supabase Storage → DB row). A reviewer testing image upload should use the latter; the former does not validate that the URLs point to anything real.
- **No pagination** on any list endpoint (`GET /listings`, `/mine`, `/incoming`, `/mine` for transactions, etc.) — acceptable at current seed-data scale but worth flagging as a known gap for a production system.
- **No rate limiting / request size limits** beyond Multer's 5MB image cap and Express defaults.
- **CORS is fully open** (`app.use(cors())` with no options) — fine for coursework, would need an allow-list before any real deployment.
