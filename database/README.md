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
