import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';

import {
    createListingController,
    getListingsController,
    getListingByIdController
} from '../controllers/listingController.js';

const router = Router();

router.get('/', requireAuth, getListingsController);
router.get('/:id', requireAuth, getListingByIdController);
router.post('/', requireAuth, createListingController);

export default router;