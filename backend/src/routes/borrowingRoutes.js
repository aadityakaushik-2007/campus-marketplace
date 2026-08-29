import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import {
    createBorrowingController,
    getOwnBorrowingsController,
    getIncomingBorrowingsController,
    decideBorrowingController,
    activateBorrowingController,
    updateBorrowingStatusController
} from '../controllers/borrowingController.js';

const router = Router();

router.get('/mine', requireAuth, getOwnBorrowingsController);
router.get('/incoming', requireAuth, getIncomingBorrowingsController);
router.post('/', requireAuth, createBorrowingController);
router.patch('/:id/decision', requireAuth, decideBorrowingController);
router.patch('/:id/activate', requireAuth, activateBorrowingController);
router.patch('/:id/status', requireAuth, updateBorrowingStatusController);

export default router;
