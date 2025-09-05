const express = require('express');
const adminRoutes = require('./routes/admin'); // path to routes/admin.js
const path = require('path');
const session = require('express-session');

const app = express();

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

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use("/", adminRoutes);

app.get('/', (req, res) => {
  res.render('login'); // If using EJS, or res.sendFile for HTML for views/login.ejs
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});