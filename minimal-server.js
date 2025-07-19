const express = require("express");
const app = express();
const PORT = process.env.PORT || 8080;

console.log("Starting minimal server with API routes...");

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "healthy", port: PORT });
});

// Simple API key auth middleware
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  const validApiKey = process.env.API_KEY || process.env.API_KEY_ENV || 'voice-assistant-api-key-2024';
  
  if (!apiKey || apiKey !== validApiKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
};

// Voice processing endpoint
app.post("/api/voice/process-text", authenticateApiKey, async (req, res) => {
  try {
    const { text, sessionId } = req.body;
    console.log(`Processing text: ${text}, session: ${sessionId}`);
    
    // Return a simple response for now
    res.json({
      text: text,
      response: "I received your message: " + text,
      audioData: "",
      sessionId: sessionId,
      success: true
    });
  } catch (error) {
    console.error("Error processing text:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`API_KEY_ENV: ${process.env.API_KEY_ENV ? 'Set' : 'Not set'}`);
});

console.log("Server setup complete");

