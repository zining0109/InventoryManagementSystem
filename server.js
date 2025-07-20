const express = require('express');
const app = express();
const port = 3000;

// Middleware to parse JSON
app.use(express.json());

// Test route
app.get('/', (req, res) => {
  res.send('Inventory API is running!');
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});