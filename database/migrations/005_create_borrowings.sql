-- Stores requests to borrow an item and, once accepted, the booked period.
-- A request starts PENDING; the listing owner then accepts it (-> BOOKED)
-- or rejects it (-> REJECTED). total_amount is priced automatically from
-- the listing's price_per_day and the requested date range, so the app
-- never gets to supply its own total.
CREATE TABLE borrowings (
    borrowing_id BIGSERIAL PRIMARY KEY,
    listing_id BIGINT NOT NULL,
    borrower_id BIGINT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,

    CONSTRAINT borrowings_listing_fk FOREIGN KEY (listing_id)
        REFERENCES listings (listing_id) ON DELETE RESTRICT,

    CONSTRAINT borrowings_borrower_fk FOREIGN KEY (borrower_id)
        REFERENCES users (user_id) ON DELETE RESTRICT,

    CONSTRAINT borrowings_time_check CHECK (end_time > start_time),
    CONSTRAINT borrowings_total_amount_check CHECK (total_amount >= 0),
    CONSTRAINT borrowings_status_check CHECK (
        status IN ('PENDING', 'BOOKED', 'ACTIVE', 'RETURNED', 'CANCELLED', 'REJECTED')
    )
);


-- A CHECK constraint can't look at the listings table, so this trigger
-- makes sure we only create borrowings for BORROW listings, and prices
-- each request automatically from the listing's daily rate.
CREATE OR REPLACE FUNCTION validate_and_price_borrowing()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_listing listings%ROWTYPE;
    days NUMERIC;
BEGIN
    SELECT * INTO target_listing FROM listings
    WHERE listing_id = NEW.listing_id AND type = 'BORROW'
    FOR KEY SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'borrowings require a BORROW listing (listing_id=%)', NEW.listing_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- Bill in whole days, rounding any partial day up.
    days := CEIL(EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 86400.0);
    NEW.total_amount := target_listing.price_per_day * days;

    RETURN NEW;
END;
$$;


CREATE TRIGGER borrowings_validate_and_price
BEFORE INSERT OR UPDATE OF listing_id, start_time, end_time ON borrowings
FOR EACH ROW EXECUTE FUNCTION validate_and_price_borrowing();

COMMENT ON COLUMN borrowings.status IS
    'PENDING (requested) -> BOOKED (owner accepted) or REJECTED (owner declined); BOOKED -> ACTIVE/RETURNED/CANCELLED.';
COMMENT ON COLUMN borrowings.total_amount IS
    'Computed automatically as listings.price_per_day x whole days in [start_time, end_time).';
