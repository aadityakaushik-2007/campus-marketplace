-- Every error below is expected. Run sections independently in psql: an expected error
-- aborts its transaction, and ROLLBACK restores a clean database state.

-- 1. Duplicate email
BEGIN;
INSERT INTO users (auth_user_id, name, email) VALUES
('20000000-0000-4000-8000-000000000001', 'Duplicate', 'aarav.sharma@youruniversity.edu');
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

-- 4. Negative price; 5. BORROW with price; 6. SELL without price
BEGIN; INSERT INTO listings (owner_id, category_id, title, type, price) VALUES (1, 1, 'Negative', 'SELL', -1); ROLLBACK;
BEGIN; INSERT INTO listings (owner_id, category_id, title, type, price) VALUES (1, 1, 'Borrow price', 'BORROW', 1); ROLLBACK;
BEGIN; INSERT INTO listings (owner_id, category_id, title, type, price) VALUES (1, 1, 'No sell price', 'SELL', NULL); ROLLBACK;

-- 7. Invalid foreign key
BEGIN; INSERT INTO listings (owner_id, category_id, title, type, price) VALUES (999999, 1, 'No owner', 'SELL', 1); ROLLBACK;

-- 8. Invalid borrowing dates
BEGIN; INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time) VALUES (2, 1, '2027-11-02 10:00+00', '2027-11-02 10:00+00'); ROLLBACK;

-- 9. Borrowing a SELL listing
BEGIN; INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time) VALUES (3, 1, '2027-11-02 10:00+00', '2027-11-03 10:00+00'); ROLLBACK;

-- 10. Overlapping active/BOOKED Drill booking
BEGIN; INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time) VALUES (2, 1, '2027-08-16 10:00+00', '2027-08-18 10:00+00'); ROLLBACK;
-- Identical ranges overlap too.
BEGIN; INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time) VALUES (2, 1, '2027-08-15 10:00+00', '2027-08-17 10:00+00'); ROLLBACK;

-- 11. Invalid borrowing and transaction statuses
BEGIN; INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time, status) VALUES (2, 1, '2027-11-04 10:00+00', '2027-11-05 10:00+00', 'LOST'); ROLLBACK;
BEGIN; INSERT INTO transactions (listing_id, buyer_id, seller_id, amount, status) VALUES (3, 1, 3, 700, 'PAID'); ROLLBACK;

-- Positive controls: adjacent intervals are valid; cancelled intervals do not block time.
BEGIN;
INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time)
VALUES (2, 9, '2027-08-19 10:00+00', '2027-08-20 10:00+00');
ROLLBACK;

-- updated_at is trigger-maintained (rollback prevents test data changes).
BEGIN;
SELECT listing_id, updated_at FROM listings WHERE listing_id = 3;
UPDATE listings SET description = 'Trigger verification' WHERE listing_id = 3;
SELECT listing_id, updated_at FROM listings WHERE listing_id = 3;
ROLLBACK;
