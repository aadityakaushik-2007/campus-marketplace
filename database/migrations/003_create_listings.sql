-- Stores items posted by users for either sale or borrowing.
CREATE TABLE listings (
    listing_id BIGSERIAL PRIMARY KEY,
    owner_id BIGINT NOT NULL,
    category_id BIGINT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    price NUMERIC(12, 2),
    price_per_day NUMERIC(12, 2),
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT listings_owner_fk FOREIGN KEY (owner_id)
        REFERENCES users (user_id) ON DELETE RESTRICT,

    CONSTRAINT listings_category_fk FOREIGN KEY (category_id)
        REFERENCES categories (category_id) ON DELETE RESTRICT,

    CONSTRAINT listings_title_not_blank CHECK (btrim(title) <> ''),
    CONSTRAINT listings_type_check CHECK (type IN ('SELL', 'BORROW')),
    CONSTRAINT listings_status_check CHECK (status IN ('ACTIVE', 'SOLD', 'REMOVED')),

    -- SELL listings carry a one-time price. BORROW listings instead carry a
    -- per-day rental rate; borrowings.total_amount is priced from this
    -- automatically based on how many days are requested.
    CONSTRAINT listings_price_check CHECK (
        (type = 'SELL' AND price IS NOT NULL AND price >= 0 AND price_per_day IS NULL)
        OR (type = 'BORROW' AND price IS NULL AND price_per_day IS NOT NULL AND price_per_day >= 0)
    )
);


-- Keeps updated_at in sync whenever a listing is updated.
CREATE OR REPLACE FUNCTION set_listings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;


CREATE TRIGGER listings_set_updated_at
BEFORE UPDATE ON listings
FOR EACH ROW
EXECUTE FUNCTION set_listings_updated_at();


-- Listing status describes the listing itself; borrowing availability
-- is handled separately through the borrowings table.
COMMENT ON COLUMN listings.status IS 'Lifecycle state only. Borrowing availability is derived from borrowings.';
COMMENT ON COLUMN listings.price_per_day IS 'Rental rate for BORROW listings. borrowings.total_amount is computed from this automatically.';
