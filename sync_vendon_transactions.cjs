/**
 * Vendon Transaktions-Sync für fehlende Tage
 * Importiert aktuelle Transaktionen vom 9.-10. Juni 2025
 */

require('dotenv').config();
const { Pool } = require('pg');

// Datenbankverbindung
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Vendon API Konfiguration
const VENDON_API_BASE = 'https://api.vendon.net/1.0';
const VENDON_API_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIzIiwianRpIjoiNDJmZWI0NzEwZWM1ZWNmN2NjYTQ0NjFkZWM4ODU1YzI4YzY4NWI4YTY4MzU4YzBhNzNhZWE4YjZmM2U4ZmJlZGJhOGZhMmQ0ZGE3MDI4Y2EiLCJpYXQiOjE3MTIyMzk2MzcsIm5iZiI6MTcxMjIzOTYzNywiZXhwIjoxNzQzNzc1NjM3LCJzdWIiOiI3NiIsInNjb3BlcyI6W119.iCWaZv3wPIuOE6jVU9jdnpyT9Q6pKcxsUgM6zN7VAVkJ4Uds7qD5hFeWYGsNfRpq7xk3TQoAhcOKRfJpGqGWqiYLUv1iCTqjXKfAmWeFzCHrKhcpL6TQcJOK1HVAiJ-1QaKOIFmtJXCw6WfMQqCr3kKGMFNzQ5nDgP6YhGJFu5kAQKjdqc1Nw7RsKtL2WMx8gHhBfPr4VzE9XpSj6bYvCzO3mKnW0qLuT8R5sGhI7yDcFl1PeA2ZpNmV9iBxJvKtS4';

async function fetchVendonTransactions(startDate, endDate) {
  console.log(`Fetching transactions from ${startDate} to ${endDate}...`);
  
  let allTransactions = [];
  let page = 1;
  const perPage = 100;
  
  while (true) {
    try {
      const url = `${VENDON_API_BASE}/vends?page=${page}&per_page=${perPage}&from=${startDate}&to=${endDate}`;
      console.log(`Fetching page ${page}...`);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${VENDON_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.data || data.data.length === 0) {
        console.log(`No more data on page ${page}`);
        break;
      }
      
      allTransactions.push(...data.data);
      console.log(`Page ${page}: ${data.data.length} transactions`);
      
      if (data.data.length < perPage) {
        console.log('Last page reached');
        break;
      }
      
      page++;
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error.message);
      break;
    }
  }
  
  console.log(`Total transactions fetched: ${allTransactions.length}`);
  return allTransactions;
}

async function saveTransactionsToDatabase(transactions) {
  console.log(`Saving ${transactions.length} transactions to database...`);
  
  let saved = 0;
  let duplicates = 0;
  
  for (const transaction of transactions) {
    try {
      // Check if transaction already exists
      const existingQuery = 'SELECT id FROM transactions WHERE vendon_id = $1';
      const existingResult = await pool.query(existingQuery, [transaction.id.toString()]);
      
      if (existingResult.rows.length > 0) {
        duplicates++;
        continue;
      }
      
      // Find machine by vendon_id
      const machineQuery = 'SELECT id, machine_name FROM machines WHERE vendon_id = $1';
      const machineResult = await pool.query(machineQuery, [transaction.machine_id.toString()]);
      
      if (machineResult.rows.length === 0) {
        console.log(`Machine not found for vendon_id: ${transaction.machine_id}`);
        continue;
      }
      
      const machine = machineResult.rows[0];
      
      // Convert timestamps
      const datetime = new Date(transaction.datetime * 1000);
      const transactionDt = new Date(transaction.transaction_dt * 1000);
      const registeredDt = new Date(transaction.registered_dt * 1000);
      
      // Insert transaction
      const insertQuery = `
        INSERT INTO transactions (
          vendon_id, machine_id, machine_name, datetime, transaction_dt, registered_dt,
          product_name, selection, stock_id, quantity, price, price_vat, price_wo_vat,
          vat, currency, payment_method, source, extra_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      `;
      
      const insertValues = [
        transaction.id.toString(),
        machine.id,
        machine.machine_name,
        datetime,
        transactionDt,
        registeredDt,
        transaction.article || 'Unknown Product',
        transaction.selection || 0,
        transaction.stock_id || null,
        transaction.quantity || 1,
        parseFloat(transaction.price || 0),
        parseFloat(transaction.price_vat || 0),
        parseFloat(transaction.price_wo_vat || 0),
        parseInt(transaction.vat || 0),
        transaction.currency || 'EUR',
        transaction.payment_method || 'UNKNOWN',
        'VENDON_SYNC',
        JSON.stringify(transaction)
      ];
      
      await pool.query(insertQuery, insertValues);
      saved++;
      
    } catch (error) {
      console.error(`Error saving transaction ${transaction.id}:`, error.message);
    }
  }
  
  console.log(`Saved: ${saved}, Duplicates: ${duplicates}`);
  return { saved, duplicates };
}

async function updateSyncState(lastDate) {
  try {
    const updateQuery = `
      UPDATE sync_state 
      SET last_date = $1, updated_at = NOW() 
      WHERE job_name = 'vendon_history_import'
    `;
    await pool.query(updateQuery, [lastDate]);
    console.log(`Sync state updated to: ${lastDate}`);
  } catch (error) {
    console.error('Error updating sync state:', error.message);
  }
}

async function main() {
  try {
    console.log('=== Vendon Transaction Sync Start ===');
    
    // Fetch transactions for missing days
    const startDate = '2025-06-09';
    const endDate = '2025-06-10';
    
    const transactions = await fetchVendonTransactions(startDate, endDate);
    
    if (transactions.length > 0) {
      const result = await saveTransactionsToDatabase(transactions);
      await updateSyncState(endDate);
      
      console.log(`=== Sync Complete ===`);
      console.log(`Total fetched: ${transactions.length}`);
      console.log(`Saved: ${result.saved}`);
      console.log(`Duplicates: ${result.duplicates}`);
    } else {
      console.log('No transactions found for the specified period');
    }
    
  } catch (error) {
    console.error('Sync failed:', error.message);
  } finally {
    await pool.end();
  }
}

// Start the sync
main();