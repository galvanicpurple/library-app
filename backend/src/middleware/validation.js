import { body, param, query, validationResult } from 'express-validator';

// Middleware to handle validation errors
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation failed', 
      details: errors.array() 
    });
  }
  next();
};

// User validation rules
export const validateRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and number'),
  body('fullName')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Full name must be between 2 and 255 characters'),
  handleValidationErrors
];

export const validateEmailChange = [
  body('newEmail')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  handleValidationErrors
];

export const validatePasswordChange = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and number'),
  handleValidationErrors
];

export const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors
];

// Shelf validation rules
export const validateShelf = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Shelf name must be between 1 and 255 characters'),
  body('location')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Location must not exceed 255 characters'),
  body('description')
    .optional()
    .trim(),
  handleValidationErrors
];

// Book validation rules
export const validateBook = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Title is required and must not exceed 500 characters'),
  body('isbn')
    .optional()
    .trim()
    .matches(/^(?:\d{10}|\d{13})$/)
    .withMessage('ISBN must be 10 or 13 digits'),
  body('authors')
    .optional()
    .isArray()
    .withMessage('Authors must be an array'),
  handleValidationErrors
];

// Reading validation rules
export const validateReading = [
  body('status')
    .isIn(['want_to_read', 'currently_reading', 'completed', 'abandoned'])
    .withMessage('Invalid reading status'),
  // nullable (not just optional): null is a meaningful value here - "clear
  // the rating" - and must reach the controller distinguishable from the
  // field being omitted ("leave the rating as it is").
  body('rating')
    .optional({ nullable: true })
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  handleValidationErrors
];

// UUID validation
export const validateUUID = (paramName = 'id') => [
  param(paramName)
    .isUUID()
    .withMessage(`Invalid ${paramName} format`),
  handleValidationErrors
];

// Search query validation
export const validateSearch = [
  query('q')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Search query must be between 1 and 500 characters'),
  handleValidationErrors
];

// Sanitize user input to prevent XSS
export const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    return input.replace(/[<>]/g, '');
  }
  return input;
};
