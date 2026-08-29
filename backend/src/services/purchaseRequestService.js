import { pool, query } from '../db.js';

const requestSelect = `
    pr.request_id,
    pr.listing_id,
    l.title,
    l.owner_id AS seller_id,
    seller.name AS seller_name,
    pr.buyer_id,
    buyer.name AS buyer_name,
    pr.status,
    pr.created_at,
    pr.responded_at
`;

export async function createPurchaseRequest(listingId, buyerId) {
    const result = await query(
        `
        INSERT INTO purchase_requests (listing_id, buyer_id)
        VALUES ($1, $2)
        RETURNING request_id, listing_id, buyer_id, status, created_at, responded_at
        `,
        [listingId, buyerId]
    );
    return result.rows[0];
}

export async function getPurchaseRequestsByBuyer(buyerId) {
    const result = await query(
        `
        SELECT ${requestSelect}
        FROM purchase_requests pr
        JOIN listings l ON l.listing_id = pr.listing_id
        JOIN users seller ON seller.user_id = l.owner_id
        JOIN users buyer ON buyer.user_id = pr.buyer_id
        WHERE pr.buyer_id = $1
        ORDER BY pr.created_at DESC
        `,
        [buyerId]
    );
    return result.rows;
}

export async function getIncomingPurchaseRequests(sellerId) {
    const result = await query(
        `
        SELECT ${requestSelect}
        FROM purchase_requests pr
        JOIN listings l ON l.listing_id = pr.listing_id
        JOIN users seller ON seller.user_id = l.owner_id
        JOIN users buyer ON buyer.user_id = pr.buyer_id
        WHERE l.owner_id = $1
        ORDER BY pr.created_at DESC
        `,
        [sellerId]
    );
    return result.rows;
}

export async function rejectPurchaseRequest(requestId, sellerId) {
    const result = await query(
        `
        UPDATE purchase_requests pr
        SET status = 'REJECTED', responded_at = NOW()
        FROM listings l
        WHERE pr.request_id = $1
          AND pr.listing_id = l.listing_id
          AND l.owner_id = $2
          AND pr.status = 'PENDING'
        RETURNING pr.request_id, pr.listing_id, pr.buyer_id, pr.status, pr.responded_at
        `,
        [requestId, sellerId]
    );
    return result.rows[0] ?? null;
}

export async function cancelPurchaseRequest(requestId, buyerId) {
    const result = await query(
        `
        UPDATE purchase_requests
        SET status = 'CANCELLED', responded_at = NOW()
        WHERE request_id = $1
          AND buyer_id = $2
          AND status = 'PENDING'
        RETURNING request_id, listing_id, buyer_id, status, responded_at
        `,
        [requestId, buyerId]
    );
    return result.rows[0] ?? null;
}

export async function acceptPurchaseRequest(requestId, sellerId) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const request = await client.query(
            `
            UPDATE purchase_requests pr
            SET status = 'ACCEPTED', responded_at = NOW()
            FROM listings l
            WHERE pr.request_id = $1
              AND pr.listing_id = l.listing_id
              AND l.owner_id = $2
              AND pr.status = 'PENDING'
            RETURNING pr.request_id, pr.listing_id, pr.buyer_id
            `,
            [requestId, sellerId]
        );

        if (request.rowCount !== 1) {
            await client.query('ROLLBACK');
            return null;
        }

        const { request_id, listing_id, buyer_id } = request.rows[0];

        const listing = await client.query(
            `
            SELECT listing_id, owner_id, price, status, type
            FROM listings
            WHERE listing_id = $1
            FOR UPDATE
            `,
            [listing_id]
        );

        if (
            !listing.rows[0] ||
            listing.rows[0].status !== 'ACTIVE' ||
            listing.rows[0].type !== 'SELL'
        ) {
            throw Object.assign(
                new Error('Purchase request can only be accepted for an ACTIVE SELL listing'),
                { status: 409 }
            );
        }

        const transaction = await client.query(
            `
            INSERT INTO transactions
                (purchase_request_id, listing_id, buyer_id, seller_id, amount)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING transaction_id, listing_id, buyer_id, seller_id, amount,
                      status, created_at, completed_at
            `,
            [
                request_id,
                listing_id,
                buyer_id,
                listing.rows[0].owner_id,
                listing.rows[0].price
            ]
        );

        await client.query(
            `
            UPDATE listings
            SET status = 'SOLD'
            WHERE listing_id = $1 AND status = 'ACTIVE'
            `,
            [listing_id]
        );

        await client.query('COMMIT');
        return transaction.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
