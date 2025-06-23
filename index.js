const { processReel } = require("./upload");
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files like HTML and CSS
app.use(express.static(path.join(__dirname, "public")));

// API to trigger upload functionality
app.use('/', require('./upload'));

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
