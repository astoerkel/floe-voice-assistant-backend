const express = require('express');
const router = express.Router();

// Tasks routes placeholder
router.get('/', (req, res) => {
  res.status(501).json({ message: 'Get tasks not implemented yet' });
});

router.post('/', (req, res) => {
  res.status(501).json({ message: 'Create task not implemented yet' });
});

router.put('/:id', (req, res) => {
  res.status(501).json({ message: 'Update task not implemented yet' });
});

router.delete('/:id', (req, res) => {
  res.status(501).json({ message: 'Delete task not implemented yet' });
});

router.get('/overdue', (req, res) => {
  res.status(501).json({ message: 'Get overdue tasks not implemented yet' });
});

module.exports = router;