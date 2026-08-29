import {
    getTransactionHistory,
    getTransactionById,
    completeTransaction
} from '../services/transactionService.js';

function positiveId(value, label) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) {
        throw Object.assign(new Error(`Invalid ${label}`), { status: 400 });
    }
    return n;
}

export async function getTransactionHistoryController(req, res, next) {
    try {
        res.json({
            transactions: await getTransactionHistory(req.user.user_id)
        });
    } catch (error) {
        next(error);
    }
}

export async function getTransactionByIdController(req, res, next) {
    try {
        const transaction = await getTransactionById(
            positiveId(req.params.id, 'transaction id'),
            req.user.user_id
        );

        if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

        res.json({ transaction });
    } catch (error) {
        next(error);
    }
}

export async function completeTransactionController(req, res, next) {
    try {
        const transaction = await completeTransaction(
            positiveId(req.params.id, 'transaction id'),
            req.user.user_id
        );

        if (!transaction) {
            return res.status(404).json({
                error: 'Pending transaction not found or you are not a party to it'
            });
        }

        res.json({ transaction });
    } catch (error) {
        next(error);
    }
}
