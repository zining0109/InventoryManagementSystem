const express = require('express');
const bodyParser = require('body-parser');
const userRoutes = require('./routes/user'); // path to routes/user.js
const path = require('path');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', userRoutes); // Mounts routes/user.js at root

app.get('/', (req, res) => {
  res.render('login'); // If using EJS, or res.sendFile for HTML// views/login.ejs
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
