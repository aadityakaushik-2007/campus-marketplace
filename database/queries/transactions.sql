-- A transaction is now created by accepting a purchase_requests row (see
-- purchase_requests.sql), not by inserting into transactions directly.
-- This file covers the transactions table itself, once that row exists.

-- Accepting a request is kept atomic: the request becomes ACCEPTED (which
-- auto-rejects any other pending requests on the same listing), the
-- transaction is created, and the listing is marked SOLD together.
BEGIN;

UPDATE purchase_requests
SET status = 'ACCEPTED', responded_at = NOW()
WHERE request_id = 5
  AND status = 'PENDING'
RETURNING listing_id, buyer_id;

SELECT listing_id, owner_id, type, price, status
FROM listings
WHERE listing_id = 3
FOR UPDATE;

-- use the listing's current owner and price when creating the transaction
INSERT INTO transactions (listing_id, buyer_id, seller_id, amount)
SELECT listing_id, 4, owner_id, price
FROM listings
WHERE listing_id = 3
  AND status = 'ACTIVE'
  AND type = 'SELL';

-- only mark the listing as sold after the transaction has been created
UPDATE listings
SET status = 'SOLD'
WHERE listing_id = 3
  AND status = 'ACTIVE';

COMMIT;


-- nothing below persists because the whole transaction is rolled back
BEGIN;

INSERT INTO transactions (listing_id, buyer_id, seller_id, amount)
SELECT listing_id, 9, owner_id, price
FROM listings
WHERE listing_id = 7
  AND status = 'ACTIVE'
  AND type = 'SELL';

UPDATE listings
SET status = 'SOLD'
WHERE listing_id = 7;

ROLLBACK;


-- show all purchases made by a particular user
SELECT t.*, l.title
FROM transactions t
JOIN listings l USING (listing_id)
WHERE t.buyer_id = 2
ORDER BY t.created_at DESC;


-- show all sales made by a particular user
SELECT t.*, l.title
FROM transactions t
JOIN listings l USING (listing_id)
WHERE t.seller_id = 3
ORDER BY t.created_at DESC;


-- mark a pending transaction as completed and record when it was completed
UPDATE transactions
SET status = 'COMPLETED',
    completed_at = NOW()
WHERE transaction_id = 3
  AND status = 'PENDING';


-- show the transaction history for a listing
SELECT *
FROM transactions
WHERE listing_id = 3
ORDER BY created_at;


-- for concurrent purchases, lock the listing before creating the transaction.
-- the unique listing index provides an additional database-level safeguard.
