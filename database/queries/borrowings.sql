-- show all bookings for a particular listing
SELECT * FROM borrowings
WHERE listing_id = 2
ORDER BY start_time;

-- show a user's current and upcoming borrowings
SELECT * FROM borrowings
WHERE borrower_id = 5
  AND status IN ('BOOKED', 'ACTIVE')
ORDER BY start_time;

-- show a user's borrow requests still waiting on the owner
SELECT * FROM borrowings
WHERE borrower_id = 7
  AND status = 'PENDING'
ORDER BY created_at;

-- show all future active/booked reservations
SELECT * FROM borrowings
WHERE start_time > NOW()
  AND status IN ('BOOKED', 'ACTIVE')
ORDER BY start_time;


-- check whether a requested time period overlaps an existing BOOKED/ACTIVE
-- booking. this is useful for checking availability, but the exclusion
-- constraint is still the final authority once a request is actually accepted.
SELECT EXISTS (
    SELECT 1 FROM borrowings
    WHERE listing_id = 2
      AND status IN ('BOOKED', 'ACTIVE')
      AND tstzrange(start_time, end_time, '[)')
          && tstzrange('2027-08-19 10:00+00', '2027-08-20 10:00+00', '[)')
) AS conflicts;


-- request to borrow the Drill. this only needs listing_id/borrower_id/dates --
-- total_amount is computed automatically from the listing's price_per_day,
-- and the request starts PENDING until the owner responds.
INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time)
VALUES (2, 5, '2027-08-19 10:00+00', '2027-08-20 10:00+00')
RETURNING borrowing_id, total_amount, status;


-- two people can request overlapping dates while both are still PENDING --
-- no_overlapping_bookings only checks BOOKED/ACTIVE rows.
INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time)
VALUES (6, 4, '2027-10-01 09:00+00', '2027-10-02 09:00+00');

INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time)
VALUES (6, 5, '2027-10-01 18:00+00', '2027-10-03 18:00+00');


-- the owner accepts one request: PENDING -> BOOKED.
-- the exclusion constraint is what actually rejects this if it would
-- overlap an already-BOOKED period for the same listing.
UPDATE borrowings
SET status = 'BOOKED', responded_at = NOW()
WHERE borrowing_id = 4
  AND status = 'PENDING'
RETURNING borrowing_id, status, total_amount;

-- the owner rejects a request instead
UPDATE borrowings
SET status = 'REJECTED', responded_at = NOW()
WHERE borrowing_id = 5
  AND status = 'PENDING';


-- this overlaps an existing BOOKED booking, so accepting it should be rejected.
BEGIN;
UPDATE borrowings
SET status = 'BOOKED', responded_at = NOW()
WHERE borrowing_id = 5
  AND status = 'PENDING';
ROLLBACK;


-- mark a completed borrowing as returned
UPDATE borrowings
SET status = 'RETURNED'
WHERE borrowing_id = 4;

-- cancel a booking that is no longer needed
UPDATE borrowings
SET status = 'CANCELLED'
WHERE borrowing_id = 7;
