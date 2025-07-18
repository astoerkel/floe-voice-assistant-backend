const express = require('express');
const router = express.Router();

// Sync routes placeholder
router.post('/calendar', (req, res) => {
  res.status(501).json({ message: 'Calendar sync not implemented yet' });
});

router.post('/email', (req, res) => {
  res.status(501).json({ message: 'Email sync not implemented yet' });
});

router.post('/tasks', (req, res) => {
  res.status(501).json({ message: 'Tasks sync not implemented yet' });
});

router.get('/status', (req, res) => {
  res.status(501).json({ message: 'Sync status not implemented yet' });
});

module.exports = router;