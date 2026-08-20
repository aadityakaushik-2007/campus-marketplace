-- express interest in an ACTIVE SELL listing. multiple buyers can do this
-- for the same listing; nothing is committed to transactions yet.
INSERT INTO purchase_requests (listing_id, buyer_id)
VALUES (9, 4)
RETURNING request_id, status;


-- show every open request a seller has on their listings
SELECT pr.request_id, l.title, u.name AS buyer, pr.status, pr.created_at
FROM purchase_requests pr
JOIN listings l USING (listing_id)
JOIN users u ON u.user_id = pr.buyer_id
WHERE l.owner_id = 9
  AND pr.status = 'PENDING'
ORDER BY pr.created_at;


-- show a buyer's own requests and how they were resolved
SELECT pr.request_id, l.title, pr.status, pr.created_at, pr.responded_at
FROM purchase_requests pr
JOIN listings l USING (listing_id)
WHERE pr.buyer_id = 10
ORDER BY pr.created_at DESC;


-- the seller accepts one request -- see transactions.sql for the full
-- atomic accept flow (request -> ACCEPTED, transaction created, listing SOLD).
-- every other PENDING request on that listing is auto-rejected by
-- reject_other_purchase_requests, so it doesn't need to be done manually here:
SELECT request_id, buyer_id, status
FROM purchase_requests
WHERE listing_id = 1
ORDER BY request_id;


-- this fails: a listing owner can't request to buy their own listing
BEGIN;
INSERT INTO purchase_requests (listing_id, buyer_id)
VALUES (9, 9);
ROLLBACK;


-- this fails: buyer 4 already has a PENDING request on listing 3 (seed data)
BEGIN;
INSERT INTO purchase_requests (listing_id, buyer_id)
VALUES (3, 4);
ROLLBACK;


-- a buyer can withdraw their own request before the seller responds
UPDATE purchase_requests
SET status = 'CANCELLED', responded_at = NOW()
WHERE request_id = 6
  AND status = 'PENDING';
