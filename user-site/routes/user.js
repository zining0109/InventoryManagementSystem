//app.js
const express = require('express');
const router = express.Router();
const mysql = require('mysql2');
require('dotenv').config();

// MySQL connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// Login POST route
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  // Example DB check — replace with your own logic
  const query = 'SELECT * FROM users WHERE username = ? AND password = ? AND role = "staff"';
  db.query(query, [username, password], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Server error');
    }

    if (results.length > 0) {
      // Successful login
      res.redirect('/home');
    } else {
      // Invalid login
      res.send(`<script>
        alert("Invalid Username or Password");
        window.location.href = "/";
      </script>`);
    }
  });
});

router.get('/forgot-password', (req, res) => {
  res.render('forgot-password'); // Render forgot-password.ejs
});

//Forgot password send email to manager
router.post('/forgot-password', (req, res) => {
  const { username, email } = req.body;

  const nodemailer = require('nodemailer');
  const adminEmail = process.env.EMAIL_ADMIN; // Admin email from .env

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: adminEmail,
    subject: 'Password Request',
    text: `User "${username}" with email "${email}" requested a password reset.`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error(error);
      return res.send(`<script>
        alert("Failed to send email. Please try again later.");
        window.location.href = "/";
      </script>`);
    }

    // SUCCESS ALERT + redirect back to login
    res.send(`<script>
      alert("An email has been sent to your manager. Please wait and check the new password from the reply email.");
      window.location.href = "/";
    </script>`);
  });
});


module.exports = router;
