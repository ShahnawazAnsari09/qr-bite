'use strict';

const { ZodError } = require('zod');
const ApiError = require('../lib/ApiError');

/**
 * Server-side validation of every client-submitted payload (Chapter 4.4
 * "Input Validation"). The parsed result replaces the raw input so downstream
 * handlers only ever see coerced, stripped values.
 */
function validate(schemas) {
  return function runValidation(req, _res, next) {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) {
        // req.query is a getter-only property on Express 5 style requests;
        // assigning to a local keeps this compatible either way.
        const parsed = schemas.query.parse(req.query);
        Object.defineProperty(req, 'validatedQuery', { value: parsed, writable: true });
        req.query = parsed;
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          message: issue.message,
        }));
        return next(ApiError.unprocessable('Validation failed', details));
      }
      return next(err);
    }
  };
}

module.exports = validate;
