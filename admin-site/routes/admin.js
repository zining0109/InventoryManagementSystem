//app.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Login POST route
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  // DB check
  const query = 'SELECT * FROM users WHERE username = ? AND password = ? AND role = "manager"';
  db.query(query, [username, password], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Server error');
    }

    if (results.length > 0) {
      const user = results[0];

      // Successful login
      req.session.username = results[0].username; // store user ID in session

      // Save full user object in session
      req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role
      };

      console.log("User logged in:", req.session.user);
      res.redirect('/home'); // Redirect to home page
    } else {
      // Invalid login
      res.send(`<script>
        alert("Invalid Username or Password. Please try again.");
        window.location.href = "/";
      </script>`);
    }
  });
});

// Home GET route
router.get('/home', (req, res) => {
  res.render('home'); 
});

router.get('/forgot-password', (req, res) => {
  res.render('forgot-password'); // Render forgot-password.ejs
});

//Forgot password send email to manager and manager reset password
router.post('/forgot-password', (req, res) => {
  const { email } = req.body;

  // Generate secure token
  const token = crypto.randomBytes(32).toString('hex');
  const expireTime = new Date(Date.now() + 3600000); // 1 hour expiry

  // Save token in DB
  const sql = "UPDATE users SET reset_token = ?, reset_token_expire = ? WHERE email = ? AND role = 'manager'";
  db.query(sql, [token, expireTime, email], (err, result) => {
    if (err) {
      console.error(err);
      return res.send("Server error");
    }

    if (result.affectedRows === 0) {
      return res.send("No manager found with that email");
    }

    // Send email
    const transporter = nodemailer.createTransport({
      service: "gmail", 
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const resetLink = `http://localhost:3001/reset-password/${token}`;
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset Request",
      html: `<p>You requested a password reset.</p>
             <p>Click <a href="${resetLink}">here</a> to reset your password.</p>`
    };

    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error(err);
        return res.send("Error sending email");
      }
      // Redirect to login with success message
      res.send(`<script>
        alert("Reset link sent successfully. Please check your email.");
        window.location.href = "/"; 
        </script>`);
    });
  });
});

router.get('/reset-password/:token', (req, res) => {
  const { token } = req.params;

  if (!token) {
    return res.send(`<script>
      alert("Invalid reset link.");
      window.location.href = "/";
    </script>`);
  }
    res.render('reset-password', { token }); // pass token to form
});

router.post('/reset-password/:token', (req, res) => {
  const { token } = req.params;
  const { newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword) {
    return res.send(`<script>
      alert("Passwords do not match. Please try again.");
      window.location.href = "/reset-password/token=${token}";
    </script>`);
  }

  // Verify token in db
  const query = "SELECT * FROM users WHERE reset_token = ? AND reset_token_expire > NOW()";
  db.query(query, [token], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Server error");
    }

    if (results.length === 0) {
      return res.send(`<script>
        alert("Invalid or expired token.");
        window.location.href = "/";
      </script>`);
    }

    const userId = results[0].id;

    // Update password and clear token
    const updateQuery = "UPDATE users SET password = ?, reset_token = NULL, reset_token_expire = NULL WHERE id = ?";
    db.query(updateQuery, [newPassword, userId], (err2) => {
      if (err2) {
        console.error(err2);
        return res.status(500).send("Server error");
      }

    res.send(`<script>
      alert("Reset successfully. Please login with your new password.");
      window.location.href = "/";
      </script>`);
    });
  });
});

router.get('/profile', (req, res) => {
  const username = req.session.username;

  if (!username) {
    return res.redirect('/login');
  }

  const query = 'SELECT * FROM users WHERE username = ?';
  db.query(query, [username], (err, results) => {
    if (err) {
      console.error('Error retrieving user data:', err);
      return res.status(500).send('Server error');
    }

    if (results.length === 0) {
      return res.status(404).send('User not found');
    }

    res.render('profile', { user: results[0] }); // send user data to EJS
  });
});

// Show edit form
router.get('/edit-profile', (req, res) => {
  if (!req.session.user) {
        return res.redirect("/login"); // not logged in
    }

    const userId = req.session.user.id;

    db.query("SELECT * FROM users WHERE id = ?", [userId], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Database error");
        }
        if (results.length === 0) {
            return res.status(404).send("User not found");
        }

        res.render("edit-profile", {
            user: results[0] // pass data to EJS form
        });
    });
});

// Handle form submission
router.post("/edit-profile", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    const { username, email, name, age, gender, contact_no } = req.body;
    const userId = req.session.user.id;

    // Check if username is taken by another user
    db.query("SELECT id FROM users WHERE username = ? AND id != ?", [username, userId], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Database error");
        }

        if (results.length > 0) {
            // Username already taken
            return res.send(`
                <script>
                    alert("Username is already taken. Please choose another one.");
                    window.location.href = "/edit-profile";
                </script>
            `);
        }

    // If username is unique, update profile
    const sql = `
        UPDATE users 
        SET username = ?, email = ?, name = ?, age = ?, gender = ?, contact_no = ?
        WHERE id = ?
    `;

    db.query(sql, [username, email, name, age, gender, contact_no, userId], (err) => {
        if (err) {
            console.error("Update error:", err);
            return res.status(500).send("Database update error");
        }

        // update session data too (so profile page shows updated info immediately)
        req.session.user.username = username;
        req.session.user.email = email;
        req.session.user.name = name;
        req.session.user.age = age;
        req.session.user.gender = gender;
        req.session.user.contact_no = contact_no;

        res.send(`<script>
          alert("Profile updated successfully.");
          window.location.href = "/profile";
          </script>`);
        });
    });
});

router.get('/inventory', (req, res) => {
  const searchQuery = req.query.q;
  let params = [];

  let query = `
    SELECT i.id, i.name, i.sku, i.color, i.quantity, i.price, i.barcode, i.description,
           c.name AS category_name
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
  `;

  if (searchQuery && searchQuery.trim() !== '') {
    query += ' WHERE i.name LIKE ? OR c.name LIKE ?';
    const searchTerm = `%${searchQuery.trim()}%`;
    params = [searchTerm, searchTerm];
  }

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching items:', err);
      return res.status(500).send('Server error');
    }

    // Add a low_stock flag
    results = results.map(item => ({
        ...item,
        low_stock: item.quantity < 5 // threshold
    }));

    res.render('inventory', { items: results, search: searchQuery || '' });
  });
});

router.get('/item/:id', (req, res) => {
  const itemId = req.params.id;
  const sql = `
    SELECT i.*, c.name AS category_name
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    WHERE i.id = ?
  `;

  db.query(sql, [itemId], (err, result) => {
    if (err) {
      console.error('Error fetching item:', err);
      return res.status(500).send('Database error');
    }
    if (result.length === 0) {
      return res.status(404).send('Item not found');
    }

    const item = result[0];

    // Add status field dynamically
    result.forEach(item => {
      if (item.quantity === 0) {
        item.status = "Out of Stock";
      } else if (item.quantity < 5) {
        item.status = "Low Stock";
      } else {
        item.status = "In Stock";
      }
    });

    res.render('item-detail', { item: result[0] });
  });
});

// Export router so server.js can use it
module.exports = router;