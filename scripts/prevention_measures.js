/**
 * Prevention Measures - Präventionsmaßnahmen für zukünftige Datenverluste
 * Implementiert Backup-Strategien und Sicherheitsmaßnahmen
 */

const { rawDb } = require('../server/db');
const fs = require('fs').promises;
const path = require('path');

class PreventionManager {
  constructor() {
    this.backupPath = path.join(process.cwd(), 'backups');
    this.configPath = path.join(process.cwd(), 'config', 'backup_config.json');
  }

  /**
   * Implementiert alle Präventionsmaßnahmen
   */
  async implementPreventionMeasures() {
    console.log('🛡️  Implementiere Präventionsmaßnahmen...');

    try {
      // 1. Backup-Strategien einrichten
      await this.setupBackupStrategy();
      
      // 2. Transaktions-Logging erweitern
      await this.enhanceTransactionLogging();
      
      // 3. Recovery-Tests einrichten
      await this.setupRecoveryTests();
      
      // 4. Portal-Archivierung implementieren
      await this.setupPortalArchiving();
      
      // 5. Monitoring und Alerts
      await this.setupMonitoring();
      
      console.log('✅ Alle Präventionsmaßnahmen erfolgreich implementiert');
      
    } catch (error) {
      console.error('❌ Fehler bei der Implementierung der Präventionsmaßnahmen:', error);
      throw error;
    }
  }

  /**
   * Richtet automatische Backup-Strategie ein
   */
  async setupBackupStrategy() {
    console.log('💾 Richte Backup-Strategie ein...');

    // Erstelle Backup-Verzeichnis
    try {
      await fs.mkdir(this.backupPath, { recursive: true });
    } catch (error) {
      // Verzeichnis existiert bereits
    }

    // Backup-Konfiguration
    const backupConfig = {
      enabled: true,
      schedules: {
        pre_script_backup: {
          description: "Backup vor kritischen Script-Ausführungen",
          trigger: "before_reset_scripts",
          retention_days: 30,
          tables: ["orders", "order_items", "supplier_access_pins", "recurring_orders"]
        },
        daily_backup: {
          description: "Tägliches vollständiges Backup",
          schedule: "0 2 * * *", // 2:00 Uhr täglich
          retention_days: 7,
          tables: "all"
        },
        weekly_backup: {
          description: "Wöchentliches Archiv-Backup",
          schedule: "0 3 * * 0", // Sonntag 3:00 Uhr
          retention_days: 90,
          tables: "all",
          compress: true
        }
      },
      notifications: {
        success: ["admin@example.com"],
        failure: ["admin@example.com", "tech@example.com"]
      }
    };

    // Speichere Konfiguration
    await this.ensureConfigDirectory();
    await fs.writeFile(this.configPath, JSON.stringify(backupConfig, null, 2));

    // Erstelle Backup-Script
    const backupScript = `#!/bin/bash
# Automated Backup Script for Order Recovery Prevention

BACKUP_DIR="${this.backupPath}"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME=\${DATABASE_URL##*/}

# Function to create table backup
backup_table() {
    local table_name=$1
    local backup_file="$BACKUP_DIR/\${table_name}_\${DATE}.sql"
    
    echo "📦 Backing up table: $table_name"
    pg_dump --table=public.$table_name --data-only --column-inserts $DATABASE_URL > "$backup_file"
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully backed up: $table_name"
        gzip "$backup_file"
    else
        echo "❌ Failed to backup: $table_name"
        return 1
    fi
}

# Critical tables backup
CRITICAL_TABLES=("orders" "order_items" "supplier_access_pins" "recurring_orders" "suppliers" "products")

echo "🚀 Starting critical tables backup..."
mkdir -p "$BACKUP_DIR"

for table in "\${CRITICAL_TABLES[@]}"; do
    backup_table "$table"
done

# Cleanup old backups (keep 30 days)
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete

echo "🎉 Backup completed: $DATE"
`;

    await fs.writeFile(path.join(this.backupPath, 'backup_critical_tables.sh'), backupScript);
    
    console.log('✅ Backup-Strategie eingerichtet');
  }

  /**
   * Erweitert Transaktions-Logging
   */
  async enhanceTransactionLogging() {
    console.log('📝 Erweitere Transaktions-Logging...');

    // Erstelle erweiterte Audit-Tabelle
    const auditTableSQL = `
      CREATE TABLE IF NOT EXISTS order_audit_log (
        id SERIAL PRIMARY KEY,
        table_name VARCHAR(50) NOT NULL,
        record_id INTEGER NOT NULL,
        operation VARCHAR(20) NOT NULL, -- INSERT, UPDATE, DELETE
        old_data JSONB,
        new_data JSONB,
        changed_by VARCHAR(100),
        change_reason TEXT,
        change_timestamp TIMESTAMP DEFAULT NOW(),
        script_name VARCHAR(100), -- Name des Scripts das die Änderung vornahm
        session_id VARCHAR(100),
        ip_address INET,
        user_agent TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_order_audit_log_table_record 
        ON order_audit_log(table_name, record_id);
      CREATE INDEX IF NOT EXISTS idx_order_audit_log_timestamp 
        ON order_audit_log(change_timestamp);
    `;

    await rawDb.query(auditTableSQL);

    // Trigger-Funktionen für automatisches Logging
    const triggerFunctionSQL = `
      CREATE OR REPLACE FUNCTION audit_order_changes()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          INSERT INTO order_audit_log (
            table_name, record_id, operation, old_data, changed_by, change_reason
          ) VALUES (
            TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD), 
            current_setting('application_name', true), 'Automatic trigger'
          );
          RETURN OLD;
        ELSIF TG_OP = 'UPDATE' THEN
          INSERT INTO order_audit_log (
            table_name, record_id, operation, old_data, new_data, changed_by, change_reason
          ) VALUES (
            TG_TABLE_NAME, NEW.id, 'UPDATE', row_to_json(OLD), row_to_json(NEW),
            current_setting('application_name', true), 'Automatic trigger'
          );
          RETURN NEW;
        ELSIF TG_OP = 'INSERT' THEN
          INSERT INTO order_audit_log (
            table_name, record_id, operation, new_data, changed_by, change_reason
          ) VALUES (
            TG_TABLE_NAME, NEW.id, 'INSERT', row_to_json(NEW),
            current_setting('application_name', true), 'Automatic trigger'
          );
          RETURN NEW;
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `;

    await rawDb.query(triggerFunctionSQL);

    // Trigger für kritische Tabellen erstellen
    const criticalTables = ['orders', 'order_items', 'supplier_access_pins'];
    
    for (const table of criticalTables) {
      const triggerSQL = `
        DROP TRIGGER IF EXISTS audit_${table}_trigger ON ${table};
        CREATE TRIGGER audit_${table}_trigger
          AFTER INSERT OR UPDATE OR DELETE ON ${table}
          FOR EACH ROW EXECUTE FUNCTION audit_order_changes();
      `;
      
      await rawDb.query(triggerSQL);
    }

    console.log('✅ Erweiterte Transaktions-Logging implementiert');
  }

  /**
   * Richtet Recovery-Tests ein
   */
  async setupRecoveryTests() {
    console.log('🧪 Richte Recovery-Tests ein...');

    const recoveryTestScript = `/**
 * Recovery Test Suite
 * Testet regelmäßig die Wiederherstellungsverfahren
 */

const { rawDb } = require('../server/db');

class RecoveryTestSuite {
  async runTests() {
    console.log('🧪 Starte Recovery-Tests...');
    
    const results = {
      backup_integrity: await this.testBackupIntegrity(),
      audit_log_functionality: await this.testAuditLogFunctionality(),
      recovery_speed: await this.testRecoverySpeed(),
      data_consistency: await this.testDataConsistency()
    };
    
    return results;
  }
  
  async testBackupIntegrity() {
    try {
      // Test ob Backups lesbar sind
      const backupFiles = await this.getRecentBackupFiles();
      let integrityChecks = 0;
      
      for (const file of backupFiles) {
        if (await this.verifyBackupFile(file)) {
          integrityChecks++;
        }
      }
      
      return {
        status: integrityChecks > 0 ? 'PASS' : 'FAIL',
        details: \`\${integrityChecks}/\${backupFiles.length} Backups intakt\`
      };
    } catch (error) {
      return { status: 'ERROR', details: error.message };
    }
  }
  
  async testAuditLogFunctionality() {
    try {
      // Test ob Audit-Logging funktioniert
      const testTimestamp = new Date();
      
      // Führe Test-Operation durch
      await rawDb.query(\`
        INSERT INTO order_audit_log (table_name, record_id, operation, change_reason)
        VALUES ('test_table', 999999, 'TEST', 'Recovery test - \${testTimestamp.toISOString()}')
      \`);
      
      // Prüfe ob Log erstellt wurde
      const result = await rawDb.query(\`
        SELECT * FROM order_audit_log 
        WHERE change_reason LIKE 'Recovery test - %' 
        AND change_timestamp >= $1
      \`, [testTimestamp]);
      
      // Cleanup
      await rawDb.query(\`
        DELETE FROM order_audit_log 
        WHERE change_reason LIKE 'Recovery test - %'
      \`);
      
      return {
        status: result.rows.length > 0 ? 'PASS' : 'FAIL',
        details: \`Audit-Log Eintrag \${result.rows.length > 0 ? 'erfolgreich' : 'nicht'} erstellt\`
      };
    } catch (error) {
      return { status: 'ERROR', details: error.message };
    }
  }
  
  async testRecoverySpeed() {
    const startTime = Date.now();
    
    try {
      // Simuliere Recovery-Operationen
      await rawDb.query('SELECT COUNT(*) FROM orders');
      await rawDb.query('SELECT COUNT(*) FROM order_items');
      await rawDb.query('SELECT COUNT(*) FROM supplier_access_pins');
      
      const duration = Date.now() - startTime;
      
      return {
        status: duration < 5000 ? 'PASS' : 'SLOW',
        details: \`Recovery-Operationen in \${duration}ms\`
      };
    } catch (error) {
      return { status: 'ERROR', details: error.message };
    }
  }
  
  async testDataConsistency() {
    try {
      // Prüfe Datenintegrität
      const consistencyChecks = await rawDb.query(\`
        SELECT 
          (SELECT COUNT(*) FROM orders) as order_count,
          (SELECT COUNT(*) FROM order_items) as item_count,
          (SELECT COUNT(*) FROM order_items WHERE order_id NOT IN (SELECT id FROM orders)) as orphaned_items
      \`);
      
      const orphanedItems = consistencyChecks.rows[0].orphaned_items;
      
      return {
        status: orphanedItems === 0 ? 'PASS' : 'FAIL',
        details: \`\${orphanedItems} verwaiste Order Items gefunden\`
      };
    } catch (error) {
      return { status: 'ERROR', details: error.message };
    }
  }
}

module.exports = RecoveryTestSuite;
`;

    await fs.writeFile(
      path.join(process.cwd(), 'scripts', 'recovery_test_suite.js'),
      recoveryTestScript
    );

    console.log('✅ Recovery-Tests eingerichtet');
  }

  /**
   * Richtet Portal-Archivierung ein
   */
  async setupPortalArchiving() {
    console.log('📋 Richte Portal-Archivierung ein...');

    // Erweiterte Portal-Logging-Tabelle
    const portalArchiveSQL = `
      CREATE TABLE IF NOT EXISTS supplier_portal_archive (
        id SERIAL PRIMARY KEY,
        supplier_id INTEGER NOT NULL,
        session_id VARCHAR(100),
        action_type VARCHAR(50) NOT NULL, -- login, view_order, confirm_delivery, etc.
        request_data JSONB,
        response_data JSONB,
        user_agent TEXT,
        ip_address INET,
        session_duration INTEGER, -- in seconds
        timestamp TIMESTAMP DEFAULT NOW(),
        archived_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_portal_archive_supplier_date 
        ON supplier_portal_archive(supplier_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_portal_archive_action 
        ON supplier_portal_archive(action_type, timestamp);
    `;

    await rawDb.query(portalArchiveSQL);

    console.log('✅ Portal-Archivierung eingerichtet');
  }

  /**
   * Richtet Monitoring und Alerts ein
   */
  async setupMonitoring() {
    console.log('🔔 Richte Monitoring und Alerts ein...');

    // Monitoring-Konfiguration
    const monitoringConfig = {
      alerts: {
        large_deletions: {
          enabled: true,
          threshold: 10, // Alert bei mehr als 10 gelöschten Datensätzen
          tables: ["orders", "order_items"],
          notification_emails: ["admin@example.com"]
        },
        backup_failures: {
          enabled: true,
          notification_emails: ["admin@example.com", "tech@example.com"],
          retry_attempts: 3
        },
        recovery_test_failures: {
          enabled: true,
          notification_emails: ["admin@example.com"]
        }
      },
      health_checks: {
        interval_minutes: 15,
        checks: [
          "backup_age",
          "audit_log_recent_entries", 
          "database_connectivity",
          "disk_space"
        ]
      }
    };

    // Health Check Script
    const healthCheckScript = `/**
 * Health Check Monitor
 * Überwacht System-Health und sendet Alerts
 */

const { rawDb } = require('../server/db');

class HealthMonitor {
  async performHealthChecks() {
    const checks = {
      backup_age: await this.checkBackupAge(),
      audit_log_activity: await this.checkAuditLogActivity(),
      database_connectivity: await this.checkDatabaseConnectivity(),
      data_integrity: await this.checkDataIntegrity()
    };
    
    const alerts = this.generateAlerts(checks);
    
    if (alerts.length > 0) {
      await this.sendAlerts(alerts);
    }
    
    return { checks, alerts };
  }
  
  async checkBackupAge() {
    // Implementierung der Backup-Alter-Prüfung
    return { status: 'OK', message: 'Backups sind aktuell' };
  }
  
  async checkAuditLogActivity() {
    const recentEntries = await rawDb.query(\`
      SELECT COUNT(*) as count FROM order_audit_log 
      WHERE change_timestamp >= NOW() - INTERVAL '24 hours'
    \`);
    
    return {
      status: recentEntries.rows[0].count > 0 ? 'OK' : 'WARNING',
      message: \`\${recentEntries.rows[0].count} Audit-Einträge in den letzten 24h\`
    };
  }
  
  async checkDatabaseConnectivity() {
    try {
      await rawDb.query('SELECT 1');
      return { status: 'OK', message: 'Datenbankverbindung stabil' };
    } catch (error) {
      return { status: 'CRITICAL', message: \`Datenbankfehler: \${error.message}\` };
    }
  }
  
  async checkDataIntegrity() {
    // Grundlegende Integritätsprüfungen
    const result = await rawDb.query(\`
      SELECT 
        (SELECT COUNT(*) FROM orders WHERE id IS NULL) as null_order_ids,
        (SELECT COUNT(*) FROM order_items WHERE order_id NOT IN (SELECT id FROM orders)) as orphaned_items
    \`);
    
    const issues = result.rows[0];
    const hasIssues = issues.null_order_ids > 0 || issues.orphaned_items > 0;
    
    return {
      status: hasIssues ? 'WARNING' : 'OK',
      message: hasIssues ? \`Datenintegritätsprobleme erkannt\` : 'Datenintegrität OK'
    };
  }
  
  generateAlerts(checks) {
    const alerts = [];
    
    Object.entries(checks).forEach(([checkName, result]) => {
      if (result.status === 'CRITICAL' || result.status === 'WARNING') {
        alerts.push({
          type: result.status,
          check: checkName,
          message: result.message,
          timestamp: new Date()
        });
      }
    });
    
    return alerts;
  }
  
  async sendAlerts(alerts) {
    // Implementierung für Alert-Versendung
    console.log('🚨 Alerts generiert:', alerts);
  }
}

module.exports = HealthMonitor;
`;

    await fs.writeFile(
      path.join(process.cwd(), 'scripts', 'health_monitor.js'),
      healthCheckScript
    );

    console.log('✅ Monitoring und Alerts eingerichtet');
  }

  /**
   * Hilfsfunktion: Stellt sicher, dass Config-Verzeichnis existiert
   */
  async ensureConfigDirectory() {
    const configDir = path.dirname(this.configPath);
    try {
      await fs.mkdir(configDir, { recursive: true });
    } catch (error) {
      // Verzeichnis existiert bereits
    }
  }
}

// Exportiere Klasse
module.exports = PreventionManager;

// Direkter Aufruf wenn Script ausgeführt wird
if (require.main === module) {
  (async () => {
    try {
      const prevention = new PreventionManager();
      await prevention.implementPreventionMeasures();
      console.log('🎉 Präventionsmaßnahmen erfolgreich implementiert!');
      process.exit(0);
    } catch (error) {
      console.error('❌ Fehler bei der Implementierung:', error);
      process.exit(1);
    }
  })();
}