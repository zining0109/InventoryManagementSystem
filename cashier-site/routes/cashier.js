//app.js
const express = require('express');
const router = express.Router();
const { db, dbPromise } = require("../db");

// Login route
router.post('/login', (req, res) => {
  const { password } = req.body;

  if (!password) {
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

router.get('/login', (req, res) => {
  res.render('login'); 
});

router.get('/forgot-password', (req, res) => {
  res.render('forgot-password'); // Render forgot-password.ejs
});

// Forgot password send email to manager
router.post('/forgot-password', (req, res) => {
  const { username, email } = req.body;

  // Step 1: Check if username exists in DB
  const sql = 'SELECT * FROM users WHERE username = ?';
  db.query(sql, [username], (err, rows) => {
    if (err) {
      console.error(err);
      return res.send(`<script>
        alert("Error checking user. Please try again.");
        window.location.href = "/";
      </script>`);
    }

    if (rows.length === 0) {
      // Username not found
      return res.send(`<script>
        alert("Invalid username. Please try again.");
        window.location.href = "/";
      </script>`);
    }

    // Step 2: If username exists, send email to manager
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
});

// Load categories and items
router.get('/home', (req, res) => {
  db.query('SELECT * FROM categories', (err, categories) => {
    if (err) return res.send('DB error');
    db.query('SELECT * FROM items', (err, items) => {
      if (err) return res.send('DB error');
      // Add status and ensure price is a number
      items = items.map(item => ({
        ...item,
        price: Number(item.price), // convert string to number
        status: item.quantity === 0 ? 'Out of Stock' : item.quantity <= 5 ? 'Low Stock' : 'In Stock'
      }));
      res.render('home', { categories, items });
    });
  });
});

// Checkout Route
router.post("/checkout", async (req, res) => {
  const { cart, discountApplied } = req.body;
  const userId = req.session.user?.id || 1;

  if (!cart || cart.length === 0) {
    return res.status(400).json({ success: false, error: "Cart is empty." });
  }

  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();

    const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
    const discount = discountApplied ? subtotal * 0.10 : 0;
    const taxableAmount = subtotal - discount;
    const tax = taxableAmount * 0.06;
    const grandTotal = taxableAmount + tax;

    const [saleResult] = await conn.query(
      "INSERT INTO sales (user_id, subtotal, discount, tax, total, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
      [userId, subtotal, discount, tax, grandTotal]
    );
    const salesId = saleResult.insertId;

    for (const item of cart) {
      await conn.query("UPDATE items SET quantity = quantity - ? WHERE id = ?", [item.qty, item.id]);

      const [[{ quantity: currentQty }]] = await conn.query("SELECT quantity FROM items WHERE id = ?", [item.id]);

      await conn.query(
        `INSERT INTO history (item_id, user_id, sales_id, action, amount, current_quantity, created_at) 
         VALUES (?, ?, ?, 'sales', ?, ?, NOW())`,
        [item.id, userId, salesId, item.qty, currentQty]
      );
    }

    const [[user]] = await conn.query("SELECT username, name FROM users WHERE id = ?", [userId]);

    await conn.commit();

    res.json({
      success: true,
      salesId,
      cashier: user?.name || "Unknown",
      items: cart,
      subtotal,
      discount,
      tax,
      grandTotal
    });
  } catch (err) {
    await conn.rollback();
    console.error("Checkout error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  } finally {
    conn.release();
  }
});

router.get("/history", (req, res) => {
  const { months, start_date, end_date, q } = req.query;

  let sql = `
    SELECT s.id, u.name AS cashier_name, s.total, s.created_at
    FROM sales s
    JOIN users u ON s.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  // Search by cashier name
  if (q) {
    sql += " AND u.name LIKE ?";
    params.push(`%${q}%`);
  }

  // Filter last X months
  if (months) {
    sql += " AND s.created_at >= DATE_SUB(NOW(), INTERVAL ? MONTH)";
    params.push(Number(months));
  }

  // Filter by date range
  if (start_date && end_date) {
    sql += " AND DATE(s.created_at) BETWEEN ? AND ?";
    params.push(start_date, end_date);
  }

  sql += " ORDER BY s.created_at DESC";

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error(err);
      return res.send("Database error");
    }

    res.render("history", {
      history: results,
      search: q || "",
      start_date,
      end_date
    });
  });
});

router.get("/history/:id/detail", (req, res) => {
  const { id } = req.params;

  const sql = `
    SELECT s.id, s.subtotal, s.discount, s.tax, s.total, s.created_at, u.name AS cashier_name,
           i.name AS item_name, i.price, h.amount
    FROM sales s
    JOIN users u ON s.user_id = u.id
    JOIN history h ON h.sales_id = s.id
    JOIN items i ON h.item_id = i.id
    WHERE s.id = ?
  `;

  db.query(sql, [id], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: "Sale not found" });
    }

    res.json(results);
  });
});

// GET profile data (for modal)
router.get('/api/profile', (req, res) => {
  const user = req.session.user;
  
  if (!user) {
    return res.status(401).json({ error: "Not logged in" });
  }

  // fetch fresh data from DB
  const query = 'SELECT * FROM users WHERE id = ?';
  db.query(query, [user.id], (err, results) => {
    if (err) {
      console.error("Error retrieving profile:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(results[0]);
  });
});

// Update profile
router.post('/api/profile/update', (req, res) => {
  const user = req.session.user;

  if (!user) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const { name, id_no, gender, age, contact_no } = req.body;

  const sql = `
    UPDATE users 
    SET name = ?, id_no = ?, gender = ?, age = ?, contact_no = ?
    WHERE id = ?
  `;

  db.query(sql, [name, id_no, gender, age, contact_no, user.id], (err, result) => {
    if (err) {
      console.error("Error updating profile:", err);
      return res.status(500).json({ error: "Database error" });
    }

    // also update session with new values
    req.session.user = { ...req.session.user, name, id_no, gender, age, contact_no };

    res.json({ success: true, message: "Profile updated successfully." });
  });
});

// Export router so server.js can use it
module.exports = router;