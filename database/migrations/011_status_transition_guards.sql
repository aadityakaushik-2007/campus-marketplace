-- Closes gaps that plain CHECK constraints can't cover, since a CHECK can't
-- see a row's previous value: valid status transitions, tamper-proofing the
-- auto-computed total_amount, and responded_at/status consistency.

-- Only these transitions are allowed; same-status updates are always a no-op pass-through.
CREATE OR REPLACE FUNCTION validate_borrowing_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'PENDING' AND NEW.status IN ('BOOKED', 'REJECTED'))
        OR (OLD.status = 'BOOKED' AND NEW.status IN ('ACTIVE', 'CANCELLED'))
        OR (OLD.status = 'ACTIVE' AND NEW.status = 'RETURNED')
    ) THEN
        RAISE EXCEPTION 'invalid borrowing status transition: % -> %', OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER borrowings_validate_status_transition
BEFORE UPDATE OF status ON borrowings
FOR EACH ROW EXECUTE FUNCTION validate_borrowing_status_transition();


CREATE OR REPLACE FUNCTION validate_purchase_request_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    IF NOT (OLD.status = 'PENDING' AND NEW.status IN ('ACCEPTED', 'REJECTED', 'CANCELLED')) THEN
        RAISE EXCEPTION 'invalid purchase request status transition: % -> %', OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER purchase_requests_validate_status_transition
BEFORE UPDATE OF status ON purchase_requests
FOR EACH ROW EXECUTE FUNCTION validate_purchase_request_status_transition();


CREATE OR REPLACE FUNCTION validate_transaction_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    IF NOT (OLD.status = 'PENDING' AND NEW.status IN ('COMPLETED', 'CANCELLED')) THEN
        RAISE EXCEPTION 'invalid transaction status transition: % -> %', OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_validate_status_transition
BEFORE UPDATE OF status ON transactions
FOR EACH ROW EXECUTE FUNCTION validate_transaction_status_transition();


-- total_amount is only ever supposed to change via borrowings_validate_and_price
-- (which fires on listing_id/start_time/end_time changes, not on a direct
-- assignment). This blocks any UPDATE that names total_amount explicitly.
CREATE OR REPLACE FUNCTION prevent_borrowing_amount_tamper()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.total_amount <> OLD.total_amount THEN
        RAISE EXCEPTION 'total_amount is computed automatically and cannot be edited directly'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER borrowings_prevent_amount_tamper
BEFORE UPDATE OF total_amount ON borrowings
FOR EACH ROW EXECUTE FUNCTION prevent_borrowing_amount_tamper();


-- responded_at must be set exactly when a request has actually been responded to.
ALTER TABLE borrowings ADD CONSTRAINT borrowings_responded_at_check CHECK (
    (status = 'PENDING' AND responded_at IS NULL)
    OR (status <> 'PENDING' AND responded_at IS NOT NULL)
);

ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_responded_at_check CHECK (
    (status = 'PENDING' AND responded_at IS NULL)
    OR (status <> 'PENDING' AND responded_at IS NOT NULL)
);


-- At most one ACCEPTED purchase request per listing, mirroring the one-BOOKED
-- protection the exclusion constraint already gives borrowings.
CREATE UNIQUE INDEX purchase_requests_one_accepted_per_listing_idx
    ON purchase_requests (listing_id)
    WHERE status = 'ACCEPTED';
