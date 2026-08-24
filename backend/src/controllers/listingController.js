import {
    createListing,
    getListings,
    getListingById
} from '../services/listingService.js';

export async function createListingController(req, res, next) {
    try {
        const {
            category_id,
            title,
            description,
            type,
            price,
            price_per_day
        } = req.body;

        if (
            category_id === undefined ||
            title === undefined ||
            type === undefined
        ) {
            return res.status(400).json({
                error: 'category_id, title, and type are required'
            });
        }

        if (typeof title !== 'string' || title.trim() === '') {
            return res.status(400).json({
                error: 'title must be a non-empty string'
            });
        }

        if (!['SELL', 'BORROW'].includes(type)) {
            return res.status(400).json({
                error: 'type must be SELL or BORROW'
            });
        }

        if (type === 'SELL') {
            if (price === undefined || price === null) {
                return res.status(400).json({
                    error: 'price is required for SELL listings'
                });
            }

            if (price_per_day !== undefined && price_per_day !== null) {
                return res.status(400).json({
                    error: 'price_per_day must not be provided for SELL listings'
                });
            }
        }

        if (type === 'BORROW') {
            if (price_per_day === undefined || price_per_day === null) {
                return res.status(400).json({
                    error: 'price_per_day is required for BORROW listings'
                });
            }

            if (price !== undefined && price !== null) {
                return res.status(400).json({
                    error: 'price must not be provided for BORROW listings'
                });
            }
        }

        if (Number.isNaN(Number(category_id))) {
            return res.status(400).json({
                error: 'category_id must be a valid number'
            });
        }

        if (Number(price) < 0 || Number(price_per_day) < 0) {
            return res.status(400).json({
                error: 'price values cannot be negative'
            });
        }

        const listing = await createListing({
            ownerId: req.user.user_id,
            categoryId: Number(category_id),
            title: title.trim(),
            description:
                description === undefined || description === null
                    ? null
                    : description,
            type,
            price: type === 'SELL' ? price : null,
            pricePerDay: type === 'BORROW' ? price_per_day : null
        });

        res.status(201).json({
            listing
        });
    } catch (error) {
        next(error);
    }
}

export async function getListingsController(req, res, next) {
    try {
        const listings = await getListings();

        res.json({
            listings
        });
    } catch (error) {
        next(error);
    }
}

export async function getListingByIdController(req, res, next) {
    try {
        const listingId = Number(req.params.id);

        if (!Number.isInteger(listingId) || listingId <= 0) {
            return res.status(400).json({
                error: 'Invalid listing id'
            });
        }

        const listing = await getListingById(listingId);

        if (!listing) {
            return res.status(404).json({
                error: 'Listing not found'
            });
        }

        res.json({
            listing
        });
    } catch (error) {
        next(error);
    }
}