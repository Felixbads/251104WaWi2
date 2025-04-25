/**
 * Database Backup Script
 * 
 * This script creates a backup of the PostgreSQL database.
 * It can be scheduled to run periodically using cron or another scheduler.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const BACKUP_DIR = path.join(__dirname, '../db_backups');
const BACKUP_RETENTION_DAYS = 7; // Number of days to keep backups
const COMPRESS_BACKUP = true;

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log(`Created backup directory: ${BACKUP_DIR}`);
}

// Function to create a database backup
function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `backup-${timestamp}.sql`;
  const backupPath = path.join(BACKUP_DIR, backupFileName);
  
  try {
    console.log(`Creating database backup: ${backupFileName}`);
    
    // Use pg_dump to create a backup (requires DATABASE_URL environment variable)
    execSync(`pg_dump $DATABASE_URL -f ${backupPath}`);
    
    // Compress the backup if configured
    if (COMPRESS_BACKUP) {
      console.log('Compressing backup...');
      execSync(`gzip ${backupPath}`);
      console.log(`Backup compressed: ${backupPath}.gz`);
      return `${backupPath}.gz`;
    }
    
    console.log(`Backup created: ${backupPath}`);
    return backupPath;
  } catch (error) {
    console.error(`ERROR: Failed to create database backup: ${error.message}`);
    throw error;
  }
}

// Function to clean up old backups
function cleanupOldBackups() {
  console.log(`Cleaning up backups older than ${BACKUP_RETENTION_DAYS} days...`);
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - BACKUP_RETENTION_DAYS);
  
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isFile() && stats.mtime < cutoffDate) {
        fs.unlinkSync(filePath);
        console.log(`Deleted old backup: ${file}`);
        deletedCount++;
      }
    }
    
    console.log(`Cleanup complete. Deleted ${deletedCount} old backup files.`);
  } catch (error) {
    console.error(`ERROR: Failed to clean up old backups: ${error.message}`);
  }
}

// Main execution
(async function main() {
  console.log('Starting database backup process...');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  
  try {
    // Create a new backup
    const backupPath = createBackup();
    
    // Clean up old backups
    cleanupOldBackups();
    
    console.log('Backup process completed successfully.');
    console.log(`Latest backup: ${backupPath}`);
  } catch (error) {
    console.error('Backup process failed:', error);
    process.exit(1);
  }
})();