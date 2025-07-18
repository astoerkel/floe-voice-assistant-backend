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

// Configure multer for audio file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'), false);
    }
  }
});

// Development-only endpoint with authentication (still uses development tokens)
router.post('/dev/process-audio', upload.single('audio'), authenticateToken, processVoiceAudioValidation, controller.processVoiceAudio);

// All other voice routes require authentication
router.use(authenticateToken);

// Voice processing routes
router.post('/process-text', processTextValidation, controller.processText);
router.post('/process', processVoiceValidation, controller.processVoiceCommand);
router.post('/process-audio', upload.single('audio'), processVoiceAudioValidation, controller.processVoiceAudio);

// Async voice processing routes (using queue)
router.post('/process-async', processVoiceValidation, controller.processVoiceCommandAsync);
router.post('/process-audio-async', upload.single('audio'), processVoiceAudioValidation, controller.processVoiceAudioAsync);
router.get('/job/:jobId', controller.getJobStatus);

// Speech-to-text and text-to-speech routes
router.post('/transcribe', upload.single('audio'), controller.transcribeAudio);
router.post('/synthesize', synthesizeSpeechValidation, controller.synthesizeSpeech);
router.get('/voices', controller.getAvailableVoices);

// Voice command management routes
router.get('/history', controller.getVoiceHistory);
router.get('/conversations', controller.getConversationHistory);
router.delete('/conversations', controller.clearConversationHistory);
router.get('/context', controller.getUserContext);
router.get('/stats', controller.getVoiceStats);
router.get('/analytics', controller.getTranscriptionAnalytics);

// Streaming routes for real-time processing
router.post('/stream-start', controller.streamStart);
router.post('/stream-process', controller.streamProcess);
router.post('/stream-end', controller.streamEnd);

module.exports = router;