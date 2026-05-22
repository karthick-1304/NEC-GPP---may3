// src/utils/appError.js
export class AppError extends Error {
  /**
   * @param {string}  message
   * @param {number}  statusCode
   * @param {Array|null} errors
   * @param {object}  [opts]
   * @param {'info'|'warn'|'error'} [opts.logLevel]
   *   Override the level the global error handler uses for this error.
   *
   *   Use `'info'` for *expected* failure states that aren't really errors —
   *   the classic case is anonymous visitors hitting `/auth/refresh` (no
   *   cookie → 401). Without this, every public-page visit floods the log
   *   with red `[error]` lines that obscure real problems.
   *
   *   When omitted, the handler picks the default: `error` in dev,
   *   `warn` for operational errors in prod.
   */
  constructor(message, statusCode, errors = null, opts = {}) {
    super(message);
    this.statusCode    = statusCode;
    this.status        = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.errors        = errors;
    this.logLevel      = opts.logLevel ?? null;
    Error.captureStackTrace(this, this.constructor);
  }
}