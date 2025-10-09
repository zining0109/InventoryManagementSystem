//app.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require("multer");
const path = require("path");

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
      req.session.username = results[0].username; // Store user ID in session

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

// Forgot password send email to manager
router.post('/forgot-password', (req, res) => {
  const { username, email } = req.body;

  // Step 1: Validate username in DB
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

    // Step 2: Send email to admin
    const nodemailer = require('nodemailer');
    const adminEmail = process.env.EMAIL_ADMIN;

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

      res.send(`<script>
        alert("An email has been sent to your manager. Please wait and check the new password from the reply email.");
        window.location.href = "/";
      </script>`);
    });
  });
});

router.get('/login', (req, res) => {
  res.render('login'); // Renders views/login.ejs
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

    res.render('profile', { user: results[0] }); // Send user data to EJS
  });
});

router.get('/edit-profile', (req, res) => {
  res.render('edit-profile'); // Renders views/login.ejs
});

// Show edit profile form
router.get('/edit-profile', (req, res) => {
  const username = req.session.username;
  if (username) {
    return res.redirect('/login');
  }
  db.query('SELECT * FROM users WHERE id = ?', [userId], (err, results) => {
    if (err || results.length === 0) {
      return res.send('User not found');
    }
    res.render('edit-profile', { user: results[0] });
  });
});

// Handle edit profile submission
router.post('/edit-profile', (req, res) => {
  const username = req.session.username;
  if (!username) {
    return res.redirect('/login');
  }
  const { name, id_no, gender, age, contact_no } = req.body;
  db.query(
    'UPDATE users SET name = ?, id_no = ?, gender = ?, age = ?, contact_no = ? WHERE username = ?',
    [name, id_no, gender, age, contact_no, username],
    (err, result) => {
      if (err) {
        return res.send('Failed to update profile');
      }
      res.send(`
      <script>
        alert("Profile updated successfully.");
        window.location.href = "/profile";
      </script>
    `);
    }
  );
});

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../..", "uploads/items")); // Folder for uploads
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Unique filename
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png|gif/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);

    if (mimetype && extname) cb(null, true);
    else cb("Please upload images.");
  },
});
 
router.get('/item', (req, res) => {
  const searchQuery = req.query.q;
  const statusFilter = req.query.status; // Get status from query
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

  // Status filter (In, Low, Out)
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

    res.render('item', { items: results, search: searchQuery || '', status: statusFilter || '' });
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

    // Ensure quantity is numeric
    const qty = Number(item.quantity) || 0;

    if (qty === 0) {
      item.status = "Out of Stock";
    } else if (qty < 5) {
      item.status = "Low Stock";
    } else {
      item.status = "In Stock";
    }

    res.render('item-detail', { item });
  });
});

// Show edit form
router.get("/item/edit/:id", (req, res) => {
  const id = req.params.id;

  const itemSql = "SELECT * FROM items WHERE id = ?";
  const categorySql = "SELECT * FROM categories";

  db.query(itemSql, [id], (err, itemResults) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Database error");
    }
    if (itemResults.length === 0) {
      return res.status(404).send("Item not found");
    }

    db.query(categorySql, (err, categoryResults) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Database error");
      }

      res.render("edit-item", {
        item: itemResults[0],
        categories: categoryResults,
      });
    });
  });
});

// Handle form submission
router.post("/item/edit/:id", upload.single("image"), (req, res) => {
  const id = req.params.id;
  const { name, sku, category_id, color, price, barcode, description } = req.body;

  // Step 1: Check if SKU already exists for another item
  const checkSkuSql = "SELECT id FROM items WHERE sku = ? AND id <> ?";
  db.query(checkSkuSql, [sku, id], (err, skuResults) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Database error");
    }
    if (skuResults.length > 0) {
      return res.send(`
        <script>
          alert("SKU already exists. Please use another SKU.");
          window.history.back();
        </script>
      `);
    }

    // Step 2: Check if Barcode already exists for another item
    const checkBarcodeSql = "SELECT id FROM items WHERE barcode = ? AND id <> ?";
    db.query(checkBarcodeSql, [barcode, id], (err, barcodeResults) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Database error");
      }
      if (barcodeResults.length > 0) {
        return res.send(`
          <script>
            alert("Barcode already exists. Please use another Barcode.");
            window.history.back();
          </script>
        `);
      }

      // Step 3: If passed validation → proceed with update
      let imageQuery = "";
      let params = [name, sku, category_id, color, price, barcode, description];

      if (req.file) {
        imageQuery = ", image = ?";
        params.push(req.file.filename);
      }

      params.push(id);

      const sql = `
        UPDATE items 
        SET name = ?, sku = ?, category_id = ?, color = ?, price = ?, barcode = ?, description = ?
        ${imageQuery}
        WHERE id = ?
      `;

      db.query(sql, params, (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).send("Failed to update item.");
        }
        res.send(`
          <script>
            alert("Item updated successfully.");
            window.location.href = "/item/${id}";
          </script>
        `);
      });
    });
  });
});

// Delete item route
router.get('/item/delete/:id', (req, res) => {
  const id = req.params.id;

  // Step 1: Check item quantity first
  const checkSql = 'SELECT quantity FROM items WHERE id = ?';
  db.query(checkSql, [id], (err, rows) => {
    if (err) {
      console.error(err);
      return res.send(`
        <script>
          alert("Error checking item.");
          window.location.href = "/item";
        </script>
      `);
    }

    if (rows.length === 0) {
      return res.send(`
        <script>
          alert("Item not found.");
          window.location.href = "/item";
        </script>
      `);
    }

    const quantity = rows[0].quantity;

    if (quantity > 0) {
      // Prevent deletion if stock exists
      return res.send(`
        <script>
          alert("Cannot delete item. Quantity is greater than 0.");
          window.location.href = "/item";
        </script>
      `);
    }

    // Step 2: Proceed with deletion if quantity = 0
    const deleteSql = 'DELETE FROM items WHERE id = ?';
    db.query(deleteSql, [id], (err, result) => {
      if (err) {
        console.error(err);
        return res.send(`
          <script>
            alert("Failed to delete item.");
            window.location.href = "/item";
          </script>
        `);
      }

      res.send(`
        <script>
          alert("Item deleted successfully.");
          window.location.href = "/item";
        </script>
      `);
    });
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
router.post("/add-item", upload.single("image"), (req, res) => {
  const { name, sku, category_id, color, quantity, price, barcode, description } = req.body;

  const image = req.file ? req.file.filename : "default.png";

  // Step 1: Check if SKU already exists
  const checkSkuSql = "SELECT id FROM items WHERE sku = ?";
  db.query(checkSkuSql, [sku], (err, skuResults) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Database error");
    }
    if (skuResults.length > 0) {
      return res.send(`
        <script>
          alert("SKU already exists. Please use another SKU.");
          window.history.back();
        </script>
      `);
    }

    // Step 2: Check if Barcode already exists
    const checkBarcodeSql = "SELECT id FROM items WHERE barcode = ?";
    db.query(checkBarcodeSql, [barcode], (err, barcodeResults) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Database error");
      }
      if (barcodeResults.length > 0) {
        return res.send(`
          <script>
            alert("Barcode already exists. Please use another Barcode.");
            window.history.back();
          </script>
        `);
      }

      // Step 3: If passed validation → insert new item
      const sql = `
        INSERT INTO items (name, sku, category_id, color, quantity, price, barcode, description, image)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const params = [name, sku, category_id, color, quantity, price, barcode, description, image];

      db.query(sql, params, (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).send("Failed to add item.");
        }
        res.send(`
          <script>
            alert("Item added successfully.");
            window.location.href = "/item";
          </script>
        `);
      });
    });
  });
});

router.get('/category', (req, res) => {
  const search = req.query.q || null;

  let sql = `
    SELECT c.id, c.name, c.description, IFNULL(SUM(i.quantity), 0) AS total_quantity
    FROM categories c
    LEFT JOIN items i ON c.id = i.category_id
  `;

  if (search) {
    sql += ` WHERE c.name LIKE ? `;
  }

  sql += ` GROUP BY c.id, c.name, c.description`;

  db.query(sql, search ? [`%${search}%`] : [], (err, results) => {
    if (err) return res.status(500).send(err);
    res.render('category', { categories: results, search });
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
    res.json(results); // Return items as JSON
  });
});

router.get('/category/delete/:id', (req, res) => {
  const id = req.params.id;

  db.query('DELETE FROM categories WHERE id = ?', [id], (err, result) => {
    if (err) {
      console.error(err);
      return res.send(`
        <script>
          alert("Failed to delete category.");
          window.location.href = "/category";
        </script>
      `);
    }

    if (result.affectedRows === 0) {
      return res.send(`
        <script>
          alert("Category not found.");
          window.location.href = "/category";
        </script>
      `);
    }

    res.send(`
      <script>
        alert("Category deleted successfully.");
        window.location.href = "/category";
      </script>
    `);
  });
});

router.get('/add-category', (req, res) => {
  res.render('add-category'); 
});

// Handle add form
router.post('/add-category', (req, res) => {
  const { name, description } = req.body;

  // Check if category already exists
  const checkSql = 'SELECT * FROM categories WHERE name = ? LIMIT 1';
  db.query(checkSql, [name], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }

    if (results.length > 0) {
      // Category already exists
      return res.send(`
        <script>
          alert("Category name already exists. Please use another category name.");
          window.location.href = "/category";
        </script>
      `);
    }

    // Insert new category if not exists
    const insertSql = 'INSERT INTO categories (name, description) VALUES (?, ?)';
    db.query(insertSql, [name, description], (err, result) => {
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
  const userId = req.session.user?.id; // Get logged-in user id from session

  if (!userId) {
    return res.status(401).send("Unauthorized: Please log in");
  }

  const sql = "UPDATE items SET quantity = quantity + ? WHERE id = ?";
  db.query(sql, [amount, itemId], (err) => {
    if (err) {
      console.error("Inbound error:", err);
      return res.status(500).send("Database error");
    }

    // Get current quantity
    db.query("SELECT quantity FROM items WHERE id = ?", [itemId], (err, result) => {
      if (err) return res.status(500).send("Database error");

      const currentQty = result[0].quantity;

      // Log to history
      const sqlHistory = `
        INSERT INTO history (item_id, user_id, action, amount, current_quantity)
        VALUES (?, ?, 'inbound', ?, ?)
      `;
      db.query(sqlHistory, [itemId, userId, amount, currentQty], (err2) => {
        if (err2) {
          console.error("History insert error:", err2);
        }
      
      res.send(`<script>
        alert("Inbound recorded successfully.");
        window.location.href = "/item/${itemId}";
        </script>`);
      });
    });
  });
});

// Outbound (decrease quantity)
router.post('/outbound/:id', (req, res) => {
  const itemId = req.params.id;
  const { amount } = req.body;
  const userId = req.session.user?.id; // Get logged-in user id from session

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

    // Get current quantity
    db.query("SELECT quantity FROM items WHERE id = ?", [itemId], (err, result) => {
      if (err) return res.status(500).send("Database error");

      const currentQty = result[0].quantity;

      // Log to history
      const sqlHistory = `
        INSERT INTO history (item_id, user_id, action, amount, current_quantity)
        VALUES (?, ?, 'outbound', ?, ?)
      `;
      db.query(sqlHistory, [itemId, userId, amount, currentQty], (err2) => {
        if (err2) {
          console.error("History insert error:", err2);
        }

      res.send(`<script>
        alert("Outbound recorded successfully.");
        window.location.href = "/item/${itemId}";
        </script>`);
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
    res.render("history", { history: results, search: q || "", action, start_date, end_date });
  });
});

module.exports = router;
