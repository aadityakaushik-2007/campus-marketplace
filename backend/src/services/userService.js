import { query } from '../db.js';

export async function getUserByAuthId(authUserId) {
    const result = await query(
        `
        SELECT
            user_id,
            auth_user_id,
            name,
            email,
            contact_info,
            created_at
        FROM users
        WHERE auth_user_id = $1
        `,
        [authUserId]
    );

    return result.rows[0] ?? null;
}

export async function createUser({
    authUserId,
    name,
    email
}) {
    const result = await query(
        `
        INSERT INTO users (
            auth_user_id,
            name,
            email
        )
        VALUES ($1, $2, $3)
        RETURNING
            user_id,
            auth_user_id,
            name,
            email,
            contact_info,
            created_at
        `,
        [authUserId, name, email]
    );

    return result.rows[0];
}

export async function getOrCreateUser(authUser) {
    const authUserId = authUser.sub;
    const email = authUser.email;
    const name = authUser.name || authUser.nickname;

    if (!authUserId) {
        throw new Error('Authenticated user has no subject identifier');
    }

    if (!email) {
        throw new Error('Authenticated user has no email');
    }

    if (!name) {
        throw new Error('Authenticated user has no name');
    }

    if (!email.toLowerCase().endsWith('@thapar.edu')) {
        const error = new Error('Only @thapar.edu accounts are allowed');
        error.status = 403;
        throw error;
    }

    const normalizedEmail = email.toLowerCase();

    const existingUser = await getUserByAuthId(authUserId);

    if (existingUser) {
        return existingUser;
    }

    return createUser({
        authUserId,
        name,
        email: normalizedEmail
    });
}