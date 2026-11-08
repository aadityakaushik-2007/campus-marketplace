import crypto from 'node:crypto';

import { pool, query } from '../db.js';
import { LISTING_IMAGES_BUCKET, supabase } from '../supabase.js';

const listingSelect = `
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
    l.updated_at,
    (
        SELECT MAX(b.end_time)
        FROM borrowings b
        WHERE b.listing_id = l.listing_id
          AND b.status IN ('BOOKED', 'ACTIVE')
          AND b.end_time > NOW()
    ) AS borrowed_until,
    COALESCE(
        json_agg(li.image_url ORDER BY li.image_id)
        FILTER (WHERE li.image_id IS NOT NULL),
        '[]'
    ) AS images
`;

export async function createListing({
    ownerId, categoryId, title, description, type, price, pricePerDay, images = []
}) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const result = await client.query(
            `
            INSERT INTO listings
                (owner_id, category_id, title, description, type, price, price_per_day)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING listing_id, owner_id, category_id, title, description,
                      type, price, price_per_day, status, created_at, updated_at
            `,
            [ownerId, categoryId, title, description, type, price, pricePerDay]
        );

        const listing = result.rows[0];

        for (const image of images) {
            await client.query(
                `INSERT INTO listing_images (listing_id, image_url) VALUES ($1, $2)`,
                [listing.listing_id, image]
            );
        }

        await client.query('COMMIT');
        listing.images = images;
        return listing;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function getListings(filters = {}) {
    const values = [];
    const conditions = [`l.status = 'ACTIVE'`];

    if (filters.query) {
        values.push(`%${filters.query}%`);
        conditions.push(`(l.title ILIKE $${values.length} OR l.description ILIKE $${values.length})`);
    }

    if (filters.categoryId !== undefined) {
        values.push(filters.categoryId);
        conditions.push(`l.category_id = $${values.length}`);
    }

    if (filters.type) {
        values.push(filters.type);
        conditions.push(`l.type = $${values.length}`);
    }

    if (filters.minPrice !== undefined) {
        values.push(filters.minPrice);
        conditions.push(`(
            (l.type = 'SELL' AND l.price >= $${values.length})
            OR (l.type = 'BORROW' AND l.price_per_day >= $${values.length})
        )`);
    }

    if (filters.maxPrice !== undefined) {
        values.push(filters.maxPrice);
        conditions.push(`(
            (l.type = 'SELL' AND l.price <= $${values.length})
            OR (l.type = 'BORROW' AND l.price_per_day <= $${values.length})
        )`);
    }

    const result = await query(
        `
        SELECT ${listingSelect}
        FROM listings l
        JOIN users u ON u.user_id = l.owner_id
        JOIN categories c ON c.category_id = l.category_id
        LEFT JOIN listing_images li ON li.listing_id = l.listing_id
        WHERE ${conditions.join(' AND ')}
        GROUP BY l.listing_id, u.name, c.name
        ORDER BY l.created_at DESC
        `,
        values
    );

    return result.rows;
}

export async function getListingById(listingId) {
    const result = await query(
        `
        SELECT ${listingSelect}
        FROM listings l
        JOIN users u ON u.user_id = l.owner_id
        JOIN categories c ON c.category_id = l.category_id
        LEFT JOIN listing_images li ON li.listing_id = l.listing_id
        WHERE l.listing_id = $1
        GROUP BY l.listing_id, u.name, c.name
        `,
        [listingId]
    );
    return result.rows[0] ?? null;
}

export async function getListingsByOwner(ownerId) {
    const result = await query(
        `
        SELECT ${listingSelect}
        FROM listings l
        JOIN users u ON u.user_id = l.owner_id
        JOIN categories c ON c.category_id = l.category_id
        LEFT JOIN listing_images li ON li.listing_id = l.listing_id
        WHERE l.owner_id = $1
        GROUP BY l.listing_id, u.name, c.name
        ORDER BY l.created_at DESC
        `,
        [ownerId]
    );
    return result.rows;
}

export async function getActiveListingsByOwner(ownerId) {
    const result = await query(
        `
        SELECT ${listingSelect}
        FROM listings l
        JOIN users u ON u.user_id = l.owner_id
        JOIN categories c ON c.category_id = l.category_id
        LEFT JOIN listing_images li ON li.listing_id = l.listing_id
        WHERE l.owner_id = $1 AND l.status = 'ACTIVE'
        GROUP BY l.listing_id, u.name, c.name
        ORDER BY l.created_at DESC
        `,
        [ownerId]
    );
    return result.rows;
}

export async function removeListing(listingId, ownerId) {
    const result = await query(
        `
        UPDATE listings
        SET status = 'REMOVED'
        WHERE listing_id = $1 AND owner_id = $2 AND status = 'ACTIVE'
        RETURNING listing_id, status, updated_at
        `,
        [listingId, ownerId]
    );
    return result.rows[0] ?? null;
}

export async function addListingImage(listingId, ownerId, file) {
    const owner = await query(
        `SELECT listing_id FROM listings WHERE listing_id = $1 AND owner_id = $2`,
        [listingId, ownerId]
    );

    if (owner.rowCount !== 1) return null;

    const extensionByMimeType = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp'
    };
    const extension = extensionByMimeType[file.mimetype];
    if (!extension) {
        throw Object.assign(new Error('Unsupported image type'), { status: 400 });
    }

    const objectPath = `listing-${listingId}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
        .from(LISTING_IMAGES_BUCKET)
        .upload(objectPath, file.buffer, {
            contentType: file.mimetype,
            upsert: false
        });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
        .from(LISTING_IMAGES_BUCKET)
        .getPublicUrl(objectPath);

    try {
        const result = await query(
            `
            INSERT INTO listing_images (listing_id, image_url)
            VALUES ($1, $2)
            RETURNING image_id, listing_id, image_url, created_at
            `,
            [listingId, publicUrlData.publicUrl]
        );

        return result.rows[0];
    } catch (error) {
        await supabase.storage.from(LISTING_IMAGES_BUCKET).remove([objectPath]);
        throw error;
    }
}

export async function removeListingImage(listingId, ownerId, imageId) {
    const result = await query(
        `
        DELETE FROM listing_images li
        USING listings l
        WHERE li.image_id = $1
          AND li.listing_id = $2
          AND l.listing_id = li.listing_id
          AND l.owner_id = $3
        RETURNING li.image_id, li.listing_id, li.image_url
        `,
        [imageId, listingId, ownerId]
    );

    const image = result.rows[0] ?? null;
    if (!image) return null;

    const prefix = `/storage/v1/object/public/${LISTING_IMAGES_BUCKET}/`;
    const marker = image.image_url.indexOf(prefix);
    if (marker !== -1) {
        const objectPath = decodeURIComponent(image.image_url.slice(marker + prefix.length));
        const { error: storageError } = await supabase.storage
            .from(LISTING_IMAGES_BUCKET)
            .remove([objectPath]);

        if (storageError) {
            console.error('Failed to remove image from Supabase Storage:', storageError);
        }
    }

    return image;
}

export async function getListingOwner(listingId) {
    const result = await query(
        `SELECT owner_id FROM listings WHERE listing_id = $1`,
        [listingId]
    );
    return result.rows[0] ?? null;
}
