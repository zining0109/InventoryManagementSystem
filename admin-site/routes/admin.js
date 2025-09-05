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

router.get('/user', (req, res) => {
  const searchQuery = req.query.q;
  const roleFilter = req.query.role; // get role from query params
  let params = [];

  let query = `
    SELECT id, work_id, name, username, email, role, gender, age, contact_no
    FROM users
    WHERE role <> 'manager'
  `;

  if (searchQuery && searchQuery.trim() !== '') {
    query += ' AND (name LIKE ? OR username LIKE ? OR email LIKE ? OR role LIKE ?)';
    const searchTerm = `%${searchQuery.trim()}%`;
    params = [searchTerm, searchTerm, searchTerm, searchTerm];
  }

  // Role filter
  if (roleFilter && roleFilter.trim() !== '') {
    query += ' AND role = ?';
    params.push(roleFilter);
  }

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching users:', err);
      return res.status(500).send('Server error');
    }

    res.render('user', { users: results, search: searchQuery || '', roleFilter: roleFilter || ''});
  });
});

router.get('/add-user', (req, res) => {
  res.render('add-user'); // Render add-user.ejs
});

// Add User Route with Validation + Separate alerts
router.post('/add-user', (req, res) => {
  const { work_id, name, id_no, username, password, confirmPassword, email, role, gender, age, contact_no } = req.body;

  // Validate Work ID format
  let validWorkId = false;
  if (role === 'warehouse staff' && /^B\d{3}$/.test(work_id)) {
    validWorkId = true;
  } else if (role === 'user' && /^C\d{3}$/.test(work_id)) {
    validWorkId = true;
  }

  if (!validWorkId) {
    return res.send(`<script>alert("Invalid Work ID. Warehouse staff IDs must be Bxxx, Cashier IDs must be Cxxx."); window.location.href='/add-user';</script>`);
  }

  // Validate password confirmation
  if (password !== confirmPassword) {
    return res.send(`<script>alert("Passwords do not match. Please enter again."); window.location.href='/add-user';</script>`);
  }

  // Check if username already exists
  const checkUsername = 'SELECT id FROM users WHERE username = ? LIMIT 1';
  db.query(checkUsername, [username], (err, usernameResult) => {
    if (err) {
      console.error('Error checking username:', err);
      return res.status(500).send('Server error');
    }

    if (usernameResult.length > 0) {
      return res.send(`<script>alert("Username already exists. Please assign another username."); window.location.href='/add-user';</script>`);
    }

    // Check if work_id already exists
    const checkWorkId = 'SELECT id FROM users WHERE work_id = ? LIMIT 1';
    db.query(checkWorkId, [work_id], (err, workIdResult) => {
      if (err) {
        console.error('Error checking work ID:', err);
        return res.status(500).send('Server error');
      }

      if (workIdResult.length > 0) {
        return res.send(`<script>alert("Work ID already exists. Please assign another Work ID."); window.location.href='/add-user';</script>`);
      }

      // Insert user if all validation passed
      const insertQuery = `
        INSERT INTO users (work_id, name, id_no, username, password, email, role, gender, age, contact_no)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      db.query(insertQuery, [work_id, name, id_no, username, password, email, role, gender, age, contact_no], (err, result) => {
        if (err) {
          console.error('Error inserting user:', err);
          return res.send(`<script>alert("Failed to add user."); window.location.href='/user';</script>`);
        }

        console.log('User added:', result.insertId);
        res.send(`<script>alert("User added successfully."); window.location.href='/user';</script>`);
      });
    });
  });
});

// User detail route
router.get('/user/:id', (req, res) => {
  const userId = req.params.id;
  const sql = `
    SELECT *
    FROM users
    WHERE id = ?
  `;

  db.query(sql, [userId], (err, result) => {
    if (err) {
      console.error('Error fetching user:', err);
      return res.status(500).send('Database error');
    }
    if (result.length === 0) {
      return res.status(404).send('User not found');
    }

    res.render('user-detail', { user: result[0] });
  });
});

// Delete user route
router.get('/user/delete/:id', (req, res) => {
  const id = req.params.id;

  const sql = 'DELETE FROM users WHERE id = ?';
  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error(err);
      return res.send(`
        <script>
          alert("Failed to delete user.");
          window.location.href = "/user";
        </script>
      `);
    }

    if (result.affectedRows === 0) {
      return res.send(`
        <script>
          alert("User not found.");
          window.location.href = "/user";
        </script>
      `);
    }

    res.send(`
      <script>
        alert("User deleted successfully.");
        window.location.href = "/user";
      </script>
    `);
  });
});

router.get('/user/edit/:id', (req, res) => {
  const userId = req.params.id;

  // Available roles (excluding manager if you want)
  const roles = ["Warehouse Staff", "Store Cashier"];

  const sql = `SELECT * FROM users WHERE id = ?`;
  db.query(sql, [userId], (err, result) => {
    if (err) return res.status(500).send('Database error');
    if (result.length === 0) return res.status(404).send('User not found');

    res.render('edit-user', { user: result[0], roles });
  });
});

router.post('/user/edit/:id', (req, res) => {
  const userId = req.params.id;
  const {
    work_id,
    name,
    username,
    password,
    confirmPassword,
    email,
    role,
    gender,
    age,
    contact_no
  } = req.body;

  // Validate Work ID format
  const normalizedRole = role.toLowerCase();
  let validWorkId = false;
  if (normalizedRole === 'warehouse staff' && /^B\d{3}$/.test(work_id)) validWorkId = true;
  else if (normalizedRole === 'store cashier' && /^C\d{3}$/.test(work_id)) validWorkId = true;

  if (!validWorkId) {
    return res.send(`<script>alert("Invalid Work ID. Warehouse staff IDs must be Bxxx, Cashier IDs must be Cxxx."); window.history.back();</script>`);
  }

  // Step 1: fetch current password from DB
  db.query('SELECT password FROM users WHERE id = ?', [userId], (err, result) => {
    if (err) {
      console.error('Error fetching user password:', err);
      return res.status(500).send('Server error');
    }

    if (result.length === 0) {
      return res.status(404).send('User not found');
    }

    const userCurrentPassword = result[0].password;

    // Step 2: validate password only if changed
    if (password && password !== userCurrentPassword) {
      if (!confirmPassword || password !== confirmPassword) {
        return res.send(`<script>alert("Passwords do not match."); window.history.back();</script>`);
      }
    }

    // Step 3: check if username already exists (excluding current user)
    const checkUsername = 'SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1';
    db.query(checkUsername, [username, userId], (err, usernameResult) => {
      if (err) return res.status(500).send('Server error');
      if (usernameResult.length > 0) {
        return res.send(`<script>alert("Username already exists."); window.history.back();</script>`);
      }

      // Step 4: check if work_id already exists (excluding current user)
      const checkWorkId = 'SELECT id FROM users WHERE work_id = ? AND id <> ? LIMIT 1';
      db.query(checkWorkId, [work_id, userId], (err, workIdResult) => {
        if (err) return res.status(500).send('Server error');
        if (workIdResult.length > 0) {
          return res.send(`<script>alert("Work ID already exists."); window.history.back();</script>`);
        }

        // Step 5: update user (conditionally update password)
        let sql, params;
        if (password && password !== userCurrentPassword) {
          // update with new password
          sql = `
            UPDATE users SET
              work_id=?, name=?, username=?, password=?, email=?, role=?, gender=?, age=?, contact_no=?
            WHERE id=?
          `;
          params = [work_id, name, username, password, email, role, gender, age, contact_no, userId];
        } else {
          // update without changing password
          sql = `
            UPDATE users SET
              work_id=?, name=?, username=?, email=?, role=?, gender=?, age=?, contact_no=?
            WHERE id=?
          `;
          params = [work_id, name, username, email, role, gender, age, contact_no, userId];
        }

        db.query(sql, params, (err, result) => {
          if (err) return res.status(500).send('Database error');
          res.send(`<script>alert("User updated successfully."); window.location.href='/user/${userId}';</script>`);
        });

      }); // end checkWorkId
    }); // end checkUsername
  }); // end fetch current password
});

router.get('/history', (req, res) => {
  const searchQuery = req.query.q;
  const actionFilter = req.query.action;
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  let query = `
    SELECT h.id, h.item_id, h.user_id, h.action, h.amount, h.current_quantity, h.created_at,
           i.name AS item_name, u.name AS user_name
    FROM history h
    LEFT JOIN items i ON h.item_id = i.id
    LEFT JOIN users u ON h.user_id = u.id
    WHERE 1=1
  `;
  let params = [];

  // Search filter (item or user name)
  if (searchQuery && searchQuery.trim() !== '') {
    query += ` AND (i.name LIKE ? OR u.name LIKE ?)`;
    const term = `%${searchQuery.trim()}%`;
    params.push(term, term);
  }

  // Action filter (inbound/outbound)
  if (actionFilter && actionFilter.trim() !== '') {
    query += ` AND h.action = ?`;
    params.push(actionFilter);
  }

  // Date filter
  if (startDate && endDate) {
    query += ` AND DATE(h.created_at) BETWEEN ? AND ?`;
    params.push(startDate, endDate);
  } else if (startDate) {
    query += ` AND DATE(h.created_at) >= ?`;
    params.push(startDate);
  } else if (endDate) {
    query += ` AND DATE(h.created_at) <= ?`;
    params.push(endDate);
  }

  query += ` ORDER BY h.created_at DESC`;

  db.query(query, params, (err, results) => {
    if (err) {
      console.error("Error fetching history:", err);
      return res.status(500).send("Server error");
    }

    res.render("history", {
      history: results,
      search: searchQuery || '',
      action: actionFilter || '',
      start_date: startDate || '',
      end_date: endDate || ''
    });
  });
});


// Export router so server.js can use it
module.exports = router;