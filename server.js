const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));


function generate5DigitOrderNumberWithTime() {
    const timestampPart = Date.now().toString().slice(-3); // Last 3 digits of the timestamp
    const randomPart = Math.floor(Math.random() * 100).toString().padStart(2, '0'); // 2 random digits
    return parseInt(timestampPart + randomPart);
}

// Database connection pool configuration
const pool = new Pool({
    connectionString: "postgresql://food_pre_order_db_user:PH3UMYXXsYSRnoKWN6vJegvQsDujj6LB@dpg-cvrs78muk2gs73bja5fg-a.frankfurt-postgres.render.com/food_pre_order_db",
    ssl: {
        rejectUnauthorized: false // Required for Render's free PostgreSQL tier
    }
});

async function saveOrderToDatabase(order) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Start a transaction

        const orderDate = new Date();
        const customerName = order.customer.name;
        const customerPhone = order.customer.phone;

        const orderResult = await client.query(
            'INSERT INTO orders (order_date, customer_name, customer_phone) VALUES ($1, $2, $3) RETURNING order_id',
            [orderDate, customerName, customerPhone]
        );
        const orderId = orderResult.rows[0].order_id;

        for (const vendorName in order.items) {
            for (const itemName in order.items[vendorName]) {
                const item = order.items[vendorName][itemName];
                await client.query(
                    'INSERT INTO order_items (order_id, vendor_name, item_name, quantity, price) VALUES ($1, $2, $3, $4, $5)',
                    [orderId, vendorName, itemName, item.quantity, item.price]
                );

                // Update the vendor summary
                await updateVendorSummary(client, vendorName, itemName, item.quantity);
            }
        }

        await client.query('COMMIT'); // Commit the transaction
        return orderId;
    } catch (error) {
        await client.query('ROLLBACK'); // Rollback the transaction on error
        console.error('Error saving order:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function updateVendorSummary(client, vendorName, itemName, quantity) {
    await client.query(
        `INSERT INTO vendor_summary (vendor_name, item_name, total_quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (vendor_name, item_name)
         DO UPDATE SET total_quantity = vendor_summary.total_quantity + $3`,
        [vendorName, itemName, quantity]
    );
}


app.post('/api/submit-order', async (req, res) => {
    const orderData = req.body;
    console.log('Received order data:', orderData);

    try {
        const orderId = await saveOrderToDatabase(orderData);
        res.json({ message: 'Order received successfully!', orderId: orderId }); // Send back the order ID
    } catch (error) {
        console.error('Error processing order in route:', error);
        res.status(500).json({ error: 'Failed to process order.', details: error.message });
    }
});

// Example route to fetch all orders (for demonstration - you'll likely need more specific queries)
app.get('/api/orders', async (req, res) => {
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT * FROM orders ORDER BY order_date DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders.', details: error.message });
    } finally {
        client.release();
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
