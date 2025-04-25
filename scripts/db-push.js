/**
 * Database Schema Push Script
 * 
 * This script pushes schema changes to the database using Drizzle Kit.
 * It ensures database schema is in sync with the code definitions.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const BACKUP_DIR = path.join(__dirname, '../db_backups');
const DRIZZLE_CONFIG = path.join(__dirname, '../drizzle.config.ts');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log(`Created backup directory: ${BACKUP_DIR}`);
}

// Create a backup of the current database before making changes
function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.sql`);
  
  try {
    console.log('Creating database backup before schema changes...');
    // Use pg_dump to create a backup (requires DATABASE_URL environment variable)
    execSync(`pg_dump $DATABASE_URL -f ${backupFile}`);
    console.log(`Backup created: ${backupFile}`);
    return true;
  } catch (error) {
    console.error(`ERROR: Failed to create database backup: ${error.message}`);
    return false;
  }
}

// Push schema changes to the database
function pushSchemaChanges() {
  try {
    console.log('Pushing schema changes to database...');
    execSync('npx drizzle-kit push:pg', { stdio: 'inherit' });
    console.log('Schema changes applied successfully!');
    return true;
  } catch (error) {
    console.error(`ERROR: Failed to push schema changes: ${error.message}`);
    return false;
  }
}

// Main execution
(async function main() {
  console.log('Starting database schema synchronization...');
  
  // Check if drizzle config exists
  if (!fs.existsSync(DRIZZLE_CONFIG)) {
    console.error(`ERROR: Drizzle config not found at ${DRIZZLE_CONFIG}`);
    process.exit(1);
  }
  
  // Create backup
  const backupSuccess = createBackup();
  if (!backupSuccess) {
    const continueAnyway = process.env.FORCE_PUSH === 'true';
    if (!continueAnyway) {
      console.error('Aborting schema push due to backup failure. Set FORCE_PUSH=true to override.');
      process.exit(1);
    }
    console.warn('WARNING: Continuing without backup due to FORCE_PUSH=true');
  }
  
  // Push schema changes
  const pushSuccess = pushSchemaChanges();
  if (!pushSuccess) {
    console.error('Schema push failed. Please check the errors above.');
    process.exit(1);
  }
  
  console.log('Database schema synchronization completed successfully!');
})();