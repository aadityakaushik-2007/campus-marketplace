CREATE TABLE transactions (
    transaction_id BIGSERIAL PRIMARY KEY,
    listing_id BIGINT NOT NULL,
    buyer_id BIGINT NOT NULL,
    seller_id BIGINT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT transactions_listing_fk FOREIGN KEY (listing_id)
        REFERENCES listings (listing_id) ON DELETE RESTRICT,
    CONSTRAINT transactions_buyer_fk FOREIGN KEY (buyer_id)
        REFERENCES users (user_id) ON DELETE RESTRICT,
    CONSTRAINT transactions_seller_fk FOREIGN KEY (seller_id)
        REFERENCES users (user_id) ON DELETE RESTRICT,
    CONSTRAINT transactions_amount_check CHECK (amount >= 0),
    CONSTRAINT transactions_status_check CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT transactions_buyer_seller_different CHECK (buyer_id <> seller_id),
    CONSTRAINT transactions_completed_at_check CHECK (
        (status = 'COMPLETED' AND completed_at IS NOT NULL)
        OR (status IN ('PENDING', 'CANCELLED') AND completed_at IS NULL)
    )
);

-- Ensures a transaction is tied to the active SELL listing and its current owner.
CREATE OR REPLACE FUNCTION validate_sale_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    sale_listing listings%ROWTYPE;
BEGIN
    -- This lock also serializes direct competing sale inserts for the same listing.
    SELECT * INTO sale_listing FROM listings WHERE listing_id = NEW.listing_id FOR UPDATE;
    IF NOT FOUND OR sale_listing.type <> 'SELL' OR sale_listing.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'transactions require an ACTIVE SELL listing (listing_id=%)', NEW.listing_id
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.seller_id <> sale_listing.owner_id THEN
        RAISE EXCEPTION 'seller_id must be the listing owner' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.amount <> sale_listing.price THEN
        RAISE EXCEPTION 'transaction amount must equal listing price' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_validate_active_sale
BEFORE INSERT ON transactions
FOR EACH ROW EXECUTE FUNCTION validate_sale_transaction();
