// src/utils/imgbb.js
// Handles ImgBB image cleanup.
// Call deleteImgBBImages(deleteUrls) before removing any question rows from DB.
// ImgBB delete URLs are stored in questions.question_image_delete_url.

import logger from './logger.js';

/**
 * Calls ImgBB's delete endpoint for each supplied URL.
 * Failures are logged but never throw — a failed image delete must NOT
 * block the DB deletion (worst case: a few orphan images, never a stuck TX).
 *
 * @param {string[]} deleteUrls  Array of ImgBB delete URLs to call.
 */
export const deleteImgBBImages = async (deleteUrls) => {
  const urls = (deleteUrls || []).filter(Boolean);
  if (!urls.length) return;

  // Fire all deletes in parallel — ImgBB delete URLs are idempotent GET requests.
  const results = await Promise.allSettled(
    urls.map(url =>
      fetch(url, { method: 'GET', signal: AbortSignal.timeout(8000) })
        .then(res => {
          if (!res.ok) {
            logger.warn('ImgBB delete non-2xx', { url, status: res.status });
          }
        })
    )
  );

  // Log any network failures but swallow them
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      logger.error('ImgBB delete failed', { url: urls[i], reason: r.reason?.message });
    }
  });
};
