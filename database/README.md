# Campus Marketplace database

PostgreSQL database layer for the campus marketplace. It contains migrations, seed data, integrity tests, SQL examples, and a Node.js terminal UI. There is no ORM, HTTP API, payment gateway, or authentication implementation.

## Schema

![Database schema](diagram/schema.jpg)

The six application tables are:

| Table | Purpose |
| --- | --- |
| `users` | Student profiles linked to Supabase Auth UUIDs; no passwords are stored. |
| `categories` | Listing categories. |
| `listings` | Items offered for sale or borrowing. |
| `listing_images` | Supabase Storage URLs/paths for listing images. |
| `borrowings` | Time-bounded item reservations and returns. |
| `transactions` | Offline sale agreements between buyers and sellers. |

Campus emails are enforced as `@thapar.edu` in the users migration and demo data.

Listings are soft-deleted through `ACTIVE`, `SOLD`, and `REMOVED` status values, preserving marketplace history. Images remain in Supabase Storage; only their URL/path is stored here. Payments happen offline and transactions record only the agreed amount.

## Integrity and concurrency

- Campus emails are lower-case, unique, and domain-restricted.
- SELL listings require a non-negative price; BORROW listings require `NULL` price.
- Foreign keys use restrictive deletion to preserve history.
- Borrowings must use a BORROW listing and have `end_time > start_time`.
- `btree_gist` plus the `no_overlapping_bookings` exclusion constraint rejects overlapping `BOOKED` or `ACTIVE` periods for the same item.
- Booking periods are half-open `[start_time, end_time)`, so adjacent reservations are valid.
- Listing updates automatically refresh `updated_at`.
- Purchase and booking workflows use PostgreSQL transactions and row locks. The database constraints remain the final integrity authority.

### CRUD sanity check output

Plain `psql` session against a freshly seeded database, one statement per table (`users`, `categories`, `listings`, `listing_images`, `borrowings`, `transactions`):

```
=> INSERT INTO users (auth_user_id, name, email) VALUES ('30000000-0000-4000-8000-000000000099', 'Sanity Check', 'sanity.check@thapar.edu') RETURNING user_id, name, email;
 user_id |     name     |          email
---------+--------------+-------------------------
      13 | Sanity Check | sanity.check@thapar.edu
INSERT 0 1

=> SELECT category_id, name FROM categories ORDER BY category_id LIMIT 3;
 category_id |    name
-------------+-------------
           1 | Books
           2 | Electronics
           3 | Stationery

=> SELECT listing_id, title, type, price, status FROM listings ORDER BY listing_id LIMIT 3;
 listing_id |              title              |  type  | price  | status
------------+---------------------------------+--------+--------+--------
          1 | Calculus: Early Transcendentals | SELL   | 450.00 | SOLD
          2 | Electric Drill                  | BORROW |        | ACTIVE
          3 | Scientific Calculator           | SELL   | 700.00 | ACTIVE

=> UPDATE listings SET description = 'Sanity check update' WHERE listing_id = 1 RETURNING listing_id, description, updated_at;
 listing_id |     description     |          updated_at
------------+---------------------+-------------------------------
          1 | Sanity check update | 2026-08-16 06:12:31.231329+00
UPDATE 1

=> DELETE FROM users WHERE email = 'sanity.check@thapar.edu' RETURNING user_id, email;
 user_id |          email
---------+-------------------------
      13 | sanity.check@thapar.edu
DELETE 1

=> SELECT listing_id, image_url FROM listing_images ORDER BY image_id LIMIT 2;
 listing_id |               image_url
------------+----------------------------------------
          1 | listing-images/calculus-textbook-1.jpg
          2 | listing-images/electric-drill-1.jpg

=> SELECT borrowing_id, listing_id, start_time, end_time, status FROM borrowings ORDER BY borrowing_id LIMIT 2;
 borrowing_id | listing_id |       start_time       |        end_time        | status
--------------+------------+------------------------+------------------------+--------
            1 |          2 | 2027-08-15 10:00:00+00 | 2027-08-17 10:00:00+00 | BOOKED
            2 |          2 | 2027-08-17 10:00:00+00 | 2027-08-19 10:00:00+00 | BOOKED

=> SELECT transaction_id, listing_id, amount, status FROM transactions ORDER BY transaction_id LIMIT 2;
 transaction_id | listing_id | amount  |  status
----------------+------------+---------+-----------
              1 |          1 |  450.00 | COMPLETED
              2 |          4 | 1800.00 | COMPLETED
```

`npm run db:test` output (the JavaScript integrity suite, `database/run.js test`):

```
PASS expected rejection: duplicate email (23505)
PASS expected rejection: non-campus email (23514)
PASS expected rejection: invalid listing type (23514)
PASS expected rejection: negative SELL price (23514)
PASS expected rejection: priced BORROW listing (23514)
PASS expected rejection: missing SELL price (23514)
PASS expected rejection: missing owner foreign key (23503)
PASS expected rejection: invalid booking period (23514)
PASS expected rejection: borrowing SELL listing (23514)
PASS expected rejection: overlapping booking (23P01)
PASS expected rejection: identical booking range (23P01)
PASS expected rejection: invalid listing status (23514)
PASS adjacent booking and updated_at trigger
All JavaScript integrity tests passed.
```

### Concurrency test setup

The concurrency tests demonstrate what happens when two users try to interact with the same listing at the same time. The experiments are performed using **two separate PostgreSQL sessions** connected to the same database.

#### Experiment 1: booking overlap

Simulates two users trying to book the same drill at overlapping times.

**Session A** — start a transaction and lock the listing:

```sql
BEGIN;

SELECT *
FROM listings
WHERE listing_id = 2
FOR UPDATE;
```

Then create the first booking without committing yet:

```sql
INSERT INTO borrowings (
    listing_id,
    borrower_id,
    start_time,
    end_time
)
VALUES (
    2,
    7,
    '2027-10-01 10:00+00',
    '2027-10-03 10:00+00'
);
```

Keep this transaction open.

**Session B** — in a second PostgreSQL session, try to lock the same listing:

```sql
BEGIN;

SELECT *
FROM listings
WHERE listing_id = 2
FOR UPDATE;
```

Session B will wait because Session A currently holds the row lock.

Now commit Session A:

```sql
COMMIT;
```

Session B can continue. Try creating an overlapping booking:

```sql
INSERT INTO borrowings (
    listing_id,
    borrower_id,
    start_time,
    end_time
)
VALUES (
    2,
    8,
    '2027-10-02 10:00+00',
    '2027-10-04 10:00+00'
);
```

PostgreSQL rejects the operation because the requested period overlaps the existing booking, through the `no_overlapping_bookings` exclusion constraint:

```
ERROR:  conflicting key value violates exclusion constraint "no_overlapping_bookings"
DETAIL:  Key (listing_id, tstzrange(start_time, end_time, '[)'::text))=(2, ["2027-10-02 10:00:00+00","2027-10-04 10:00:00+00")) conflicts with existing key (listing_id, tstzrange(start_time, end_time, '[)'::text))=(2, ["2027-10-01 10:00:00+00","2027-10-03 10:00:00+00")).
```

The transaction can then be rolled back:

```sql
ROLLBACK;
```

This demonstrates two levels of concurrency protection:

1. `SELECT ... FOR UPDATE` serializes operations that need to modify the same listing.
2. The PostgreSQL exclusion constraint independently guarantees that overlapping `BOOKED` or `ACTIVE` reservations cannot exist.

#### Experiment 2: purchase race

Simulates two buyers trying to purchase the same `SELL` listing at the same time. Unlike the booking case, there's no exclusion constraint here — the second buyer has to be turned away by checking the listing's status, so this experiment shows what the row lock alone protects.

**Session A** — start a transaction and lock the listing before reading its status:

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

Record the sale and mark the listing sold, then commit:

```sql
INSERT INTO transactions (listing_id, buyer_id, seller_id, amount)
VALUES (7, 2, 7, 900.00);

UPDATE listings SET status = 'SOLD' WHERE listing_id = 7;

COMMIT;
```

**Session B** — in a second session, started concurrently with Session A, issue the same lock request:

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

Session B now sees `status = SOLD` and must roll back instead of inserting a second transaction:

```sql
ROLLBACK;
```

The row lock is what stops both sessions from reading `ACTIVE` and racing each other into the `transactions` table; the application logic then makes the reject decision based on the status it saw. The unique index on `transactions(listing_id)` (see `database/migrations/007_constraints_and_indexes.sql`) is the backstop in case application logic ever inserts anyway.

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

`db:setup` runs every migration in order and loads the dummy users, categories, listings, images, borrowings, and transactions. Run it only against an empty database.

Run the JavaScript integrity suite:

```powershell
npm run db:test
```

Open the terminal UI:

```powershell
npm run db:cli
```

The menu supports listing browsing, listing details, user lookup, borrowing, return/cancellation, atomic purchases, transaction completion, and transaction history.

`database/queries/` contains standalone SQL examples, and `database/queries/concurrency.sql` documents two-session concurrency experiments for learning and manual verification.
