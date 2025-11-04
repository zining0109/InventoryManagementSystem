// admin-site/utils/checkStock.js
const db = require('../db'); // adjust path if needed

function checkStock(io) {
  const now = new Date();

  db.query('SELECT id AS item_id, name, quantity FROM items', (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return;
    }

    results.forEach(item => {
      let alertStatus = null;

      if (item.quantity === 0) alertStatus = 'Out of Stock';
      else if (item.quantity < 5) alertStatus = 'Low Stock';

      if (!alertStatus) {
        // If stock recovered, mark previous unread alerts as read
        const resolveQuery = `
          UPDATE notifications
          SET is_read = 1
          WHERE item_id = ? AND is_read = 0
        `;
        db.query(resolveQuery, [item.item_id]);
        return;
      }

      // Check if similar alert exists within 7 days
      const checkQuery = `
        SELECT id FROM notifications
        WHERE item_id = ?
          AND status = ?
          AND created_at >= NOW() - INTERVAL 7 DAY
        LIMIT 1
      `;
      db.query(checkQuery, [item.item_id, alertStatus], (err2, existing) => {
        if (err2) return console.error('Query error:', err2);

        if (existing.length === 0) {
          const message = `${item.name} is ${alertStatus} (qty ${item.quantity})`;
          const insertQuery = `
            INSERT INTO notifications (item_id, status, message, created_at, is_read)
            VALUES (?, ?, ?, NOW(), 0)
          `;
          db.query(insertQuery, [item.item_id, alertStatus, message], (err3, insertRes) => {
            if (err3) return console.error('Insert error:', err3);

            const notif = {
              id: insertRes.insertId,
              item_id: item.item_id,
              item_name: item.name,
              status: alertStatus,
              message,
              created_at: now.toISOString(),
              is_read: 0
            };
            io.emit('notification', notif);
            console.log('Emitted new notification:', notif);
          });
        }
      });
    });
  });
}

module.exports = checkStock;