import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import {
    createReviewController,
    getReviewsForUserController
} from '../controllers/reviewController.js';

const router = Router();

router.post('/', requireAuth, createReviewController);
router.get('/user/:id', requireAuth, getReviewsForUserController);

export default router;
