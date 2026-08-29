import { query } from '../db.js';

export async function createReview({ dealType, dealId, reviewerId, rating, comment }) {
    if (dealType === 'T') {
        const deal = await query(
            `
            SELECT buyer_id, seller_id
            FROM transactions
            WHERE transaction_id = $1 AND status = 'COMPLETED'
            `,
            [dealId]
        );

        if (!deal.rows[0]) {
            throw Object.assign(
                new Error('Reviews require a COMPLETED transaction'),
                { status: 409 }
            );
        }

        const { buyer_id, seller_id } = deal.rows[0];

        if (reviewerId !== Number(buyer_id) && reviewerId !== Number(seller_id)) {
            throw Object.assign(
                new Error('You are not a party to this transaction'),
                { status: 403 }
            );
        }

        const revieweeId = reviewerId === Number(buyer_id)
            ? seller_id
            : buyer_id;

        const result = await query(
            `
            INSERT INTO reviews
                (transaction_id, reviewer_id, reviewee_id, rating, comment)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING review_id, transaction_id, borrowing_id,
                      reviewer_id, reviewee_id, rating, comment, created_at
            `,
            [dealId, reviewerId, revieweeId, rating, comment]
        );

        return result.rows[0];
    }

    if (dealType === 'B') {
        const deal = await query(
            `
            SELECT
                b.borrower_id,
                l.owner_id
            FROM borrowings b
            JOIN listings l ON l.listing_id = b.listing_id
            WHERE b.borrowing_id = $1 AND b.status = 'RETURNED'
            `,
            [dealId]
        );

        if (!deal.rows[0]) {
            throw Object.assign(
                new Error('Reviews require a RETURNED borrowing'),
                { status: 409 }
            );
        }

        const { borrower_id, owner_id } = deal.rows[0];

        if (reviewerId !== Number(borrower_id) && reviewerId !== Number(owner_id)) {
            throw Object.assign(
                new Error('You are not a party to this borrowing'),
                { status: 403 }
            );
        }

        const revieweeId = reviewerId === Number(borrower_id)
            ? owner_id
            : borrower_id;

        const result = await query(
            `
            INSERT INTO reviews
                (borrowing_id, reviewer_id, reviewee_id, rating, comment)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING review_id, transaction_id, borrowing_id,
                      reviewer_id, reviewee_id, rating, comment, created_at
            `,
            [dealId, reviewerId, revieweeId, rating, comment]
        );

        return result.rows[0];
    }

    throw Object.assign(new Error('deal_type must be T or B'), { status: 400 });
}

export async function getReviewsForUser(userId) {
    const result = await query(
        `
        SELECT
            r.review_id,
            r.transaction_id,
            r.borrowing_id,
            r.reviewer_id,
            reviewer.name AS reviewer_name,
            r.reviewee_id,
            r.rating,
            r.comment,
            r.created_at
        FROM reviews r
        JOIN users reviewer ON reviewer.user_id = r.reviewer_id
        WHERE r.reviewee_id = $1
        ORDER BY r.created_at DESC
        `,
        [userId]
    );
    return result.rows;
}
