import { Router } from 'express';
import multer from 'multer';

import { requireAuth } from '../middleware/auth.js';
import {
    createListingController,
    getListingsController,
    getListingByIdController,
    getOwnListingsController,
    removeListingController,
    addListingImageController,
    removeListingImageController
} from '../controllers/listingController.js';

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
            return callback(Object.assign(new Error('Only JPEG, PNG, and WebP images are allowed'), { status: 400 }));
        }
        callback(null, true);
    }
});

// Browsing public marketplace listings does not require an account.
router.get('/', getListingsController);
router.get('/mine', requireAuth, getOwnListingsController);
router.get('/:id', getListingByIdController);
router.post('/', requireAuth, createListingController);
router.patch('/:id/status', requireAuth, removeListingController);
router.post('/:id/images', requireAuth, upload.single('image'), addListingImageController);
router.delete('/:id/images/:imageId', requireAuth, removeListingImageController);

export default router;
