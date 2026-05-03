import { catchAsync } from '../utils/catchAsync.js';
import { successResponse } from '../utils/successResponse.js';
import { AppError } from '../utils/appError.js';
import { uploadToImgBB } from '../config/imgbb.js';

export const uploadSingleImage = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new AppError('No image file provided.', 400);
  }

  const result = await uploadToImgBB(
    req.file.buffer,
    req.file.originalname
  );

  return successResponse(res, {
    url:         result.url,
    display_url: result.display_url,
    thumb_url:   result.thumb_url,
    public_id:   result.public_id,
    delete_url:  result.delete_url,
    width:       result.width,
    height:      result.height,
    size:        result.size,
    mime:        result.mime,
    extension:   result.extension,
  }, 'Image uploaded to imgBB successfully.', 201);
});