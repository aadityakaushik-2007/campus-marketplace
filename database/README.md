# Campus Marketplace database

PostgreSQL database layer for the campus marketplace. It contains migrations, seed data, integrity tests, SQL examples, and a Node.js terminal UI. There is no ORM, HTTP API, payment gateway, or authentication implementation.

## Schema

![Database schema](diagram/schema.jpg)

The eight application tables are:

| Table | Purpose |
| --- | --- |
| `users` | Student profiles linked to Supabase Auth UUIDs; no passwords are stored. |
| `categories` | Listing categories. |
| `listings` | Items offered for sale or borrowing. |
| `listing_images` | Supabase Storage URLs/paths for listing images. |
| `borrowings` | Borrow requests: `PENDING` until the owner accepts or rejects them, then a time-bounded reservation. |
| `transactions` | Sale records, created once a seller accepts a purchase request. |
| `purchase_requests` | Buyers expressing interest in a `SELL` listing before the seller picks one. |
| `reviews` | Post-deal ratings, tied to exactly one completed transaction or returned borrowing. |

Campus emails are enforced as `@thapar.edu` in the users migration and demo data.

Listings are soft-deleted through `ACTIVE`, `SOLD`, and `REMOVED` status values, preserving marketplace history. Listings cannot be edited after creation (title, description, category, price, price_per_day, and type are immutable) — to change any of these, remove the old listing and create a new one, so buyers never see a listing silently change under them. Images remain in Supabase Storage; only their URL/path is stored here. Payments happen offline; `users.contact_info` is an optional handle the app can reveal to the other party once a request is accepted, so they can arrange payment and handoff themselves.

`SELL` listings carry a one-time `price`. `BORROW` listings instead carry a `price_per_day`, and `borrowings.total_amount` is computed automatically (`price_per_day × whole days`, rounding any partial day up) — the application never supplies its own total.

## Two-step request/accept workflow

Both borrowing and buying go through a request, then an accept/reject step, rather than committing immediately:

- **Borrowing**: a request is inserted into `borrowings` as `PENDING`. The listing owner accepts it (`PENDING → BOOKED`) or rejects it (`PENDING → REJECTED`). Multiple people can hold overlapping `PENDING` requests on the same dates — the `no_overlapping_bookings` exclusion constraint only checks `BOOKED`/`ACTIVE` rows, so it's only enforced at the point the owner actually accepts one.
- **Buying**: interest is inserted into `purchase_requests` as `PENDING`. When the seller accepts one (`PENDING → ACCEPTED`), every other `PENDING` request on that listing is automatically rejected by a trigger, a `transactions` row is created, and the listing is marked `SOLD` — all in one atomic step.

## Integrity and concurrency

- Campus emails are lower-case, unique, and domain-restricted.
- `SELL` listings require a non-negative `price` and no `price_per_day`; `BORROW` listings require a non-negative `price_per_day` and no `price`.
- Foreign keys use restrictive deletion to preserve history.
- Listings cannot be edited after creation (`listings_prevent_core_edits`); status and `updated_at` are unaffected.
- Borrowings must use a `BORROW` listing and have `end_time > start_time`. `total_amount` is computed automatically and cannot be edited directly (`borrowings_prevent_amount_tamper`).
- `btree_gist` plus the `no_overlapping_bookings` exclusion constraint rejects overlapping `BOOKED`/`ACTIVE` periods for the same item. Booking periods are half-open `[start_time, end_time)`, so adjacent reservations are valid.
- Status changes follow a fixed state machine, not free-form updates: borrowings only move `PENDING → BOOKED/REJECTED`, `BOOKED → ACTIVE/CANCELLED`, `ACTIVE → RETURNED`; purchase requests only move `PENDING → ACCEPTED/REJECTED/CANCELLED`; transactions only move `PENDING → COMPLETED/CANCELLED`. `responded_at` is required exactly when a borrowing or purchase request has left `PENDING`.
- Purchase requests require an `ACTIVE` `SELL` listing, block an owner requesting their own listing, allow at most one `PENDING` and one `ACCEPTED` request per listing, and accepting one auto-rejects the other `PENDING` requests on that listing.
- Transactions require an `ACTIVE` `SELL` listing, a `seller_id` matching the real owner, and an `amount` matching the listing price. Only one transaction can ever exist per listing.
- Reviews require a `COMPLETED` transaction or `RETURNED` borrowing, can only be left by that deal's actual two parties, and are limited to one review per reviewer per deal.
- Listing updates automatically refresh `updated_at`.
- Purchase and booking workflows use PostgreSQL transactions and row locks. The database constraints remain the final integrity authority.

### CRUD sanity check output

Plain `psql` session against a freshly seeded database, covering all eight tables:

```
=> INSERT INTO users (auth_user_id, name, email, contact_info) VALUES ('30000000-0000-4000-8000-000000000099', 'Sanity Check', 'sanity.check@thapar.edu', '@sanity.check') RETURNING user_id, name, email;
 user_id |     name     |          email
---------+--------------+-------------------------
      15 | Sanity Check | sanity.check@thapar.edu
INSERT 0 1

=> SELECT category_id, name FROM categories ORDER BY category_id LIMIT 3;
 category_id |    name
-------------+-------------
           1 | Books
           2 | Electronics
           3 | Stationery

=> SELECT listing_id, title, type, price, price_per_day, status FROM listings ORDER BY listing_id LIMIT 4;
 listing_id |              title              |  type  |  price  | price_per_day | status
------------+---------------------------------+--------+---------+----------------+--------
          1 | Calculus: Early Transcendentals | SELL   |  450.00 |                | SOLD
          2 | Electric Drill                  | BORROW |         |          60.00 | ACTIVE
          3 | Scientific Calculator           | SELL   |  700.00 |                | ACTIVE
          4 | Study Desk                      | SELL   | 1800.00 |                | SOLD

=> UPDATE listings SET status = 'REMOVED' WHERE listing_id = 11 RETURNING listing_id, status, updated_at;
 listing_id | status  |          updated_at
------------+---------+-------------------------------
         11 | REMOVED | 2026-08-17 03:46:17.395074+00
UPDATE 1

=> DELETE FROM users WHERE email = 'sanity.check@thapar.edu' RETURNING user_id, email;
 user_id |          email
---------+-------------------------
      15 | sanity.check@thapar.edu
DELETE 1

=> SELECT listing_id, image_url FROM listing_images ORDER BY image_id LIMIT 2;
 listing_id |               image_url
------------+----------------------------------------
          1 | listing-images/calculus-textbook-1.jpg
          2 | listing-images/electric-drill-1.jpg

=> SELECT borrowing_id, listing_id, total_amount, status FROM borrowings ORDER BY borrowing_id LIMIT 3;
 borrowing_id | listing_id | total_amount | status
--------------+------------+--------------+--------
            1 |          2 |       120.00 | BOOKED
            2 |          2 |       120.00 | BOOKED
            3 |          2 |       120.00 | BOOKED

=> SELECT transaction_id, listing_id, amount, status FROM transactions ORDER BY transaction_id LIMIT 2;
 transaction_id | listing_id | amount  |  status
----------------+------------+---------+-----------
              1 |          1 |  450.00 | COMPLETED
              2 |          4 | 1800.00 | COMPLETED

=> SELECT request_id, listing_id, buyer_id, status FROM purchase_requests ORDER BY request_id LIMIT 3;
 request_id | listing_id | buyer_id |  status
------------+------------+----------+----------
          1 |          1 |        2 | ACCEPTED
          2 |          4 |        7 | ACCEPTED
          3 |          5 |        8 | ACCEPTED

=> SELECT review_id, reviewer_id, reviewee_id, rating FROM reviews ORDER BY review_id LIMIT 2;
 review_id | reviewer_id | reviewee_id | rating
-----------+-------------+-------------+--------
         1 |           2 |           1 |      5
         2 |           1 |           2 |      5
```

`npm run db:test` output (the JavaScript integrity suite, `database/run.js test`):

```
PASS expected rejection: duplicate email (23505)
PASS expected rejection: non-campus email (23514)
PASS expected rejection: invalid listing type (23514)
PASS expected rejection: negative SELL price (23514)
PASS expected rejection: priced BORROW listing (23514)
PASS expected rejection: BORROW listing missing price_per_day (23514)
PASS expected rejection: missing SELL price (23514)
PASS expected rejection: missing owner foreign key (23503)
PASS expected rejection: invalid booking period (23514)
PASS expected rejection: borrowing SELL listing (23514)
PASS expected rejection: overlapping BOOKED booking (23P01)
PASS expected rejection: identical BOOKED range (23P01)
PASS expected rejection: invalid listing status (23514)
PASS expected rejection: invalid borrowing status (23514)
PASS expected rejection: invalid transaction status (23514)
PASS expected rejection: edit listing price after creation (23514)
PASS expected rejection: purchase request on own listing (23514)
PASS expected rejection: purchase request on BORROW listing (23514)
PASS expected rejection: duplicate pending purchase request (23505)
PASS expected rejection: review of a PENDING transaction (23514)
PASS expected rejection: review by someone not party to the deal (23514)
PASS expected rejection: duplicate review of the same deal (23505)
PASS adjacent booking, auto-priced total_amount, and updated_at trigger
All JavaScript integrity tests passed.
```

The standalone SQL equivalent of these checks, runnable directly in `psql`, is in `database/tests/integrity_tests.sql`.

### Concurrency test setup

The concurrency tests demonstrate what happens when two users try to interact with the same listing at the same time. The experiments are performed using **two separate PostgreSQL sessions** connected to the same database.

#### Experiment 1: booking overlap

Simulates two users both trying to get a `BOOKED` reservation on the same item for overlapping dates. (In the real request/accept flow this is the moment an owner *accepts* two overlapping `PENDING` requests — modeled here as two direct `BOOKED` inserts to isolate the constraint being tested.)

**Session A** — start a transaction and lock the listing:

```sql
BEGIN;

SELECT listing_id
FROM listings
WHERE listing_id = 6
FOR UPDATE;
```

Then create the first booking without committing yet:

```sql
INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time, status, responded_at)
VALUES (6, 3, '2028-01-05 10:00+00', '2028-01-07 10:00+00', 'BOOKED', NOW());
```

Keep this transaction open.

**Session B** — in a second PostgreSQL session, try to lock the same listing:

```sql
BEGIN;

SELECT listing_id
FROM listings
WHERE listing_id = 6
FOR UPDATE;
```

Session B waits because Session A currently holds the row lock. Once Session A commits, Session B's `SELECT` returns and it attempts an overlapping booking:

```sql
COMMIT; -- Session A

INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time, status, responded_at)
VALUES (6, 4, '2028-01-06 10:00+00', '2028-01-08 10:00+00', 'BOOKED', NOW());
```

```
ERROR:  conflicting key value violates exclusion constraint "no_overlapping_bookings"
DETAIL:  Key (listing_id, tstzrange(start_time, end_time, '[)'::text))=(6, ["2028-01-06 10:00:00+00","2028-01-08 10:00:00+00")) conflicts with existing key (listing_id, tstzrange(start_time, end_time, '[)'::text))=(6, ["2028-01-05 10:00:00+00","2028-01-07 10:00:00+00")).
```

```sql
ROLLBACK;
```

This demonstrates two levels of concurrency protection:

1. `SELECT ... FOR UPDATE` serializes operations that need to modify the same listing.
2. The PostgreSQL exclusion constraint independently guarantees that overlapping `BOOKED`/`ACTIVE` reservations cannot exist — the real safety net, since the row lock alone only orders the two sessions.

#### Experiment 2: purchase race

Simulates two buyers with `PENDING` purchase requests on the same `SELL` listing, both trying to be the one the seller accepts. Unlike the booking case, there's no exclusion constraint here — the second session has to be turned away by checking the listing's status, so this experiment shows what the row lock alone protects.

**Session A** — lock the listing before reading its status:

```sql
BEGIN;

SELECT listing_id, status
FROM listings
WHERE listing_id = 7
FOR UPDATE;
```

```
 listing_id | status
------------+--------
          7 | ACTIVE
```

Accept the request, record the sale, and mark the listing sold, then commit:

```sql
UPDATE purchase_requests SET status = 'ACCEPTED', responded_at = NOW() WHERE request_id = 6;

INSERT INTO transactions (listing_id, buyer_id, seller_id, amount)
VALUES (7, 9, 7, 900.00);

UPDATE listings SET status = 'SOLD' WHERE listing_id = 7;

COMMIT;
```

**Session B** — started concurrently with Session A, issues the same lock request:

```sql
BEGIN;

SELECT listing_id, status
FROM listings
WHERE listing_id = 7
FOR UPDATE;
```

Session B queues behind Session A's row lock and does not return until Session A commits. Once it does, Session B's `SELECT` returns:

```
 listing_id | status
------------+--------
          7 | SOLD
```

Session B now sees `status = SOLD` and must roll back instead of accepting its own request:

```sql
ROLLBACK;
```

The row lock is what stops both sessions from reading `ACTIVE` and racing each other into `transactions`; application logic then makes the reject decision based on the status it saw. The unique index on `transactions(listing_id)` (see `database/migrations/009_constraints_and_indexes.sql`) is the backstop in case application logic ever inserts anyway.

The complete concurrency examples are available in:

```text
database/queries/concurrency.sql
```

## Run with the JavaScript tool

Prerequisites: Node.js, a running PostgreSQL server, an empty database, and a database role allowed to create tables, functions, indexes, triggers, and the `btree_gist` extension.

From the repository root:

```powershell
npm install
$env:DATABASE_URL = 'postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/campus_marketplace'
npm run db:setup
```

`db:setup` runs every migration in order and loads the demo users, categories, listings, images, borrowings, transactions, purchase requests, and reviews. Run it only against an empty database.

Run the JavaScript integrity suite:

```powershell
npm run db:test
```

Open the terminal UI:

```powershell
npm run db:cli
```

The menu supports: active listings, listing details, requesting to borrow, accepting/rejecting a borrow request, returning/cancelling a booking, expressing interest to buy, accepting/rejecting a purchase request, completing a transaction, transaction history, leaving a review, and listing users.

`database/queries/` contains standalone SQL examples for every table, and `database/queries/concurrency.sql` documents the two-session concurrency experiments above for manual verification.
