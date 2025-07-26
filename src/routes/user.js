const express = require('express');
const router = express.Router();
const { 
  controller: userController,
  updateProfileValidation,
  updatePreferencesValidation,
  deviceValidation,
  updateDeviceValidation,
  usageStatsValidation
} = require('../controllers/user.controller');
const { authenticateJWT } = require('../middleware/jwtAuth');


/**
 * @route   GET /api/user/profile
 * @desc    Get current user's detailed profile
 * @access  Private
 */
router.get('/profile', authenticateJWT, userController.getProfile);

/**
 * @route   PUT /api/user/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', authenticateJWT, updateProfileValidation, userController.updateProfile);

/**
 * @route   GET /api/user/preferences
 * @desc    Get user preferences
 * @access  Private
 */
router.get('/preferences', authenticateJWT, userController.getPreferences);

/**
 * @route   PUT /api/user/preferences
 * @desc    Update user preferences
 * @access  Private
 */
router.put('/preferences', authenticateJWT, updatePreferencesValidation, userController.updatePreferences);

/**
 * @route   GET /api/user/usage
 * @desc    Get user usage statistics
 * @access  Private
 */
router.get('/usage', authenticateJWT, usageStatsValidation, userController.getUsageStats);

/**
 * @route   GET /api/user/devices
 * @desc    Get user devices
 * @access  Private
 */
router.get('/devices', authenticateJWT, userController.getDevices);

/**
 * @route   POST /api/user/devices
 * @desc    Register or update a device
 * @access  Private
 */
router.post('/devices', authenticateJWT, deviceValidation, userController.registerDevice);

/**
 * @route   PUT /api/user/devices/:deviceId
 * @desc    Update device information
 * @access  Private
 */
router.put('/devices/:deviceId', authenticateJWT, updateDeviceValidation, userController.updateDevice);

/**
 * @route   DELETE /api/user/account
 * @desc    Delete user account permanently
 * @access  Private
 */
router.delete('/account', authenticateJWT, userController.deleteAccount);

/**
 * @route   GET /api/user/export
 * @desc    Export user data (GDPR compliance)
 * @access  Private
 */
router.get('/export', authenticateJWT, userController.exportData);

module.exports = router;