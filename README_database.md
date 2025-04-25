# Database Infrastructure & Maintenance Guide

This document provides an overview of the database infrastructure, key maintenance procedures, and integrity safeguards.

## Database Overview

The application uses a PostgreSQL database hosted on Neon (serverless PostgreSQL). The database connection is managed through the `server/db.ts` file, which configures the connection pool and provides both ORM (Drizzle) and raw query access.

### Key Database Elements

- **Schema Definition**: Found in `shared/schema.ts` - contains all table definitions and their relationships
- **Storage Layer**: `server/storage/database-storage.ts` implements the database access layer
- **Interface**: `server/storage.ts` defines the storage interface

## Data Synchronization

Data is regularly synchronized from external APIs (like Vendon) to keep the local database up-to-date.

### Synchronization Process

1. The `syncLock` mechanism prevents concurrent synchronization tasks
2. Synchronization is logged in the `sync_logs` table
3. Data is processed and validated before being stored
4. Error handling ensures that failed synchronizations don't corrupt the database

## Maintenance Scripts

The following scripts are available to help maintain database integrity:

### Database Backup (scripts/db-backup.js)

Creates a backup of the PostgreSQL database. To create a backup:

```bash
node scripts/db-backup.js
```

- Backups are stored in the `db_backups` directory
- Old backups are automatically cleaned up (7-day retention by default)
- Backups are compressed to save space

### Schema Synchronization (scripts/db-push.js)

Applies schema changes to the database. To update the database schema:

```bash
node scripts/db-push.js
```

- Always creates a backup before applying changes
- Uses Drizzle Kit to handle migrations
- Can force push even if backup fails by setting `FORCE_PUSH=true`

### Database Integrity Check (scripts/db-integrity-check.js)

Performs comprehensive integrity checks on the database:

```bash
node scripts/db-integrity-check.js
```

- Identifies orphaned records (missing foreign key relationships)
- Checks for data gaps in critical time-series data
- Validates data consistency (duplicate checks, data format validation)
- Identifies stuck synchronization processes
- Generates detailed reports in the `db_reports` directory
- Creates SQL scripts to fix common issues

## Best Practices

### 1. Regular Backups

Schedule regular database backups:

```bash
# Run daily backup at 1 AM
0 1 * * * cd /path/to/project && node scripts/db-backup.js >> logs/backup.log 2>&1
```

### 2. Schema Changes

When making schema changes:

1. Update the schema in `shared/schema.ts`
2. Run the schema sync script: `node scripts/db-push.js`
3. Verify that the changes were applied correctly

### 3. Integrity Checks

Run integrity checks weekly (or after major data imports):

```bash
# Run weekly integrity check on Sunday at 2 AM
0 2 * * 0 cd /path/to/project && node scripts/db-integrity-check.js >> logs/integrity-check.log 2>&1
```

### 4. Error Resolution

When errors are detected:

1. Review the generated reports in `db_reports`
2. Fix data issues using the repair scripts or manual intervention
3. Implement fixes in the application code to prevent future occurrences

### 5. Monitoring

Monitor the `sync_logs` table for synchronization errors:

```sql
SELECT * FROM sync_logs WHERE sync_status = 'error' ORDER BY start_date DESC LIMIT 10;
```

## Troubleshooting

### Common Issues

1. **Duplicate Records**:
   - Check for missing unique constraints
   - Review synchronization code for proper duplicate detection

2. **Orphaned Records**:
   - Use the integrity check script to identify and repair
   - Check for code that deletes parent records without handling children

3. **Stuck Synchronization**:
   - Look for long-running sync processes: `SELECT * FROM sync_logs WHERE sync_status = 'running' AND start_date < NOW() - INTERVAL '1 hour';`
   - Manually update status or restart the synchronization

4. **Data Gaps**:
   - Review sync logs for errors during the gap period
   - Check API availability during those times

5. **Schema Discrepancies**:
   - Run `node scripts/db-push.js` to synchronize the schema
   - Check for errors in schema definitions

## Database Recovery

In case of database corruption or data loss:

1. Stop all application processes that write to the database
2. Restore from the most recent backup:

```bash
# Restore from a backup file
pg_restore -d $DATABASE_URL /path/to/backup/file.sql
```

3. Run the integrity check to verify the restored data
4. Restart the application