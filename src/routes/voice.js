const express = require('express');
const multer = require('multer');
const router = express.Router();
const { 
  controller, 
  processVoiceValidation, 
  processVoiceAudioValidation, 
  processTextValidation,
  synthesizeSpeechValidation 
} = require('../controllers/voice.controller');
const { authenticateToken } = require('../services/auth/middleware');
// SECURITY FIX: Add parameter validation middleware
const { validateJobId, handleValidationErrors } = require('../middleware/parameterValidation');

// SECURITY FIX: Enhanced file upload validation
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1 // Only one file allowed
  },
  fileFilter: (req, file, cb) => {
    // Validate MIME type more strictly
    const allowedMimeTypes = [
      'audio/wav', 'audio/wave', 'audio/x-wav',
      'audio/mpeg', 'audio/mp3',
      'audio/mp4', 'audio/m4a',
      'audio/ogg', 'audio/webm'
    ];
    
    if (!allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: ${allowedMimeTypes.join(', ')}`), false);
      return;
    }
    
    // Validate file extension
    const allowedExtensions = ['.wav', '.mp3', '.m4a', '.ogg', '.webm'];
    const fileExtension = require('path').extname(file.originalname).toLowerCase();
    
    if (!allowedExtensions.includes(fileExtension)) {
      cb(new Error(`Invalid file extension: ${fileExtension}. Allowed: ${allowedExtensions.join(', ')}`), false);
      return;
    }
    
    cb(null, true);
  }
});

// Development-only endpoint
router.post('/dev/process-audio', upload.single('audio'), processVoiceAudioValidation, controller.processVoiceAudio.bind(controller));

// Voice processing routes (authentication handled by app.js)
router.post('/process-text', processTextValidation, controller.processText.bind(controller));
router.post('/process', processVoiceValidation, controller.processVoiceCommand.bind(controller));
router.post('/process-audio', upload.single('audio'), processVoiceAudioValidation, controller.processVoiceAudio.bind(controller));

// Async voice processing routes (using queue)
router.post('/process-async', processVoiceValidation, controller.processVoiceCommandAsync.bind(controller));
router.post('/process-audio-async', upload.single('audio'), processVoiceAudioValidation, controller.processVoiceAudioAsync.bind(controller));
router.get('/job/:jobId', validateJobId, handleValidationErrors, controller.getJobStatus.bind(controller));

// Speech-to-text and text-to-speech routes
router.post('/transcribe', upload.single('audio'), controller.transcribeAudio.bind(controller));
router.post('/synthesize', synthesizeSpeechValidation, controller.synthesizeSpeech.bind(controller));
router.get('/voices', controller.getAvailableVoices.bind(controller));

// Voice command management routes
router.get('/history', controller.getVoiceHistory.bind(controller));
router.get('/conversations', controller.getConversationHistory.bind(controller));
router.delete('/conversations', controller.clearConversationHistory.bind(controller));
router.get('/context', controller.getUserContext.bind(controller));
router.get('/stats', controller.getVoiceStats.bind(controller));
router.get('/analytics', controller.getTranscriptionAnalytics.bind(controller));

// Streaming routes for real-time processing
router.post('/stream-start', controller.streamStart.bind(controller));
router.post('/stream-process', controller.streamProcess.bind(controller));
router.post('/stream-end', controller.streamEnd.bind(controller));

module.exports = router;