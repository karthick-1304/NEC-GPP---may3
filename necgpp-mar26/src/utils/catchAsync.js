// src/utils/catchAsync.js
export const catchAsync = (fn) => (req, res, next) => {
  fn(req, res, next).catch(next);
};