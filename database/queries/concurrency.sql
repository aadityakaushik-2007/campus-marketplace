-- Run these blocks in separate psql sessions against the same seeded database.
-- PostgreSQL's exclusion constraint is the final authority for reservation overlap;
-- SELECT ... FOR UPDATE is useful to serialize the surrounding multi-step workflow.

-- SESSION A: holds the Drill listing lock while it creates a booking.
BEGIN;
SELECT * FROM listings WHERE listing_id = 2 FOR UPDATE;
INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time)
VALUES (2, 7, '2027-10-01 10:00+00', '2027-10-03 10:00+00');
-- Leave this transaction open temporarily, then run COMMIT;

-- SESSION B: this waits on Session A's row lock. After A commits, attempt an overlap.
BEGIN;
SELECT * FROM listings WHERE listing_id = 2 FOR UPDATE;
INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time)
VALUES (2, 8, '2027-10-02 10:00+00', '2027-10-04 10:00+00');
-- ERROR: conflicting key value violates exclusion constraint "no_overlapping_bookings"
ROLLBACK;

-- The constraint also protects direct concurrent INSERTs that omit this advisory row lock.
-- Adjacent periods (Oct 3 10:00 onward) are accepted because ranges use [).

-- PURCHASE SESSIONS: both try to buy listing 7, currently ACTIVE and SELL.
-- SESSION A
BEGIN;
SELECT * FROM listings WHERE listing_id = 7 FOR UPDATE;
INSERT INTO transactions (listing_id, buyer_id, seller_id, amount) VALUES (7, 2, 7, 900.00);
UPDATE listings SET status = 'SOLD' WHERE listing_id = 7;
COMMIT;

-- SESSION B starts concurrently; its FOR UPDATE waits. Once A commits it sees SOLD,
-- so application logic must ROLLBACK without inserting. The unique index on
-- transactions(listing_id) is a backstop against a second transaction record.
BEGIN;
SELECT * FROM listings WHERE listing_id = 7 FOR UPDATE;
-- Observe status = SOLD, then:
ROLLBACK;

-- Isolation: row locks serialize conflicting purchase workflows; exclusion checks use
-- PostgreSQL's concurrency-safe GiST enforcement. Durability: committed changes are
-- recovered by PostgreSQL's WAL/recovery mechanisms, not by application code.
