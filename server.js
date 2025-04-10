const express = require('express');
const bodyParser = require('body-parser');
const ExcelJS = require('exceljs');
const path = require('path');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid'); // Import the uuid library for generating unique IDs

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

async function saveOrderToExcel(order) {
    const workbook = new ExcelJS.Workbook();
    const filename = 'customer_orders.xlsx';
    let customerWorksheet;
    let summaryWorksheet;
    const currentOrderVendorQuantities = {};
    const aggregatedVendorTotals = {};

    try {
        await workbook.xlsx.readFile(filename);
        customerWorksheet = workbook.getWorksheet('Customer Orders') || workbook.addWorksheet('Customer Orders');
        summaryWorksheet = workbook.getWorksheet('Vendor Summary') || workbook.addWorksheet('Vendor Summary');
    } catch (error) {
        customerWorksheet = workbook.addWorksheet('Customer Orders');
        summaryWorksheet = workbook.addWorksheet('Vendor Summary');
        customerWorksheet.addRow(['Order Number', 'Order Date', 'Customer Name', 'Phone Number', 'Vendor', 'Item', 'Quantity', 'Price', 'Total']);
        summaryWorksheet.addRow(['Vendor', 'Item', 'Total Quantity']);
    }

    // --- Customer Order Details ---
    const orderDate = new Date().toLocaleString();
    const orderNumber = uuidv4(); // Generate a unique order ID

    for (const vendorName in order.items) {
        if (!currentOrderVendorQuantities[vendorName]) {
            currentOrderVendorQuantities[vendorName] = {};
        }
        for (const itemName in order.items[vendorName]) {
            const item = order.items[vendorName][itemName];
            customerWorksheet.addRow([
                orderNumber, // Add the order number
                orderDate,
                order.customer.name,
                order.customer.phone,
                vendorName,
                itemName,
                item.quantity,
                item.price,
                item.quantity * item.price,
            ]);
            currentOrderVendorQuantities[vendorName][itemName] = (currentOrderVendorQuantities[vendorName][itemName] || 0) + item.quantity;
        }
    }
    customerWorksheet.addRow([]); // Add an empty row for spacing

    // --- Aggregate Vendor Summary ---
    const existingSummaryData = {};
    if (summaryWorksheet) {
        summaryWorksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                const vendor = row.getCell(1).value;
                const item = row.getCell(2).value;
                const quantity = row.getCell(3).value ? Number(row.getCell(3).value) : 0;
                if (vendor && item) {
                    if (!existingSummaryData[vendor]) {
                        existingSummaryData[vendor] = {};
                    }
                    existingSummaryData[vendor][item] = quantity;
                }
            }
        });
    }

    for (const vendorName in currentOrderVendorQuantities) {
        if (!aggregatedVendorTotals[vendorName]) {
            aggregatedVendorTotals[vendorName] = { ...existingSummaryData[vendorName] };
        }
        for (const itemName in currentOrderVendorQuantities[vendorName]) {
            aggregatedVendorTotals[vendorName][itemName] = (aggregatedVendorTotals[vendorName][itemName] || 0) + currentOrderVendorQuantities[vendorName][itemName];
        }
    }

    const headerRowCount = 1;
    if (summaryWorksheet) {
        summaryWorksheet.spliceRows(headerRowCount + 1, summaryWorksheet.rowCount - headerRowCount);
        for (const vendorName in aggregatedVendorTotals) {
            for (const itemName in aggregatedVendorTotals[vendorName]) {
                summaryWorksheet.addRow([vendorName, itemName, aggregatedVendorTotals[vendorName][itemName]]);
            }
        }
        summaryWorksheet.addRow([]); // Add an empty row for spacing
    }

    try {
        await workbook.xlsx.writeFile(filename);
        console.log('Order data saved to Excel.');
    } catch (error) {
        console.error('Error writing to Excel file:', error);
    }

    return orderNumber; // Return the generated order number
}

app.post('/api/submit-order', async (req, res) => {
    const orderData = req.body;
    console.log('Received order data:', orderData);

    try {
        const orderNumber = await saveOrderToExcel(orderData);
        res.json({ message: 'Order received successfully!', orderNumber: orderNumber }); // Send back the order number
    } catch (error) {
        console.error('Error processing order in route:', error);
        res.status(500).json({ error: 'Failed to process order.' });
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});