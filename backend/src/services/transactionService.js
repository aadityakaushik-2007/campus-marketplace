import { query } from '../db.js';

const transactionSelect = `
    t.transaction_id,
    t.purchase_request_id,
    t.listing_id,
    l.title,
    t.buyer_id,
    buyer.name AS buyer_name,
    t.seller_id,
    seller.name AS seller_name,
    t.amount,
    t.status,
    t.created_at,
    t.completed_at
`;

export async function getTransactionHistory(userId) {
    const result = await query(
        `
        SELECT ${transactionSelect}
        FROM transactions t
        JOIN listings l ON l.listing_id = t.listing_id
        JOIN users buyer ON buyer.user_id = t.buyer_id
        JOIN users seller ON seller.user_id = t.seller_id
        WHERE t.buyer_id = $1 OR t.seller_id = $1
        ORDER BY t.created_at DESC
        `,
        [userId]
    );
    return result.rows;
}

export async function getTransactionById(transactionId, userId) {
    const result = await query(
        `
        SELECT ${transactionSelect}
        FROM transactions t
        JOIN listings l ON l.listing_id = t.listing_id
        JOIN users buyer ON buyer.user_id = t.buyer_id
        JOIN users seller ON seller.user_id = t.seller_id
        WHERE t.transaction_id = $1
          AND (t.buyer_id = $2 OR t.seller_id = $2)
        `,
        [transactionId, userId]
    );
    return result.rows[0] ?? null;
}

export async function completeTransaction(transactionId, userId) {
    const result = await query(
        `
        UPDATE transactions
        SET status = 'COMPLETED', completed_at = NOW()
        WHERE transaction_id = $1
          AND status = 'PENDING'
          AND (buyer_id = $2 OR seller_id = $2)
        RETURNING transaction_id, listing_id, buyer_id, seller_id,
                  amount, status, created_at, completed_at
        `,
        [transactionId, userId]
    );
    return result.rows[0] ?? null;
}
