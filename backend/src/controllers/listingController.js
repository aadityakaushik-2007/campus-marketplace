import {
    createListing,
    getListings,
    getListingById,
    getListingsByOwner,
    removeListing,
    addListingImage,
    removeListingImage
} from '../services/listingService.js';

function positiveId(value, label) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
        throw Object.assign(new Error(`Invalid ${label}`), { status: 400 });
    }
    return id;
}

function validateOptionalPrice(value, field) {
    if (value === undefined) return;
    if (Number.isNaN(Number(value)) || Number(value) < 0) {
        throw Object.assign(new Error(`${field} must be a non-negative number`), { status: 400 });
    }
}

export async function createListingController(req, res, next) {
    try {
        const { category_id, title, description, type, price, price_per_day, images } = req.body;

        if (category_id === undefined || title === undefined || type === undefined) {
            return res.status(400).json({ error: 'category_id, title, and type are required' });
        }
        if (typeof title !== 'string' || title.trim() === '') {
            return res.status(400).json({ error: 'title must be a non-empty string' });
        }
        if (!['SELL', 'BORROW'].includes(type)) {
            return res.status(400).json({ error: 'type must be SELL or BORROW' });
        }

        if (type === 'SELL' && (price === undefined || price === null)) {
            return res.status(400).json({ error: 'price is required for SELL listings' });
        }
        if (type === 'SELL' && price_per_day !== undefined && price_per_day !== null) {
            return res.status(400).json({ error: 'price_per_day must not be provided for SELL listings' });
        }
        if (type === 'BORROW' && (price_per_day === undefined || price_per_day === null)) {
            return res.status(400).json({ error: 'price_per_day is required for BORROW listings' });
        }
        if (type === 'BORROW' && price !== undefined && price !== null) {
            return res.status(400).json({ error: 'price must not be provided for BORROW listings' });
        }

        validateOptionalPrice(price, 'price');
        validateOptionalPrice(price_per_day, 'price_per_day');

        const categoryId = positiveId(category_id, 'category id');

        if (images !== undefined) {
            if (!Array.isArray(images) || images.some(image => typeof image !== 'string' || image.trim() === '')) {
                return res.status(400).json({ error: 'images must be an array of non-empty strings' });
            }
        }

        const listing = await createListing({
            ownerId: req.user.user_id,
            categoryId,
            title: title.trim(),
            description: description ?? null,
            type,
            price: type === 'SELL' ? price : null,
            pricePerDay: type === 'BORROW' ? price_per_day : null,
            images: (images ?? []).map(image => image.trim())
        });

        res.status(201).json({ listing });
    } catch (error) {
        next(error);
    }
}

export async function getListingsController(req, res, next) {
    try {
        const { query, category_id, type, min_price, max_price } = req.query;

        if (type !== undefined && !['SELL', 'BORROW'].includes(type)) {
            return res.status(400).json({ error: 'type must be SELL or BORROW' });
        }

        for (const [value, field] of [[min_price, 'min_price'], [max_price, 'max_price']]) {
            if (value !== undefined && (Number.isNaN(Number(value)) || Number(value) < 0)) {
                return res.status(400).json({ error: `${field} must be a non-negative number` });
            }
        }

        const categoryId = category_id === undefined ? undefined : positiveId(category_id, 'category id');

        const listings = await getListings({
            query: typeof query === 'string' && query.trim() ? query.trim() : undefined,
            categoryId,
            type,
            minPrice: min_price,
            maxPrice: max_price
        });

        res.json({ listings });
    } catch (error) {
        next(error);
    }
}

export async function getListingByIdController(req, res, next) {
    try {
        const listingId = positiveId(req.params.id, 'listing id');
        const listing = await getListingById(listingId);

        if (!listing) return res.status(404).json({ error: 'Listing not found' });
        res.json({ listing });
    } catch (error) {
        next(error);
    }
}

export async function getOwnListingsController(req, res, next) {
    try {
        res.json({ listings: await getListingsByOwner(req.user.user_id) });
    } catch (error) {
        next(error);
    }
}

export async function removeListingController(req, res, next) {
    try {
        const listingId = positiveId(req.params.id, 'listing id');
        const listing = await removeListing(listingId, req.user.user_id);

        if (!listing) {
            return res.status(404).json({
                error: 'Active listing not found or you are not the owner'
            });
        }

        res.json({ listing });
    } catch (error) {
        next(error);
    }
}

export async function addListingImageController(req, res, next) {
    try {
        const listingId = positiveId(req.params.id, 'listing id');
        if (!req.file) {
            return res.status(400).json({ error: 'image file is required' });
        }

        const image = await addListingImage(listingId, req.user.user_id, req.file);

        if (!image) {
            return res.status(404).json({ error: 'Listing not found or you are not the owner' });
        }

        res.status(201).json({ image });
    } catch (error) {
        next(error);
    }
}

export async function removeListingImageController(req, res, next) {
    try {
        const listingId = positiveId(req.params.id, 'listing id');
        const imageId = positiveId(req.params.imageId, 'image id');

        const image = await removeListingImage(listingId, req.user.user_id, imageId);

        if (!image) return res.status(404).json({ error: 'Image not found or you are not the owner' });

        res.json({ image });
    } catch (error) {
        next(error);
    }
}
