import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import {
    getTransactionHistoryController,
    getTransactionByIdController,
    completeTransactionController
} from '../controllers/transactionController.js';

const router = Router();

router.get('/mine', requireAuth, getTransactionHistoryController);
router.get('/:id', requireAuth, getTransactionByIdController);
router.patch('/:id/complete', requireAuth, completeTransactionController);

export default router;
