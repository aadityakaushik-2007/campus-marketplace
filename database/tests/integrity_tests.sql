-- Every error below is expected. Run sections independently in psql: an expected error
-- aborts its transaction, and ROLLBACK restores a clean database state.

-- 1. Duplicate email
BEGIN;
INSERT INTO users (auth_user_id, name, email) VALUES
('20000000-0000-4000-8000-000000000001', 'Duplicate', 'aarav.sharma@thapar.edu');
ROLLBACK;

-- 2. Invalid campus email
BEGIN;
INSERT INTO users (auth_user_id, name, email) VALUES
('20000000-0000-4000-8000-000000000002', 'Outside', 'outside@example.com');
ROLLBACK;

-- 3. Invalid listing type
BEGIN;
INSERT INTO listings (owner_id, category_id, title, type, price)
VALUES (1, 1, 'Invalid type', 'GIFT', 1.00);
ROLLBACK;

-- Invalid listing status
BEGIN;
INSERT INTO listings (owner_id, category_id, title, type, price, status)
VALUES (1, 1, 'Invalid status', 'SELL', 1.00, 'ARCHIVED');
ROLLBACK;

-- 4. Negative price; 5. BORROW with price; 6. SELL without price;
-- 6b. BORROW without price_per_day
BEGIN; INSERT INTO listings (owner_id, category_id, title, type, price) VALUES (1, 1, 'Negative', 'SELL', -1); ROLLBACK;
BEGIN; INSERT INTO listings (owner_id, category_id, title, type, price) VALUES (1, 1, 'Borrow price', 'BORROW', 1); ROLLBACK;
BEGIN; INSERT INTO listings (owner_id, category_id, title, type, price) VALUES (1, 1, 'No sell price', 'SELL', NULL); ROLLBACK;
BEGIN; INSERT INTO listings (owner_id, category_id, title, type, price_per_day) VALUES (1, 1, 'No daily rate', 'BORROW', NULL); ROLLBACK;

-- 7. Invalid foreign key
BEGIN; INSERT INTO listings (owner_id, category_id, title, type, price) VALUES (999999, 1, 'No owner', 'SELL', 1); ROLLBACK;

-- 8. Invalid borrowing dates
BEGIN; INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time) VALUES (2, 1, '2027-11-02 10:00+00', '2027-11-02 10:00+00'); ROLLBACK;

-- 9. Borrowing a SELL listing
BEGIN; INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time) VALUES (3, 1, '2027-11-02 10:00+00', '2027-11-03 10:00+00'); ROLLBACK;

-- 10. Overlapping active/BOOKED Drill booking. Borrowings default to PENDING now, and
-- no_overlapping_bookings only checks BOOKED/ACTIVE rows, so status = 'BOOKED' is
-- explicit here -- a PENDING insert would not conflict at all. responded_at is also
-- set explicitly (borrowings_responded_at_check requires it once status leaves PENDING),
-- so the failure below comes from the exclusion constraint, not that check.
BEGIN; INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time, status, responded_at) VALUES (2, 1, '2027-08-16 10:00+00', '2027-08-18 10:00+00', 'BOOKED', NOW()); ROLLBACK;
-- Identical ranges overlap too.
BEGIN; INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time, status, responded_at) VALUES (2, 1, '2027-08-15 10:00+00', '2027-08-17 10:00+00', 'BOOKED', NOW()); ROLLBACK;

-- 11. Invalid borrowing and transaction statuses
BEGIN; INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time, status) VALUES (2, 1, '2027-11-04 10:00+00', '2027-11-05 10:00+00', 'LOST'); ROLLBACK;
BEGIN; INSERT INTO transactions (listing_id, buyer_id, seller_id, amount, status) VALUES (3, 1, 3, 700, 'PAID'); ROLLBACK;

-- 12. Listings cannot be edited after creation -- relist instead.
BEGIN; UPDATE listings SET price = 1.00 WHERE listing_id = 3; ROLLBACK;
BEGIN; UPDATE listings SET description = 'sneaky edit' WHERE listing_id = 2; ROLLBACK;

-- 13. Purchase requests: an owner can't request their own listing.
BEGIN; INSERT INTO purchase_requests (listing_id, buyer_id) VALUES (9, 9); ROLLBACK;

-- 14. Purchase requests only target ACTIVE SELL listings (not BORROW, not SOLD).
BEGIN; INSERT INTO purchase_requests (listing_id, buyer_id) VALUES (2, 1); ROLLBACK;

-- 15. A buyer can't have two PENDING requests on the same listing at once
-- (buyer 4 already has a PENDING request on listing 3 in the seed data).
BEGIN; INSERT INTO purchase_requests (listing_id, buyer_id) VALUES (3, 4); ROLLBACK;

-- 16. Reviews require a COMPLETED transaction / RETURNED borrowing.
BEGIN; INSERT INTO reviews (transaction_id, reviewer_id, reviewee_id, rating) VALUES (3, 8, 5, 5); ROLLBACK;
BEGIN; INSERT INTO reviews (borrowing_id, reviewer_id, reviewee_id, rating) VALUES (4, 5, 6, 5); ROLLBACK;

-- 17. Reviews can only be left by the deal's actual two parties.
BEGIN; INSERT INTO reviews (transaction_id, reviewer_id, reviewee_id, rating) VALUES (1, 9, 1, 3); ROLLBACK;

-- 18. Reviewer and reviewee can't be the same person.
BEGIN; INSERT INTO reviews (transaction_id, reviewer_id, reviewee_id, rating) VALUES (1, 1, 1, 5); ROLLBACK;

-- 19. Only one review per person per deal (transaction 1, reviewer 2, in the seed data).
BEGIN; INSERT INTO reviews (transaction_id, reviewer_id, reviewee_id, rating) VALUES (1, 2, 1, 1); ROLLBACK;

-- Positive controls: adjacent intervals are valid; cancelled intervals do not block time.
BEGIN;
INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time)
VALUES (2, 9, '2027-08-19 10:00+00', '2027-08-20 10:00+00');
ROLLBACK;

-- total_amount is priced automatically: 60.00/day x 1 day = 60.00 for the Drill above.
BEGIN;
INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time)
VALUES (2, 9, '2027-08-19 10:00+00', '2027-08-20 10:00+00');
SELECT borrowing_id, total_amount, status FROM borrowings
WHERE listing_id = 2 AND borrower_id = 9 ORDER BY borrowing_id DESC LIMIT 1;
ROLLBACK;

-- Accepting a PENDING borrow request moves it to BOOKED, at which point
-- no_overlapping_bookings starts protecting it.
BEGIN;
INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time)
VALUES (6, 10, '2027-11-10 09:00+00', '2027-11-12 09:00+00');
UPDATE borrowings SET status = 'BOOKED', responded_at = NOW()
WHERE listing_id = 6 AND borrower_id = 10 AND status = 'PENDING';
SELECT borrowing_id, status, total_amount FROM borrowings
WHERE listing_id = 6 AND borrower_id = 10;
ROLLBACK;

-- updated_at is trigger-maintained (rollback prevents test data changes).
BEGIN;
SELECT listing_id, updated_at FROM listings WHERE listing_id = 3;
UPDATE listings SET status = 'REMOVED' WHERE listing_id = 3;
SELECT listing_id, updated_at FROM listings WHERE listing_id = 3;
ROLLBACK;
