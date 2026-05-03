import { Router } from 'express';
import { uploadSingleImage } from '../controllers/media.controller.js';
import { uploadImage } from '../middleware/upload.middleware.js';
import { protect, restrictTo } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/upload',
  protect,
  restrictTo('Staff', 'Dept Head', 'Admin'),
  uploadImage.single('image'),
  uploadSingleImage
);

export default router;