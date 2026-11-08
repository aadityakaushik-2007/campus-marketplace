import { query } from '../db.js';

const borrowingSelect = (reviewerIdParameter) => `
    b.borrowing_id,
    b.listing_id,
    l.title,
    l.owner_id,
    owner.name AS owner_name,
    b.borrower_id,
    borrower.name AS borrower_name,
    b.start_time,
    b.end_time,
    b.total_amount,
    b.status,
    b.created_at,
    b.responded_at,
    EXISTS (
        SELECT 1
        FROM reviews r
        WHERE r.borrowing_id = b.borrowing_id
          AND r.reviewer_id = ${reviewerIdParameter}
    ) AS has_review
`;

export async function createBorrowing({ listingId, borrowerId, startTime, endTime }) {
    const result = await query(
        `
        INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time)
        VALUES ($1, $2, $3, $4)
        RETURNING borrowing_id, listing_id, borrower_id, start_time, end_time, total_amount, status, created_at, responded_at
        `,
        [listingId, borrowerId, startTime, endTime]
    );
    return result.rows[0];
}

export async function getBorrowingsByBorrower(borrowerId) {
    const result = await query(
        `
        SELECT ${borrowingSelect('$1')}
        FROM borrowings b
        JOIN listings l ON l.listing_id = b.listing_id
        JOIN users owner ON owner.user_id = l.owner_id
        JOIN users borrower ON borrower.user_id = b.borrower_id
        WHERE b.borrower_id = $1
        ORDER BY b.created_at DESC
        `,
        [borrowerId]
    );
    return result.rows;
}

export async function getIncomingBorrowings(ownerId) {
    const result = await query(
        `
        SELECT ${borrowingSelect('$1')}
        FROM borrowings b
        JOIN listings l ON l.listing_id = b.listing_id
        JOIN users owner ON owner.user_id = l.owner_id
        JOIN users borrower ON borrower.user_id = b.borrower_id
        WHERE l.owner_id = $1
        ORDER BY b.created_at DESC
        `,
        [ownerId]
    );
    return result.rows;
}

export async function decideBorrowing(borrowingId, ownerId, decision) {
    const newStatus = decision === 'ACCEPT' ? 'BOOKED' : 'REJECTED';

    const result = await query(
        `
        UPDATE borrowings b
        SET status = $1, responded_at = NOW()
        FROM listings l
        WHERE b.borrowing_id = $2
          AND b.listing_id = l.listing_id
          AND l.owner_id = $3
          AND b.status = 'PENDING'
        RETURNING
            b.borrowing_id, b.listing_id, b.borrower_id,
            b.total_amount, b.status, b.responded_at
        `,
        [newStatus, borrowingId, ownerId]
    );

    return result.rows[0] ?? null;
}

export async function activateBorrowing(borrowingId, userId) {
    const result = await query(
        `
        UPDATE borrowings b
        SET status = 'ACTIVE'
        WHERE b.borrowing_id = $1
          AND b.status = 'BOOKED'
          AND (
              b.borrower_id = $2
              OR EXISTS (
                  SELECT 1 FROM listings l
                  WHERE l.listing_id = b.listing_id AND l.owner_id = $2
              )
          )
        RETURNING borrowing_id, status, responded_at
        `,
        [borrowingId, userId]
    );
    return result.rows[0] ?? null;
}

export async function updateBorrowingStatus(borrowingId, userId, status) {
    let result;

    if (status === 'CANCELLED') {
        result = await query(
            `
            UPDATE borrowings b
            SET status = 'CANCELLED', responded_at =
                CASE WHEN b.status = 'PENDING' THEN NOW() ELSE b.responded_at END
            WHERE b.borrowing_id = $1
              AND (
                  b.borrower_id = $2
                  OR EXISTS (
                      SELECT 1 FROM listings l
                      WHERE l.listing_id = b.listing_id AND l.owner_id = $2
                  )
              )
              AND b.status IN ('PENDING', 'BOOKED')
            RETURNING borrowing_id, status, responded_at
            `,
            [borrowingId, userId]
        );
    } else if (status === 'RETURNED') {
        result = await query(
            `
            UPDATE borrowings b
            SET status = 'RETURNED'
            WHERE b.borrowing_id = $1
              AND b.status = 'ACTIVE'
              AND (
                  b.borrower_id = $2
                  OR EXISTS (
                      SELECT 1 FROM listings l
                      WHERE l.listing_id = b.listing_id AND l.owner_id = $2
                  )
              )
            RETURNING borrowing_id, status, responded_at
            `,
            [borrowingId, userId]
        );
    } else {
        throw Object.assign(new Error('status must be RETURNED or CANCELLED'), { status: 400 });
    }

    return result.rows[0] ?? null;
}
