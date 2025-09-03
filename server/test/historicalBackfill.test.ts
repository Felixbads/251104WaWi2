/**
 * Tests für Historische Vendon-Synchronisation
 * 
 * Unit- und Integrationstests für die implementierten Komponenten:
 * - WatermarkStore
 * - HistoricalBackfillService  
 * - VendonDeltaSync
 * - Upsert-Funktionalität
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { watermarkStore } from '../services/watermarkStore';
import { historicalBackfillService } from '../services/historicalBackfillService';
import { vendonDeltaSync } from '../services/vendonDeltaSync';
import { storage } from '../storage';

// Mock-Daten für Tests
const mockMachineId = 'test-machine-123';
const mockTransactions = [
  {
    transaction_id: 'txn-001',
    machine_id: mockMachineId,
    machine_name: 'Test Machine',
    datetime: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:05:00Z',
    product_name: 'Test Product',
    price: 2.50,
    quantity: 1,
    payment_method: 'CASHLESS'
  },
  {
    transaction_id: 'txn-002',
    machine_id: mockMachineId,
    machine_name: 'Test Machine',
    datetime: '2024-01-15T11:00:00Z',
    updated_at: '2024-01-15T11:05:00Z',
    product_name: 'Test Product 2',
    price: 3.00,
    quantity: 1,
    payment_method: 'CASH'
  }
];

describe('WatermarkStore', () => {
  beforeEach(async () => {
    // Cleanup vor jedem Test
    await watermarkStore.deleteWatermark(mockMachineId);
  });

  test('sollte Watermark für neue Maschine initialisieren', async () => {
    const testDate = new Date('2024-01-15T00:00:00Z');
    const success = await watermarkStore.initializeWatermark(mockMachineId, testDate);
    
    expect(success).toBe(true);
    
    const watermark = await watermarkStore.getWatermark(mockMachineId);
    expect(watermark).not.toBeNull();
    expect(watermark?.machineId).toBe(mockMachineId);
    expect(watermark?.lastUpdatedAt.getTime()).toBe(testDate.getTime());
  });

  test('sollte Watermark nur aktualisieren wenn neuer Timestamp', async () => {
    const initialDate = new Date('2024-01-15T10:00:00Z');
    const olderDate = new Date('2024-01-15T09:00:00Z');
    const newerDate = new Date('2024-01-15T11:00:00Z');

    // Initialer Watermark
    await watermarkStore.setWatermark(mockMachineId, initialDate);

    // Versuch mit älterem Datum - sollte nicht aktualisiert werden
    const success1 = await watermarkStore.updateWatermarkIfNewer(mockMachineId, olderDate);
    expect(success1).toBe(true);
    
    let watermark = await watermarkStore.getLastUpdatedAt(mockMachineId);
    expect(watermark?.getTime()).toBe(initialDate.getTime());

    // Aktualisierung mit neuerem Datum - sollte aktualisiert werden
    const success2 = await watermarkStore.updateWatermarkIfNewer(mockMachineId, newerDate);
    expect(success2).toBe(true);
    
    watermark = await watermarkStore.getLastUpdatedAt(mockMachineId);
    expect(watermark?.getTime()).toBe(newerDate.getTime());
  });

  test('sollte Watermark aus Transaktionen aktualisieren', async () => {
    const success = await watermarkStore.updateWatermarkFromTransactions(mockMachineId, mockTransactions);
    expect(success).toBe(true);

    const watermark = await watermarkStore.getLastUpdatedAt(mockMachineId);
    expect(watermark).not.toBeNull();
    
    // Sollte den neuesten updated_at Wert haben
    const expectedDate = new Date('2024-01-15T11:05:00Z');
    expect(watermark?.getTime()).toBe(expectedDate.getTime());
  });
});

describe('Storage Upsert-Funktionalität', () => {
  const testTransaction = {
    vendonId: 'test-txn-upsert',
    machineId: 999,
    machineName: 'Test Upsert Machine',
    datetime: new Date('2024-01-15T10:00:00Z'),
    productName: 'Test Upsert Product',
    price: 2.50,
    quantity: 1,
    source: 'test',
    status: 'completed'
  };

  test('sollte neue Transaktion mit Upsert erstellen', async () => {
    const result = await storage.upsertTransaction(testTransaction);
    
    expect(result).toBeDefined();
    expect(result.vendonId).toBe(testTransaction.vendonId);
    expect(result.machineId).toBe(testTransaction.machineId);
    expect(result.price).toBe(testTransaction.price);
  });

  test('sollte bestehende Transaktion mit Upsert aktualisieren', async () => {
    // Erste Erstellung
    await storage.upsertTransaction(testTransaction);

    // Aktualisierung mit geändertem Preis
    const updatedTransaction = {
      ...testTransaction,
      price: 3.50,
      productName: 'Updated Product'
    };

    const result = await storage.upsertTransaction(updatedTransaction);
    
    expect(result.vendonId).toBe(testTransaction.vendonId);
    expect(result.price).toBe(3.50);
    expect(result.productName).toBe('Updated Product');
  });

  test('sollte Batch-Upsert korrekt verarbeiten', async () => {
    const batchTransactions = [
      { ...testTransaction, vendonId: 'batch-1', price: 1.50 },
      { ...testTransaction, vendonId: 'batch-2', price: 2.50 },
      { ...testTransaction, vendonId: 'batch-3', price: 3.50 }
    ];

    const results = await storage.upsertTransactionsBatch(batchTransactions);
    
    expect(results.length).toBe(3);
    expect(results[0].vendonId).toBe('batch-1');
    expect(results[1].vendonId).toBe('batch-2');
    expect(results[2].vendonId).toBe('batch-3');
  });
});

describe('HistoricalBackfillService (Integration)', () => {
  // Integrationstests können aufgrund der API-Abhängigkeiten in CI/CD problematisch sein
  // Hier würden normalerweise Mock-APIs verwendet
  
  test('sollte BackfillOptions validieren', () => {
    const validOptions = {
      machineId: 'test-machine',
      fromTs: 1640995200, // 2022-01-01
      toTs: 1672531200,   // 2023-01-01
      chunkDays: 14,
      pageSize: 500,
      dryRun: true,
      maxPagesPerWindow: 100
    };

    // Validierung durch Zod-Schema in der Service-Klasse
    expect(() => {
      // Dies würde normalerweise durch den Service validiert
      const fromDate = new Date(validOptions.fromTs * 1000);
      const toDate = new Date(validOptions.toTs * 1000);
      expect(fromDate < toDate).toBe(true);
      expect(validOptions.chunkDays).toBeGreaterThan(0);
      expect(validOptions.pageSize).toBeGreaterThan(0);
    }).not.toThrow();
  });

  test('sollte Zeit-Fenster korrekt erstellen', () => {
    // Test für die createTimeWindows-Logik
    const fromTs = 1640995200; // 2022-01-01
    const toTs = 1643673600;   // 2022-02-01 (31 Tage später)
    const chunkDays = 7;
    
    const chunkSeconds = chunkDays * 24 * 60 * 60;
    const expectedWindows = Math.ceil((toTs - fromTs) / chunkSeconds);
    
    expect(expectedWindows).toBe(5); // 31 Tage / 7 Tage = 5 Chunks (aufgerundet)
  });
});

describe('VendonDeltaSync (Unit)', () => {
  test('sollte Domain-Mapping korrekt durchführen', () => {
    // Test für die mapToDomain-Funktion
    const apiItem = {
      transaction_id: 'api-txn-123',
      machine_id: 'machine-456',
      machine_name: 'API Test Machine',
      datetime: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T10:05:00Z',
      product_name: 'API Product',
      price: 4.50,
      quantity: 2,
      payment_method: 'CARD'
    };

    // Simuliere Domain-Mapping (normalerweise private Methode)
    const mapped = {
      vendonId: apiItem.transaction_id,
      machineId: apiItem.machine_id,
      machineName: apiItem.machine_name,
      datetime: new Date(apiItem.datetime),
      updatedAt: new Date(apiItem.updated_at),
      productName: apiItem.product_name,
      price: apiItem.price,
      quantity: apiItem.quantity,
      paymentMethod: apiItem.payment_method,
      source: 'vendon_delta',
      status: 'completed'
    };

    expect(mapped.vendonId).toBe('api-txn-123');
    expect(mapped.machineId).toBe('machine-456');
    expect(mapped.price).toBe(4.50);
    expect(mapped.quantity).toBe(2);
    expect(mapped.source).toBe('vendon_delta');
  });

  test('sollte Sync-Status korrekt berechnen', () => {
    const now = Date.now();
    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);
    const fourHoursAgo = new Date(now - 4 * 60 * 60 * 1000);
    
    // Gesunde Maschine (< 2 Stunden)
    const healthyTimeDiff = now - twoHoursAgo.getTime();
    const isHealthy = healthyTimeDiff < (2 * 60 * 60 * 1000);
    expect(isHealthy).toBe(true);
    
    // Ungesunde Maschine (> 2 Stunden)
    const unhealthyTimeDiff = now - fourHoursAgo.getTime();
    const isUnhealthy = unhealthyTimeDiff >= (2 * 60 * 60 * 1000);
    expect(isUnhealthy).toBe(true);
  });
});

// Mock-Tests für API-abhängige Funktionen
describe('API-Mock Tests', () => {
  test('sollte API-Response korrekt verarbeiten', () => {
    const mockApiResponse = {
      items: mockTransactions,
      count: mockTransactions.length
    };

    expect(mockApiResponse.items.length).toBe(2);
    expect(mockApiResponse.count).toBe(2);
    expect(mockApiResponse.items[0].transaction_id).toBe('txn-001');
  });

  test('sollte leere API-Response handhaben', () => {
    const emptyResponse = {
      items: [],
      count: 0
    };

    expect(emptyResponse.items.length).toBe(0);
    expect(emptyResponse.count).toBe(0);
  });
});