import { query } from '../db.js';

export async function createListing({
    ownerId,
    categoryId,
    title,
    description,
    type,
    price,
    pricePerDay
}) {
    const result = await query(
        `
        INSERT INTO listings (
            owner_id,
            category_id,
            title,
            description,
            type,
            price,
            price_per_day
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING
            listing_id,
            owner_id,
            category_id,
            title,
            description,
            type,
            price,
            price_per_day,
            status,
            created_at,
            updated_at
        `,
        [
            ownerId,
            categoryId,
            title,
            description,
            type,
            price,
            pricePerDay
        ]
    );

    return result.rows[0];
}

export async function getListings() {
    const result = await query(
        `
        SELECT
            l.listing_id,
            l.owner_id,
            u.name AS owner_name,
            l.category_id,
            c.name AS category_name,
            l.title,
            l.description,
            l.type,
            l.price,
            l.price_per_day,
            l.status,
            l.created_at,
            l.updated_at
        FROM listings l
        JOIN users u
            ON u.user_id = l.owner_id
        JOIN categories c
            ON c.category_id = l.category_id
        WHERE l.status = 'ACTIVE'
        ORDER BY l.created_at DESC
        `
    );

    return result.rows;
}

export async function getListingById(listingId) {
    const result = await query(
        `
        SELECT
            l.listing_id,
            l.owner_id,
            u.name AS owner_name,
            l.category_id,
            c.name AS category_name,
            l.title,
            l.description,
            l.type,
            l.price,
            l.price_per_day,
            l.status,
            l.created_at,
            l.updated_at
        FROM listings l
        JOIN users u
            ON u.user_id = l.owner_id
        JOIN categories c
            ON c.category_id = l.category_id
        WHERE l.listing_id = $1
        `,
        [listingId]
    );

    return result.rows[0] ?? null;
}