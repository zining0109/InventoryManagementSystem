const express = require('express');
const userRoutes = require('./routes/user'); // path to routes/user.js
const path = require('path');
const session = require('express-session');

const app = express();

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true })); 

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use('/', userRoutes); // Mounts routes/user.js at root

app.get('/', (req, res) => {
  res.render('login'); // If using EJS, or res.sendFile for HTML for views/login.ejs
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
