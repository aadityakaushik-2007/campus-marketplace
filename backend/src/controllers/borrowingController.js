import {
    createBorrowing,
    getBorrowingsByBorrower,
    getIncomingBorrowings,
    decideBorrowing,
    activateBorrowing,
    updateBorrowingStatus
} from '../services/borrowingService.js';

function positiveId(value, label) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) {
        throw Object.assign(new Error(`Invalid ${label}`), { status: 400 });
    }
    return n;
}

export async function createBorrowingController(req, res, next) {
    try {
        const { listing_id, start_time, end_time } = req.body;

        if (!listing_id || !start_time || !end_time) {
            return res.status(400).json({
                error: 'listing_id, start_time, and end_time are required'
            });
        }

        const borrowing = await createBorrowing({
            listingId: positiveId(listing_id, 'listing id'),
            borrowerId: req.user.user_id,
            startTime: start_time,
            endTime: end_time
        });

        res.status(201).json({ borrowing });
    } catch (error) {
        next(error);
    }
}

export async function getOwnBorrowingsController(req, res, next) {
    try {
        res.json({ borrowings: await getBorrowingsByBorrower(req.user.user_id) });
    } catch (error) {
        next(error);
    }
}

export async function getIncomingBorrowingsController(req, res, next) {
    try {
        res.json({ borrowings: await getIncomingBorrowings(req.user.user_id) });
    } catch (error) {
        next(error);
    }
}

export async function decideBorrowingController(req, res, next) {
    try {
        const borrowingId = positiveId(req.params.id, 'borrowing id');
        const decision = String(req.body.decision || '').toUpperCase();

        if (!['ACCEPT', 'REJECT'].includes(decision)) {
            return res.status(400).json({ error: 'decision must be ACCEPT or REJECT' });
        }

        const borrowing = await decideBorrowing(
            borrowingId,
            req.user.user_id,
            decision
        );

        if (!borrowing) {
            return res.status(404).json({
                error: 'Pending borrow request not found or you are not the listing owner'
            });
        }

        res.json({ borrowing });
    } catch (error) {
        next(error);
    }
}

export async function activateBorrowingController(req, res, next) {
    try {
        const borrowing = await activateBorrowing(
            positiveId(req.params.id, 'borrowing id'),
            req.user.user_id
        );

        if (!borrowing) {
            return res.status(404).json({
                error: 'BOOKED borrowing not found or you are not a party to it'
            });
        }

        res.json({ borrowing });
    } catch (error) {
        next(error);
    }
}

export async function updateBorrowingStatusController(req, res, next) {
    try {
        const borrowingId = positiveId(req.params.id, 'borrowing id');
        const status = String(req.body.status || '').toUpperCase();

        const borrowing = await updateBorrowingStatus(
            borrowingId,
            req.user.user_id,
            status
        );

        if (!borrowing) {
            return res.status(404).json({
                error: 'Borrowing not found, invalid status transition, or you are not a party to the borrowing'
            });
        }

        res.json({ borrowing });
    } catch (error) {
        next(error);
    }
}
