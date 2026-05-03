// src/middleware/errorHandler.js
import { AppError } from '../utils/appError.js';
import logger       from '../utils/logger.js';

const handleDuplicateEntry = (err) => {
  const match   = err.message.match(/Duplicate entry '(.+?)' for key '(.+?)'/);
  const value   = match?.[1] ?? 'unknown';
  const rawKey  = match?.[2] ?? '';
  const keyPart = rawKey.includes('.') ? rawKey.split('.').pop() : rawKey;
  const key     = keyPart || 'field';
  return new AppError(`'${value}' is already registered for ${key}. Please use a different value.`, 409);
};  

const handleForeignKeyViolation    = () => new AppError('Invalid reference: the related resource does not exist.', 400);
const handleReferencedRowViolation = () => new AppError('Cannot delete: this resource is referenced by other records.', 409);
const handleDBQueueTimeout         = () => new AppError('Server is under heavy load. Please try again in a moment.', 503);
const handleDBConnectionLost       = () => new AppError('Database connection was lost. Please try again.', 503);
const handleQueryExecutionTimeout  = () => new AppError('The request took too long to process. Please try again.', 503);
const handleJWTInvalid             = () => new AppError('Invalid token. Please log in again.', 401);
const handleJWTExpired             = () => new AppError('Your session has expired. Please log in again.', 401);

const sendErrorDev = (err, req, res) => {
  logger.error('DEV ERROR', { error: err.message, stack: err.stack, url: req.originalUrl, method: req.method, body: req.body });
  return res.status(err.statusCode).json({
    success: false, message: err.message, statusCode: err.statusCode,
    errors: err.errors || undefined, stack: err.stack,
    request: { url: req.originalUrl, method: req.method, body: req.body }
  });
};

const sendErrorProd = (err, req, res) => {
  if (err.isOperational) {
    logger.warn('Operational error', { message: err.message, statusCode: err.statusCode, url: req.originalUrl, userId: req.user?.userId });
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.errors && { errors: err.errors }),
    });
  }
  logger.error('UNKNOWN ERROR — investigate immediately', { error: err.message, stack: err.stack, url: req.originalUrl, userId: req.user?.userId });
  return res.status(500).json({ success: false, message: 'Something went wrong. Please try again later.' });
};

export const globalErrorHandler = (err, req, res, next) => {
  let error = Object.assign(Object.create(Object.getPrototypeOf(err)), err);
  error.message = err.message; error.stack = err.stack;
  error.statusCode = err.statusCode || 500; 
  error.status = err.status || 'error';

  if (err.code === 'ER_DUP_ENTRY')              error = handleDuplicateEntry(err);
  else if (err.code === 'ER_NO_REFERENCED_ROW_2') error = handleForeignKeyViolation();
  else if (err.code === 'ER_ROW_IS_REFERENCED_2') error = handleReferencedRowViolation();
  else if (err.code === 'ER_LOCK_DEADLOCK')       error = new AppError('Request conflicted with another operation. Please try again.', 409);
  else if (['PROTOCOL_CONNECTION_LOST','ECONNREFUSED','ETIMEDOUT','ENOTFOUND'].includes(err.code)) error = handleDBConnectionLost();
  else if (err.message?.startsWith('DB_QUEUE_TIMEOUT'))           error = handleDBQueueTimeout();
  else if (err.message?.startsWith('DB_QUERY_EXECUTION_TIMEOUT')) error = handleQueryExecutionTimeout();
  else if (err.name === 'JsonWebTokenError')  error = handleJWTInvalid();
  else if (err.name === 'TokenExpiredError')  error = handleJWTExpired();

  if (process.env.NODE_ENV === 'development') {
    return sendErrorDev(error, req, res);
  }

  return sendErrorProd(error, req, res);
};

export const notFoundHandler = (req, _res, next) => {
  next(new AppError(`Cannot ${req.method} ${req.originalUrl} — route not found.`, 404));
};