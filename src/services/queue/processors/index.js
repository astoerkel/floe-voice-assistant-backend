const voiceProcessor = require('./voiceProcessor');
const transcriptionProcessor = require('./transcriptionProcessor');
const synthesisProcessor = require('./synthesisProcessor');
const emailProcessor = require('./emailProcessor');
const calendarProcessor = require('./calendarProcessor');
const taskProcessor = require('./taskProcessor');
const aiProcessor = require('./aiProcessor');
const notificationProcessor = require('./notificationProcessor');

module.exports = {
  voiceProcessor,
  transcriptionProcessor,
  synthesisProcessor,
  emailProcessor,
  calendarProcessor,
  taskProcessor,
  aiProcessor,
  notificationProcessor
};