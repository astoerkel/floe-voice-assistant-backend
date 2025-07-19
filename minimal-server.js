const express = require("express");
const app = express();
const PORT = process.env.PORT || 8080;

console.log("Starting minimal server...");

app.get("/health", (req, res) => {
  res.json({ status: "healthy", port: PORT });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
});

console.log("Server setup complete");

