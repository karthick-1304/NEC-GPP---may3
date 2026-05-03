// src/middleware/sanitizer.js
import logger from '../utils/logger.js';

const HTML_ALLOWED_FIELDS = new Set([
  'question_text',
  'option_a', 'option_b', 'option_c', 'option_d',
  'explanation',
]);

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const SUSPICIOUS_PATTERNS = [
  /<script/i, /javascript:/i, /on\w+\s*=/i,
  /<iframe/i, /eval\s*\(/i, /expression\s*\(/i,
  /vbscript:/i, /<object/i, /<embed/i,
];

const sanitizeHTML = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]*/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/data:text\/html/gi, '')
    .replace(/<(iframe|object|embed|applet|form)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(iframe|object|embed|applet|form)\b[^>]*\/>/gi, '');
};

const stripHTML = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '').trim();
};

const checkAndLogSuspicious = (value, fieldPath, req) => {
  if (typeof value !== 'string') return;
  if (SUSPICIOUS_PATTERNS.some(p => p.test(value))) {
    logger.logSecurityEvent('XSS_ATTEMPT_DETECTED', req, {
      field: fieldPath,
      value: value.substring(0, 150),
    });
  }
};

const sanitizeObject = (obj, req, parentKey = '') => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item, i) => sanitizeObject(item, req, `${parentKey}[${i}]`));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (DANGEROUS_KEYS.has(key)) {
      logger.logSecurityEvent('PROTOTYPE_POLLUTION_ATTEMPT', req, { key, parentKey: parentKey || 'root' });
      continue;
    }
    const fullPath = parentKey ? `${parentKey}.${key}` : key;
    if (typeof value === 'string') {
      checkAndLogSuspicious(value, fullPath, req);
      result[key] = HTML_ALLOWED_FIELDS.has(key) ? sanitizeHTML(value) : stripHTML(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObject(value, req, fullPath);
    } else {
      result[key] = value;
    }
  }
  return result;
};

export const sanitizeInput = (req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body, req);
  }
  // Express 5: req.query is a per-access getter — assigning to req.query[key]
  // can be lost by the time downstream handlers read it. Rebuild in-place by
  // delete + reassign, the same pattern validate.js uses.
  if (req.query && typeof req.query === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(req.query)) {
      if (DANGEROUS_KEYS.has(key)) {
        logger.logSecurityEvent('PROTOTYPE_POLLUTION_ATTEMPT', req, { key, parentKey: 'query' });
        continue;
      }
      if (typeof value === 'string') {
        checkAndLogSuspicious(value, `query.${key}`, req);
        sanitized[key] = stripHTML(value);
      } else {
        sanitized[key] = value;
      }
    }
    Object.keys(req.query).forEach(k => delete req.query[k]);
    Object.assign(req.query, sanitized);
  }
  next();
};