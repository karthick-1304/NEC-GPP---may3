// src/middleware/requestLogger.js
import logger from '../utils/logger.js';

export const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.logRequest(req, res, Date.now() - start);
  });
  next();
};