-- leave a review after a COMPLETED sale. reviewer/reviewee must be the
-- actual buyer and seller on that transaction (reviews_validate_parties).
INSERT INTO reviews (transaction_id, reviewer_id, reviewee_id, rating, comment)
VALUES (2, 4, 7, 5, 'Chair arrived as described, smooth pickup.')
RETURNING review_id;


-- leave a review after a RETURNED borrowing. reviewer/reviewee must be the
-- actual borrower and listing owner on that borrowing.
INSERT INTO reviews (borrowing_id, reviewer_id, reviewee_id, rating, comment)
VALUES (5, 8, 6, 5, 'Bank was returned fully charged, no issues.')
RETURNING review_id;


-- show every review left about a user, most recent first
SELECT r.review_id, r.rating, r.comment, r.created_at, u.name AS reviewer
FROM reviews r
JOIN users u ON u.user_id = r.reviewer_id
WHERE r.reviewee_id = 1
ORDER BY r.created_at DESC;


-- a user's average rating and review count
SELECT reviewee_id, ROUND(AVG(rating), 2) AS average_rating, COUNT(*) AS review_count
FROM reviews
WHERE reviewee_id = 1
GROUP BY reviewee_id;


-- this fails: transaction 3 is still PENDING, not COMPLETED
BEGIN;
INSERT INTO reviews (transaction_id, reviewer_id, reviewee_id, rating)
VALUES (3, 8, 5, 4);
ROLLBACK;


-- this fails: user 9 was never the buyer or seller on transaction 1
BEGIN;
INSERT INTO reviews (transaction_id, reviewer_id, reviewee_id, rating)
VALUES (1, 9, 1, 3);
ROLLBACK;


-- this fails: reviewer 2 already reviewed transaction 1 (seed data)
BEGIN;
INSERT INTO reviews (transaction_id, reviewer_id, reviewee_id, rating)
VALUES (1, 2, 1, 2);
ROLLBACK;
