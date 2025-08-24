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

  // DB check
  const query = 'SELECT * FROM users WHERE username = ? AND password = ? AND role = "warehouse staff"';
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

router.get('/login', (req, res) => {
  res.render('login'); // Renders views/login.ejs
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

router.get('/item', (req, res) => {
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

    res.render('item', { items: results, search: searchQuery || '' });
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

    res.render('item-detail', { item: result[0] });
  });
});


// Show edit form
router.get('/item/edit/:id', (req, res) => {
  const id = req.params.id;

  const itemSql = 'SELECT * FROM items WHERE id = ?';
  const categorySql = 'SELECT * FROM categories';

  db.query(itemSql, [id], (err, itemResults) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }
    if (itemResults.length === 0) {
      return res.status(404).send('Item not found');
    }

    db.query(categorySql, (err, categoryResults) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Database error');
      }

      res.render('edit-item', {
        item: itemResults[0],
        categories: categoryResults
      });
    });
  });
});


// Handle form submission
router.post('/item/edit/:id', (req, res) => {
  const id = req.params.id;
  const { name, sku, category_id, color, price, barcode, description } = req.body;

  const sql = `
    UPDATE items 
    SET name = ?, sku = ?, category_id = ?, color = ?, price = ?, barcode = ?, description = ?
    WHERE id = ?
  `;

  db.query(sql, [name, sku, category_id, color, price, barcode, description, id], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Failed to update item.');
    }
    res.send(`
      <script>
        alert("Item updated successfully.");
        window.location.href = "/item/${id}";
      </script>
    `);
  });
});

// Delete item POST route
router.delete('/item/delete/:id', (req, res) => {
  const id = req.params.id;
  
  const sql = 'DELETE FROM items WHERE id = ?';
  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Failed to delete item.' });
    }

      res.json({ message: 'Item deleted successfully.' });
    });
});

router.get('/add-item', (req, res) => {
  const sql = "SELECT id, name FROM categories";
  db.query(sql, (err, categories) => {
    if (err) return res.status(500).send(err);
    res.render('add-item', { categories });
  });
});

// Add item POST route
router.post("/add-item", (req, res) => {
    const { name, sku, category_id, color, quantity, price, barcode, description } = req.body;

    const sql = `
        INSERT INTO items (name, sku, category_id, color, quantity, price, barcode, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    db.query(sql, [name, sku, category_id, color, quantity, price, barcode, description], (err, result) => {
        if (err) throw err;
        console.log("Item added:", result.insertId);
        res.redirect("/item"); // redirect to item list page
    });
});

router.get('/category', (req, res) => {
  const search = req.query.q ? `%${req.query.q}%` : null;

  let sql = `
    SELECT c.id, c.name, c.description, IFNULL(SUM(i.quantity), 0) AS total_quantity
    FROM categories c
    LEFT JOIN items i ON c.id = i.category_id
  `;

  if (search) {
    sql += ` WHERE c.name LIKE ? `;
  }

  sql += ` GROUP BY c.id, c.name, c.description`;

  db.query(sql, search ? [search] : [], (err, results) => {
    if (err) return res.status(500).send(err);
    res.render('category', { categories: results });
  });
});

// Get items of a category (AJAX)
router.get('/category/:id/items', (req, res) => {
  const categoryId = req.params.id;
  const sql = 'SELECT id, name FROM items WHERE category_id = ?';

  db.query(sql, [categoryId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results); // return items as JSON
  });
});

router.delete('/category/delete/:id', (req, res) => {
  const id = req.params.id;
  db.query('DELETE FROM categories WHERE id = ?', [id], (err, result) => {
    if (err) {
      console.error(err);
      return res.json({ success: false, message: "Failed to delete category." });
    }
    res.json({ success: true, message: "Category deleted successfully." });
  });
});

router.get('/add-category', (req, res) => {
  res.render('add-category'); 
});

// Handle add form
router.post('/add-category', (req, res) => {
  const { name, description } = req.body;
  const sql = 'INSERT INTO categories (name, description) VALUES (?, ?)';

  db.query(sql, [name, description], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }

    res.send(`
      <script>
        alert("Category added successfully.");
        window.location.href = "/category";
      </script>
    `);
  });
});

// Edit category page
router.get('/category/edit/:id', (req, res) => {
  const categoryId = req.params.id;

  // Fetch category details
  const sqlCategory = 'SELECT * FROM categories WHERE id = ?';
  // Fetch items of this category
  const sqlItems = 'SELECT * FROM items WHERE category_id = ?';
  // Fetch all categories (for moving items)
  const sqlAllCategories = 'SELECT id, name FROM categories';

  db.query(sqlCategory, [categoryId], (err, categoryResult) => {
    if (err) return res.status(500).send(err);

    db.query(sqlItems, [categoryId], (err2, itemsResult) => {
      if (err2) return res.status(500).send(err2);

      db.query(sqlAllCategories, (err3, allCats) => {
        if (err3) return res.status(500).send(err3);

        res.render('edit-category', { 
          category: categoryResult[0], 
          items: itemsResult,
          allCategories: allCats
        });
      });
    });
  });
});

// Save edited category info
router.post('/category/edit/:id', (req, res) => {
  const { name, description } = req.body;
  const categoryId = req.params.id;

  const sql = 'UPDATE categories SET name = ?, description = ? WHERE id = ?';
  db.query(sql, [name, description, categoryId], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }

    res.send(`
      <script>
        alert("Category updated successfully.");
        window.location.href = "/category";
      </script>
    `);
  });
});

// Move item to another category
router.post('/item/:id/move', (req, res) => {
  const itemId = req.params.id;
  const { newCategoryId, oldCategoryId } = req.body;

  const sql = 'UPDATE items SET category_id = ? WHERE id = ?';
  db.query(sql, [newCategoryId, itemId], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }

    res.send(`
      <script>
        alert("Item moved successfully.");
        window.location.href = "/category/edit/${oldCategoryId}";
      </script>
    `);
  });
});

router.get('/barcode', (req, res) => {
  res.render('barcode'); // Render barcode.ejs
});

// Search barcode
router.get("/search-barcode", (req, res) => {
  const barcode = req.query.barcode;

  if (!barcode) {
    return res.json({ exists: false });
  }

  const sql = "SELECT * FROM items WHERE barcode = ?";
  db.query(sql, [barcode], (err, results) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ exists: false });
    }

    if (results.length > 0) {
      const item = results[0];
      res.json({
        exists: true,
        item: {
          id: item.id,
          name: item.name,
          barcode: item.barcode,
          stock: item.stock
        }
      });
    } else {
      res.json({ exists: false });
    }
  });
});


// Inbound (increase quantity)
router.post('/inbound/:id', (req, res) => {
  const { amount } = req.body;
  const itemId = req.params.id;
  const userId = req.session.user?.id; // get logged-in user id from session

  if (!userId) {
    return res.status(401).send("Unauthorized: Please log in");
  }

  const sql = "UPDATE items SET quantity = quantity + ? WHERE id = ?";
  db.query(sql, [amount, itemId], (err) => {
    if (err) {
      console.error("Inbound error:", err);
      return res.status(500).send("Database error");
    }

    // get current quantity
    db.query("SELECT quantity FROM items WHERE id = ?", [itemId], (err, result) => {
      if (err) return res.status(500).send("Database error");

      const currentQty = result[0].quantity;

      // log to history
      const sqlHistory = `
        INSERT INTO history (item_id, user_id, action, amount, current_quantity)
        VALUES (?, ?, 'inbound', ?, ?)
      `;
      db.query(sqlHistory, [itemId, userId, amount, currentQty], (err2) => {
        if (err2) {
          console.error("History insert error:", err2);
        }

      res.redirect(`/item/${itemId}`);
      });
    });
  });
});

// Outbound (decrease quantity)
router.post('/outbound/:id', (req, res) => {
  const itemId = req.params.id;
  const { amount } = req.body;
  const userId = req.session.user?.id; // get logged-in user id from session

  if (!userId) {
    return res.status(401).send("Unauthorized: Please log in");
  }

  const sql = `UPDATE items SET quantity = quantity - ? WHERE id = ? AND quantity >= ?`;
  db.query(sql, [amount, itemId, amount], (err, result) => {
    if (err) return res.status(500).send('Database error');

    if (result.affectedRows === 0) {
      // Not enough stock
      return res.send(`
        <script>
          alert("Not enough stock for outbound.");
          window.location.href = "/item/${itemId}";
        </script>
      `);
    }

    // get current quantity
    db.query("SELECT quantity FROM items WHERE id = ?", [itemId], (err, result) => {
      if (err) return res.status(500).send("Database error");

      const currentQty = result[0].quantity;

      // log to history
      const sqlHistory = `
        INSERT INTO history (item_id, user_id, action, amount, current_quantity)
        VALUES (?, ?, 'outbound', ?, ?)
      `;
      db.query(sqlHistory, [itemId, userId, amount, currentQty], (err2) => {
        if (err2) {
          console.error("History insert error:", err2);
        }

      // redirect to item detail page
      res.redirect(`/item/${itemId}`);
      });
    });
  });
});

router.get('/history', (req, res) => {
  const userId = req.session.user?.id;
  const { q, action, start_date, end_date } = req.query;

  if (!userId) {
    return res.status(401).send("Unauthorized: Please log in");
  }

  // Base query
  let sql = `
    SELECT h.id, i.name AS item_name, h.action, h.amount, h.current_quantity, h.created_at
    FROM history h
    JOIN items i ON h.item_id = i.id
    WHERE h.user_id = ?
  `;
  let params = [userId];

  // Search by item name
  if (q) {
    sql += " AND i.name LIKE ?";
    params.push(`%${q}%`);
  }

  // Filter by action
  if (action) {
    sql += " AND h.action = ?";
    params.push(action);
  }

  // Date range filter
  if (start_date && end_date) {
    sql += " AND DATE(h.created_at) BETWEEN ? AND ?";
    params.push(start_date, end_date);
  } else if (start_date) {
    sql += " AND DATE(h.created_at) >= ?";
    params.push(start_date);
  } else if (end_date) {
    sql += " AND DATE(h.created_at) <= ?";
    params.push(end_date);
  }

  // Always order by date
  sql += " ORDER BY h.created_at DESC";

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error("History fetch error:", err);
      return res.status(500).send("Database error");
    }

    // Pass filters back so your EJS can pre-fill form inputs
    res.render("history", { history: results, q, action, start_date, end_date });
  });
});


module.exports = router;
