-- Run these blocks in separate psql sessions against the same seeded database.
-- PostgreSQL's exclusion constraint is the final authority for reservation overlap;
-- SELECT ... FOR UPDATE is useful to serialize the surrounding multi-step workflow.
--
-- Borrowings default to PENDING now, and no_overlapping_bookings only checks
-- BOOKED/ACTIVE rows, so both inserts below explicitly request status = 'BOOKED'
-- to actually exercise the exclusion constraint (a PENDING vs PENDING insert
-- would not conflict at all -- that's the point of the request/accept workflow).

-- SESSION A: holds the Drill listing lock while it books it directly.
-- responded_at is set explicitly since borrowings_responded_at_check requires
-- it for any non-PENDING status.
BEGIN;
SELECT * FROM listings WHERE listing_id = 2 FOR UPDATE;
INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time, status, responded_at)
VALUES (2, 7, '2027-10-01 10:00+00', '2027-10-03 10:00+00', 'BOOKED', NOW());
-- Leave this transaction open temporarily, then run COMMIT;

-- SESSION B: this waits on Session A's row lock. After A commits, attempt an overlap.
BEGIN;
SELECT * FROM listings WHERE listing_id = 2 FOR UPDATE;
INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time, status, responded_at)
VALUES (2, 8, '2027-10-02 10:00+00', '2027-10-04 10:00+00', 'BOOKED', NOW());
-- ERROR: conflicting key value violates exclusion constraint "no_overlapping_bookings"
ROLLBACK;

-- The constraint also protects direct concurrent INSERTs that omit this advisory row lock.
-- Adjacent periods (Oct 3 10:00 onward) are accepted because ranges use [).

-- PURCHASE SESSIONS: two buyers already have PENDING purchase_requests on
-- listing 7 (request_id 6, seed data). Both sessions try to accept a
-- request on the same listing at once.
-- SESSION A
BEGIN;
SELECT * FROM listings WHERE listing_id = 7 FOR UPDATE;
UPDATE purchase_requests SET status = 'ACCEPTED', responded_at = NOW()
    WHERE request_id = 6 AND status = 'PENDING';
INSERT INTO transactions (listing_id, buyer_id, seller_id, amount) VALUES (7, 9, 7, 900.00);
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
