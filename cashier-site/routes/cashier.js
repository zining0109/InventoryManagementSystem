//app.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// Login route
router.post('/login', (req, res) => {
  const { password } = req.body;

  if (!password || password.length !== 4) {
    return res.send("<script>alert('Invalid Password. Please try again.'); window.location.href='/';</script>");
  }

  const sql = "SELECT * FROM users WHERE password = ? LIMIT 1";

  db.query(sql, [password], (err, results) => {
    if (err) {
      console.error(err);
      return res.send("<script>alert('Database error'); window.location.href='/';</script>");
    }

    if (results.length === 0) {
      return res.send("<script>alert('Invalid Password. Please try again.'); window.location.href='/';</script>");
    }

    const user = results[0];

    if (!user.work_id.startsWith("C")) {
      return res.send("<script>alert('Only cashiers can login.'); window.location.href='/';</script>");
    }

    // store session
    req.session.user = user;

    return res.redirect('/home');
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
    text: `User "${username}" with email "${email}" requested password.`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error(error);
      return res.send(`<script>
        alert("Failed to send email. Please try again.");
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

router.get('/home', (req, res) => {
  res.render('home'); // Renders views/login.ejs
});


// Export router so server.js can use it
module.exports = router;