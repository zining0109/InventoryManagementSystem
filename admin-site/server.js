const express = require('express');
const adminRoutes = require('./routes/admin'); // Path to routes/admin.js
const path = require('path');
const session = require('express-session');
const http = require('http');           
const { Server } = require('socket.io');

require('dotenv').config();

const app = express();

const server = http.createServer(app); // Use this instead of app.listen
const io = new Server(server); // Create socket.io server
app.set('io', io); // Make io accessible in routes if needed

const checkStock = require('./utils/checkStock');

// Run stock check automatically every 60 seconds
setInterval(() => {
  console.log('Running automatic stock check...');
  checkStock(io);
}, 60000);

setInterval(() => {
  db.query('DELETE FROM notifications WHERE created_at < NOW() - INTERVAL 7 DAY', (err) => {
    if (err) console.error('Cleanup error:', err);
    else console.log('Old notifications cleaned up');
  });
}, 24 * 60 * 60 * 1000);

app.use(express.json());

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Set EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

// Routes
app.use("/", adminRoutes);

app.get('/', (req, res) => {
  res.render('login'); // If using EJS, or res.sendFile for HTML for views/login.ejs
});

// Socket.IO connection log
io.on('connection', (socket) => {
  console.log('Manager connected to Socket.IO');
});

const PORT = 3001;

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});