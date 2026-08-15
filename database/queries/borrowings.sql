-- show all bookings for a particular listing
SELECT * FROM borrowings
WHERE listing_id = 2
ORDER BY start_time;

-- show a user's current and upcoming borrowings
SELECT * FROM borrowings
WHERE borrower_id = 5
  AND status IN ('BOOKED', 'ACTIVE')
ORDER BY start_time;

-- show all future active/booked reservations
SELECT * FROM borrowings
WHERE start_time > NOW()
  AND status IN ('BOOKED', 'ACTIVE')
ORDER BY start_time;


-- check whether a requested time period overlaps an existing booking.
-- this is useful for checking availability, but the exclusion constraint
-- is still the final authority when the booking is actually inserted.
SELECT EXISTS (
    SELECT 1 FROM borrowings
    WHERE listing_id = 2
      AND status IN ('BOOKED', 'ACTIVE')
      AND tstzrange(start_time, end_time, '[)')
          && tstzrange('2027-08-19 10:00+00', '2027-08-20 10:00+00', '[)')
) AS conflicts;


-- valid because this starts exactly when the previous booking ends
INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time)
VALUES (2, 5, '2027-08-19 10:00+00', '2027-08-20 10:00+00');


-- this overlaps an existing booking, so PostgreSQL should reject it.
BEGIN;
INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time)
VALUES (2, 6, '2027-08-18 10:00+00', '2027-08-20 10:00+00');
ROLLBACK;


-- mark a completed borrowing as returned
UPDATE borrowings
SET status = 'RETURNED'
WHERE borrowing_id = 4;

-- cancel a booking that is no longer needed
UPDATE borrowings
SET status = 'CANCELLED'
WHERE borrowing_id = 7;