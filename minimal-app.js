const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

console.log('Starting minimal app...');
console.log('PORT:', PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('Health check requested');
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Minimal app is running' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Minimal app listening on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;