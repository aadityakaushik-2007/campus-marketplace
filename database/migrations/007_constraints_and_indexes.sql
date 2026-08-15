-- PostgreSQL needs btree_gist to compare the listing ID and time range
-- together in the exclusion constraint below.
CREATE EXTENSION IF NOT EXISTS btree_gist;


-- This is the final database-level protection against double booking.
-- Adjacent bookings are allowed, but overlapping BOOKED/ACTIVE bookings aren't.
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


-- A listing can only be purchased once, even if the transaction is later kept as history.
CREATE UNIQUE INDEX transactions_one_per_listing_idx
ON transactions (listing_id);


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


COMMENT ON CONSTRAINT no_overlapping_bookings ON borrowings IS
    'Prevents overlapping BOOKED/ACTIVE reservations for the same listing.';