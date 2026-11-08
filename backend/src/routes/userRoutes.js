import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import {
    getCurrentUser,
    getUserProfileController,
    updateCurrentUser,
    searchUsersController
} from '../controllers/userController.js';

const router = Router();

router.get('/me', requireAuth, getCurrentUser);
router.patch('/me', requireAuth, updateCurrentUser);
router.get('/search', requireAuth, searchUsersController);
router.get('/:id', getUserProfileController);

export default router;
