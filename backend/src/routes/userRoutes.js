import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import {
    getCurrentUser,
    updateCurrentUser
} from '../controllers/userController.js';

const router = Router();

router.get('/me', requireAuth, getCurrentUser);
router.patch('/me', requireAuth, updateCurrentUser);

export default router;