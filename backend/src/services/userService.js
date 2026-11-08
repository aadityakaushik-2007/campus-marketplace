import { query } from '../db.js';

export async function getUserByAuthId(authUserId) {
    const result = await query(
        `
        SELECT user_id, auth_user_id, name, email, contact_info, created_at
        FROM users
        WHERE auth_user_id = $1
        `,
        [authUserId]
    );
    return result.rows[0] ?? null;
}

export async function createUser({ authUserId, name, email }) {
    const result = await query(
        `
        INSERT INTO users (auth_user_id, name, email)
        VALUES ($1, $2, $3)
        RETURNING user_id, auth_user_id, name, email, contact_info, created_at
        `,
        [authUserId, name, email]
    );
    return result.rows[0];
}

export async function getOrCreateUser(authUser) {
    const authUserId = authUser.sub;
    const email = authUser.email;
    const name = authUser.name || authUser.nickname;

    if (!authUserId) throw new Error('Authenticated user has no subject identifier');
    if (!email) throw new Error('Authenticated user has no email');
    if (!name) throw new Error('Authenticated user has no name');

    if (!email.toLowerCase().endsWith('@thapar.edu')) {
        const error = new Error('Only @thapar.edu accounts are allowed');
        error.status = 403;
        throw error;
    }

    const normalizedEmail = email.toLowerCase();
    const existingUser = await getUserByAuthId(authUserId);

    if (existingUser) return existingUser;

    return createUser({
        authUserId,
        name,
        email: normalizedEmail
    });
}

export async function getUserProfile(userId) {
    const userResult = await query(
        `
        SELECT user_id, name, created_at
        FROM users
        WHERE user_id = $1
        `,
        [userId]
    );

    if (!userResult.rows[0]) return null;

    const reviewsResult = await query(
        `
        SELECT
            r.review_id,
            r.rating,
            r.comment,
            r.created_at,
            r.transaction_id,
            r.borrowing_id,
            u.user_id AS reviewer_id,
            u.name AS reviewer_name
        FROM reviews r
        JOIN users u ON u.user_id = r.reviewer_id
        WHERE r.reviewee_id = $1
        ORDER BY r.created_at DESC
        `,
        [userId]
    );

    return {
        ...userResult.rows[0],
        reviews: reviewsResult.rows
    };
}

export async function searchUsers(searchQuery) {
    if (!searchQuery) return [];

    const result = await query(
        `
        SELECT user_id, name
        FROM users
        WHERE name ILIKE $1
        ORDER BY name ASC, user_id ASC
        LIMIT 20
        `,
        [`%${searchQuery}%`]
    );
    return result.rows;
}
