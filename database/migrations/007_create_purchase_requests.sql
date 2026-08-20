-- Lets multiple buyers express interest in a SELL listing before the seller
-- picks one. Kept separate from `transactions`, which can only ever hold
-- one row per listing -- that table remains the final sale record, created
-- only once the seller accepts a request.
CREATE TABLE purchase_requests (
    request_id BIGSERIAL PRIMARY KEY,
    listing_id BIGINT NOT NULL,
    buyer_id BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,

    CONSTRAINT purchase_requests_listing_fk FOREIGN KEY (listing_id)
        REFERENCES listings (listing_id) ON DELETE RESTRICT,

    CONSTRAINT purchase_requests_buyer_fk FOREIGN KEY (buyer_id)
        REFERENCES users (user_id) ON DELETE RESTRICT,

    CONSTRAINT purchase_requests_status_check CHECK (
        status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED')
    )
);


-- A CHECK constraint can't look at the listings table, so this trigger
-- makes sure requests only target an ACTIVE SELL listing, and that a
-- buyer can't request their own listing.
CREATE OR REPLACE FUNCTION validate_purchase_request_listing()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_listing listings%ROWTYPE;
BEGIN
    SELECT * INTO target_listing FROM listings
    WHERE listing_id = NEW.listing_id
    FOR KEY SHARE;

    IF NOT FOUND OR target_listing.type <> 'SELL' OR target_listing.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'purchase requests require an ACTIVE SELL listing (listing_id=%)', NEW.listing_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.buyer_id = target_listing.owner_id THEN
        RAISE EXCEPTION 'a listing owner cannot request to buy their own listing'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;


CREATE TRIGGER purchase_requests_require_active_sell_listing
BEFORE INSERT ON purchase_requests
FOR EACH ROW EXECUTE FUNCTION validate_purchase_request_listing();


-- When the seller accepts one request, every other still-pending request
-- for the same listing is automatically rejected, so the app doesn't have
-- to remember to do it manually.
CREATE OR REPLACE FUNCTION reject_other_purchase_requests()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'ACCEPTED' AND OLD.status IS DISTINCT FROM 'ACCEPTED' THEN
        UPDATE purchase_requests
        SET status = 'REJECTED', responded_at = NOW()
        WHERE listing_id = NEW.listing_id
          AND request_id <> NEW.request_id
          AND status = 'PENDING';
    END IF;

    RETURN NEW;
END;
$$;


CREATE TRIGGER purchase_requests_auto_reject_others
AFTER UPDATE OF status ON purchase_requests
FOR EACH ROW EXECUTE FUNCTION reject_other_purchase_requests();
