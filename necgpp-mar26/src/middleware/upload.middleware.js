import multer from 'multer';
import { AppError } from '../utils/appError.js';

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp|gif/;
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype) {
    return cb(null, true);
  } else {
    cb(new AppError('Only images are allowed (jpeg, jpg, png, webp, gif)', 400));
  }
};

// memoryStorage keeps file in buffer — we send it directly to imgBB
export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
});