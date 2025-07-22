const { param, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// SECURITY FIX: Route parameter validation middleware

// Validate UUID parameters (for IDs)
const validateUuidParam = (paramName) => [
  param(paramName)
    .matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .withMessage(`${paramName} must be a valid UUID`)
    .customSanitizer((value) => {
      return value.toLowerCase().replace(/[^a-f0-9-]/g, '');
    })
];

// Validate alphanumeric IDs (e.g., cuid, custom IDs)
const validateAlphanumericId = (paramName) => [
  param(paramName)
    .isAlphanumeric()
    .isLength({ min: 1, max: 50 })
    .withMessage(`${paramName} must be alphanumeric and 1-50 characters`)
    .customSanitizer((value) => {
      return String(value).replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
    })
];

// Validate job IDs (BullMQ format)
const validateJobId = [
  param('jobId')
    .matches(/^[0-9]+$/)
    .withMessage('Job ID must be a numeric string')
    .customSanitizer((value) => {
      return String(value).replace(/[^0-9]/g, '').slice(0, 20);
    })
];

// Validate event IDs (various formats)
const validateEventId = [
  param('eventId')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .isLength({ min: 1, max: 100 })
    .withMessage('Event ID must be alphanumeric with underscores/hyphens, 1-100 characters')
    .customSanitizer((value) => {
      return String(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
    })
];

// Validate task IDs (Airtable format)
const validateTaskId = [
  param('taskId')
    .matches(/^[a-zA-Z0-9]+$/)
    .isLength({ min: 1, max: 50 })
    .withMessage('Task ID must be alphanumeric, 1-50 characters')
    .customSanitizer((value) => {
      return String(value).replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
    })
];

// Validate integration IDs
const validateIntegrationId = [
  param('integrationId')
    .isIn(['google', 'airtable', 'apple'])
    .withMessage('Integration ID must be one of: google, airtable, apple')
];

// Validate service names
const validateServiceName = [
  param('serviceName')
    .isIn(['calendar', 'email', 'tasks', 'weather'])
    .withMessage('Service name must be one of: calendar, email, tasks, weather')
];

// Generic parameter validation handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('Parameter validation failed', {
      path: req.path,
      method: req.method,
      errors: errors.array(),
      params: req.params,
      ip: req.ip
    });
    
    return res.status(400).json({
      error: 'Invalid parameters',
      details: errors.array().map(err => ({
        parameter: err.param,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

module.exports = {
  validateUuidParam,
  validateAlphanumericId,
  validateJobId,
  validateEventId,
  validateTaskId,
  validateIntegrationId,
  validateServiceName,
  handleValidationErrors
};