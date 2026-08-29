import {
    createPurchaseRequest,
    getPurchaseRequestsByBuyer,
    getIncomingPurchaseRequests,
    rejectPurchaseRequest,
    cancelPurchaseRequest,
    acceptPurchaseRequest
} from '../services/purchaseRequestService.js';

function positiveId(value, label) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) {
        throw Object.assign(new Error(`Invalid ${label}`), { status: 400 });
    }
    return n;
}

export async function createPurchaseRequestController(req, res, next) {
    try {
        const listingId = positiveId(req.body.listing_id, 'listing id');

        const request = await createPurchaseRequest(
            listingId,
            req.user.user_id
        );

        res.status(201).json({ purchase_request: request });
    } catch (error) {
        next(error);
    }
}

export async function getOwnPurchaseRequestsController(req, res, next) {
    try {
        res.json({
            purchase_requests: await getPurchaseRequestsByBuyer(req.user.user_id)
        });
    } catch (error) {
        next(error);
    }
}

export async function getIncomingPurchaseRequestsController(req, res, next) {
    try {
        res.json({
            purchase_requests: await getIncomingPurchaseRequests(req.user.user_id)
        });
    } catch (error) {
        next(error);
    }
}

export async function decidePurchaseRequestController(req, res, next) {
    try {
        const requestId = positiveId(req.params.id, 'request id');
        const decision = String(req.body.decision || '').toUpperCase();

        if (!['ACCEPT', 'REJECT'].includes(decision)) {
            return res.status(400).json({ error: 'decision must be ACCEPT or REJECT' });
        }

        if (decision === 'REJECT') {
            const request = await rejectPurchaseRequest(
                requestId,
                req.user.user_id
            );

            if (!request) {
                return res.status(404).json({
                    error: 'Pending purchase request not found or you are not the seller'
                });
            }

            return res.json({ purchase_request: request });
        }

        const transaction = await acceptPurchaseRequest(
            requestId,
            req.user.user_id
        );

        if (!transaction) {
            return res.status(404).json({
                error: 'Pending purchase request not found or you are not the seller'
            });
        }

        res.status(201).json({ transaction });
    } catch (error) {
        next(error);
    }
}

export async function cancelPurchaseRequestController(req, res, next) {
    try {
        const request = await cancelPurchaseRequest(
            positiveId(req.params.id, 'request id'),
            req.user.user_id
        );

        if (!request) {
            return res.status(404).json({
                error: 'Pending purchase request not found or you are not the buyer'
            });
        }

        res.json({ purchase_request: request });
    } catch (error) {
        next(error);
    }
}
