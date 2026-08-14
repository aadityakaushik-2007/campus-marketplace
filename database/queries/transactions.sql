-- A purchase is atomic: locking, validation, transaction creation, and SOLD state change all succeed or roll back together.
BEGIN;

SELECT listing_id, owner_id, type, price, status
FROM listings
WHERE listing_id = 3
FOR UPDATE;

-- After checking ACTIVE + SELL and using the returned owner/price, create the record.
INSERT INTO transactions (listing_id, buyer_id, seller_id, amount)
SELECT listing_id, 2, owner_id, price
FROM listings
WHERE listing_id = 3 AND status = 'ACTIVE' AND type = 'SELL';

UPDATE listings SET status = 'SOLD' WHERE listing_id = 3 AND status = 'ACTIVE';
COMMIT;

-- Atomicity demonstration: neither statement below persists.
BEGIN;
INSERT INTO transactions (listing_id, buyer_id, seller_id, amount)
SELECT listing_id, 4, owner_id, price
FROM listings
WHERE listing_id = 7 AND status = 'ACTIVE' AND type = 'SELL';
UPDATE listings SET status = 'SOLD' WHERE listing_id = 7;
ROLLBACK;

SELECT t.*, l.title FROM transactions t JOIN listings l USING (listing_id)
WHERE t.buyer_id = 2 ORDER BY t.created_at DESC;
SELECT t.*, l.title FROM transactions t JOIN listings l USING (listing_id)
WHERE t.seller_id = 3 ORDER BY t.created_at DESC;

UPDATE transactions
SET status = 'COMPLETED', completed_at = NOW()
WHERE transaction_id = 3 AND status = 'PENDING';

SELECT * FROM transactions WHERE listing_id = 3 ORDER BY created_at;

-- Concurrent-purchase protection: see concurrency.sql. Lock the listing before the
-- INSERT/UPDATE pair. The unique listing index additionally prevents two transactions.
