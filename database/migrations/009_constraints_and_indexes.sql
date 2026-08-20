-- PostgreSQL needs btree_gist to compare the listing ID and time range
-- together in the exclusion constraint below.
CREATE EXTENSION IF NOT EXISTS btree_gist;


-- This is the final database-level protection against double booking.
-- Adjacent bookings are allowed, but overlapping BOOKED/ACTIVE bookings aren't.
-- PENDING requests are intentionally excluded, so multiple people can
-- request overlapping dates and the owner picks who gets BOOKED.
ALTER TABLE borrowings
    ADD CONSTRAINT no_overlapping_bookings
    EXCLUDE USING GIST (
        listing_id WITH =,
        tstzrange(start_time, end_time, '[)') WITH &&
    )
    WHERE (status IN ('BOOKED', 'ACTIVE'));


-- Prevents changes to a listing that would make its existing borrowing
-- or transaction history inconsistent with the listing type or owner.
CREATE OR REPLACE FUNCTION protect_listing_relationships()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.type <> OLD.type THEN
        IF NEW.type <> 'BORROW' AND EXISTS (
            SELECT 1 FROM borrowings WHERE listing_id = OLD.listing_id
        ) THEN
            RAISE EXCEPTION 'cannot change a listing with borrowing history away from BORROW'
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.type <> 'SELL' AND EXISTS (
            SELECT 1 FROM transactions WHERE listing_id = OLD.listing_id
        ) THEN
            RAISE EXCEPTION 'cannot change a listing with transaction history away from SELL'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.owner_id <> OLD.owner_id AND EXISTS (
        SELECT 1 FROM transactions WHERE listing_id = OLD.listing_id
    ) THEN
        RAISE EXCEPTION 'cannot change owner of a listing with transaction history'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;


CREATE TRIGGER listings_protect_relationships
BEFORE UPDATE OF type, owner_id ON listings
FOR EACH ROW EXECUTE FUNCTION protect_listing_relationships();


-- Enforces "no editing a listing, relist instead" at the database level,
-- not just in the app: once a listing exists, its title, description,
-- price, price_per_day, category, and type can never be changed. Status
-- (ACTIVE/SOLD/REMOVED) and updated_at are unaffected and still change freely.
CREATE OR REPLACE FUNCTION prevent_listing_core_edits()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.title <> OLD.title
        OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.category_id <> OLD.category_id
        OR NEW.price IS DISTINCT FROM OLD.price
        OR NEW.price_per_day IS DISTINCT FROM OLD.price_per_day
        OR NEW.type <> OLD.type
    THEN
        RAISE EXCEPTION 'listings cannot be edited after creation; create a new listing instead'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;


CREATE TRIGGER listings_prevent_core_edits
BEFORE UPDATE OF title, description, category_id, price, price_per_day, type ON listings
FOR EACH ROW EXECUTE FUNCTION prevent_listing_core_edits();


-- A listing can only be purchased once, even if the transaction is later kept as history.
CREATE UNIQUE INDEX transactions_one_per_listing_idx
ON transactions (listing_id);


-- A buyer can only have one *pending* purchase request per listing at a
-- time, but can re-request later if a previous one was rejected/cancelled.
CREATE UNIQUE INDEX purchase_requests_one_pending_per_buyer_idx
    ON purchase_requests (listing_id, buyer_id)
    WHERE status = 'PENDING';


-- One review per person per deal.
CREATE UNIQUE INDEX reviews_one_per_transaction_reviewer_idx
    ON reviews (transaction_id, reviewer_id) WHERE transaction_id IS NOT NULL;

CREATE UNIQUE INDEX reviews_one_per_borrowing_reviewer_idx
    ON reviews (borrowing_id, reviewer_id) WHERE borrowing_id IS NOT NULL;


CREATE INDEX listings_owner_id_idx ON listings (owner_id);
CREATE INDEX listings_category_id_idx ON listings (category_id);
CREATE INDEX listings_active_category_idx
    ON listings (category_id, created_at DESC)
    WHERE status = 'ACTIVE';
CREATE INDEX listings_status_idx ON listings (status);
CREATE INDEX listings_type_idx ON listings (type);
CREATE INDEX listing_images_listing_id_idx ON listing_images (listing_id);
CREATE INDEX borrowings_listing_id_idx ON borrowings (listing_id);
CREATE INDEX borrowings_borrower_id_idx ON borrowings (borrower_id);
CREATE INDEX borrowings_start_time_idx ON borrowings (start_time);
CREATE INDEX transactions_buyer_id_idx ON transactions (buyer_id);
CREATE INDEX transactions_seller_id_idx ON transactions (seller_id);
CREATE INDEX purchase_requests_listing_id_idx ON purchase_requests (listing_id);
CREATE INDEX purchase_requests_buyer_id_idx ON purchase_requests (buyer_id);
CREATE INDEX reviews_reviewee_id_idx ON reviews (reviewee_id);


COMMENT ON CONSTRAINT no_overlapping_bookings ON borrowings IS
    'Prevents overlapping BOOKED/ACTIVE reservations for the same listing.';
