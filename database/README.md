# Campus Marketplace database

This directory is a PostgreSQL-only foundation for the campus marketplace. It contains no ORM, API, authentication implementation, payment integration, or image binary storage. The six application tables are exactly `users`, `categories`, `listings`, `listing_images`, `borrowings`, and `transactions`.

## Configuration required before deployment

`001_create_users.sql` intentionally uses `@youruniversity.edu` as the campus-email placeholder. Replace that string with the real university domain before running migrations in a real environment. Email is required to be stored lower case, making the ordinary unique constraint consistently case-insensitive.

## Architecture and relationships

| Table | Purpose | Important relationships |
| --- | --- | --- |
| `users` | Application profile for a student | `auth_user_id` is the Supabase Auth UUID; no credentials are stored. |
| `categories` | Curated listing categories | One category has many listings. |
| `listings` | A sellable or borrowable item | Owned by one user and belongs to one category. |
| `listing_images` | Supabase Storage references | Many image URLs/paths per listing. |
| `borrowings` | Time-bounded reservations and returns | One BORROW listing and one borrower per row. |
| `transactions` | Offline-sale agreement record | One SELL listing, a buyer, and its owner as seller. |

Authentication flow:

```text
Supabase Auth UUID → users.auth_user_id → application profile/data
```

Passwords, password hashes, access tokens, and refresh tokens do not belong in this schema. Images are held in Supabase Storage; `listing_images.image_url` only stores a URL or storage path. Payments are currently out of scope: a transaction records an agreed amount and the students pay face-to-face.

Listings use soft lifecycle states. `ACTIVE → SOLD` retains the listing so its transaction history remains valid; `ACTIVE → REMOVED` takes an item off the marketplace without losing history. `SOLD` is not physical deletion. Foreign keys use restrictive deletion, preventing accidental removal of users, listings, transactions, and borrowing history.

## Borrowing and concurrency

Availability is calculated from `borrowings`; it is never stored as an `is_available`, `booked_until`, or similar column on `listings`. A `BORROW` listing may have many future reservations while staying `ACTIVE`.

Reservation periods use half-open ranges: `[start_time, end_time)`. Thus a reservation ending at 12:00 and one starting at exactly 12:00 are adjacent and valid. Only `BOOKED` and `ACTIVE` rows block availability. `RETURNED` and `CANCELLED` rows remain historical records but do not block a period.

Migration 007 installs `btree_gist` and creates the `no_overlapping_bookings` GiST exclusion constraint over `listing_id` and `tstzrange(start_time, end_time, '[)')`. This is the final database-level authority against overlap, including races between clients. A trigger rejects borrowings against a `SELL` listing because a CHECK constraint cannot read another table.

Use a database transaction and `SELECT ... FOR UPDATE` for the surrounding multi-step booking or purchase workflow. The lock serializes that workflow, but it is not the overlap guarantee—the exclusion constraint is. For sales, lock an `ACTIVE` `SELL` listing, insert its transaction, update it to `SOLD`, and commit together. The transaction trigger validates listing type, owner/seller, and amount; the unique transaction-listing index prevents a second purchase record.

## ACID demonstrated here

- **Atomicity:** `queries/transactions.sql` shows a successful purchase `COMMIT` and a purchase `ROLLBACK`, so transaction creation and SOLD transition do not partially persist.
- **Consistency:** declarative foreign keys, CHECK constraints, triggers, and the exclusion constraint reject invalid data. `tests/integrity_tests.sql` demonstrates these failures.
- **Isolation:** `queries/concurrency.sql` gives two-session locking and overlapping-reservation experiments. PostgreSQL enforces the GiST invariant safely under concurrency.
- **Durability:** PostgreSQL's WAL and recovery mechanisms make committed transactions durable; this schema does not try to imitate durability in application code.

## Indexes

Indexes cover listing owner/category/status/type access, active category browsing, image lookup, borrowing listing/borrower/time lookup, and transaction buyer/seller lookup. The unique `transactions(listing_id)` index also serves listing-history lookup and blocks a duplicate sale transaction. The GiST exclusion constraint supplies its own index for booking conflict checks.

## Run from scratch

Create an empty database, then run migrations in lexical order. In PowerShell:

```powershell
createdb campus_marketplace
Get-ChildItem .\database\migrations\*.sql | Sort-Object Name | ForEach-Object { psql -d campus_marketplace -v ON_ERROR_STOP=1 -f $_.FullName }
psql -d campus_marketplace -v ON_ERROR_STOP=1 -f .\database\seeds\seed.sql
```

Run examples individually because some are intentionally mutating or failing demonstrations:

```powershell
psql -d campus_marketplace -f .\database\queries\users.sql
psql -d campus_marketplace -f .\database\queries\borrowings.sql
psql -d campus_marketplace -f .\database\tests\integrity_tests.sql
```

`integrity_tests.sql` contains expected errors. Each failure is within a transaction followed by `ROLLBACK`, so it leaves no test rows behind. For the concurrency exercise, open two terminals with `psql -d campus_marketplace`, copy the Session A block from `queries/concurrency.sql`, leave it open, run Session B, and then commit A. Session B waits for the row lock and is rejected if it attempts the overlapping range. The same file also documents two concurrent purchase attempts.

For a clean rerun, create a new empty database rather than adding destructive `DROP` statements to migrations.
