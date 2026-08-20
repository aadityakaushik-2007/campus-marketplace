-- show all active listings with their category and owner
SELECT l.*, c.name AS category_name, u.name AS owner_name
FROM listings l
JOIN categories c USING (category_id)
JOIN users u ON u.user_id = l.owner_id
WHERE l.status = 'ACTIVE'
ORDER BY l.created_at DESC;


-- filter active listings by category
SELECT l.*
FROM listings l
JOIN categories c USING (category_id)
WHERE c.name = 'Electronics'
  AND l.status = 'ACTIVE';


-- show active items that are being sold (price is the one-time sale price)
SELECT *
FROM listings
WHERE type = 'SELL'
  AND status = 'ACTIVE';


-- show active items available for borrowing (price_per_day is the daily rate)
SELECT *
FROM listings
WHERE type = 'BORROW'
  AND status = 'ACTIVE';


-- show all listings created by a particular user
SELECT *
FROM listings
WHERE owner_id = 1
ORDER BY created_at DESC;


-- listings can't be edited after creation (listings_prevent_core_edits).
-- to change price, description, or category, remove the old listing and
-- create a new one instead -- this also keeps a clean history rather than
-- silently rewriting what an interested buyer originally saw.
UPDATE listings
SET status = 'REMOVED'
WHERE listing_id = 18
  AND owner_id = 8
  AND status = 'ACTIVE';

INSERT INTO listings (owner_id, category_id, title, description, type, price)
VALUES (8, 3, 'Whiteboard Markers (relisted)', 'Set of twelve assorted colours, price dropped.', 'SELL', 150.00);


-- this UPDATE is rejected: price is a core field and cannot change after creation
BEGIN;
UPDATE listings
SET price = 500.00
WHERE listing_id = 3;
ROLLBACK;


-- mark a listing as sold instead of deleting it so its transaction history is preserved
UPDATE listings
SET status = 'SOLD'
WHERE listing_id = 3
  AND status = 'ACTIVE';


-- hide a listing from the marketplace without deleting its history
UPDATE listings
SET status = 'REMOVED'
WHERE listing_id = 18
  AND status = 'ACTIVE';


-- get a listing together with all of its image URLs
SELECT l.*,
       COALESCE(
           json_agg(li.image_url ORDER BY li.image_id)
           FILTER (WHERE li.image_id IS NOT NULL),
           '[]'
       ) AS image_urls
FROM listings l
LEFT JOIN listing_images li
    ON li.listing_id = l.listing_id
WHERE l.listing_id = 2
GROUP BY l.listing_id;
