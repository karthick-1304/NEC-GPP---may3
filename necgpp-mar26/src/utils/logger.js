// src/utils/logger.js
import winston           from 'winston';
import path              from 'path';
import fs                from 'fs';
import { fileURLToPath } from 'url';
import { dirname }       from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const logsDir = path.join(__dirname, '../../logs');
fs.mkdirSync(logsDir, { recursive: true });

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const consoleFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let output = `${timestamp} [${level}]: ${stack || message}`;
  if (Object.keys(meta).length > 0) {
    const { service, environment, ...cleanMeta } = meta;
    if (Object.keys(cleanMeta).length > 0) {
      output += `\n${JSON.stringify(cleanMeta, null, 2)}`;
    }
  }
  return output;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    json()
  ),
  defaultMeta: {
    service:     'nec-gate-portal-api',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level:    'error',
      maxsize:  5 * 1024 * 1024,
      maxFiles: 5,
      tailable: true
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize:  5 * 1024 * 1024,
      maxFiles: 10,
      tailable: true
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'http.log'),
      level:    'http',
      maxsize:  5 * 1024 * 1024,
      maxFiles: 3
    })
  ],
  silent: process.env.NODE_ENV === 'test'
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: combine(
      colorize({ all: true }),
      timestamp({ format: 'HH:mm:ss' }),
      consoleFormat
    )
  }));
}

logger.logRequest = (req, res, durationMs) => {
  const data = {
    method:    req.method,
    url:       req.originalUrl,
    status:    res.statusCode,
    duration:  `${durationMs}ms`,
    ip:        req.ip ?? req.socket?.remoteAddress ?? 'unknown',
    userAgent: req.get('user-agent'),
    userId:    req.user?.userId ?? null
  };
  if (res.statusCode >= 500)      logger.error('Server error',  data);
  else if (res.statusCode >= 400) logger.warn('Client error',   data);
  else                            logger.http('HTTP request',   data);
};

logger.logSecurityEvent = (type, req, details = {}) => {
  logger.warn('Security event', {
    type,
    ip:        req.ip ?? req.socket?.remoteAddress ?? 'unknown',
    url:       req.originalUrl,
    method:    req.method,
    userAgent: req.get('user-agent'),
    userId:    req.user?.userId ?? null,
    ...details
  });
};

export default logger;