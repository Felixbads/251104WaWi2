/**
 * Batch Traceability API - Vollständige Chargen-Rückverfolgung für Compliance
 * 
 * Endpunkte:
 * - GET /api/batch-traceability/transaction/:id - Vollständige Rückverfolgung einer Transaktion
 * - GET /api/batch-traceability/batch/:batchNumber - Alle Transaktionen einer Charge
 * - GET /api/batch-traceability/product-recall/:productId - Produktrückruf-Informationen
 * - GET /api/batch-traceability/compliance-report - Compliance-Bericht für Audits
 * - GET /api/batch-traceability/health-check - System-Gesundheitscheck für Chargen-Tracking
 * - POST /api/batch-traceability/process-retroactive - Rückwirkende Verarbeitung von Transaktionen
 */

import express from 'express';
import { eq, and, or, like, gte, lte, desc, asc, inArray } from 'drizzle-orm';
import { db } from '../db';
import { 
  transactions, 
  batchTransactionLog, 
  machines, 
  products, 
  productBatches 
} from '../../shared/schema';
import { batchTrackingService } from '../services/batchTrackingService';
import { enhancedTransactionProcessor } from '../services/enhancedTransactionProcessor';

const router = express.Router();

/**
 * GET /api/batch-traceability/transaction/:id
 * Vollständige Rückverfolgung einer spezifischen Transaktion
 */
router.get('/transaction/:id', async (req, res) => {
  try {
    const transactionId = parseInt(req.params.id);
    
    if (isNaN(transactionId)) {
      return res.status(400).json({ 
        error: 'Ungültige Transaktions-ID' 
      });
    }

    console.log(`🔍 [BatchTraceability] Rückverfolgung für Transaktion ${transactionId}`);

    // Hole Rückverfolgungsdaten vom Service
    const traceabilityData = await batchTrackingService.getTransactionBatchTraceability(transactionId);

    if (traceabilityData.length === 0) {
      return res.status(404).json({
        error: 'Keine Chargen-Rückverfolgungsdaten für diese Transaktion gefunden',
        transactionId
      });
    }

    // Hole zusätzliche Transaktionsdaten
    const transactionDetails = await db
      .select({
        id: transactions.id,
        vendonId: transactions.vendonId,
        machineId: transactions.machineId,
        machineName: transactions.machineName,
        productId: transactions.productId,
        productName: transactions.productName,
        quantity: transactions.quantity,
        price: transactions.price,
        datetime: transactions.datetime,
        paymentMethod: transactions.paymentMethod,
        batchId: transactions.batchId,
        batchNumber: transactions.batchNumber,
        expiryDateAtSale: transactions.expiryDateAtSale
      })
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .limit(1);

    const response = {
      transaction: transactionDetails[0] || null,
      batchTraceability: traceabilityData,
      summary: {
        totalBatches: traceabilityData.length,
        totalQuantity: traceabilityData.reduce((sum, item) => sum + item.quantity, 0),
        oldestBatch: traceabilityData.reduce((oldest, current) => 
          oldest.expiryDate < current.expiryDate ? oldest : current
        ),
        newestBatch: traceabilityData.reduce((newest, current) => 
          newest.expiryDate > current.expiryDate ? newest : current
        )
      }
    };

    console.log(`✅ [BatchTraceability] Rückverfolgung abgeschlossen: ${traceabilityData.length} Chargen gefunden`);

    res.json(response);

  } catch (error) {
    console.error(`❌ [BatchTraceability] Fehler bei Transaktions-Rückverfolgung:`, error);
    res.status(500).json({ 
      error: 'Fehler bei der Chargen-Rückverfolgung',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * GET /api/batch-traceability/batch/:batchNumber
 * Alle Transaktionen die eine spezifische Charge verwendet haben
 */
router.get('/batch/:batchNumber', async (req, res) => {
  try {
    const batchNumber = req.params.batchNumber;
    
    console.log(`🔍 [BatchTraceability] Suche alle Transaktionen für Charge ${batchNumber}`);

    const batchUsage = await db
      .select({
        // Batch Log Data
        logId: batchTransactionLog.id,
        transactionId: batchTransactionLog.transactionId,
        vendonTransactionId: batchTransactionLog.vendonTransactionId,
        productName: batchTransactionLog.productName,
        quantity: batchTransactionLog.quantity,
        stockBefore: batchTransactionLog.stockBefore,
        stockAfter: batchTransactionLog.stockAfter,
        processedAt: batchTransactionLog.processedAt,
        fifoSequence: batchTransactionLog.fifoSequence,
        
        // Transaction Data
        transactionDate: transactions.datetime,
        price: transactions.price,
        paymentMethod: transactions.paymentMethod,
        
        // Machine Data  
        machineId: machines.id,
        machineName: machines.machineName,
        locationId: machines.locationId,
      })
      .from(batchTransactionLog)
      .leftJoin(transactions, eq(batchTransactionLog.transactionId, transactions.id))
      .leftJoin(machines, eq(batchTransactionLog.machineId, machines.id))
      .where(eq(batchTransactionLog.batchNumber, batchNumber))
      .orderBy(desc(batchTransactionLog.processedAt));

    if (batchUsage.length === 0) {
      return res.status(404).json({
        error: 'Keine Transaktionen für diese Charge gefunden',
        batchNumber
      });
    }

    // Hole Chargen-Details
    const batchDetails = await db
      .select()
      .from(productBatches)
      .where(eq(productBatches.batchNumber, batchNumber))
      .limit(1);

    const response = {
      batch: batchDetails[0] || null,
      transactions: batchUsage,
      summary: {
        totalTransactions: batchUsage.length,
        totalQuantitySold: batchUsage.reduce((sum, item) => sum + item.quantity, 0),
        totalRevenue: batchUsage.reduce((sum, item) => sum + (item.price || 0), 0),
        uniqueMachines: Array.from(new Set(batchUsage.map(item => item.machineId))).length,
        dateRange: {
          first: batchUsage[batchUsage.length - 1]?.transactionDate,
          last: batchUsage[0]?.transactionDate
        }
      }
    };

    console.log(`✅ [BatchTraceability] Gefunden: ${batchUsage.length} Transaktionen für Charge ${batchNumber}`);

    res.json(response);

  } catch (error) {
    console.error(`❌ [BatchTraceability] Fehler bei Chargen-Suche:`, error);
    res.status(500).json({ 
      error: 'Fehler bei der Chargen-Suche',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * GET /api/batch-traceability/product-recall/:productId
 * Produktrückruf-Informationen für alle Chargen eines Produkts
 */
router.get('/product-recall/:productId', async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    const { startDate, endDate } = req.query;
    
    if (isNaN(productId)) {
      return res.status(400).json({ 
        error: 'Ungültige Produkt-ID' 
      });
    }

    console.log(`🚨 [BatchTraceability] Produktrückruf-Analyse für Produkt ${productId}`);

    const conditions = [eq(batchTransactionLog.productId, productId)];

    // Optionale Datums-Filter
    if (startDate) {
      conditions.push(gte(batchTransactionLog.processedAt, new Date(startDate as string)));
    }
    if (endDate) {
      conditions.push(lte(batchTransactionLog.processedAt, new Date(endDate as string)));
    }
    
    const whereConditions = and(...conditions);

    const recallData = await db
      .select({
        batchNumber: batchTransactionLog.batchNumber,
        expiryDate: batchTransactionLog.expiryDate,
        transactionId: batchTransactionLog.transactionId,
        vendonTransactionId: batchTransactionLog.vendonTransactionId,
        machineId: batchTransactionLog.machineId,
        productName: batchTransactionLog.productName,
        quantity: batchTransactionLog.quantity,
        processedAt: batchTransactionLog.processedAt,
        
        // Transaction Details
        transactionDate: transactions.datetime,
        
        // Machine Details
        machineName: machines.machineName,
        locationId: machines.locationId,
      })
      .from(batchTransactionLog)
      .leftJoin(transactions, eq(batchTransactionLog.transactionId, transactions.id))
      .leftJoin(machines, eq(batchTransactionLog.machineId, machines.id))
      .where(whereConditions)
      .orderBy(asc(batchTransactionLog.expiryDate), desc(batchTransactionLog.processedAt));

    // Gruppiere nach Chargen
    const batchGroups = recallData.reduce((groups, item) => {
      const batch = item.batchNumber;
      if (!groups[batch]) {
        groups[batch] = {
          batchNumber: batch,
          expiryDate: item.expiryDate,
          transactions: [],
          totalQuantity: 0,
          affectedMachines: new Set(),
          dateRange: { first: null, last: null }
        };
      }
      
      groups[batch].transactions.push(item);
      groups[batch].totalQuantity += item.quantity;
      groups[batch].affectedMachines.add(item.machineId);
      
      if (item.transactionDate && (!groups[batch].dateRange.first || item.transactionDate < groups[batch].dateRange.first)) {
        groups[batch].dateRange.first = item.transactionDate;
      }
      if (item.transactionDate && (!groups[batch].dateRange.last || item.transactionDate > groups[batch].dateRange.last)) {
        groups[batch].dateRange.last = item.transactionDate;
      }
      
      return groups;
    }, {} as any);

    // Konvertiere Sets zu Arrays
    Object.values(batchGroups).forEach((group: any) => {
      group.affectedMachines = Array.from(group.affectedMachines);
    });

    const response = {
      productId,
      recallAnalysis: Object.values(batchGroups),
      summary: {
        totalBatches: Object.keys(batchGroups).length,
        totalTransactions: recallData.length,
        totalQuantityAffected: recallData.reduce((sum, item) => sum + item.quantity, 0),
        uniqueMachines: Array.from(new Set(recallData.map(item => item.machineId))).length,
        dateRange: {
          first: recallData[recallData.length - 1]?.transactionDate,
          last: recallData[0]?.transactionDate
        }
      }
    };

    console.log(`✅ [BatchTraceability] Produktrückruf-Analyse abgeschlossen: ${Object.keys(batchGroups).length} Chargen, ${recallData.length} Transaktionen`);

    res.json(response);

  } catch (error) {
    console.error(`❌ [BatchTraceability] Fehler bei Produktrückruf-Analyse:`, error);
    res.status(500).json({ 
      error: 'Fehler bei der Produktrückruf-Analyse',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * GET /api/batch-traceability/compliance-report
 * Compliance-Bericht für Audits und Behörden
 */
router.get('/compliance-report', async (req, res) => {
  try {
    const { startDate, endDate, format } = req.query;

    console.log(`📋 [BatchTraceability] Erstelle Compliance-Bericht`);

    // Hole Health-Check Daten
    const healthCheck = await batchTrackingService.performComplianceHealthCheck();

    // Hole Verarbeitungsstatistiken
    const processingStats = await enhancedTransactionProcessor.getProcessingStatistics();

    // Berechne Zeitraum (Standard: letzten 30 Tage)
    const endDateObj = endDate ? new Date(endDate as string) : new Date();
    const startDateObj = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Hole detaillierte Compliance-Daten
    const complianceData = await db
      .select({
        date: batchTransactionLog.processedAt,
        batchesTracked: batchTransactionLog.id,
        machineId: batchTransactionLog.machineId,
        productName: batchTransactionLog.productName,
        verificationHash: batchTransactionLog.verificationHash,
      })
      .from(batchTransactionLog)
      .where(
        and(
          gte(batchTransactionLog.processedAt, startDateObj),
          lte(batchTransactionLog.processedAt, endDateObj)
        )
      )
      .orderBy(desc(batchTransactionLog.processedAt))
      .limit(1000); // Limite für Performance

    const response = {
      reportGenerated: new Date(),
      reportPeriod: {
        startDate: startDateObj,
        endDate: endDateObj
      },
      complianceStatus: {
        overallStatus: healthCheck.complianceRate >= 95 ? 'COMPLIANT' : 'NON_COMPLIANT',
        complianceRate: healthCheck.complianceRate,
        issues: healthCheck.issues
      },
      statistics: {
        totalTransactions: healthCheck.totalTransactions,
        trackedTransactions: healthCheck.trackedTransactions,
        untrackedTransactions: healthCheck.untrackedTransactions,
        processingRate: processingStats.processingRate
      },
      auditTrail: {
        totalBatchEntries: complianceData.length,
        uniqueMachines: Array.from(new Set(complianceData.map(item => item.machineId))).length,
        uniqueProducts: Array.from(new Set(complianceData.map(item => item.productName))).length,
        verificationComplete: complianceData.filter(item => item.verificationHash).length
      },
      recommendations: [
        ...(healthCheck.complianceRate < 95 ? ['Compliance-Rate unter 95% - Überprüfung des Batch-Tracking Systems erforderlich'] : []),
        ...(healthCheck.untrackedTransactions > 10 ? ['Hohe Anzahl unverfolgter Transaktionen - Rückwirkende Verarbeitung empfohlen'] : []),
        ...(healthCheck.issues.length > 0 ? healthCheck.issues.map(issue => `⚠️ ${issue}`) : [])
      ]
    };

    // Format-spezifische Ausgabe (falls PDF/Excel gewünscht)
    if (format === 'summary') {
      res.json({
        complianceRate: response.complianceStatus.complianceRate,
        status: response.complianceStatus.overallStatus,
        issues: response.complianceStatus.issues.length,
        recommendations: response.recommendations.length
      });
    } else {
      res.json(response);
    }

    console.log(`✅ [BatchTraceability] Compliance-Bericht erstellt: ${response.complianceStatus.overallStatus}`);

  } catch (error) {
    console.error(`❌ [BatchTraceability] Fehler bei Compliance-Bericht:`, error);
    res.status(500).json({ 
      error: 'Fehler beim Erstellen des Compliance-Berichts',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * GET /api/batch-traceability/health-check
 * System-Gesundheitscheck für Chargen-Tracking
 */
router.get('/health-check', async (req, res) => {
  try {
    console.log(`🏥 [BatchTraceability] Führe System-Health-Check durch`);

    const healthCheck = await batchTrackingService.performComplianceHealthCheck();
    const processingStats = await enhancedTransactionProcessor.getProcessingStatistics();

    const response = {
      timestamp: new Date(),
      status: healthCheck.complianceRate >= 95 ? 'HEALTHY' : 'WARNING',
      compliance: healthCheck,
      processing: processingStats,
      systemHealth: {
        batchTrackingActive: true,
        dataIntegrity: healthCheck.complianceRate >= 90,
        processingEfficiency: processingStats.processingRate >= 80,
        overallHealth: healthCheck.complianceRate >= 95 && processingStats.processingRate >= 80 ? 'GOOD' : 'NEEDS_ATTENTION'
      }
    };

    res.json(response);

  } catch (error) {
    console.error(`❌ [BatchTraceability] Fehler bei Health-Check:`, error);
    res.status(500).json({ 
      error: 'Fehler beim System-Health-Check',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

/**
 * POST /api/batch-traceability/process-retroactive
 * Rückwirkende Verarbeitung von Transaktionen ohne Chargen-Tracking
 */
router.post('/process-retroactive', async (req, res) => {
  try {
    const { limit = 1000, batchSize = 50 } = req.body;

    console.log(`🔄 [BatchTraceability] Starte rückwirkende Verarbeitung (Limit: ${limit})`);

    const result = await enhancedTransactionProcessor.processExistingTransactionsRetroactively(
      limit,
      { batchSize }
    );

    const response = {
      success: result.success,
      processed: result.processed,
      skipped: result.skipped,
      failed: result.failed,
      errors: result.errors,
      warnings: result.warnings,
      summary: `${result.processed} Transaktionen erfolgreich verarbeitet, ${result.failed} Fehler`
    };

    if (result.success) {
      console.log(`✅ [BatchTraceability] Rückwirkende Verarbeitung abgeschlossen: ${result.processed} verarbeitet`);
      res.json(response);
    } else {
      console.warn(`⚠️ [BatchTraceability] Rückwirkende Verarbeitung mit Fehlern: ${result.failed} fehlgeschlagen`);
      res.status(207).json(response); // 207 Multi-Status für teilweise Erfolg
    }

  } catch (error) {
    console.error(`❌ [BatchTraceability] Fehler bei rückwirkender Verarbeitung:`, error);
    res.status(500).json({ 
      error: 'Fehler bei der rückwirkenden Verarbeitung',
      details: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
});

export default router;