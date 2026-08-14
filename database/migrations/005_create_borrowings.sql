CREATE TABLE borrowings (
    borrowing_id BIGSERIAL PRIMARY KEY,
    listing_id BIGINT NOT NULL,
    borrower_id BIGINT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'BOOKED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT borrowings_listing_fk FOREIGN KEY (listing_id)
        REFERENCES listings (listing_id) ON DELETE RESTRICT,
    CONSTRAINT borrowings_borrower_fk FOREIGN KEY (borrower_id)
        REFERENCES users (user_id) ON DELETE RESTRICT,
    CONSTRAINT borrowings_time_check CHECK (end_time > start_time),
    CONSTRAINT borrowings_status_check CHECK (status IN ('BOOKED', 'ACTIVE', 'RETURNED', 'CANCELLED'))
);

-- A CHECK constraint cannot inspect another table, so this trigger prevents borrowing SELL listings.
CREATE OR REPLACE FUNCTION validate_borrowing_listing_type()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM 1 FROM listings
    WHERE listing_id = NEW.listing_id AND type = 'BORROW'
    FOR KEY SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'borrowings require a BORROW listing (listing_id=%)', NEW.listing_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER borrowings_require_borrow_listing
BEFORE INSERT OR UPDATE OF listing_id ON borrowings
FOR EACH ROW EXECUTE FUNCTION validate_borrowing_listing_type();
