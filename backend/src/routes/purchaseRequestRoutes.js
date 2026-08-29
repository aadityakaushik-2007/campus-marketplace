import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import {
    createPurchaseRequestController,
    getOwnPurchaseRequestsController,
    getIncomingPurchaseRequestsController,
    decidePurchaseRequestController,
    cancelPurchaseRequestController
} from '../controllers/purchaseRequestController.js';

const router = Router();

router.get('/mine', requireAuth, getOwnPurchaseRequestsController);
router.get('/incoming', requireAuth, getIncomingPurchaseRequestsController);
router.post('/', requireAuth, createPurchaseRequestController);
router.patch('/:id/decision', requireAuth, decidePurchaseRequestController);
router.patch('/:id/cancel', requireAuth, cancelPurchaseRequestController);

export default router;
