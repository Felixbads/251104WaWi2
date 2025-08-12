#!/usr/bin/env node
/**
 * CRITICAL: Machine Duplicates Cleanup Script
 * 
 * Problem: 13,867 machine records for only 19 real machines due to faulty Vendon sync
 * Solution: Keep oldest record per vendon_id, merge related data, delete duplicates
 * 
 * Safety: Handles foreign key constraints by updating references before deletion
 */

const { Client } = require('pg');
require('dotenv').config();

const db = new Client({
  connectionString: process.env.DATABASE_URL
});

async function cleanupMachineDuplicates() {
  try {
    await db.connect();
    console.log('🔧 Starting machine duplicates cleanup...');

    // Step 1: Get overview of the problem
    const overview = await db.query(`
      SELECT 
        COUNT(*) as total_machines,
        COUNT(DISTINCT vendon_id) as unique_vendon_ids,
        COUNT(DISTINCT machine_name) as unique_names
      FROM machines 
      WHERE vendon_id IS NOT NULL AND vendon_id != ''
    `);
    
    console.log('📊 Problem Overview:', overview.rows[0]);

    // Step 2: Get duplicates grouped by vendon_id
    const duplicates = await db.query(`
      SELECT 
        vendon_id, 
        machine_name, 
        COUNT(*) as duplicate_count,
        ARRAY_AGG(id ORDER BY created_at ASC) as all_ids,
        MIN(id) as keep_id
      FROM machines 
      WHERE vendon_id IS NOT NULL AND vendon_id != ''
      GROUP BY vendon_id, machine_name 
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `);

    console.log(`🎯 Found ${duplicates.rows.length} machine groups with duplicates`);

    let totalDuplicatesRemoved = 0;

    // Step 3: Process each duplicate group
    for (const duplicate of duplicates.rows) {
      const { vendon_id, machine_name, duplicate_count, all_ids, keep_id } = duplicate;
      const duplicateIds = all_ids.filter(id => id !== keep_id);
      
      console.log(`\n🔄 Processing ${machine_name} (${vendon_id}): ${duplicate_count} duplicates`);
      console.log(`   Keeping ID: ${keep_id}, Removing: ${duplicateIds.length} duplicates`);

      if (duplicateIds.length === 0) continue;

      await db.query('BEGIN');

      try {
        // Step 3a: Update transactions to point to the kept machine
        const transactionUpdate = await db.query(`
          UPDATE transactions 
          SET machine_id = $1 
          WHERE machine_id = ANY($2::int[])
        `, [keep_id, duplicateIds]);
        
        console.log(`   📊 Updated ${transactionUpdate.rowCount} transaction references`);

        // Step 3b: Update machine_daily_stats
        const statsUpdate = await db.query(`
          UPDATE machine_daily_stats 
          SET machine_id = $1 
          WHERE machine_id = ANY($2::int[])
        `, [keep_id, duplicateIds]);
        
        console.log(`   📈 Updated ${statsUpdate.rowCount} daily stats references`);

        // Step 3c: Update machine_stocks
        const stocksUpdate = await db.query(`
          UPDATE machine_stocks 
          SET machine_id = $1 
          WHERE machine_id = ANY($2::int[])
        `, [keep_id, duplicateIds]);
        
        console.log(`   📦 Updated ${stocksUpdate.rowCount} stock references`);

        // Step 3d: Update refills
        const refillsUpdate = await db.query(`
          UPDATE refills 
          SET machine_id = $1 
          WHERE machine_id = ANY($2::int[])
        `, [keep_id, duplicateIds]);
        
        console.log(`   🔄 Updated ${refillsUpdate.rowCount} refill references`);

        // Step 3e: Update events
        const eventsUpdate = await db.query(`
          UPDATE events 
          SET machine_id = $1 
          WHERE machine_id = ANY($2::int[])
        `, [keep_id, duplicateIds]);
        
        console.log(`   🚨 Updated ${eventsUpdate.rowCount} event references`);

        // Step 3f: Now safely delete the duplicate machines
        const deleteResult = await db.query(`
          DELETE FROM machines 
          WHERE id = ANY($1::int[])
        `, [duplicateIds]);
        
        console.log(`   ✅ Deleted ${deleteResult.rowCount} duplicate machine records`);
        totalDuplicatesRemoved += deleteResult.rowCount;

        await db.query('COMMIT');

      } catch (error) {
        await db.query('ROLLBACK');
        console.error(`   ❌ Error processing ${machine_name}:`, error.message);
        continue;
      }
    }

    // Step 4: Final verification
    const finalCount = await db.query(`
      SELECT 
        COUNT(*) as total_machines,
        COUNT(DISTINCT vendon_id) as unique_vendon_ids
      FROM machines 
      WHERE vendon_id IS NOT NULL AND vendon_id != ''
    `);

    console.log('\n🎉 Cleanup completed!');
    console.log(`📈 Removed ${totalDuplicatesRemoved} duplicate machine records`);
    console.log('📊 Final state:', finalCount.rows[0]);

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

// Run cleanup
cleanupMachineDuplicates();