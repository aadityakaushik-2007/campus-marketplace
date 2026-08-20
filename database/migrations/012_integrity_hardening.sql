-- 012_integrity_hardening.sql
-- Closes integrity gaps around request state, sale provenance, listing lifecycle,
-- ownership history, and review updates.

-- ---------------------------------------------------------------------------
-- Borrowing invariants
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION validate_and_price_borrowing()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_listing listings%ROWTYPE;
    days NUMERIC;
BEGIN
    SELECT * INTO target_listing
    FROM listings
    WHERE listing_id = NEW.listing_id
      AND type = 'BORROW'
    FOR KEY SHARE;

    IF NOT FOUND OR target_listing.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'borrowings require an ACTIVE BORROW listing (listing_id=%)', NEW.listing_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.borrower_id = target_listing.owner_id THEN
        RAISE EXCEPTION 'a listing owner cannot borrow their own listing'
            USING ERRCODE = 'check_violation';
    END IF;

    days := CEIL(EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 86400.0);
    NEW.total_amount := target_listing.price_per_day * days;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS borrowings_validate_and_price ON borrowings;
CREATE TRIGGER borrowings_validate_and_price
BEFORE INSERT OR UPDATE OF listing_id, borrower_id, start_time, end_time ON borrowings
FOR EACH ROW EXECUTE FUNCTION validate_and_price_borrowing();


CREATE OR REPLACE FUNCTION validate_borrowing_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'PENDING' OR NEW.responded_at IS NOT NULL THEN
            RAISE EXCEPTION 'new borrowing requests must start PENDING with responded_at NULL'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    IF NEW.status IN ('BOOKED', 'ACTIVE') THEN
        IF NOT EXISTS (
            SELECT 1
            FROM listings
            WHERE listing_id = NEW.listing_id
              AND type = 'BORROW'
              AND status = 'ACTIVE'
        ) THEN
            RAISE EXCEPTION 'a borrowing can only be BOOKED or ACTIVE for an ACTIVE BORROW listing (listing_id=%)', NEW.listing_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NOT (
        (OLD.status = 'PENDING' AND NEW.status IN ('BOOKED', 'REJECTED', 'CANCELLED'))
        OR (OLD.status = 'BOOKED' AND NEW.status IN ('ACTIVE', 'CANCELLED'))
        OR (OLD.status = 'ACTIVE' AND NEW.status = 'RETURNED')
    ) THEN
        RAISE EXCEPTION 'invalid borrowing status transition: % -> %', OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS borrowings_validate_status_transition ON borrowings;
CREATE TRIGGER borrowings_validate_status_transition
BEFORE INSERT OR UPDATE OF status ON borrowings
FOR EACH ROW EXECUTE FUNCTION validate_borrowing_status_transition();


-- ---------------------------------------------------------------------------
-- Purchase-request invariants
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION validate_purchase_request_listing()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_listing listings%ROWTYPE;
BEGIN
    SELECT * INTO target_listing
    FROM listings
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

    IF NEW.status <> 'PENDING' OR NEW.responded_at IS NOT NULL THEN
        RAISE EXCEPTION 'new purchase requests must start PENDING with responded_at NULL'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchase_requests_require_active_sell_listing ON purchase_requests;
CREATE TRIGGER purchase_requests_require_active_sell_listing
BEFORE INSERT ON purchase_requests
FOR EACH ROW EXECUTE FUNCTION validate_purchase_request_listing();


CREATE OR REPLACE FUNCTION validate_purchase_request_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_listing listings%ROWTYPE;
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    IF NOT (OLD.status = 'PENDING' AND NEW.status IN ('ACCEPTED', 'REJECTED', 'CANCELLED')) THEN
        RAISE EXCEPTION 'invalid purchase request status transition: % -> %', OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'ACCEPTED' THEN
        SELECT * INTO target_listing
        FROM listings
        WHERE listing_id = NEW.listing_id
        FOR UPDATE;

        IF NOT FOUND OR target_listing.type <> 'SELL' OR target_listing.status <> 'ACTIVE' THEN
            RAISE EXCEPTION 'purchase request can only be accepted while its listing is ACTIVE and SELL (listing_id=%)', NEW.listing_id
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.buyer_id = target_listing.owner_id THEN
            RAISE EXCEPTION 'a listing owner cannot have an accepted purchase request on their own listing'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchase_requests_validate_status_transition ON purchase_requests;
CREATE TRIGGER purchase_requests_validate_status_transition
BEFORE UPDATE OF status ON purchase_requests
FOR EACH ROW EXECUTE FUNCTION validate_purchase_request_status_transition();


-- ---------------------------------------------------------------------------
-- Sale provenance
-- ---------------------------------------------------------------------------

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS purchase_request_id BIGINT;

-- Existing databases can be upgraded if each historical transaction can be
-- matched unambiguously to its accepted purchase request.
UPDATE transactions t
SET purchase_request_id = pr.request_id
FROM purchase_requests pr
WHERE t.purchase_request_id IS NULL
  AND pr.listing_id = t.listing_id
  AND pr.buyer_id = t.buyer_id
  AND pr.status = 'ACCEPTED';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM transactions WHERE purchase_request_id IS NULL) THEN
        RAISE EXCEPTION
            'cannot enforce purchase_request_id: existing transactions have no matching ACCEPTED purchase request';
    END IF;
END;
$$;

ALTER TABLE transactions
    ALTER COLUMN purchase_request_id SET NOT NULL;

ALTER TABLE transactions
    ADD CONSTRAINT transactions_purchase_request_fk
    FOREIGN KEY (purchase_request_id)
    REFERENCES purchase_requests (request_id)
    ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_one_per_purchase_request_idx
    ON transactions (purchase_request_id);


CREATE OR REPLACE FUNCTION validate_sale_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    sale_listing listings%ROWTYPE;
    accepted_request purchase_requests%ROWTYPE;
BEGIN
    SELECT * INTO accepted_request
    FROM purchase_requests
    WHERE request_id = NEW.purchase_request_id
    FOR KEY SHARE;

    IF NOT FOUND OR accepted_request.status <> 'ACCEPTED' THEN
        RAISE EXCEPTION 'transactions require an ACCEPTED purchase request (purchase_request_id=%)',
            NEW.purchase_request_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.listing_id <> accepted_request.listing_id
       OR NEW.buyer_id <> accepted_request.buyer_id THEN
        RAISE EXCEPTION 'transaction must match its purchase request'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO sale_listing
    FROM listings
    WHERE listing_id = NEW.listing_id
    FOR UPDATE;

    IF NOT FOUND OR sale_listing.type <> 'SELL' OR sale_listing.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'transactions require an ACTIVE SELL listing (listing_id=%)', NEW.listing_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.seller_id <> sale_listing.owner_id THEN
        RAISE EXCEPTION 'seller_id must be the listing owner'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.amount <> sale_listing.price THEN
        RAISE EXCEPTION 'transaction amount must equal listing price'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_validate_active_sale ON transactions;
CREATE TRIGGER transactions_validate_active_sale
BEFORE INSERT OR UPDATE OF purchase_request_id, listing_id, buyer_id, seller_id, amount
ON transactions
FOR EACH ROW EXECUTE FUNCTION validate_sale_transaction();


-- ---------------------------------------------------------------------------
-- Listing lifecycle / ownership history
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION validate_listing_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'ACTIVE' AND NEW.status = 'SOLD' THEN
        IF OLD.type <> 'SELL' THEN
            RAISE EXCEPTION 'only SELL listings can become SOLD'
                USING ERRCODE = 'check_violation';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM transactions
            WHERE listing_id = OLD.listing_id
        ) THEN
            RAISE EXCEPTION 'a listing can only become SOLD after its transaction is created'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF OLD.status = 'ACTIVE' AND NEW.status = 'REMOVED' THEN
        IF EXISTS (
            SELECT 1 FROM borrowings
            WHERE listing_id = OLD.listing_id
              AND status IN ('BOOKED', 'ACTIVE')
        ) THEN
            RAISE EXCEPTION 'cannot remove a listing with BOOKED or ACTIVE borrowings'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        RAISE EXCEPTION 'invalid listing status transition: % -> %', OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listings_validate_status_transition ON listings;
CREATE TRIGGER listings_validate_status_transition
BEFORE UPDATE OF status ON listings
FOR EACH ROW EXECUTE FUNCTION validate_listing_status_transition();


CREATE OR REPLACE FUNCTION protect_listing_relationships()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.type <> OLD.type THEN
        IF EXISTS (SELECT 1 FROM borrowings WHERE listing_id = OLD.listing_id)
           OR EXISTS (SELECT 1 FROM reviews r JOIN borrowings b ON b.borrowing_id = r.borrowing_id
                      WHERE b.listing_id = OLD.listing_id) THEN
            RAISE EXCEPTION 'cannot change listing type with borrowing/review history'
                USING ERRCODE = 'check_violation';
        END IF;

        IF EXISTS (SELECT 1 FROM transactions WHERE listing_id = OLD.listing_id)
           OR EXISTS (SELECT 1 FROM reviews r JOIN transactions t ON t.transaction_id = r.transaction_id
                      WHERE t.listing_id = OLD.listing_id) THEN
            RAISE EXCEPTION 'cannot change listing type with transaction/review history'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.owner_id <> OLD.owner_id THEN
        IF EXISTS (SELECT 1 FROM borrowings WHERE listing_id = OLD.listing_id)
           OR EXISTS (SELECT 1 FROM transactions WHERE listing_id = OLD.listing_id)
           OR EXISTS (
               SELECT 1
               FROM reviews r
               LEFT JOIN borrowings b ON b.borrowing_id = r.borrowing_id
               LEFT JOIN transactions t ON t.transaction_id = r.transaction_id
               WHERE b.listing_id = OLD.listing_id OR t.listing_id = OLD.listing_id
           ) THEN
            RAISE EXCEPTION 'cannot change owner of a listing with borrowing, transaction, or review history'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listings_protect_relationships ON listings;
CREATE TRIGGER listings_protect_relationships
BEFORE UPDATE OF type, owner_id ON listings
FOR EACH ROW EXECUTE FUNCTION protect_listing_relationships();


-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS reviews_validate_parties ON reviews;
CREATE TRIGGER reviews_validate_parties
BEFORE INSERT OR UPDATE OF transaction_id, borrowing_id, reviewer_id, reviewee_id
ON reviews
FOR EACH ROW EXECUTE FUNCTION validate_review_parties();
