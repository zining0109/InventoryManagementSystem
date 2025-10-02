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

router.get("/home", (req, res) => {
  const query = `
    SELECT 
      SUM(CASE WHEN quantity < 5 THEN 1 ELSE 0 END) AS low_stock,
      SUM(quantity) AS total_quantity,
      COUNT(*) AS total_items,
      SUM(CASE WHEN quantity > 5 THEN 1 ELSE 0 END) AS active_items
    FROM items;
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Database error");
    }

    const stats = results[0];
    const activePercentage = stats.total_items > 0 
      ? Math.round((stats.active_items / stats.total_items) * 100) 
      : 0;

    res.render("home", {
      stats: {
        lowStock: stats.low_stock || 0,
        quantity: stats.total_quantity || 0,
        allItems: stats.total_items || 0,
        activePercentage: activePercentage
      }
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

  const { work_id, username, password, confirmPassword, email, name, id_no, age, gender, contact_no } = req.body;
  const userId = req.session.user.id;
  const userRole = req.session.user.role;

  // 1. Validate password if being updated
  if (password || confirmPassword) {
    if (password !== confirmPassword) {
      return res.send(`
        <script>
          alert("Passwords do not match. Please enter again.");
          window.location.href = "/edit-profile";
        </script>
      `);
    }
  }

  // 2. Validate work_id rule for managers
  if (userRole === "manager") {
    if (!/^A/.test(work_id)) {
      return res.send(`
        <script>
          alert("Manager Work ID must start with 'A'.");
          window.location.href = "/edit-profile";
        </script>
      `);
    }
  }

  // Check uniqueness of username + work_id
  const checkSql = `
    SELECT id, username, work_id FROM users
    WHERE (username = ? OR work_id = ?) AND id != ?
  `;
  db.query(checkSql, [username, work_id, userId], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).send("Database error");
    }

    if (results.length > 0) {
      let conflictMsg = "";
      results.forEach(r => {
        if (r.username === username) conflictMsg = "Username already exists. Please assign another username.";
        if (r.work_id === work_id) conflictMsg = "Work ID already exists. Please assign another work id.";
      });

      return res.send(`
        <script>
          alert("${conflictMsg}");
          window.location.href = "/edit-profile";
        </script>
      `);
    }

    // Build update query dynamically
    let sql = `
      UPDATE users 
      SET work_id = ?, username = ?, email = ?, name = ?, id_no = ?, age = ?, gender = ?, contact_no = ?
    `;
    const params = [work_id, username, email, name, id_no, age, gender, contact_no, userId];

    if (password) {
      sql += `, password = ?`;
      params.splice(params.length - 1, 0, password); // insert before userId
    }

    sql += ` WHERE id = ?`;

    db.query(sql, params, (err) => {
      if (err) {
        console.error("Update error:", err);
        return res.status(500).send("Database update error");
      }

      // update session data too
      req.session.user.work_id = work_id;
      req.session.user.username = username;
      req.session.user.email = email;
      req.session.user.name = name;
      req.session.user.id_no = id_no;
      req.session.user.age = age;
      req.session.user.gender = gender;
      req.session.user.contact_no = contact_no;

      if (password) {
        req.session.user.password = password; // ⚠️ best practice: hash this before storing
      }

      res.send(`
        <script>
          alert("Profile updated successfully.");
          window.location.href = "/profile";
        </script>
      `);
    });
  });
});


router.get('/inventory', (req, res) => {
  const searchQuery = req.query.q;
  const statusFilter = req.query.status; // get status from query
  let params = [];

  let query = `
    SELECT i.id, i.name, i.sku, i.color, i.quantity, i.price, i.barcode, i.description,
           c.name AS category_name
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
  `;

  // Search filter
  if (searchQuery && searchQuery.trim() !== '') {
    query += ' WHERE (i.name LIKE ? OR c.name LIKE ?)';
    const searchTerm = `%${searchQuery.trim()}%`;
    params.push(searchTerm, searchTerm);
  }

  // Status filter (Active, Low, Out)
  if (statusFilter) {
    const whereOrAnd = query.includes("WHERE") ? " AND" : " WHERE";
    if (statusFilter === "in") {
      query += `${whereOrAnd} i.quantity > 5`;
    } else if (statusFilter === "low") {
      query += `${whereOrAnd} i.quantity BETWEEN 1 AND 5`;
    } else if (statusFilter === "out") {
      query += `${whereOrAnd} i.quantity = 0`;
    }
  }

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching items:', err);
      return res.status(500).send('Server error');
    }

    results = results.map(item => ({
    ...item,
    low_stock: item.quantity < 5 
    }));

    // Add a status label for display
    results.forEach(item => {
      if (item.quantity === 0) {
        item.status = "Out of Stock";
      } else if (item.quantity < 5) {
        item.status = "Low Stock";
      } else {
        item.status = "In Stock";
      }
    });

    res.render('inventory', {
      items: results,
      search: searchQuery || '',
      status: statusFilter || '' // so frontend knows which filter is active
    });
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
    return res.send(`<script>alert("Passwords do not match. Please try again."); window.location.href='/add-user';</script>`);
  }

  // Check if username already exists
  const checkUsername = 'SELECT id FROM users WHERE username = ? LIMIT 1';
  db.query(checkUsername, [username], (err, usernameResult) => {
    if (err) {
      console.error('Error checking username:', err);
      return res.status(500).send('Server error');
    }

    if (usernameResult.length > 0) {
      return res.send(`<script>alert("Username already exists. Please use another username."); window.location.href='/add-user';</script>`);
    }

    // Check if work_id already exists
    const checkWorkId = 'SELECT id FROM users WHERE work_id = ? LIMIT 1';
    db.query(checkWorkId, [work_id], (err, workIdResult) => {
      if (err) {
        console.error('Error checking work ID:', err);
        return res.status(500).send('Server error');
      }

      if (workIdResult.length > 0) {
        return res.send(`<script>alert("Work ID already exists. Please use another Work ID."); window.location.href='/add-user';</script>`);
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
    id_no,
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
        return res.send(`<script>alert("Passwords do not match. Please try again."); window.history.back();</script>`);
      }
    }

    // Step 3: check if username already exists (excluding current user)
    const checkUsername = 'SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1';
    db.query(checkUsername, [username, userId], (err, usernameResult) => {
      if (err) return res.status(500).send('Server error');
      if (usernameResult.length > 0) {
        return res.send(`<script>alert("Username already exists. Please use another Username."); window.history.back();</script>`);
      }

      // Step 4: check if work_id already exists (excluding current user)
      const checkWorkId = 'SELECT id FROM users WHERE work_id = ? AND id <> ? LIMIT 1';
      db.query(checkWorkId, [work_id, userId], (err, workIdResult) => {
        if (err) return res.status(500).send('Server error');
        if (workIdResult.length > 0) {
          return res.send(`<script>alert("Work ID already exists. Please use another Work ID."); window.history.back();</script>`);
        }

        // Step 5: update user (conditionally update password)
        let sql, params;
        if (password && password !== userCurrentPassword) {
          // update with new password
          sql = `
            UPDATE users SET
              work_id=?, name=?, id_no=?, username=?, password=?, email=?, role=?, gender=?, age=?, contact_no=?
            WHERE id=?
          `;
          params = [work_id, name, id_no, username, password, email, role, gender, age, contact_no, userId];
        } else {
          // update without changing password
          sql = `
            UPDATE users SET
              work_id=?, name=?, id_no=?, username=?, email=?, role=?, gender=?, age=?, contact_no=?
            WHERE id=?
          `;
          params = [work_id, name, id_no, username, email, role, gender, age, contact_no, userId];
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

router.get('/report', (req, res) => {
  res.render('report'); // Render report.ejs
});

router.get("/api/report/stock-on-hand", (req, res) => {
  const sql = "SELECT name, quantity FROM items";

  db.query(sql, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to load stock on hand report" });
    }
    res.json(rows);
  });
});

router.get("/api/report/stock-movement", (req, res) => {
  const { start_date, end_date } = req.query;

  // default last 7 days
  const today = new Date();
  const defaultEnd = today.toISOString().split("T")[0];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 6);
  const defaultStart = sevenDaysAgo.toISOString().split("T")[0];

  const start = start_date || defaultStart;
  const end = end_date || defaultEnd;

  const sql = `
    WITH RECURSIVE dates AS (
      SELECT ? AS date
      UNION ALL
      SELECT DATE_ADD(date, INTERVAL 1 DAY)
      FROM dates
      WHERE date < ?
    )
    SELECT 
      d.date, 
      i.id AS item_id, 
      i.name, 
      IFNULL(SUM(
        CASE 
          WHEN h.action = 'inbound' THEN h.amount
          WHEN h.action IN ('outbound','sales') THEN -h.amount
          ELSE 0
        END
      ), 0) AS movement
    FROM dates d
    CROSS JOIN items i
    LEFT JOIN history h 
      ON h.item_id = i.id 
     AND DATE(h.created_at) = d.date
    WHERE d.date BETWEEN ? AND ?
    GROUP BY i.id, d.date
    ORDER BY d.date ASC;
  `;

  db.query(sql, [start, end, start, end], (err, result) => {
    if (err) {
      console.error("SQL error:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json(result);
  });
});

router.get("/api/report/sales-report", (req, res) => {
  const { month, year } = req.query;

  if (!month || !year) {
    return res.status(400).json({ error: "Please provide ?month=MM&year=YYYY" });
  }

  const report = {};

  // 1. Total sales qty
  const sqlTotalQty = `
    SELECT COALESCE(SUM(h.amount), 0) AS total_sales_qty
    FROM history h
    WHERE h.action IN ('sales', 'outbound')
      AND MONTH(h.created_at) = ? AND YEAR(h.created_at) = ?;
  `;

  db.query(sqlTotalQty, [month, year], (err, qtyRows) => {
    if (err) return res.status(500).json({ error: "Failed total qty" });
    report.totalSalesQty = qtyRows[0].total_sales_qty;

    // 2. Total revenue
    const sqlTotalRevenue = `
      SELECT COALESCE(SUM(s.total), 0) AS total_revenue
      FROM sales s
      WHERE MONTH(s.created_at) = ? AND YEAR(s.created_at) = ?;
    `;
    db.query(sqlTotalRevenue, [month, year], (err, revRows) => {
      if (err) return res.status(500).json({ error: "Failed total revenue" });
      report.totalRevenue = revRows[0].total_revenue;

      // 3. Item revenues
      const sqlItemRevenue = `
        SELECT i.name, COALESCE(SUM(h.amount * i.price), 0) AS revenue
        FROM history h
        JOIN items i ON h.item_id = i.id
        WHERE h.action IN ('sales','outbound')
          AND MONTH(h.created_at) = ? AND YEAR(h.created_at) = ?
        GROUP BY i.name ORDER BY revenue DESC;
      `;
      db.query(sqlItemRevenue, [month, year], (err, itemRows) => {
        if (err) return res.status(500).json({ error: "Failed item revenue" });
        report.itemRevenues = itemRows;

        // 4. Category revenues
        const sqlCategoryRevenue = `
          SELECT c.name, COALESCE(SUM(h.amount * i.price), 0) AS revenue
          FROM history h
          JOIN items i ON h.item_id = i.id
          JOIN categories c ON i.category_id = c.id
          WHERE h.action IN ('sales','outbound')
            AND MONTH(h.created_at) = ? AND YEAR(h.created_at) = ?
          GROUP BY c.name ORDER BY revenue DESC;
        `;
        db.query(sqlCategoryRevenue, [month, year], (err, catRows) => {
          if (err) return res.status(500).json({ error: "Failed category revenue" });
          report.categoryRevenues = catRows;

          res.json(report); // ✅ final response
        });
      });
    });
  });
});

// Export router so server.js can use it
module.exports = router;