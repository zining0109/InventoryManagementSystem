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
      // Successful login
      req.session.username = results[0].username; // store user ID in session
      res.redirect('/home'); // Redirect to home page
    } else {
      // Invalid login
      res.send(`<script>
        alert("Invalid Username or Password");
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
  const { name, sku, category_id, color, quantity, price, barcode, description } = req.body;

  const sql = `
    UPDATE items 
    SET name = ?, sku = ?, category_id = ?, color = ?, quantity = ?, price = ?, barcode = ?, description = ?
    WHERE id = ?
  `;

  db.query(sql, [name, sku, category_id, color, quantity, price, barcode, description, id], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Failed to update item');
    }
    res.send(`
      <script>
        alert("Successfully saved");
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
      return res.status(500).json({ message: 'Failed to delete item' });
    }

      res.json({ message: 'Item deleted successfully' });
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

module.exports = router;
