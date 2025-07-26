const express = require('express');
const router = express.Router();
const { 
  controller: adminController,
  requireAdmin,
  getUsersValidation,
  updateUserValidation,
  deactivateUserValidation
} = require('../controllers/admin.controller');
const { authenticateJWT } = require('../middleware/jwtAuth');

// Apply JWT authentication and admin check to all routes
router.use(authenticateJWT);
router.use(requireAdmin);

/**
 * @route   GET /api/admin/users
 * @desc    Get all users with pagination and filtering
 * @access  Admin
 */
router.get('/users', getUsersValidation, adminController.getUsers);

/**
 * @route   GET /api/admin/users/:userId
 * @desc    Get user details by ID
 * @access  Admin
 */
router.get('/users/:userId', adminController.getUserById);

/**
 * @route   PUT /api/admin/users/:userId
 * @desc    Update user details (admin only)
 * @access  Admin
 */
router.put('/users/:userId', updateUserValidation, adminController.updateUser);

/**
 * @route   POST /api/admin/users/:userId/reset-usage
 * @desc    Reset user usage count
 * @access  Admin
 */
router.post('/users/:userId/reset-usage', adminController.resetUserUsage);

/**
 * @route   POST /api/admin/users/:userId/deactivate
 * @desc    Deactivate user account
 * @access  Admin
 */
router.post('/users/:userId/deactivate', deactivateUserValidation, adminController.deactivateUser);

/**
 * @route   POST /api/admin/users/:userId/reactivate
 * @desc    Reactivate user account
 * @access  Admin
 */
router.post('/users/:userId/reactivate', adminController.reactivateUser);

/**
 * @route   GET /api/admin/stats
 * @desc    Get system statistics
 * @access  Admin
 */
router.get('/stats', adminController.getSystemStats);

/**
 * @route   GET /api/admin/activity
 * @desc    Get recent user activity
 * @access  Admin
 */
router.get('/activity', adminController.getRecentActivity);

module.exports = router;