import {
    createReview,
    getReviewsForUser
} from '../services/reviewService.js';

function positiveId(value, label) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) {
        throw Object.assign(new Error(`Invalid ${label}`), { status: 400 });
    }
    return n;
}

export async function createReviewController(req, res, next) {
    try {
        const dealType = String(req.body.deal_type || '').toUpperCase();
        if (!['T', 'B'].includes(dealType)) {
            return res.status(400).json({ error: 'deal_type must be T or B' });
        }

        const dealId = positiveId(
            dealType === 'T' ? req.body.transaction_id : req.body.borrowing_id,
            dealType === 'T' ? 'transaction id' : 'borrowing id'
        );
        const rating = Number(req.body.rating);

        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'rating must be an integer from 1 to 5' });
        }

        if (req.body.comment !== undefined && req.body.comment !== null &&
            typeof req.body.comment !== 'string') {
            return res.status(400).json({ error: 'comment must be a string or null' });
        }

        const review = await createReview({
            dealType,
            dealId,
            reviewerId: req.user.user_id,
            rating,
            comment: req.body.comment?.trim() || null
        });

        res.status(201).json({ review });
    } catch (error) {
        next(error);
    }
}

export async function getReviewsForUserController(req, res, next) {
    try {
        const userId = positiveId(req.params.id, 'user id');
        const reviews = await getReviewsForUser(userId);
        res.json({ reviews });
    } catch (error) {
        next(error);
    }
}
