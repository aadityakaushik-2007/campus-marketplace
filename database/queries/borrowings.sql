SELECT * FROM borrowings WHERE listing_id = 2 ORDER BY start_time;
SELECT * FROM borrowings WHERE borrower_id = 5 AND status IN ('BOOKED', 'ACTIVE') ORDER BY start_time;
SELECT * FROM borrowings WHERE start_time > NOW() AND status IN ('BOOKED', 'ACTIVE') ORDER BY start_time;

-- Conflict check for display. The exclusion constraint remains the final authority.
SELECT EXISTS (
    SELECT 1 FROM borrowings
    WHERE listing_id = 2 AND status IN ('BOOKED', 'ACTIVE')
      AND tstzrange(start_time, end_time, '[)') && tstzrange('2027-08-19 10:00+00', '2027-08-20 10:00+00', '[)')
) AS conflicts;

-- Valid: exactly adjacent to an existing Drill booking.
INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time)
VALUES (2, 5, '2027-08-19 10:00+00', '2027-08-20 10:00+00');

-- Expected rejection: overlaps the preceding booking.
BEGIN;
INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time)
VALUES (2, 6, '2027-08-18 10:00+00', '2027-08-20 10:00+00');
ROLLBACK;

UPDATE borrowings SET status = 'RETURNED' WHERE borrowing_id = 4;
UPDATE borrowings SET status = 'CANCELLED' WHERE borrowing_id = 7;
