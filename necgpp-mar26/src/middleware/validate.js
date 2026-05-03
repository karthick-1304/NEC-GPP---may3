// src/middleware/validate.js
import { AppError } from '../utils/appError.js';

const runValidation = (schema, source, label) => (req, _res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly:   false,
    stripUnknown: true,
    convert:      true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field:   detail.path.join('.'),
      message: detail.message.replace(/['"]/g, '')
    }));
    return next(new AppError(`${label} failed`, 400, errors));
  }

  if (source === 'query') {
    Object.keys(req.query).forEach(key => delete req.query[key]);
    Object.assign(req.query, value);
  } else {
    req[source] = value;
  }
  next();
};

export const validate       = (schema) => runValidation(schema, 'body',   'Validation');
export const validateQuery  = (schema) => runValidation(schema, 'query',  'Query validation');
export const validateParams = (schema) => runValidation(schema, 'params', 'Parameter validation');