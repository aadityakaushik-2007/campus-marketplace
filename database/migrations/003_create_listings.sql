CREATE TABLE listings (
    listing_id BIGSERIAL PRIMARY KEY,
    owner_id BIGINT NOT NULL,
    category_id BIGINT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    price NUMERIC(12, 2),
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
    CONSTRAINT listings_price_check CHECK (
        (type = 'SELL' AND price IS NOT NULL AND price >= 0)
        OR (type = 'BORROW' AND price IS NULL)
    )
);

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

COMMENT ON COLUMN listings.status IS 'Lifecycle state only. Borrowing availability is derived from borrowings.';
