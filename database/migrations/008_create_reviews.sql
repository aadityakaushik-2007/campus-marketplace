-- One review per completed deal per reviewer. A review is tied to exactly
-- one deal -- a COMPLETED transaction (sale) or a RETURNED borrowing --
-- never both, and only the two actual parties on that deal may review it.
CREATE TABLE reviews (
    review_id BIGSERIAL PRIMARY KEY,
    transaction_id BIGINT,
    borrowing_id BIGINT,
    reviewer_id BIGINT NOT NULL,
    reviewee_id BIGINT NOT NULL,
    rating SMALLINT NOT NULL,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT reviews_transaction_fk FOREIGN KEY (transaction_id)
        REFERENCES transactions (transaction_id) ON DELETE RESTRICT,

    CONSTRAINT reviews_borrowing_fk FOREIGN KEY (borrowing_id)
        REFERENCES borrowings (borrowing_id) ON DELETE RESTRICT,

    CONSTRAINT reviews_reviewer_fk FOREIGN KEY (reviewer_id)
        REFERENCES users (user_id) ON DELETE RESTRICT,

    CONSTRAINT reviews_reviewee_fk FOREIGN KEY (reviewee_id)
        REFERENCES users (user_id) ON DELETE RESTRICT,

    CONSTRAINT reviews_rating_check CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT reviews_reviewer_reviewee_different CHECK (reviewer_id <> reviewee_id),

    -- Exactly one of transaction_id / borrowing_id is set.
    CONSTRAINT reviews_exactly_one_deal_check CHECK (
        (transaction_id IS NOT NULL AND borrowing_id IS NULL)
        OR (transaction_id IS NULL AND borrowing_id IS NOT NULL)
    )
);


-- A CHECK constraint can't look at other tables, so this trigger makes sure
-- reviews only attach to a finished deal, and only its two real parties
-- (buyer/seller, or borrower/owner) can be reviewer/reviewee.
CREATE OR REPLACE FUNCTION validate_review_parties()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    txn transactions%ROWTYPE;
    brw borrowings%ROWTYPE;
    owner_id BIGINT;
BEGIN
    IF NEW.transaction_id IS NOT NULL THEN
        SELECT * INTO txn FROM transactions WHERE transaction_id = NEW.transaction_id;

        IF NOT FOUND OR txn.status <> 'COMPLETED' THEN
            RAISE EXCEPTION 'reviews require a COMPLETED transaction (transaction_id=%)', NEW.transaction_id
                USING ERRCODE = 'check_violation';
        END IF;

        IF NOT (
            (NEW.reviewer_id = txn.buyer_id AND NEW.reviewee_id = txn.seller_id)
            OR (NEW.reviewer_id = txn.seller_id AND NEW.reviewee_id = txn.buyer_id)
        ) THEN
            RAISE EXCEPTION 'reviewer/reviewee must be the buyer and seller on the transaction'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        SELECT * INTO brw FROM borrowings WHERE borrowing_id = NEW.borrowing_id;

        IF NOT FOUND OR brw.status <> 'RETURNED' THEN
            RAISE EXCEPTION 'reviews require a RETURNED borrowing (borrowing_id=%)', NEW.borrowing_id
                USING ERRCODE = 'check_violation';
        END IF;

        SELECT l.owner_id INTO owner_id FROM listings l WHERE l.listing_id = brw.listing_id;

        IF NOT (
            (NEW.reviewer_id = brw.borrower_id AND NEW.reviewee_id = owner_id)
            OR (NEW.reviewer_id = owner_id AND NEW.reviewee_id = brw.borrower_id)
        ) THEN
            RAISE EXCEPTION 'reviewer/reviewee must be the borrower and owner on the borrowing'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


CREATE TRIGGER reviews_validate_parties
BEFORE INSERT ON reviews
FOR EACH ROW EXECUTE FUNCTION validate_review_parties();
