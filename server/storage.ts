import { eq, desc, and, or, gte, lte, like, asc, count, aliasedTable, sql, gt, ilike, isNull, isNotNull, inArray, between } from "drizzle-orm";
import { db, rawDb, rawSql } from "./db";
// Import the database storage implementation
import { DatabaseStorage } from './storage/database-storage';
import { normalizeProductName } from "./utils/stringUtils";
import { 
  users, type User, type InsertUser,
  machines, type Machine, type InsertMachine,
  transactions, type Transaction, type InsertTransaction,
  products, type Product, type InsertProduct,
  refills, type Refill, type InsertRefill,
  refillDetails, type RefillDetail, type InsertRefillDetail,
  events, type Event, type InsertEvent,
  syncLogs, type SyncLog, type InsertSyncLog,
  locations, type Location, type InsertLocation,
  suppliers, type Supplier, type InsertSupplier,
  warehouses, type Warehouse, type InsertWarehouse,
  inventoryItems, type InventoryItem, type InsertInventoryItem,
  inventoryBatches, type InventoryBatch, type InsertInventoryBatch,
  inventoryMovements, type InventoryMovement, type InsertInventoryMovement,
  inventoryCounts, type InventoryCount, type InsertInventoryCount,
  inventoryCountItems, type InventoryCountItem, type InsertInventoryCountItem,
  machineWarehouseAssignments, type MachineWarehouseAssignment, type InsertMachineWarehouseAssignment,
  productDisposals, type ProductDisposal, type InsertProductDisposal,
  productDisposalItems, type ProductDisposalItem, type InsertProductDisposalItem,
  inventoryTransfers, type InventoryTransfer, type InsertInventoryTransfer,
  inventoryTransferItems, type InventoryTransferItem, type InsertInventoryTransferItem,
  stocks, type Stock, type InsertStock,
  machineStocks, type MachineStock, type InsertMachineStock,
  orders, type Order, type InsertOrder,
  orderItems, type OrderItem, type InsertOrderItem,
  purchaseConditions, type PurchaseCondition, type InsertPurchaseCondition,
  refillBatchMovements, type RefillBatchMovement, type InsertRefillBatchMovement,
  // Neue Tabellen für verbessertes Lagerverwaltungssystem
  productBatches, type ProductBatch, type InsertProductBatch,
  productMovements, type ProductMovement, type InsertProductMovement
} from "@shared/schema";

// Interface defining all storage operations
export interface IStorage {
  // Raw SQL Query für erweiterte Abfragen
  query(sql: string, params?: any[]): Promise<any[]>;
  
  // Direkter Zugriff auf die Datenbank für Raw Queries
  executeRawQuery(sql: string, params?: any[]): Promise<{rows: any[], rowCount: number}>;
  
  // Database statistics operations
  getDatabaseStats(): Promise<{
    transactions: { count: number; latest: Date | null };
    machines: { count: number; latest: Date | null };
    refills: { count: number; latest: Date | null };
    refillDetails: { count: number; latest: Date | null };
    events: { count: number; latest: Date | null };
    products: { count: number; latest: Date | null };
    stocks: { count: number; latest: Date | null };
    machineStocks: { count: number; latest: Date | null };
  }>;
  
  // Transaction count method for sync status tracking
  getTransactionCount(): Promise<number>;
  
  // Data coverage statistics methods
  getTransactionStatistics(): Promise<{
    earliest_date: string | null;
    latest_date: string | null;
    count: number;
    quality: number | null;
    coverage_percentage: number;
  }>;
  
  getWeatherStatistics(): Promise<{
    earliest_date: string | null;
    latest_date: string | null;
    count: number;
    quality: number | null;
    coverage_percentage: number;
  }>;
  
  // Stock operations
  getStocks(limit?: number): Promise<Stock[]>;
  getStock(id: number): Promise<Stock | undefined>;
  getStockByVendonId(vendonId: string): Promise<Stock | undefined>;
  createStock(stock: InsertStock): Promise<Stock>;
  updateStock(id: number, stock: Partial<InsertStock>): Promise<Stock | undefined>;
  
  // Machine Stock operations
  getMachineStocks(machineId?: number, limit?: number): Promise<MachineStock[]>;
  getMachineStock(id: number): Promise<MachineStock | undefined>;
  getMachineStockByMachineAndProduct(machineId: number, productVendonId: string, selectionNumber: string): Promise<MachineStock | undefined>;
  createMachineStock(machineStock: InsertMachineStock): Promise<MachineStock>;
  updateMachineStock(id: number, machineStock: Partial<InsertMachineStock>): Promise<MachineStock | undefined>;

  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;
  
  // Product Disposal operations
  getProductDisposals(filter?: { status?: string; warehouseId?: string }): Promise<ProductDisposal[]>;
  getProductDisposalById(id: number): Promise<ProductDisposal | undefined>;
  getProductDisposalItems(filter: { disposalId: number }): Promise<ProductDisposalItem[]>;
  createProductDisposal(disposal: InsertProductDisposal): Promise<ProductDisposal>;
  createProductDisposalItems(items: InsertProductDisposalItem[]): Promise<ProductDisposalItem[]>;
  updateProductDisposal(id: number, disposal: Partial<InsertProductDisposal>): Promise<ProductDisposal | undefined>;
  deleteProductDisposal(id: number): Promise<boolean>;
  deleteProductDisposalItems(filter: { disposalId: number }): Promise<void>;
  updateInventoryForDisposal(warehouseId: string, productId: string, quantity: number): Promise<void>;

  // Inventory Transfer operations
  getInventoryTransfers(filter?: Record<string, any>): Promise<InventoryTransfer[]>;
  getInventoryTransferById(id: number): Promise<InventoryTransfer | undefined>;
  getInventoryTransferItems(filter: { transferId: number }): Promise<InventoryTransferItem[]>;
  createInventoryTransfer(transfer: InsertInventoryTransfer): Promise<InventoryTransfer>;
  createInventoryTransferItems(items: InsertInventoryTransferItem[]): Promise<InventoryTransferItem[]>;
  updateInventoryTransfer(id: number, transfer: Partial<InsertInventoryTransfer>): Promise<InventoryTransfer | undefined>;
  updateInventoryForTransfer(sourceWarehouseId: number, targetWarehouseId: number, productId: string, quantity: number): Promise<{
    sourceStock: number;
    targetStock: number;
    success: boolean;
  }>;
  deleteInventoryTransfer(id: number): Promise<boolean>;

  // Machine operations
  getMachines(limit?: number): Promise<Machine[]>;
  getAllMachines(): Promise<Machine[]>;
  getMachine(id: number): Promise<Machine | undefined>;
  getMachineByVendonId(vendonId: string): Promise<Machine | undefined>;
  createMachine(machine: InsertMachine): Promise<Machine>;
  updateMachine(id: number, machine: Partial<InsertMachine>): Promise<Machine | undefined>;
  getMachineProducts(machineId: number): Promise<{ productName: string; price: number }[]>;

  // Transaction operations
  getTransactions(limit?: number): Promise<Transaction[]>;
  getTransactionsByDateRange(startDate: Date, endDate: Date, limit?: number): Promise<Transaction[]>;
  getTransactionsByMachine(machineId: number, limit?: number): Promise<Transaction[]>;
  getTransactionsByProduct(productId: number, limit?: number): Promise<Transaction[]>;
  getTransactionByVendonId(vendonId: string): Promise<Transaction | undefined>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransaction(id: number, transaction: Partial<InsertTransaction>): Promise<Transaction | undefined>;
  
  // Erweiterte Transaktionsabfragen für KPIs
  getMachineDailyStats(machineId: number | string): Promise<{
    todayTransactions: number;
    todayRevenue: number;
    lastSale: Transaction | null;
    lastCashlessSale: Transaction | null;
    alcoholSales: {
      today: number;
      weekAvg: number;
      monthAvg: number;
    };
  }>;
  
  // Refill operations
  getRefills(options?: { warehouseId?: number; startDate?: Date; endDate?: Date; limit?: number; }): Promise<any[]>;
  getRefillById(refillId: number): Promise<any>;
  getTransactionsForProcessing(limit?: number, offset?: number): Promise<Transaction[]>;
  updateTransactionProcessingStatus(id: number, status: string, errorMessage?: string): Promise<void>;
  getTransactionStats(): Promise<{total: number; processed: number; pending: number; error: number}>;

  // Product operations
  getProducts(options?: {
    limit?: number;
    offset?: number;
    category?: string;
    search?: string;
    supplierId?: number;
  } | number): Promise<Product[] | {
    data: Product[];
    meta: {
      total: number;
      offset: number;
      limit: number;
      page: number;
      pages: number;
    }
  }>;
  getProduct(id: number): Promise<Product | undefined>;
  getProductByVendonId(vendonId: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined>;
  getProductMachines(productId: number): Promise<{machineId: number, machineName: string, currentStock: number, lastRefill: string}[]>;
  getProductRefills(productId: number, limit?: number): Promise<RefillDetail[]>;

  // Refill operations
  getRefills(limit?: number, offset?: number, startDate?: string, endDate?: string, machineId?: string): Promise<Refill[]>;
  getRefillsForWarehouse(warehouseId?: number, limit?: number, offset?: number, startDate?: string, endDate?: string): Promise<Refill[]>;
  getRefillsByMachine(machineId: number, limit?: number): Promise<Refill[]>;
  getRefill(id: number): Promise<Refill | undefined>;
  getRefillByVendonId(vendonId: string): Promise<Refill | undefined>;
  getRefillDetails(refillId: number): Promise<RefillDetail[]>;
  createRefill(refill: InsertRefill): Promise<Refill>;
  createRefillDetail(detail: InsertRefillDetail): Promise<RefillDetail>;

  // Event operations
  getEvents(limit?: number): Promise<Event[]>;
  getEventsByDateRange(startDate: Date, endDate: Date, limit?: number): Promise<Event[]>;
  getEvent(id: number): Promise<Event | undefined>;
  getEventByVendonId(vendonId: string): Promise<Event | undefined>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: number, event: Partial<InsertEvent>): Promise<Event | undefined>;

  // Sync log operations
  getSyncLogs(limit?: number): Promise<SyncLog[]>;
  getSyncLogsByType(syncType: string, limit?: number): Promise<SyncLog[]>;
  getSyncLogsByTypePatterns(syncTypes: string[], limit?: number): Promise<SyncLog[]>;
  getSyncLogById(id: number): Promise<SyncLog | undefined>;
  getSyncLog(id: number): Promise<SyncLog | undefined>; // Legacy method, use getSyncLogById instead
  createSyncLog(log: InsertSyncLog): Promise<SyncLog>;
  updateSyncLog(id: number, log: Partial<InsertSyncLog>): Promise<SyncLog | undefined>;
  getLatestSyncLog(syncType: string): Promise<SyncLog | undefined>;
  
  /**
   * Ruft den letzten laufenden Synchronisationsprozess für den angegebenen Typ ab
   * Wird verwendet, um parallele Synchronisierungen zu verhindern
   */
  getLatestRunningSyncLog(syncType: string): Promise<SyncLog | undefined>;

  // Location operations
  getLocations(): Promise<Location[]>;
  getLocation(id: number): Promise<Location | undefined>;
  createLocation(location: InsertLocation): Promise<Location>;
  
  // Supplier operations
  getSuppliers(options?: {
    limit?: number;
    offset?: number;
    status?: string;
    search?: string;
  }): Promise<{
    data: Supplier[];
    meta: {
      total: number;
      offset: number;
      limit: number;
      page: number;
      pages: number;
    }
  }>;
  getSupplierById(id: number): Promise<Supplier | undefined>;
  createSupplier(supplier: InsertSupplier): Promise<Supplier>;
  updateSupplier(id: number, supplier: Partial<InsertSupplier>): Promise<Supplier | undefined>;
  deleteSupplier(id: number): Promise<boolean>;
  
  // Purchase Conditions operations
  getPurchaseConditionById(id: number): Promise<PurchaseCondition | undefined>;
  getPurchaseConditionsBySupplier(supplierId: number): Promise<PurchaseCondition[]>;
  getPurchaseConditionsByProduct(productId: number): Promise<PurchaseCondition[]>;
  createPurchaseCondition(purchaseCondition: InsertPurchaseCondition): Promise<PurchaseCondition>;
  updatePurchaseCondition(id: number, purchaseCondition: Partial<InsertPurchaseCondition>): Promise<PurchaseCondition | undefined>;
  deletePurchaseCondition(id: number): Promise<boolean>;
  
  // Order operations
  getOrders(): Promise<Order[]>;
  getOrder(id: number): Promise<Order | undefined>;
  createOrder(order: Omit<InsertOrder, "id">): Promise<Order>;
  updateOrder(id: number, order: Partial<InsertOrder>): Promise<Order | undefined>;
  deleteOrder(id: number): Promise<boolean>;
  getOpenOrders(limit?: number): Promise<Order[]>;
  getRecentlyCompletedOrders(limit?: number): Promise<Order[]>;
  getOrdersBySupplier(supplierId: number): Promise<Order[]>;
  getOrderStatistics(): Promise<{
    total: number;
    open: number;
    ordered: number;
    partial: number;
    completed: number;
    cancelled: number;
  }>;
  
  // Order Items operations
  getOrderItems(orderId?: number): Promise<OrderItem[]>;
  getOrderItem(id: number): Promise<OrderItem | undefined>;
  createOrderItem(item: Omit<InsertOrderItem, "id">): Promise<OrderItem>;
  updateOrderItem(id: number, item: Partial<InsertOrderItem>): Promise<OrderItem | undefined>;
  deleteOrderItem(id: number): Promise<boolean>;
  
  // Warehouse operations
  getWarehouses(): Promise<Warehouse[]>;
  getWarehouse(id: number): Promise<Warehouse | undefined>;
  createWarehouse(warehouse: InsertWarehouse): Promise<Warehouse>;
  updateWarehouse(id: number, warehouse: Partial<InsertWarehouse>): Promise<Warehouse | undefined>;
  deleteWarehouse(id: number): Promise<boolean>;
  
  // Inventory Item operations
  getInventoryItems(params?: {
    warehouseId?: number;
    productId?: number;
    critical?: boolean;
    includeZeroStock?: boolean;
  }): Promise<InventoryItem[]>;
  getInventoryItem(id: number): Promise<InventoryItem | undefined>;
  getInventoryItemsByWarehouse(warehouseId: number): Promise<InventoryItem[]>;
  getInventoryItemsByWarehouseAndProduct(warehouseId: number, productId: number): Promise<InventoryItem[]>;
  getInventoryItemByProductAndWarehouse(productId: number, warehouseId: number): Promise<InventoryItem | undefined>;
  createInventoryItem(item: InsertInventoryItem): Promise<InventoryItem>;
  updateInventoryItem(id: number, item: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined>;
  deleteInventoryItem(id: number): Promise<boolean>;
  
  // Inventory Movement operations
  getInventoryMovements(params?: {
    sourceWarehouseId?: number;
    destinationWarehouseId?: number;
    productId?: number;
    machineId?: number;
    movementType?: string;
    referenceType?: string;
    referenceId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<InventoryMovement[]>;
  getInventoryMovementsByInventoryItem(inventoryItemId: number): Promise<InventoryMovement[]>;
  getInventoryMovementsByReference(referenceType: string, referenceId: string): Promise<InventoryMovement[]>;
  createInventoryMovement(movement: InsertInventoryMovement): Promise<InventoryMovement>;
  
  // Inventory Count operations
  getInventoryCounts(params?: {
    warehouseId?: number;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<InventoryCount[]>;
  getInventoryCount(id: number): Promise<InventoryCount | undefined>;
  createInventoryCount(count: InsertInventoryCount): Promise<InventoryCount>;
  updateInventoryCount(id: number, count: Partial<InsertInventoryCount>): Promise<InventoryCount | undefined>;
  deleteInventoryCount(id: number): Promise<boolean>;
  
  // Inventory Count Item operations
  getInventoryCountItems(inventoryCountId: number): Promise<InventoryCountItem[]>;
  getInventoryCountItemById(id: number): Promise<InventoryCountItem | undefined>;
  createInventoryCountItem(item: InsertInventoryCountItem): Promise<InventoryCountItem>;
  updateInventoryCountItem(id: number, item: Partial<InsertInventoryCountItem>): Promise<InventoryCountItem | undefined>;
  deleteInventoryCountItemsByInventoryCount(inventoryCountId: number): Promise<void>;
  
  // Machine-Warehouse Assignment operations
  getMachineWarehouseAssignments(params?: {
    machineId?: number;
    warehouseId?: number;
  }): Promise<MachineWarehouseAssignment[]>;
  getMachineWarehouseAssignmentById(id: number): Promise<MachineWarehouseAssignment | undefined>;
  getMachineWarehouseAssignment(machineId: number, warehouseId: number): Promise<MachineWarehouseAssignment | undefined>;
  createMachineWarehouseAssignment(assignment: InsertMachineWarehouseAssignment): Promise<MachineWarehouseAssignment>;
  updateMachineWarehouseAssignment(id: number, assignment: Partial<InsertMachineWarehouseAssignment>): Promise<MachineWarehouseAssignment | undefined>;
  deleteMachineWarehouseAssignment(id: number): Promise<boolean>;
  updatePrimaryWarehouseForMachine(machineId: number): Promise<void>;

  // Product Disposal operations
  getProductDisposals(filter?: { status?: string; warehouseId?: string }): Promise<ProductDisposal[]>;
  getProductDisposalById(id: number): Promise<ProductDisposal | undefined>;
  getProductDisposalItems(filter: { disposalId: number }): Promise<ProductDisposalItem[]>;
  createProductDisposal(disposal: InsertProductDisposal): Promise<ProductDisposal>;
  createProductDisposalItems(items: InsertProductDisposalItem[]): Promise<ProductDisposalItem[]>;
  updateProductDisposal(id: number, disposal: Partial<InsertProductDisposal>): Promise<ProductDisposal | undefined>;
  deleteProductDisposal(id: number): Promise<boolean>;
  deleteProductDisposalItems(filter: { disposalId: number }): Promise<void>;
  updateInventoryForDisposal(warehouseId: string, productId: string, quantity: number): Promise<void>;
  
  // Inventory Batch operations
  // Product Batch operations - Neue Methoden für das verbesserte Lagerverwaltungskonzept
  getProductBatches(params?: {
    warehouseId?: number;
    productId?: number;
    supplierId?: number;
    status?: string;
    expiryBefore?: Date;
    expiryAfter?: Date;
    orderId?: number;
  }): Promise<ProductBatch[]>;
  getProductBatchById(id: number): Promise<ProductBatch | undefined>;
  getProductBatchByBatchNumber(batchNumber: string, productId: number, warehouseId: number): Promise<ProductBatch | undefined>;
  createProductBatch(batch: InsertProductBatch): Promise<ProductBatch>;
  updateProductBatch(id: number, batch: Partial<InsertProductBatch>): Promise<ProductBatch | undefined>;
  deleteProductBatch(id: number): Promise<boolean>;
  
  // Product Movement operations - Neue Methoden für das verbesserte Bewegungsmanagement
  getProductMovements(params?: {
    sourceType?: string;
    sourceId?: number;
    destinationType?: string;
    destinationId?: number;
    productId?: number;
    productBatchId?: number;
    movementType?: string;
    referenceType?: string;
    referenceId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<ProductMovement[]>;
  getProductMovementById(id: number): Promise<ProductMovement | undefined>;
  createProductMovement(movement: InsertProductMovement): Promise<ProductMovement>;
  
  // Bestehende Methoden für Kompatibilität
  getInventoryBatches(params?: {
    warehouseId?: number;
    productId?: number;
    expired?: boolean;
    expiryDateBefore?: Date;
    expiryDateAfter?: Date;
    limit?: number;
    offset?: number;
  }): Promise<InventoryBatch[]>;
  getInventoryBatch(id: number): Promise<InventoryBatch | undefined>;
  getInventoryBatchByBatchNumber(batchNumber: string, warehouseId: number): Promise<InventoryBatch | undefined>;
  createInventoryBatch(batch: InsertInventoryBatch): Promise<InventoryBatch>;
  updateInventoryBatch(id: number, batch: Partial<InsertInventoryBatch>): Promise<InventoryBatch | undefined>;
  deleteInventoryBatch(id: number): Promise<boolean>;
  
  // Inventory Movement with Batch operations
  createInventoryMovementWithBatch(
    movement: InsertInventoryMovement, 
    batchId: number
  ): Promise<InventoryMovement>;
  
  // Refill Batch Movement operations
  getRefillBatchMovements(params?: {
    refillId?: number;
    refillDetailId?: number;
    batchId?: number;
    warehouseId?: number;
    limit?: number;
    offset?: number;
  }): Promise<RefillBatchMovement[]>;
  getRefillBatchMovement(id: number): Promise<RefillBatchMovement | undefined>;
  createRefillBatchMovement(movement: InsertRefillBatchMovement): Promise<RefillBatchMovement>;
  processRefillWithBatches(
    refillId: number, 
    refillDetailId: number, 
    warehouseId: number, 
    productId: number, 
    quantity: number
  ): Promise<RefillBatchMovement[]>;
}

// Database storage implementation
export class DatabaseStorage implements IStorage {
  // Raw SQL Query für erweiterte Abfragen
  async query(sql: string, params: any[] = []): Promise<any[]> {
    return await db.execute(sql as any, params);
  }
  
  // Führt eine SQL-Abfrage direkt aus und gibt ein erweitertes Ergebnis zurück
  async executeRawQuery(sql: string, params: any[] = []): Promise<{rows: any[], rowCount: number}> {
    try {
      // Verwende rawDb (PostgreSQL-Client) für direkten Zugriff
      const result = await rawDb.query(sql, params);
      return {
        rows: result.rows || [],
        rowCount: result.rowCount || 0
      };
    } catch (error) {
      console.error("Fehler bei der Ausführung von Raw SQL:", error);
      throw error;
    }
  }
  
  // Get transaction count for sync status
  async getTransactionCount(): Promise<number> {
    const countResult = await db.select({ count: count() }).from(transactions);
    return parseInt(countResult[0]?.count?.toString() || '0');
  }
  
  // Data coverage statistics methods
  async getTransactionStatistics(): Promise<{
    earliest_date: string | null;
    latest_date: string | null;
    count: number;
    quality: number | null;
    coverage_percentage: number;
  }> {
    try {
      // Get earliest and latest transaction dates
      const [earliest] = await db
        .select({ date: transactions.datetime })
        .from(transactions)
        .orderBy(asc(transactions.datetime))
        .limit(1);
        
      const [latest] = await db
        .select({ date: transactions.datetime })
        .from(transactions)
        .orderBy(desc(transactions.datetime))
        .limit(1);
        
      // Get total transaction count
      const [countResult] = await db
        .select({ count: count() })
        .from(transactions);
      
      const transactionCount = parseInt(countResult?.count?.toString() || '0');
      
      // Calculate coverage percentage
      let coveragePercentage = 0;
      
      if (earliest?.date && latest?.date) {
        const startDate = new Date(earliest.date);
        const endDate = new Date(latest.date);
        const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        
        // Get unique days with transactions
        const uniqueDaysResult = await db.execute(
          `SELECT COUNT(DISTINCT DATE(datetime)) as unique_days FROM transactions`
        );
        
        const uniqueDays = parseInt(uniqueDaysResult[0]?.unique_days || '0');
        
        // Calculate coverage as percentage of days with data
        coveragePercentage = totalDays > 0 ? Math.round((uniqueDays / totalDays) * 100) : 0;
      }
      
      return {
        earliest_date: earliest?.date ? new Date(earliest.date).toISOString() : null,
        latest_date: latest?.date ? new Date(latest.date).toISOString() : null,
        count: transactionCount,
        quality: null, // Placeholder for future implementation
        coverage_percentage: coveragePercentage
      };
    } catch (error) {
      console.error("Error getting transaction statistics:", error);
      return {
        earliest_date: null,
        latest_date: null,
        count: 0,
        quality: null,
        coverage_percentage: 0
      };
    }
  }
  
  async getWeatherStatistics(): Promise<{
    earliest_date: string | null;
    latest_date: string | null;
    count: number;
    quality: number | null;
    coverage_percentage: number;
  }> {
    try {
      // This is a placeholder implementation since we don't have direct access
      // to weather data tables. In a real implementation, this would query the
      // appropriate weather data tables.
      
      // For now, we'll return a mock response with sample data
      // In a real implementation, this should be replaced with actual database queries
      
      // Try to get weather data from database
      let earliestDate = null;
      let latestDate = null;
      let count = 0;
      let coveragePercentage = 0;
      
      try {
        // Attempt to query weather_data table if it exists
        const weatherStats = await db.execute(
          `SELECT 
            MIN(date) as earliest, 
            MAX(date) as latest, 
            COUNT(*) as count 
          FROM weather_data`
        );
        
        if (weatherStats && weatherStats.length > 0) {
          earliestDate = weatherStats[0]?.earliest || null;
          latestDate = weatherStats[0]?.latest || null;
          count = parseInt(weatherStats[0]?.count || '0');
          
          if (earliestDate && latestDate) {
            const startDate = new Date(earliestDate);
            const endDate = new Date(latestDate);
            const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            
            // Get unique days with weather data
            const uniqueDaysResult = await db.execute(
              `SELECT COUNT(DISTINCT date) as unique_days FROM weather_data`
            );
            
            const uniqueDays = parseInt(uniqueDaysResult[0]?.unique_days || '0');
            
            // Calculate coverage as percentage of days with data
            coveragePercentage = totalDays > 0 ? Math.round((uniqueDays / totalDays) * 100) : 0;
          }
        }
      } catch (error) {
        // Weather data table might not exist or have a different structure
        console.warn("Could not query weather data table:", error);
        
        // Fallback to use forecast data if available
        try {
          const forecastStats = await db.execute(
            `SELECT 
              MIN(date) as earliest, 
              MAX(date) as latest, 
              COUNT(*) as count 
            FROM weather_forecasts`
          );
          
          if (forecastStats && forecastStats.length > 0) {
            earliestDate = forecastStats[0]?.earliest || null;
            latestDate = forecastStats[0]?.latest || null;
            count = parseInt(forecastStats[0]?.count || '0');
            
            // Simplified coverage calculation (assumes daily forecasts)
            if (earliestDate && latestDate) {
              const startDate = new Date(earliestDate);
              const endDate = new Date(latestDate);
              const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
              
              // Calculate coverage based on total days in the range
              coveragePercentage = count > 0 && totalDays > 0 ? Math.min(100, Math.round((count / totalDays) * 100)) : 0;
            }
          }
        } catch (error) {
          // Weather forecast table might not exist either
          console.warn("Could not query weather forecast table:", error);
        }
      }
      
      return {
        earliest_date: earliestDate,
        latest_date: latestDate,
        count: count,
        quality: null, // Placeholder for future implementation
        coverage_percentage: coveragePercentage
      };
    } catch (error) {
      console.error("Error getting weather statistics:", error);
      return {
        earliest_date: null,
        latest_date: null,
        count: 0,
        quality: null,
        coverage_percentage: 0
      };
    }
  }
  
  // Order operations
  async getOrders(): Promise<Order[]> {
    return await db.select().from(orders).orderBy(desc(orders.orderDate));
  }

  async getOrder(id: number): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    return order;
  }

  async createOrder(data: Omit<InsertOrder, "id">): Promise<Order> {
    // Datum-Felder sicher formatieren
    const cleanData = { ...data };
    
    // Explizite Behandlung aller möglichen Datums-Felder
    const dateFields = ['expectedDeliveryDate', 'actualDeliveryDate', 'orderDate', 'createdAt', 'updatedAt', 'lastUpdated'];
    
    for (const field of dateFields) {
      if (field in cleanData) {
        try {
          // Wenn es bereits ein gültiges Date-Objekt ist, nichts tun
          if (cleanData[field] instanceof Date && !isNaN(cleanData[field].getTime())) {
            // Bereits korrekt, lasse es unverändert
          } 
          // Wenn es ein String ist, konvertieren wir es in ein Date-Objekt
          else if (typeof cleanData[field] === 'string') {
            const parsedDate = new Date(cleanData[field]);
            if (!isNaN(parsedDate.getTime())) {
              cleanData[field] = parsedDate;
            } else {
              console.warn(`Ungültiger Datumswert für ${field}: ${cleanData[field]}, setze auf null`);
              cleanData[field] = null;
            }
          } 
          // Alle anderen Typen werden auf null gesetzt
          else if (cleanData[field] !== null) {
            console.warn(`Unerwarteter Typ für ${field}: ${typeof cleanData[field]}, setze auf null`);
            cleanData[field] = null;
          }
        } catch (dateError) {
          console.error(`Fehler bei der Verarbeitung des Datums für ${field}:`, dateError);
          cleanData[field] = null;
        }
      }
    }
    
    // Immer die aktuellen Zeitstempel setzen
    const [newOrder] = await db.insert(orders).values({
      ...cleanData,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    
    return newOrder;
  }

  async updateOrder(id: number, data: Partial<InsertOrder>): Promise<Order | undefined> {
    // Datum-Felder sicher formatieren
    const cleanData = { ...data };
    
    // Explizite Behandlung aller möglichen Datums-Felder
    const dateFields = ['expectedDeliveryDate', 'actualDeliveryDate', 'orderDate', 'createdAt', 'updatedAt', 'lastUpdated'];
    
    for (const field of dateFields) {
      if (field in cleanData) {
        try {
          // Wenn es bereits ein gültiges Date-Objekt ist, nichts tun
          if (cleanData[field] instanceof Date && !isNaN(cleanData[field].getTime())) {
            // Bereits korrekt, lasse es unverändert
          } 
          // Wenn es ein String ist, konvertieren wir es in ein Date-Objekt
          else if (typeof cleanData[field] === 'string') {
            const parsedDate = new Date(cleanData[field]);
            if (!isNaN(parsedDate.getTime())) {
              cleanData[field] = parsedDate;
            } else {
              console.warn(`Ungültiger Datumswert für ${field}: ${cleanData[field]}, setze auf null`);
              cleanData[field] = null;
            }
          } 
          // Alle anderen Typen werden auf null gesetzt
          else if (cleanData[field] !== null) {
            console.warn(`Unerwarteter Typ für ${field}: ${typeof cleanData[field]}, setze auf null`);
            cleanData[field] = null;
          }
        } catch (dateError) {
          console.error(`Fehler bei der Verarbeitung des Datums für ${field}:`, dateError);
          cleanData[field] = null;
        }
      }
    }
    
    const [updatedOrder] = await db
      .update(orders)
      .set({ ...cleanData, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return updatedOrder;
  }

  async deleteOrder(id: number): Promise<boolean> {
    const result = await db.delete(orders).where(eq(orders.id, id)).returning({ id: orders.id });
    return result.length > 0;
  }
  
  async getOpenOrders(limit: number = 10): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(
        or(
          eq(orders.status, "open"),
          eq(orders.status, "ordered"),
          eq(orders.status, "partial")
        )
      )
      .orderBy(desc(orders.orderDate))
      .limit(limit);
  }
  
  async getRecentlyCompletedOrders(limit: number = 5): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(eq(orders.status, "completed"))
      .orderBy(desc(orders.actualDeliveryDate))
      .limit(limit);
  }
  
  async getOrdersBySupplier(supplierId: number): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(eq(orders.supplierId, supplierId))
      .orderBy(desc(orders.orderDate));
  }
  
  // Order Items operations
  async getOrderItems(orderId?: number): Promise<OrderItem[]> {
    if (orderId) {
      return await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId))
        .orderBy(orderItems.positionNumber);
    } else {
      return await db.select().from(orderItems);
    }
  }

  async getOrderItem(id: number): Promise<OrderItem | undefined> {
    const [item] = await db.select().from(orderItems).where(eq(orderItems.id, id)).limit(1);
    return item;
  }

  async createOrderItem(data: Omit<InsertOrderItem, "id">): Promise<OrderItem> {
    const [newItem] = await db.insert(orderItems).values({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newItem;
  }

  async updateOrderItem(id: number, data: Partial<InsertOrderItem>): Promise<OrderItem | undefined> {
    const [updatedItem] = await db
      .update(orderItems)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(orderItems.id, id))
      .returning();
    return updatedItem;
  }

  async deleteOrderItem(id: number): Promise<boolean> {
    const result = await db.delete(orderItems).where(eq(orderItems.id, id)).returning({ id: orderItems.id });
    return result.length > 0;
  }
  
  // Implementierung der getOrderStatistics Methode
  async getOrderStatistics(): Promise<{
    total: number;
    open: number;
    ordered: number;
    partial: number;
    completed: number;
    cancelled: number;
  }> {
    // Total orders
    const totalResult = await db
      .select({ count: count() })
      .from(orders);
    
    // Open orders
    const openResult = await db
      .select({ count: count() })
      .from(orders)
      .where(eq(orders.status, "open"));
    
    // Ordered orders
    const orderedResult = await db
      .select({ count: count() })
      .from(orders)
      .where(eq(orders.status, "ordered"));
    
    // Partial orders
    const partialResult = await db
      .select({ count: count() })
      .from(orders)
      .where(eq(orders.status, "partial"));
    
    // Completed orders
    const completedResult = await db
      .select({ count: count() })
      .from(orders)
      .where(eq(orders.status, "completed"));
    
    // Cancelled orders
    const cancelledResult = await db
      .select({ count: count() })
      .from(orders)
      .where(eq(orders.status, "cancelled"));
    
    return {
      total: Number(totalResult[0]?.count?.toString() || '0'),
      open: Number(openResult[0]?.count?.toString() || '0'),
      ordered: Number(orderedResult[0]?.count?.toString() || '0'),
      partial: Number(partialResult[0]?.count?.toString() || '0'),
      completed: Number(completedResult[0]?.count?.toString() || '0'),
      cancelled: Number(cancelledResult[0]?.count?.toString() || '0')
    };
  }
  
  // Stock operations
  async getStocks(limit: number = 100): Promise<Stock[]> {
    return await db.select().from(stocks).orderBy(stocks.productName).limit(limit);
  }
  
  async getStock(id: number): Promise<Stock | undefined> {
    const [stock] = await db.select().from(stocks).where(eq(stocks.id, id));
    return stock;
  }
  
  async getStockByVendonId(vendonId: string): Promise<Stock | undefined> {
    const [stock] = await db.select().from(stocks).where(eq(stocks.vendonId, vendonId));
    return stock;
  }
  
  async createStock(stock: InsertStock): Promise<Stock> {
    const [newStock] = await db.insert(stocks).values({
      ...stock,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newStock;
  }
  
  async updateStock(id: number, stock: Partial<InsertStock>): Promise<Stock | undefined> {
    const [updatedStock] = await db
      .update(stocks)
      .set({ ...stock, updatedAt: new Date() })
      .where(eq(stocks.id, id))
      .returning();
    return updatedStock;
  }
  
  // Machine Stock operations
  async getMachineStocks(machineId?: number, limit: number = 100): Promise<MachineStock[]> {
    if (machineId) {
      return await db
        .select()
        .from(machineStocks)
        .where(eq(machineStocks.machineId, machineId))
        .orderBy(machineStocks.selectionNumber)
        .limit(limit);
    } else {
      return await db
        .select()
        .from(machineStocks)
        .orderBy(machineStocks.machineId)
        .limit(limit);
    }
  }
  
  async getMachineStock(id: number): Promise<MachineStock | undefined> {
    const [machineStock] = await db.select().from(machineStocks).where(eq(machineStocks.id, id));
    return machineStock;
  }
  
  async getMachineStockByMachineAndProduct(machineId: number, productVendonId: string, selectionNumber: string): Promise<MachineStock | undefined> {
    const [machineStock] = await db.select().from(machineStocks)
      .where(
        and(
          eq(machineStocks.machineId, machineId),
          eq(machineStocks.productVendonId, productVendonId),
          eq(machineStocks.selectionNumber, selectionNumber)
        )
      );
    return machineStock;
  }
  
  async createMachineStock(machineStock: InsertMachineStock): Promise<MachineStock> {
    const [newMachineStock] = await db.insert(machineStocks).values({
      ...machineStock,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newMachineStock;
  }
  
  async updateMachineStock(id: number, machineStock: Partial<InsertMachineStock>): Promise<MachineStock | undefined> {
    const [updatedMachineStock] = await db
      .update(machineStocks)
      .set({ ...machineStock, updatedAt: new Date() })
      .where(eq(machineStocks.id, id))
      .returning();
    return updatedMachineStock;
  }

  // Database statistics operations
  async getDatabaseStats(): Promise<{
    transactions: { count: number; latest: string | null };
    machines: { count: number; latest: string | null };
    refills: { count: number; latest: string | null };
    refillDetails: { count: number; latest: string | null };
    events: { count: number; latest: string | null };
    products: { count: number; latest: string | null };
    stocks: { count: number; latest: string | null };
    machineStocks: { count: number; latest: string | null };
    holidays?: number;
    syncLogs?: number;
    forecastModels?: number;
    lastUpdated: string;
  }> {
    try {
      console.log("Getting database statistics...");
      
      // Führen wir alle Abfragen parallel aus für bessere Performance
      const [
        transCountResult,
        machineCountResult,
        refillCountResult,
        refillDetailCountResult,
        eventCountResult,
        productCountResult,
        stockCountResult,
        machineStockCountResult,
        holidaysCountResult,
        syncLogsCountResult,
        forecastModelsCountResult,
        latestTrans,
        latestMachine,
        latestRefill,
        latestRefillDetail,
        latestEvent,
        latestProduct,
        latestStock,
        latestMachineStock
      ] = await Promise.all([
        // Zählung aller Entitäten
        db.select({ count: count() }).from(transactions),
        db.select({ count: count() }).from(machines),
        db.select({ count: count() }).from(refills),
        db.select({ count: count() }).from(refillDetails),
        db.select({ count: count() }).from(events),
        db.select({ count: count() }).from(products),
        db.select({ count: count() }).from(stocks),
        db.select({ count: count() }).from(machineStocks),
        
        // Zusätzliche Statistiken für die Sync-Dashboard-Seite
        this.executeRawQuery("SELECT COUNT(*) FROM holidays"),
        this.executeRawQuery("SELECT COUNT(*) FROM sync_logs"),
        this.executeRawQuery("SELECT COUNT(*) FROM forecast_models"),
        
        // Neueste Einträge
        db.select().from(transactions).orderBy(desc(transactions.datetime)).limit(1),
        db.select().from(machines).orderBy(desc(machines.updatedAt)).limit(1),
        db.select().from(refills).orderBy(desc(refills.datetime)).limit(1),
        db.select().from(refillDetails).orderBy(desc(refillDetails.createdAt)).limit(1),
        db.select().from(events).orderBy(desc(events.datetime)).limit(1),
        db.select().from(products).orderBy(desc(products.updatedAt)).limit(1),
        db.select().from(stocks).orderBy(desc(stocks.updatedAt)).limit(1),
        db.select().from(machineStocks).orderBy(desc(machineStocks.updatedAt)).limit(1)
      ]);
      
      // Sicherstellen, dass Datumswerte immer als Strings zurückgegeben werden
      const formatDate = (date: Date | null): string | null => {
        if (!date) return null;
        return date instanceof Date ? date.toISOString() : String(date);
      };
      
      // Parsen von Zählergebnissen
      const parseCount = (result: any): number => {
        if (!result || !result[0]) return 0;
        
        if (result[0].count !== undefined) {
          return parseInt(result[0].count?.toString() || '0');
        }
        
        if (result.rows && result.rows[0] && result.rows[0].count !== undefined) {
          return parseInt(result.rows[0].count?.toString() || '0');
        }
        
        return 0;
      };
      
      const stats = {
        transactions: {
          count: parseCount(transCountResult),
          latest: formatDate(latestTrans?.[0]?.datetime || null)
        },
        machines: {
          count: parseCount(machineCountResult),
          latest: formatDate(latestMachine?.[0]?.updatedAt || null)
        },
        refills: {
          count: parseCount(refillCountResult),
          latest: formatDate(latestRefill?.[0]?.datetime || null)
        },
        refillDetails: {
          count: parseCount(refillDetailCountResult),
          latest: formatDate(latestRefillDetail?.[0]?.createdAt || null)
        },
        events: {
          count: parseCount(eventCountResult),
          latest: formatDate(latestEvent?.[0]?.datetime || null)
        },
        products: {
          count: parseCount(productCountResult),
          latest: formatDate(latestProduct?.[0]?.updatedAt || null)
        },
        stocks: {
          count: parseCount(stockCountResult),
          latest: formatDate(latestStock?.[0]?.updatedAt || null)
        },
        machineStocks: {
          count: parseCount(machineStockCountResult),
          latest: formatDate(latestMachineStock?.[0]?.updatedAt || null)
        },
        holidays: holidaysCountResult?.rows?.[0]?.count ? parseInt(holidaysCountResult.rows[0].count) : 0,
        syncLogs: syncLogsCountResult?.rows?.[0]?.count ? parseInt(syncLogsCountResult.rows[0].count) : 0,
        forecastModels: forecastModelsCountResult?.rows?.[0]?.count ? parseInt(forecastModelsCountResult.rows[0].count) : 0,
        lastUpdated: new Date().toISOString()
      };
      
      console.log("Database statistics retrieved successfully.");
      return stats;
    } catch (error) {
      console.error("Error getting database statistics:", error);
      // Fallback für Fehlerfälle
      return {
        transactions: { count: 0, latest: null },
        machines: { count: 0, latest: null },
        refills: { count: 0, latest: null },
        refillDetails: { count: 0, latest: null },
        events: { count: 0, latest: null },
        products: { count: 0, latest: null },
        stocks: { count: 0, latest: null },
        machineStocks: { count: 0, latest: null },
        holidays: 0,
        syncLogs: 0,
        forecastModels: 0,
        lastUpdated: new Date().toISOString()
      };
    }
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getUsers(): Promise<User[]> {
    return await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      password: users.password,
      role: users.role,
      approved: users.approved,
      approvedBy: users.approvedBy,
      approvedAt: users.approvedAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt
    }).from(users).orderBy(desc(users.createdAt));
  }

  async updateUser(id: number, updateData: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({
        ...updateData,
        updatedAt: new Date()
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: number): Promise<boolean> {
    try {
      await db.delete(users).where(eq(users.id, id));
      return true;
    } catch (error) {
      console.error(`Error deleting user with ID ${id}:`, error);
      return false;
    }
  }

  // Machine operations
  async getMachines(limit: number = 100): Promise<Machine[]> {
    return await db.select().from(machines).limit(limit);
  }
  
  async getAllMachines(): Promise<Machine[]> {
    return await db.select().from(machines);
  }

  async getMachine(id: number): Promise<Machine | undefined> {
    const [machine] = await db.select().from(machines).where(eq(machines.id, id));
    return machine;
  }

  async getMachineByVendonId(vendonId: string): Promise<Machine | undefined> {
    const query = `
      SELECT * FROM machines 
      WHERE vendon_id = $1
      LIMIT 1
    `;
    const result = await rawDb.query(query, [vendonId]);
    return result.rows.length > 0 ? result.rows[0] : undefined;
  }

  async createMachine(machine: InsertMachine): Promise<Machine> {
    // Add timestamps to ensure consistent data
    const [newMachine] = await db.insert(machines).values({
      ...machine,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newMachine;
  }

  async updateMachine(id: number, machine: Partial<InsertMachine>): Promise<Machine | undefined> {
    const [updatedMachine] = await db
      .update(machines)
      .set({ ...machine, updatedAt: new Date() })
      .where(eq(machines.id, id))
      .returning();
    return updatedMachine;
  }
  
  async getMachineProducts(machineId: number): Promise<{ productName: string; price: number }[]> {
    // Alle Transaktionen für diese Maschine abrufen
    const machineTransactions = await db
      .select({
        productName: transactions.name,
        price: transactions.price
      })
      .from(transactions)
      .where(eq(transactions.machineId, machineId))
      .orderBy(desc(transactions.datetime));
    
    // Eine Map erstellen, um eindeutige Produkte zu identifizieren (basierend auf dem Namen)
    const uniqueProducts = new Map<string, { productName: string; price: number }>();
    
    // Durchlaufe alle Transaktionen und füge jedes Produkt nur einmal hinzu
    machineTransactions.forEach(transaction => {
      if (!uniqueProducts.has(transaction.productName)) {
        uniqueProducts.set(transaction.productName, {
          productName: transaction.productName,
          price: transaction.price
        });
      }
    });
    
    // Konvertiere die Map-Werte zurück in ein Array
    return Array.from(uniqueProducts.values());
  }

  // Transaction operations
  async getTransactions(limit: number = 100): Promise<Transaction[]> {
    return await db.select().from(transactions).orderBy(desc(transactions.datetime)).limit(limit);
  }

  async getTransactionsByDateRange(startDate: Date, endDate: Date, limit: number = 100): Promise<Transaction[]> {
    return await db
      .select()
      .from(transactions)
      .where(
        and(
          gte(transactions.datetime, startDate),
          lte(transactions.datetime, endDate)
        )
      )
      .orderBy(desc(transactions.datetime))
      .limit(limit);
  }

  async getTransactionsByMachine(machineId: number, limit: number = 100): Promise<Transaction[]> {
    return await db
      .select()
      .from(transactions)
      .where(eq(transactions.machineId, machineId))
      .orderBy(desc(transactions.datetime))
      .limit(limit);
  }
  
  async getTransactionsByProduct(productId: number, limit: number = 100): Promise<Transaction[]> {
    // Hole das Produkt, um den Namen zu bekommen
    const product = await this.getProduct(productId);
    
    if (!product) {
      return [];
    }
    
    // Suche nach Transaktionen mit dem Produktnamen, da die produkt_id oft NULL ist
    return await db
      .select()
      .from(transactions)
      .where(
        or(
          // Entweder nach productId suchen (falls gesetzt)
          eq(transactions.productId, productId),
          // Oder nach dem Produktnamen (wie er in der Transaktion gespeichert ist)
          like(transactions.productName, `%${product.productName}%`)
        )
      )
      .orderBy(desc(transactions.datetime))
      .limit(limit);
  }

  async getTransactionByVendonId(vendonId: string): Promise<Transaction | undefined> {
    const [transaction] = await db.select().from(transactions).where(eq(transactions.vendonId, vendonId));
    return transaction;
  }
  
  async getMachineDailyStats(machineId: number | string): Promise<{
    todayTransactions: number;
    todayRevenue: number;
    lastSale: Transaction | null;
    lastCashlessSale: Transaction | null;
    alcoholSales: {
      today: number;
      weekAvg: number;
      monthAvg: number;
    };
  }> {
    try {
      console.log(`[DEBUG] getMachineDailyStats aufgerufen mit ID: ${machineId} (Typ: ${typeof machineId})`);
      
      // SCHRITT 1: IDENTIFIZIERUNG DES AUTOMATEN
      // Wir müssen die interne ID des Automaten herausfinden, egal ob eine interne ID
      // oder eine Vendon-ID übergeben wurde
      
      let internalMachineId: number | null = null;
      let vendonMachineId: string | null = null;
      
      // Falls eine Vendon-ID (als String) übergeben wurde
      if (typeof machineId === 'string') {
        vendonMachineId = machineId;
        
        // Suche die interne ID anhand der Vendon-ID
        try {
          console.log(`[DEBUG] Suche Maschine mit Vendon-ID: ${vendonMachineId}`);
          const machine = await this.db.query.machines.findFirst({
            where: eq(machines.vendonId, vendonMachineId),
            columns: { id: true, vendonId: true }
          });
          
          if (machine) {
            internalMachineId = machine.id;
            console.log(`[DEBUG] Interne ID ${internalMachineId} für Vendon-ID ${vendonMachineId} gefunden`);
          } else {
            console.log(`[DEBUG] Keine Maschine mit Vendon-ID ${vendonMachineId} gefunden, versuche als interne ID zu parsen`);
            
            // Versuche als numerische ID zu interpretieren (Fallback)
            const numericId = parseInt(machineId, 10);
            if (!isNaN(numericId)) {
              const machineById = await this.db.query.machines.findFirst({
                where: eq(machines.id, numericId),
                columns: { id: true, vendonId: true }
              });
              
              if (machineById) {
                internalMachineId = numericId;
                vendonMachineId = machineById.vendonId;
                console.log(`[DEBUG] Maschine mit interner ID ${internalMachineId} gefunden`);
              }
            }
          }
        } catch (error) {
          console.error(`[ERROR] Fehler bei der Suche nach Maschine mit Vendon-ID ${vendonMachineId}:`, error);
        }
      } 
      // Falls direkt eine interne ID übergeben wurde
      else if (typeof machineId === 'number') {
        try {
          const machine = await this.db.query.machines.findFirst({
            where: eq(machines.id, machineId),
            columns: { id: true, vendonId: true }
          });
          
          if (machine) {
            internalMachineId = machineId;
            vendonMachineId = machine.vendonId;
            console.log(`[DEBUG] Maschine mit interner ID ${internalMachineId} gefunden, Vendon-ID: ${vendonMachineId}`);
          } else {
            console.log(`[DEBUG] Keine Maschine mit interner ID ${machineId} gefunden`);
          }
        } catch (error) {
          console.error(`[ERROR] Fehler bei der Suche nach Maschine mit interner ID ${machineId}:`, error);
        }
      }
      
      // Wenn keine Maschine gefunden wurde, leere Ergebnisse zurückgeben
      if (internalMachineId === null) {
        console.log(`[WARN] Keine Maschine für ID ${machineId} gefunden, gebe leere Ergebnisse zurück`);
        return {
          todayTransactions: 0,
          todayRevenue: 0,
          lastSale: null,
          lastCashlessSale: null,
          alcoholSales: {
            today: 0,
            weekAvg: 0,
            monthAvg: 0
          }
        };
      }
      
      // Aktuelles Datum für heutige Transaktionen
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      
      // Zeiträume für Durchschnittsberechnungen
      const oneWeekAgo = new Date(now);
      oneWeekAgo.setDate(now.getDate() - 7);
      
      const oneMonthAgo = new Date(now);
      oneMonthAgo.setMonth(now.getMonth() - 1);
      
      // SCHRITT 2: DATENABFRAGEN VORBEREITEN
      // Jetzt wo wir die interne ID und Vendon-ID haben, können wir
      // die notwendigen Daten für die Statistiken abfragen
      
      // 1. Heutige Transaktionen und Umsatz - Verbesserte Abfrage mit Vendon-ID
      const todayTransactionsQuery = `
        SELECT COUNT(*) as today_transactions, 
               COALESCE(SUM(price), 0) as today_revenue
        FROM transactions 
        WHERE (machine_id = $1 OR (extra_data::jsonb->>'machine_id' = $2))
        AND datetime >= $3 AND datetime < $4
      `;
      
      const todayResult = await this.db.raw(todayTransactionsQuery, [
        internalMachineId,
        vendonMachineId,
        today.toISOString(),
        tomorrow.toISOString()
      ]);
      
      const todayCount = parseInt(todayResult.rows[0]?.today_transactions || '0');
      const todayRevenue = parseFloat(todayResult.rows[0]?.today_revenue || '0');
      
      console.log(`[DEBUG] Heutige Transaktionen: ${todayCount}, Umsatz: ${todayRevenue}`);
      
      // 2. Letzter Verkauf
      console.log(`[DEBUG] Suche letzte Verkäufe für Maschine ID: ${internalMachineId} (Vendon-ID: ${vendonMachineId})`);
      
      // Verbesserte Abfrage für letzten Verkauf, die sowohl interne ID als auch Vendon-ID berücksichtigt
      const lastSaleQuery = `
        SELECT * FROM transactions 
        WHERE machine_id = $1 
           OR (extra_data::jsonb->>'machine_id' = $2)
        ORDER BY datetime DESC 
        LIMIT 1
      `;
      
      const lastSaleResult = await this.db.raw(lastSaleQuery, [internalMachineId, vendonMachineId]);
      
      const lastSale = lastSaleResult.rows.length > 0 ? lastSaleResult.rows[0] : null;
      
      console.log(`[DEBUG] Letzte Verkaufstransaktion gefunden: ${lastSale ? 'Ja' : 'Nein'}`);
      if (lastSale) {
        console.log(`[DEBUG] Details der letzten Transaktion: ID=${lastSale.id}, Zeit=${lastSale.datetime}, Produkt=${lastSale.product_name}`);
        console.log(`[DEBUG] Transaktions-MachineID=${lastSale.machine_id}, ExtraData=${JSON.stringify(lastSale.extra_data || {})}`);
      }
      
      // 3. Letzter bargeldloser Verkauf
      const lastCashlessSaleQuery = `
        SELECT * FROM transactions 
        WHERE (machine_id = $1 OR (extra_data::jsonb->>'machine_id' = $2))
        AND LOWER(payment_method) = 'cashless'
        ORDER BY datetime DESC 
        LIMIT 1
      `;
      
      const lastCashlessSaleResult = await this.db.raw(lastCashlessSaleQuery, [internalMachineId, vendonMachineId]);
      
      const lastCashlessSale = lastCashlessSaleResult.rows.length > 0 ? 
        lastCashlessSaleResult.rows[0] : null;
      
      console.log(`[DEBUG] Letzte Cashless-Transaktion gefunden: ${lastCashlessSale ? 'Ja' : 'Nein'}`);
      
      // 4. Alkohol-Verkäufe
      // Liste mit häufigen Alkohol-Keywords
      const alcoholKeywords = [
        'bier', 'beer', 'pils', 'lager', 'ale', 'wein', 'wine', 
        'vodka', 'rum', 'gin', 'whisky', 'whiskey', 'liquor', 'schnaps', 
        'radler', 'alkoholfrei', 'alcohol-free', 'alkoho'
      ];
      
      // Erstellen eines SQL-Suchmusters für Alkohol-Keywords
      const likeConditions = alcoholKeywords.map(keyword => 
        `LOWER(product_name) LIKE '%${keyword}%'`
      ).join(' OR ');
      
      // Alkohol-Verkäufe heute - Verbesserte Abfrage mit Vendon-ID
      const todayAlcoholQuery = `
        SELECT COUNT(*) AS count
        FROM transactions 
        WHERE (machine_id = $1 OR (extra_data::jsonb->>'machine_id' = $2))
        AND datetime >= $3 AND datetime < $4
        AND (${likeConditions})
      `;
      
      const todayAlcoholResult = await this.db.raw(todayAlcoholQuery, [
        internalMachineId,
        vendonMachineId,
        today.toISOString(), 
        tomorrow.toISOString()
      ]);
      
      // Letzte Woche Alkohol-Verkauf - Verbesserte Abfrage mit Vendon-ID
      const weekAlcoholQuery = `
        SELECT COUNT(*) AS count
        FROM transactions 
        WHERE (machine_id = $1 OR (extra_data::jsonb->>'machine_id' = $2))
        AND datetime >= $3 AND datetime < $4
        AND (${likeConditions})
      `;
      
      const weekAlcoholResult = await this.db.raw(weekAlcoholQuery, [
        internalMachineId,
        vendonMachineId,
        oneWeekAgo.toISOString(), 
        today.toISOString()
      ]);
      
      // Letzten Monat Alkohol-Verkauf - Verbesserte Abfrage mit Vendon-ID
      const monthAlcoholQuery = `
        SELECT COUNT(*) AS count
        FROM transactions 
        WHERE (machine_id = $1 OR (extra_data::jsonb->>'machine_id' = $2))
        AND datetime >= $3 AND datetime < $4
        AND (${likeConditions})
      `;
      
      const monthAlcoholResult = await this.db.raw(monthAlcoholQuery, [
        internalMachineId,
        vendonMachineId, 
        oneMonthAgo.toISOString(), 
        today.toISOString()
      ]);
      
      const todayAlcoholCount = parseInt(todayAlcoholResult[0]?.count?.toString() || '0');
      const weekAlcoholCount = parseInt(weekAlcoholResult[0]?.count?.toString() || '0');
      const monthAlcoholCount = parseInt(monthAlcoholResult[0]?.count?.toString() || '0');
      
      // Berechnung der Durchschnittswerte
      const weekAvg = weekAlcoholCount / 7 || 0;
      const monthDays = Math.ceil((today.getTime() - oneMonthAgo.getTime()) / (1000 * 60 * 60 * 24));
      const monthAvg = monthAlcoholCount / monthDays || 0;
      
      return {
        todayTransactions: todayCount,
        todayRevenue: todayRevenue,
        lastSale: lastSale,
        lastCashlessSale: lastCashlessSale,
        alcoholSales: {
          today: todayAlcoholCount,
          weekAvg,
          monthAvg
        }
      };
    } catch (error) {
      console.error("[ERROR] Fehler beim Abrufen der Maschinenstatistiken:", error);
      return {
        todayTransactions: 0,
        todayRevenue: 0,
        lastSale: null,
        lastCashlessSale: null,
        alcoholSales: {
          today: 0,
          weekAvg: 0,
          monthAvg: 0
        }
      };
    }
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    // Add timestamps to ensure consistent data
    const [newTransaction] = await db.insert(transactions).values({
      ...transaction,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newTransaction;
  }
  
  async updateTransaction(id: number, transaction: Partial<InsertTransaction>): Promise<Transaction | undefined> {
    try {
      const [updatedTransaction] = await db
        .update(transactions)
        .set(transaction)
        .where(eq(transactions.id, id))
        .returning();
      return updatedTransaction;
    } catch (error) {
      console.error(`Fehler beim Aktualisieren der Transaktion ${id}:`, error);
      return undefined;
    }
  }
  
  /**
   * Holt Transaktionen zur Verarbeitung aus der Datenbank
   * Mit einem erhöhten Standardlimit von 1000 Transaktionen, um sicherzustellen, 
   * dass alle notwendigen Daten verarbeitet werden.
   * 
   * @param limit Maximale Anzahl der Transaktionen (Standard: 1000)
   * @param offset Offset für Paginierung (Standard: 0)
   * @returns Liste der zu verarbeitenden Transaktionen
   */
  async getTransactionsForProcessing(limit: number = 1000, offset: number = 0): Promise<Transaction[]> {
    try {
      console.log(`Hole bis zu ${limit} Transaktionen zur Verarbeitung ab Offset ${offset}...`);
      
      const result = await db
        .select()
        .from(transactions)
        .where(eq(transactions.processingStatus, 'pending'))
        .orderBy(transactions.id)
        .limit(limit)
        .offset(offset);
        
      console.log(`${result.length} Transaktionen zum Verarbeiten gefunden`);
      return result;
    } catch (error) {
      console.error("Fehler beim Abrufen von Transaktionen zur Verarbeitung:", error);
      throw error;
    }
  }
  
  async updateTransactionProcessingStatus(
    id: number, 
    status: string, 
    errorMessage?: string
  ): Promise<void> {
    const updateData: Partial<InsertTransaction> = {
      processingStatus: status,
      processedAt: new Date()
    };
    
    if (errorMessage) {
      updateData.processingError = errorMessage;
    }
    
    await db
      .update(transactions)
      .set(updateData)
      .where(eq(transactions.id, id));
  }
  
  async getTransactionStats(): Promise<{
    total: number;
    processed: number;
    pending: number;
    error: number;
  }> {
    const totalResult = await db
      .select({ count: count() })
      .from(transactions);
    
    const processedResult = await db
      .select({ count: count() })
      .from(transactions)
      .where(eq(transactions.processingStatus, 'processed'));
    
    const pendingResult = await db
      .select({ count: count() })
      .from(transactions)
      .where(eq(transactions.processingStatus, 'pending'));
    
    const errorResult = await db
      .select({ count: count() })
      .from(transactions)
      .where(eq(transactions.processingStatus, 'error'));
    
    return {
      total: parseInt(totalResult[0]?.count?.toString() || '0'),
      processed: parseInt(processedResult[0]?.count?.toString() || '0'),
      pending: parseInt(pendingResult[0]?.count?.toString() || '0'),
      error: parseInt(errorResult[0]?.count?.toString() || '0')
    };
  }

  // Product operations
  async getProducts(options?: {
    limit?: number;
    offset?: number;
    category?: string;
    search?: string;
    supplierId?: number;
  } | number): Promise<Product[] | {
    data: Product[];
    meta: {
      total: number;
      offset: number;
      limit: number;
      page: number;
      pages: number;
    }
  }> {
    // Wenn nur ein Limit als Zahl übergeben wird (altes Interface)
    if (typeof options === 'number' || options === undefined) {
      const limit = typeof options === 'number' ? options : 100;
      return await db.select().from(products).limit(limit);
    }
    
    // Neue, erweiterte Implementierung mit Paginierung und Filtern
    const limit = options.limit || 100;
    const offset = options.offset || 0;
    
    // Build the filter condition
    const filters = [];
    
    if (options.category) {
      filters.push(eq(products.category, options.category));
    }
    
    if (options.supplierId) {
      filters.push(eq(products.supplierId, options.supplierId));
    }
    
    if (options.search) {
      filters.push(
        or(
          like(products.productName, `%${options.search}%`),
          like(products.description || '', `%${options.search}%`),
          like(products.sku || '', `%${options.search}%`)
        )
      );
    }
    
    // Combine filters or get all products
    const where = filters.length > 0 ? and(...filters) : undefined;
    
    // Get products with optional filter and supplier info
    const data = await db.select()
      .from(products)
      .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
      .where(where)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(products.createdAt));
    
    // Format result to include supplier name
    const formattedData = data.map(row => ({
      ...row.products,
      supplierName: row.suppliers?.name || null
    }));
    
    // Count total for pagination
    const countResult = await db.select({ count: count() })
      .from(products)
      .where(where);
    
    const total = parseInt(countResult[0]?.count?.toString() || '0');
    
    return {
      data: formattedData as Product[],
      meta: {
        total,
        offset,
        limit,
        page: Math.floor(offset / limit) + 1,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    
    if (product) {
      // Verkaufsdaten für das Produkt abrufen
      try {
        // Anzahl der Transaktionen für dieses Produkt abrufen
        const countResult = await db.select({ count: count() })
          .from(transactions)
          .where(
            or(
              eq(transactions.productId, String(product.vendonId)),
              sql`LOWER(${transactions.productName}) = LOWER(${product.productName})`
            )
          );
          
        // Letzte Transaktion für dieses Produkt abrufen
        const [lastTransaction] = await db.select()
          .from(transactions)
          .where(
            or(
              eq(transactions.productId, String(product.vendonId)),
              sql`LOWER(${transactions.productName}) = LOWER(${product.productName})`
            )
          )
          .orderBy(desc(transactions.datetime))
          .limit(1);
          
        // Ergänze das Produktobjekt mit den Verkaufsdaten
        product.salesCount = parseInt(countResult[0]?.count?.toString() || '0');
        product.lastSale = lastTransaction?.datetime?.toISOString() || null;
      } catch (error) {
        console.error(`Fehler beim Abrufen der Verkaufsdaten für Produkt ${id}:`, error);
        // Bei einem Fehler die Standardwerte setzen
        product.salesCount = 0;
        product.lastSale = null;
      }
    }
    
    return product;
  }

  async getProductByVendonId(vendonId: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.vendonId, vendonId));
    return product;
  }

  /**
   * Sucht ein Produkt anhand des exakten Namens
   * @deprecated Verwende stattdessen getProductByNormalizedName für bessere Matching-Ergebnisse
   */
  async getProductByName(productName: string): Promise<Product | undefined> {
    const [product] = await db.select()
      .from(products)
      .where(eq(products.productName, productName));
    return product;
  }
  
  /**
   * Sucht ein Produkt anhand des normalisierten Namens.
   * Diese Methode berücksichtigt Unterschiede in Groß-/Kleinschreibung und Leerzeichen.
   * 
   * @param productName Der zu suchende Produktname
   * @returns Das gefundene Produkt oder undefined
   */
  async getProductByNormalizedName(productName: string): Promise<Product | undefined> {
    if (!productName) return undefined;
    
    const normalizedName = normalizeProductName(productName);
    console.log(`Suche Produkt mit normalizedName="${normalizedName}"`);
    
    // Versuch 1: Versuche die schnellste Methode - direktes SQL mit normalisierter Name Spalte
    try {
      // Prüfe, ob die normalized_name Spalte existiert
      const checkColumnQuery = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'normalized_name'
      `;
      const columnResult = await rawDb.query(checkColumnQuery);
      const hasNormalizedColumn = columnResult.rows.length > 0;
      
      if (hasNormalizedColumn) {
        // Direktes SQL mit normalized_name Spalte
        const normalizedQuery = `
          SELECT * FROM products 
          WHERE normalized_name = $1 
          LIMIT 1
        `;
        
        const normalizedResult = await rawDb.query(normalizedQuery, [normalizedName]);
        
        if (normalizedResult.rows.length > 0) {
          console.log(`✅ Produkt über normalized_name Spalte gefunden: ${normalizedResult.rows[0].product_name} (ID: ${normalizedResult.rows[0].id})`);
          return normalizedResult.rows[0];
        }
      }
    } catch (sqlError) {
      console.error("Fehler bei SQL-basierter Produkt-Suche:", sqlError);
      // Weiter mit den anderen Methoden
    }
    
    // Versuch 2: Drizzle ORM mit normalizeProductName-Funktion und Caching
    // Cache der normalisierten Produktnamen für besseres Matching
    const allProducts = await db.select()
      .from(products);
      
    // In-Memory-Cache für schnellere wiederholte Suchen
    const normalizedCache = new Map<number, string>();
    
    // Vergleiche mit dem normalisierten Namen jedes Produkts
    // Das erspart uns komplexe SQL-Operationen und nutzt unsere verbesserte Normalisierungsfunktion
    const exactMatches = allProducts.filter(product => {
      if (!product.productName) return false;
      
      // Benutze Cache für normalisierte Namen
      let productNormalizedName: string;
      if (normalizedCache.has(product.id)) {
        productNormalizedName = normalizedCache.get(product.id)!;
      } else {
        productNormalizedName = normalizeProductName(product.productName);
        normalizedCache.set(product.id, productNormalizedName);
      }
      
      return productNormalizedName === normalizedName;
    });
    
    // Wenn ein exakter Match gefunden wurde, gib das erste zurück
    if (exactMatches.length > 0) {
      console.log(`✅ Produkt über normalisierten Vergleich gefunden: ${exactMatches[0].productName} (ID: ${exactMatches[0].id})`);
      return exactMatches[0];
    }
    
    // Wenn kein exakter Match gefunden wurde, versuche eine Teilübereinstimmung
    // mit mindestens 80% Ähnlichkeit (nur wenn der Name mindestens 4 Zeichen hat)
    if (normalizedName.length >= 4) {
      const fuzzyMatches = allProducts.filter(product => {
        if (!product.productName) return false;
        const productNormalizedName = normalizeProductName(product.productName);
        return productNormalizedName.includes(normalizedName) || 
               normalizedName.includes(productNormalizedName);
      });
      
      // Sortiere nach Ähnlichkeit (kürzere Differenz = besserer Match)
      fuzzyMatches.sort((a, b) => {
        const aNormalized = normalizeProductName(a.productName || '');
        const bNormalized = normalizeProductName(b.productName || '');
        
        const aDiff = Math.abs(aNormalized.length - normalizedName.length);
        const bDiff = Math.abs(bNormalized.length - normalizedName.length);
        
        return aDiff - bDiff;
      });
      
      // Wähle den besten Match
      if (fuzzyMatches.length > 0) {
        return fuzzyMatches[0];
      }
    }
    
    return undefined;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    // Add timestamps to ensure consistent data
    const [newProduct] = await db.insert(products).values({
      ...product,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newProduct;
  }

  async updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined> {
    let updateData = { ...product, updatedAt: new Date() };
    
    // Wenn eine supplierId vorhanden ist, aktualisiere supplierName
    if (product.supplierId) {
      try {
        // Lieferanten abrufen
        const supplier = await this.getSupplier(product.supplierId);
        console.log(`Lieferant für ID ${product.supplierId}:`, supplier);
        if (supplier) {
          // SupplierName mit dem Namen des Lieferanten aktualisieren
          updateData.supplierName = supplier.name;
        }
      } catch (error) {
        console.error(`Fehler beim Abrufen des Lieferanten für ID ${product.supplierId}:`, error);
      }
    } else if (product.supplierId === null) {
      // Wenn supplierId auf null gesetzt wird, auch supplierName zurücksetzen
      updateData.supplierName = null;
    }
    
    console.log("Update data:", updateData);
    
    const [updatedProduct] = await db
      .update(products)
      .set(updateData)
      .where(eq(products.id, id))
      .returning();
    return updatedProduct;
  }

  // Neue Methoden für Produktdetails
  
  async getProductMachines(productId: number): Promise<{machineId: number, machineName: string, currentStock: number, lastRefill: string | null}[]> {
    // Zuerst das Produkt abrufen
    const product = await this.getProduct(productId);
    if (!product) return [];

    // Maschinen-Set für einzigartige Einträge
    let uniqueMachines = new Map<number, {
      machineId: number,
      machineName: string,
      currentStock: number,
      lastRefill: string | null
    }>();

    // 1. Maschinen-Stocks für das Produkt mit vendonId abrufen
    const machineStocksResult = await db.select({
      machineId: machineStocks.machineId,
      machineName: machines.machineName,
      currentStock: machineStocks.quantity || sql`0`,
      productVendonId: machineStocks.productVendonId,
      updatedAt: machineStocks.updatedAt
    })
    .from(machineStocks)
    .innerJoin(machines, eq(machineStocks.machineId, machines.id))
    .where(eq(machineStocks.productVendonId, product.vendonId))
    .orderBy(desc(machineStocks.quantity));

    // Maschinen aus Stocks hinzufügen
    for (const stock of machineStocksResult) {
      uniqueMachines.set(stock.machineId, {
        machineId: stock.machineId,
        machineName: String(stock.machineName || ""),
        currentStock: stock.currentStock || 0,
        lastRefill: null // Wird später aktualisiert
      });
    }

    // 2. Maschinen aus Transaktionen für dieses Produkt abrufen
    const transactionMachinesResult = await db.select({
      machineId: transactions.machineId,
      machineName: transactions.machineName,
      datetime: transactions.datetime
    })
    .from(transactions)
    .where(
      or(
        eq(transactions.productId, String(product.vendonId)),
        sql`LOWER(${transactions.productName}) = LOWER(${product.productName})`
      )
    )
    .orderBy(desc(transactions.datetime))
    .groupBy(transactions.machineId, transactions.machineName, transactions.datetime);

    // Maschinen aus Transaktionen hinzufügen
    for (const machine of transactionMachinesResult) {
      if (machine.machineId && !uniqueMachines.has(machine.machineId)) {
        uniqueMachines.set(machine.machineId, {
          machineId: machine.machineId,
          machineName: String(machine.machineName || ""),
          currentStock: 0, // Standardwert für unbekannten Bestand
          lastRefill: null // Wird später aktualisiert
        });
      }
    }

    // 3. Maschinen aus Refills für dieses Produkt abrufen
    const refillMachinesResult = await db.select({
      machineId: refills.machineId,
      machineName: refills.machineName,
      datetime: refills.datetime
    })
    .from(refills)
    .innerJoin(refillDetails, eq(refillDetails.refillId, refills.id))
    .where(
      or(
        eq(refillDetails.vendonProductId, product.vendonId),
        sql`LOWER(${refillDetails.productName}) = LOWER(${product.productName})`
      )
    )
    .orderBy(desc(refills.datetime))
    .groupBy(refills.machineId, refills.machineName, refills.datetime);

    // Maschinen aus Refills hinzufügen
    for (const machine of refillMachinesResult) {
      if (machine.machineId && !uniqueMachines.has(machine.machineId)) {
        uniqueMachines.set(machine.machineId, {
          machineId: machine.machineId,
          machineName: String(machine.machineName || ""),
          currentStock: 0, // Standardwert für unbekannten Bestand
          lastRefill: machine.datetime ? machine.datetime.toISOString() : null
        });
      }
    }

    // Für jede Maschine die letzte Auffüllung finden und aktualisieren
    const result = await Promise.all(
      Array.from(uniqueMachines.values()).map(async (machine) => {
        // Letzte Auffüllung für diese Maschine und dieses Produkt finden
        const [lastRefill] = await db.select({
          datetime: refills.datetime
        })
        .from(refills)
        .innerJoin(refillDetails, eq(refillDetails.refillId, refills.id))
        .where(
          and(
            eq(refills.machineId, machine.machineId),
            or(
              eq(refillDetails.vendonProductId, product.vendonId),
              sql`LOWER(${refillDetails.productName}) = LOWER(${product.productName})`
            )
          )
        )
        .orderBy(desc(refills.datetime))
        .limit(1);

        if (lastRefill?.datetime) {
          machine.lastRefill = lastRefill.datetime.toISOString();
        }

        return machine;
      })
    );

    // Sortiere nach Bestand absteigend
    return result.sort((a, b) => b.currentStock - a.currentStock);
  }

  async getProductRefills(productId: number, limit: number = 100): Promise<RefillDetail[]> {
    // Zuerst das Produkt abrufen
    const product = await this.getProduct(productId);
    if (!product) return [];

    // Refill-Details für das Produkt abrufen
    const result = await db
      .select({
        detail: refillDetails,
        refill: refills
      })
      .from(refillDetails)
      .innerJoin(refills, eq(refillDetails.refillId, refills.id))
      .where(eq(refillDetails.vendonProductId, product.vendonId))
      .orderBy(desc(refills.datetime))
      .limit(limit);

    // Ergebnis formatieren und zurückgeben
    return result.map(item => item.detail);
  }

  // Refill operations mit direkter SQL-Abfrage
  async getRefills(options: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
    machineId?: string;
    warehouseId?: number;
  }): Promise<Refill[]> {
    console.log("SQL-Abfrage für Refills mit direkter SQL-Abfrage: ");
    
    // Importiere die SQL-Instanz aus der Modulebene
    // Wir nutzen die bereits importierte SQL-Instanz
    
    // Defaults festlegen
    const {
      limit = 100,
      offset = 0,
      startDate,
      endDate,
      machineId,
      warehouseId
    } = options;
    
    try {
      // Wenn Lager-ID angegeben ist, die entsprechende Methode aufrufen
      if (warehouseId) {
        return this.getRefillsForWarehouse(
          warehouseId, 
          limit, 
          offset, 
          startDate?.toISOString(), 
          endDate?.toISOString()
        );
      }

      // Zeitbereich für die Abfrage festlegen: standardmäßig letzte 7 Tage
      const effectiveStartDate = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 Tage zurück wenn nicht angegeben
      const effectiveEndDate = endDate || new Date();
      
      console.log(`Abfrage für Zeitraum: ${effectiveStartDate.toISOString()} bis ${effectiveEndDate.toISOString()}`);

      // Direkte SQL-Abfrage mit Template ausführen
      // Erstelle parametrisierte Abfrage statt Tagged Template
      let query = `
        SELECT r.*, m.machine_name as "machineName" 
        FROM refills r
        LEFT JOIN machines m ON r.machine_id = m.id
        WHERE r.datetime >= $1 AND r.datetime <= $2
      `;
      
      const params: any[] = [effectiveStartDate, effectiveEndDate];
      
      // Füge Machine ID Filter hinzu wenn vorhanden
      if (machineId && !isNaN(parseInt(machineId))) {
        query += ` AND r.machine_id = $3`;
        params.push(parseInt(machineId));
      }
      
      // Füge Sortierung und Limit hinzu
      query += ` ORDER BY r.datetime DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
      
      const result = await rawDb.query(query, params);
      const results = result.rows;
      
      console.log("Abfrage für Refills erfolgreich mit", results.length, "Ergebnissen");
      return results;
    } catch (error) {
      console.error("Fehler beim Abrufen der Refills mit erweiterten Optionen:", error);
      throw error;
    }
  }
  
  // Alte Version für Abwärtskompatibilität
  async getRefillsLegacy(limit: number = 100, offset: number = 0, startDate?: string, endDate?: string, machineId?: string): Promise<Refill[]> {
    return this.getRefills({
      limit,
      offset,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      machineId
    });
  }
  
  // Refills für ein bestimmtes Lager abrufen mit Options-Objekt
  async getRefillsForWarehouse(warehouseId?: number, limit: number = 100, offset: number = 0, startDate?: string, endDate?: string): Promise<Refill[]> {
    if (!warehouseId) {
      // Wenn keine Lager-ID angegeben ist, normale Refills zurückgeben
      return this.getRefills({
        limit,
        offset,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined
      });
    }
    
    // Wir nutzen die bereits importierte SQL-Instanz
    
    // Zuerst alle Automaten abrufen, die diesem Lager zugeordnet sind
    const assignments = await this.getMachineWarehouseAssignments({ warehouseId });
    const machineIds = assignments.map(a => a.machineId);
    
    if (machineIds.length === 0) {
      // Keine Automaten dem Lager zugeordnet
      console.log("Keine Automaten für Lager", warehouseId, "gefunden");
      return [];
    }
    
    console.log(`Abfrage für Lager ${warehouseId} mit ${machineIds.length} Automaten (IDs: ${machineIds.join(', ')})`);
    
    // Basisparameter für die Abfrage (wird nicht mehr benötigt)
    
    // Erstelle parametrisierte Abfrage
    let query = `
      SELECT r.*, m.machine_name as "machineName" 
      FROM refills r
      LEFT JOIN machines m ON r.machine_id = m.id
      WHERE r.machine_id = ANY($1)
    `;
    
    // Parameter für die Abfrage
    const params: any[] = [machineIds];
    
    // Zeitraumbedingungen hinzufügen wenn vorhanden
    if (startDate && endDate) {
      query += ` AND r.datetime >= $2 AND r.datetime <= $3`;
      params.push(new Date(startDate), new Date(endDate));
    } else if (startDate) {
      query += ` AND r.datetime >= $2`;
      params.push(new Date(startDate));
    } else if (endDate) {
      query += ` AND r.datetime <= $2`;
      params.push(new Date(endDate));
    }
    
    // Sortierung und Limits hinzufügen
    query += ` ORDER BY r.datetime DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    console.log("Abfrage für Refills im Lager wird ausgeführt");
    
    try {
      const result = await rawDb.query(query, params);
      const results = result.rows;
      console.log(`Abfrage für Lager ${warehouseId} erfolgreich mit ${results.length} Ergebnissen`);
      return results;
    } catch (error) {
      console.error("Fehler bei der Abfrage von Refills für Lager:", error);
      throw error;
    }
  }

  async getRefillsByMachine(machineId: number, limit: number = 100): Promise<Refill[]> {
    return await db
      .select()
      .from(refills)
      .where(eq(refills.machineId, machineId))
      .orderBy(desc(refills.datetime))
      .limit(limit);
  }

  async getRefill(id: number): Promise<Refill | undefined> {
    const [refill] = await db.select().from(refills).where(eq(refills.id, id));
    return refill;
  }

  async getRefillByVendonId(vendonId: string): Promise<Refill | undefined> {
    const [refill] = await db.select().from(refills).where(eq(refills.vendonId, vendonId));
    return refill;
  }
  
  // Hilfsmethode: Refill nach ID abrufen
  async getRefillById(refillId: number): Promise<any> {
    try {
      // Hole das Refill aus der Datenbank
      const [refill] = await db.select().from(refills).where(eq(refills.id, refillId));
      
      if (!refill) {
        return null;
      }
      
      // Hole zugehörige Maschine
      const [machine] = refill.machineId ? 
        await db.select().from(machines).where(eq(machines.id, refill.machineId)) : 
        [];
      
      // Hole die Refill-Details (Produkte)
      const details = await this.getRefillDetails(refill.id);
      
      return {
        ...refill,
        machineName: machine?.name || 'Unbekannt',
        details
      };
    } catch (error) {
      console.error(`Fehler beim Abrufen des Refills mit ID ${refillId}:`, error);
      throw error;
    }
  }

  // Diese Methode wird verwendet von der /api/refills Route
  
  async getRefillDetails(refillId: number): Promise<RefillDetail[]> {
    // Normale Abfrage der Refill-Details aus der Datenbank
    const details = await db
      .select()
      .from(refillDetails)
      .where(eq(refillDetails.refillId, refillId))
      .orderBy(refillDetails.id);
    
    // Keine Demo-Daten mehr - nur die echten Daten zurückgeben
    if (details.length === 0) {
      console.log(`Keine Refill-Details für RefillID ${refillId} gefunden.`);
      
      // Hole den Refill um zu sehen, ob er existiert
      const [refill] = await db.select().from(refills).where(eq(refills.id, refillId));
      
      if (refill) {
        console.log(`Refill ${refillId} existiert, aber enthält keine Details.`);
      } else {
        console.log(`Refill ${refillId} existiert nicht in der Datenbank.`);
      }
    } else {
      console.log(`Gefundene Refill-Details für RefillID ${refillId}: ${details.length} Einträge`);
    }
    
    return details;
  }

  async createRefill(refill: InsertRefill): Promise<Refill> {
    // Add timestamps to ensure consistent data
    const [newRefill] = await db.insert(refills).values({
      ...refill,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newRefill;
  }

  async createRefillDetail(detail: InsertRefillDetail): Promise<RefillDetail> {
    // Add timestamps to ensure consistent data
    const [newDetail] = await db.insert(refillDetails).values({
      ...detail,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newDetail;
  }

  // Event operations
  async getEvents(limit: number = 100): Promise<Event[]> {
    return await db.select().from(events).orderBy(desc(events.datetime)).limit(limit);
  }

  async getEventsByDateRange(startDate: Date, endDate: Date, limit: number = 100): Promise<Event[]> {
    return await db
      .select()
      .from(events)
      .where(
        and(
          gte(events.datetime, startDate),
          lte(events.datetime, endDate)
        )
      )
      .orderBy(desc(events.datetime))
      .limit(limit);
  }

  async getEvent(id: number): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event;
  }

  async getEventByVendonId(vendonId: string): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.vendonId, vendonId));
    return event;
  }

  async createEvent(event: InsertEvent): Promise<Event> {
    // Add timestamps to ensure consistent data
    const [newEvent] = await db.insert(events).values({
      ...event,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newEvent;
  }

  async updateEvent(id: number, event: Partial<InsertEvent>): Promise<Event | undefined> {
    const [updatedEvent] = await db
      .update(events)
      .set({ ...event, updatedAt: new Date() })
      .where(eq(events.id, id))
      .returning();
    return updatedEvent;
  }

  // Sync log operations
  async getSyncLogs(limit: number = 100): Promise<SyncLog[]> {
    return await db.select().from(syncLogs).orderBy(desc(syncLogs.createdAt)).limit(limit);
  }
  
  async getSyncLogsByType(syncType: string, limit: number = 100): Promise<SyncLog[]> {
    return await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.syncType, syncType))
      .orderBy(desc(syncLogs.createdAt))
      .limit(limit);
  }
  
  async getSyncLogsByTypePatterns(syncTypes: string[], limit: number = 100): Promise<SyncLog[]> {
    if (!syncTypes || syncTypes.length === 0) {
      return [];
    }
    
    // Erstelle eine OR-Bedingung für alle syncTypes
    const conditions = syncTypes.map(type => eq(syncLogs.syncType, type));
    
    return await db
      .select()
      .from(syncLogs)
      .where(or(...conditions))
      .orderBy(desc(syncLogs.createdAt))
      .limit(limit);
  }

  async getSyncLogById(id: number): Promise<SyncLog | undefined> {
    const [log] = await db.select().from(syncLogs).where(eq(syncLogs.id, id));
    return log;
  }

  async getSyncLog(id: number): Promise<SyncLog | undefined> {
    // Legacy method, using getSyncLogById internally
    return this.getSyncLogById(id);
  }

  async createSyncLog(log: InsertSyncLog): Promise<SyncLog> {
    // Add timestamps to ensure consistent data if not already set
    const result = await rawDb.query(
      `INSERT INTO sync_logs (sync_type, start_date, end_date, additional_data, errors, 
         items_found, items_saved, items_updated, sync_status, duplicates, duration_seconds, error_message, entity_type) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
       RETURNING *`, 
      [
        log.syncType, 
        log.startDate, 
        log.endDate, 
        log.additionalData, 
        log.errors || 0,
        log.itemsFound || 0,
        log.itemsSaved || 0,
        log.itemsUpdated || 0,
        log.syncStatus || 'started',
        log.duplicates || 0,
        log.durationSeconds || 0,
        log.errorMessage || null,
        log.entityType || 'unknown'  // Make sure entity_type is never null
      ]
    );
    
    return result.rows[0];
  }

  async updateSyncLog(id: number, log: Partial<InsertSyncLog>): Promise<SyncLog | undefined> {
    // Construct the set clause for the update
    let setClauses = [];
    const params = [id]; // First parameter is always the ID
    let paramIndex = 2; // Start with $2 since $1 is the ID
    
    // Add each field from the log object to the SET clause
    if (log.syncType) {
      setClauses.push(`sync_type = $${paramIndex}`);
      params.push(log.syncType);
      paramIndex++;
    }
    
    if (log.startDate !== undefined) {
      setClauses.push(`start_date = $${paramIndex}`);
      params.push(log.startDate);
      paramIndex++;
    }
    
    if (log.endDate !== undefined) {
      setClauses.push(`end_date = $${paramIndex}`);
      params.push(log.endDate);
      paramIndex++;
    }
    
    if (log.additionalData !== undefined) {
      setClauses.push(`additional_data = $${paramIndex}`);
      params.push(log.additionalData);
      paramIndex++;
    }
    
    if (log.errors !== undefined) {
      setClauses.push(`errors = $${paramIndex}`);
      params.push(log.errors);
      paramIndex++;
    }
    
    if (log.itemsFound !== undefined) {
      setClauses.push(`items_found = $${paramIndex}`);
      params.push(log.itemsFound);
      paramIndex++;
    }
    
    if (log.itemsSaved !== undefined) {
      setClauses.push(`items_saved = $${paramIndex}`);
      params.push(log.itemsSaved);
      paramIndex++;
    }
    
    if (log.itemsUpdated !== undefined) {
      setClauses.push(`items_updated = $${paramIndex}`);
      params.push(log.itemsUpdated);
      paramIndex++;
    }
    
    if (log.syncStatus !== undefined) {
      setClauses.push(`sync_status = $${paramIndex}`);
      params.push(log.syncStatus);
      paramIndex++;
    }
    
    if (log.duplicates !== undefined) {
      setClauses.push(`duplicates = $${paramIndex}`);
      params.push(log.duplicates);
      paramIndex++;
    }
    
    if (log.durationSeconds !== undefined) {
      setClauses.push(`duration_seconds = $${paramIndex}`);
      params.push(log.durationSeconds);
      paramIndex++;
    }
    
    if (log.errorMessage !== undefined) {
      setClauses.push(`error_message = $${paramIndex}`);
      params.push(log.errorMessage);
      paramIndex++;
    }
    
    if (log.entityType !== undefined) {
      setClauses.push(`entity_type = $${paramIndex}`);
      params.push(log.entityType);
      paramIndex++;
    }
    
    // Execute the update query
    const setClause = setClauses.join(', ');
    const result = await rawDb.query(
      `UPDATE sync_logs SET ${setClause} WHERE id = $1 RETURNING *`,
      params
    );
    
    return result.rows[0];
  }

  async getLatestSyncLog(syncType: string): Promise<SyncLog | undefined> {
    const [log] = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.syncType, syncType))
      .orderBy(desc(syncLogs.createdAt))
      .limit(1);
    return log;
  }
  
  /**
   * Ruft den letzten laufenden Synchronisationsprozess für den angegebenen Typ ab
   * Wird verwendet, um parallele Synchronisierungen zu verhindern
   */
  async getLatestRunningSyncLog(syncType: string): Promise<SyncLog | undefined> {
    const [log] = await db
      .select()
      .from(syncLogs)
      .where(
        and(
          eq(syncLogs.syncType, syncType),
          eq(syncLogs.syncStatus, 'running')
        )
      )
      .orderBy(desc(syncLogs.startDate))
      .limit(1);
    return log;
  }

  // Location operations
  async getLocations(): Promise<Location[]> {
    return await db.select().from(locations);
  }

  async getLocation(id: number): Promise<Location | undefined> {
    const [location] = await db.select().from(locations).where(eq(locations.id, id));
    return location;
  }

  async createLocation(location: InsertLocation): Promise<Location> {
    const [newLocation] = await db.insert(locations).values(location).returning();
    return newLocation;
  }
  
  // Supplier operations
  async getSuppliers(options?: {
    limit?: number;
    offset?: number;
    status?: string;
    search?: string;
  }): Promise<{
    data: Supplier[];
    meta: {
      total: number;
      offset: number;
      limit: number;
      page: number;
      pages: number;
    }
  }> {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    
    // Build the filter condition
    const filters = [];
    
    if (options?.status) {
      filters.push(eq(suppliers.status, options.status));
    }
    
    if (options?.search) {
      filters.push(
        or(
          like(suppliers.name, `%${options.search}%`),
          like(suppliers.contactPerson || '', `%${options.search}%`),
          like(suppliers.city || '', `%${options.search}%`),
          like(suppliers.email || '', `%${options.search}%`)
        )
      );
    }
    
    // Combine filters or get all suppliers
    const where = filters.length > 0 ? and(...filters) : undefined;
    
    // Get suppliers with optional filter
    const data = await db.select()
      .from(suppliers)
      .where(where)
      .limit(limit)
      .offset(offset)
      .orderBy(asc(suppliers.name));
    
    // Count total for pagination
    const countResult = await db.select({ count: count() })
      .from(suppliers)
      .where(where);
    
    const total = parseInt(countResult[0]?.count?.toString() || '0');
    
    return {
      data,
      meta: {
        total,
        offset,
        limit,
        page: Math.floor(offset / limit) + 1,
        pages: Math.ceil(total / limit)
      }
    };
  }
  
  async getSupplierById(id: number): Promise<Supplier | undefined> {
    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id));
    return supplier;
  }
  
  // Alias für getSupplierById für Kompatibilität
  async getSupplier(id: number): Promise<Supplier | undefined> {
    return this.getSupplierById(id);
  }
  
  async createSupplier(supplier: InsertSupplier): Promise<Supplier> {
    const [newSupplier] = await db.insert(suppliers).values(supplier).returning();
    return newSupplier;
  }
  
  async updateSupplier(id: number, supplier: Partial<InsertSupplier>): Promise<Supplier | undefined> {
    // Check if supplier exists
    const existingSupplier = await this.getSupplierById(id);
    
    if (!existingSupplier) {
      return undefined;
    }
    
    const [updatedSupplier] = await db
      .update(suppliers)
      .set({ ...supplier, updatedAt: new Date() })
      .where(eq(suppliers.id, id))
      .returning();
    
    return updatedSupplier;
  }
  
  async deleteSupplier(id: number): Promise<boolean> {
    // Check if supplier exists
    const existingSupplier = await this.getSupplierById(id);
    
    if (!existingSupplier) {
      return false;
    }
    
    // Check if supplier has linked products
    const linkedProducts = await db.select({ count: count() })
      .from(products)
      .where(eq(products.supplierId, id));
    
    const linkedCount = parseInt(linkedProducts[0]?.count?.toString() || '0');
    
    if (linkedCount > 0) {
      throw new Error(`Cannot delete supplier with linked products (${linkedCount} products)`);
    }
    
    // Delete supplier
    await db.delete(suppliers).where(eq(suppliers.id, id));
    
    return true;
  }
  
  // Purchase Conditions Operations
  async getPurchaseConditionById(id: number): Promise<PurchaseCondition | undefined> {
    const [condition] = await db
      .select()
      .from(purchaseConditions)
      .where(eq(purchaseConditions.id, id))
      .limit(1);
      
    return condition;
  }
  
  async getPurchaseConditionsBySupplier(supplierId: number): Promise<PurchaseCondition[]> {
    // Verbesserte Abfrage, die Produktnamen mit einbezieht
    const result = await db
      .select({
        condition: purchaseConditions,
        product: {
          id: products.id,
          name: products.productName,
          sku: products.sku
        }
      })
      .from(purchaseConditions)
      .leftJoin(products, eq(purchaseConditions.productId, products.id))
      .where(eq(purchaseConditions.supplierId, supplierId))
      .orderBy(desc(purchaseConditions.createdAt));
    
    // Füge Produktnamen zu den Bedingungen hinzu und gib sie zurück
    return result.map(row => ({
      ...row.condition,
      productName: row.product.name,
      productSku: row.product.sku
    }));
  }
  
  async getPurchaseConditionsByProduct(productId: number): Promise<PurchaseCondition[]> {
    // Verbesserte Abfrage, die Lieferantennamen mit einbezieht
    const result = await db
      .select({
        condition: purchaseConditions,
        supplier: {
          id: suppliers.id,
          name: suppliers.name
        }
      })
      .from(purchaseConditions)
      .leftJoin(suppliers, eq(purchaseConditions.supplierId, suppliers.id))
      .where(eq(purchaseConditions.productId, productId))
      .orderBy(
        desc(purchaseConditions.isPreferred), 
        asc(purchaseConditions.unitPrice)
      );
    
    // Füge Lieferantennamen zu den Bedingungen hinzu und gib sie zurück
    return result.map(row => ({
      ...row.condition,
      supplierName: row.supplier.name
    }));
  }
  
  async createPurchaseCondition(data: InsertPurchaseCondition): Promise<PurchaseCondition> {
    const [newCondition] = await db
      .insert(purchaseConditions)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
      
    return newCondition;
  }
  
  async updatePurchaseCondition(id: number, data: Partial<InsertPurchaseCondition>): Promise<PurchaseCondition | undefined> {
    const [updatedCondition] = await db
      .update(purchaseConditions)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(purchaseConditions.id, id))
      .returning();
      
    return updatedCondition;
  }
  
  async deletePurchaseCondition(id: number): Promise<boolean> {
    const result = await db
      .delete(purchaseConditions)
      .where(eq(purchaseConditions.id, id))
      .returning({ id: purchaseConditions.id });
      
    return result.length > 0;
  }
  
  // Warehouse operations
  async getWarehouses(): Promise<Warehouse[]> {
    const result = await rawDb.query(`SELECT * FROM warehouses ORDER BY name`);
    return result.rows;
  }

  async getWarehouse(id: number): Promise<Warehouse | undefined> {
    const result = await rawDb.query(`SELECT * FROM warehouses WHERE id = $1`, [id]);
    return result.rows.length > 0 ? result.rows[0] : undefined;
  }

  async createWarehouse(warehouse: InsertWarehouse): Promise<Warehouse> {
    const [newWarehouse] = await db.insert(warehouses).values({
      ...warehouse,
      createdAt: new Date()
    }).returning();
    return newWarehouse;
  }

  async updateWarehouse(id: number, warehouse: Partial<InsertWarehouse>): Promise<Warehouse | undefined> {
    const [updatedWarehouse] = await db
      .update(warehouses)
      .set({
        ...warehouse,
        updatedAt: new Date()
      })
      .where(eq(warehouses.id, id))
      .returning();
    return updatedWarehouse;
  }

  async deleteWarehouse(id: number): Promise<boolean> {
    try {
      const result = await db
        .delete(warehouses)
        .where(eq(warehouses.id, id))
        .returning({ id: warehouses.id });
      
      return result.length > 0;
    } catch (error) {
      console.error(`Fehler beim Löschen des Lagers mit ID ${id}:`, error);
      return false;
    }
  }

  // Inventory Item operations
  async getInventoryItems(params?: {
    warehouseId?: number;
    productId?: number;
    critical?: boolean;
    includeZeroStock?: boolean;
  }): Promise<InventoryItem[]> {
    let query = db.select({
      inventory: inventoryItems,
      product: products,
      warehouse: warehouses
    })
    .from(inventoryItems)
    .leftJoin(products, eq(inventoryItems.productId, products.id))
    .leftJoin(warehouses, eq(inventoryItems.warehouseId, warehouses.id));
    
    const conditions = [];
    
    if (params?.warehouseId) {
      conditions.push(eq(inventoryItems.warehouseId, params.warehouseId));
    }
    
    if (params?.productId) {
      conditions.push(eq(inventoryItems.productId, params.productId));
    }
    
    if (params?.critical) {
      conditions.push(
        and(
          lte(inventoryItems.quantity, inventoryItems.minQuantity),
          gte(inventoryItems.minQuantity, 1) // Nur Items mit einem Mindestbestand > 0
        )
      );
    }
    
    // Nur wenn includeZeroStock explizit auf false gesetzt ist, filtern wir nach Bestand > 0
    // Für die allgemeine Inventaransicht setzen wir keinen Filter
    if (params?.includeZeroStock === false) {
      conditions.push(gt(inventoryItems.quantity, 0));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    const result = await query.orderBy(asc(warehouses.name), asc(products.productName));
    
    // Formatieren der Ergebnisse für eine bessere Nutzbarkeit
    return result.map(row => ({
      ...row.inventory,
      productName: row.product?.productName,
      warehouseName: row.warehouse?.name
    })) as InventoryItem[];
  }

  async getInventoryItem(id: number): Promise<InventoryItem | undefined> {
    const [item] = await db.select({
      inventory: inventoryItems,
      product: products,
      warehouse: warehouses
    })
    .from(inventoryItems)
    .leftJoin(products, eq(inventoryItems.productId, products.id))
    .leftJoin(warehouses, eq(inventoryItems.warehouseId, warehouses.id))
    .where(eq(inventoryItems.id, id));
    
    if (!item) return undefined;
    
    return {
      ...item.inventory,
      productName: item.product?.productName,
      warehouseName: item.warehouse?.name
    } as InventoryItem;
  }

  async getInventoryItemsByWarehouse(warehouseId: number): Promise<InventoryItem[]> {
    const result = await db.select({
      inventory: inventoryItems,
      product: products
    })
    .from(inventoryItems)
    .leftJoin(products, eq(inventoryItems.productId, products.id))
    .where(eq(inventoryItems.warehouseId, warehouseId))
    .orderBy(asc(products.productName));
    
    return result.map(row => ({
      ...row.inventory,
      productName: row.product?.productName
    })) as InventoryItem[];
  }
  
  async getInventoryItemsByWarehouseAndProduct(warehouseId: number, productId: number): Promise<InventoryItem[]> {
    const result = await db.select({
      inventory: inventoryItems,
      product: products
    })
    .from(inventoryItems)
    .leftJoin(products, eq(inventoryItems.productId, products.id))
    .where(
      and(
        eq(inventoryItems.warehouseId, warehouseId),
        eq(inventoryItems.productId, productId)
      )
    );
    
    return result.map(row => ({
      ...row.inventory,
      productName: row.product?.productName
    })) as InventoryItem[];
  }

  async getInventoryItemByProductAndWarehouse(
    productId: number, 
    warehouseId: number
  ): Promise<InventoryItem | undefined> {
    const [item] = await db.select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.productId, productId),
          eq(inventoryItems.warehouseId, warehouseId)
        )
      );
    
    return item;
  }

  async createInventoryItem(item: InsertInventoryItem): Promise<InventoryItem> {
    const [newItem] = await db.insert(inventoryItems).values({
      ...item,
      lastCountDate: new Date(),
      createdAt: new Date()
    }).returning();
    
    return newItem;
  }

  async updateInventoryItem(id: number, item: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined> {
    const [updatedItem] = await db
      .update(inventoryItems)
      .set({
        ...item,
        updatedAt: new Date()
      })
      .where(eq(inventoryItems.id, id))
      .returning();
    
    return updatedItem;
  }

  async deleteInventoryItem(id: number): Promise<boolean> {
    try {
      const result = await db
        .delete(inventoryItems)
        .where(eq(inventoryItems.id, id))
        .returning({ id: inventoryItems.id });
      
      return result.length > 0;
    } catch (error) {
      console.error(`Fehler beim Löschen der Lagerposition mit ID ${id}:`, error);
      return false;
    }
  }

  // Inventory Movement operations
  async getInventoryMovements(params?: {
    sourceWarehouseId?: number;
    destinationWarehouseId?: number;
    productId?: number;
    machineId?: number;
    movementType?: string;
    referenceType?: string;
    referenceId?: string;
    startDate?: Date;
    endDate?: Date; 
    limit?: number;
    offset?: number;
  }): Promise<InventoryMovement[]> {
    // Für sourceWarehouse und destinationWarehouse müssen wir separate Aliase verwenden
    const sourceWarehouseAlias = aliasedTable(warehouses, 'source_warehouse');
    const destWarehouseAlias = aliasedTable(warehouses, 'dest_warehouse');
    const userAlias = aliasedTable(users, 'performed_by_user');
    
    let query = db.select({
      movement: inventoryMovements,
      product: products,
      sourceWarehouse: sourceWarehouseAlias,
      destinationWarehouse: destWarehouseAlias,
      user: userAlias
    })
    .from(inventoryMovements)
    .leftJoin(products, eq(inventoryMovements.productId, products.id))
    .leftJoin(
      sourceWarehouseAlias, 
      eq(inventoryMovements.sourceWarehouseId, sourceWarehouseAlias.id)
    )
    .leftJoin(
      destWarehouseAlias, 
      eq(inventoryMovements.destinationWarehouseId, destWarehouseAlias.id)
    )
    .leftJoin(
      userAlias,
      eq(inventoryMovements.performedBy, userAlias.id)
    );
    
    const conditions = [];
    
    if (params?.sourceWarehouseId) {
      conditions.push(eq(inventoryMovements.sourceWarehouseId, params.sourceWarehouseId));
    }
    
    if (params?.destinationWarehouseId) {
      conditions.push(eq(inventoryMovements.destinationWarehouseId, params.destinationWarehouseId));
    }
    
    if (params?.productId) {
      conditions.push(eq(inventoryMovements.productId, params.productId));
    }
    
    if (params?.machineId) {
      conditions.push(eq(inventoryMovements.machineId, params.machineId));
    }
    
    if (params?.movementType) {
      conditions.push(eq(inventoryMovements.movementType, params.movementType));
    }
    
    if (params?.referenceType) {
      conditions.push(eq(inventoryMovements.referenceType, params.referenceType));
    }

    if (params?.referenceId) {
      conditions.push(eq(inventoryMovements.referenceId, params.referenceId));
    }
    
    // Zeitraum-Filter hinzufügen
    if (params?.startDate) {
      conditions.push(gte(inventoryMovements.performedAt, params.startDate));
    }
    
    if (params?.endDate) {
      conditions.push(lte(inventoryMovements.performedAt, params.endDate));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    // Sortiere zuerst nach performedAt (wenn vorhanden), dann nach createdAt
    query = query.orderBy(
      desc(inventoryMovements.performedAt),
      desc(inventoryMovements.createdAt)
    );
    
    if (params?.limit) {
      query = query.limit(params.limit);
    }
    
    if (params?.offset) {
      query = query.offset(params.offset);
    }
    
    const result = await query;
    
    // Formatieren der Ergebnisse für eine bessere Nutzbarkeit
    return result.map(row => ({
      ...row.movement,
      productName: row.product?.productName,
      sourceWarehouseName: row.sourceWarehouse?.name,
      destinationWarehouseName: row.destinationWarehouse?.name,
      performedByName: row.user ? `${row.user.username}` : null
    })) as InventoryMovement[];
  }

  async getInventoryMovementsByInventoryItem(inventoryItemId: number): Promise<InventoryMovement[]> {
    // Zuerst das Lager und Produkt des Items abrufen
    const item = await this.getInventoryItem(inventoryItemId);
    if (!item) return [];
    
    // Bewegungen finden, die entweder Quelle oder Ziel dieses Lagers und für dieses Produkt sind
    const sourceMovements = await this.getInventoryMovements({
      productId: item.productId,
      sourceWarehouseId: item.warehouseId
    });
    
    const destinationMovements = await this.getInventoryMovements({
      productId: item.productId,
      destinationWarehouseId: item.warehouseId
    });
    
    // Beide Arrays zusammenführen und nach Datum sortieren
    const allMovements = [...sourceMovements, ...destinationMovements];
    return allMovements.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getInventoryMovementsByReference(
    referenceType: string, 
    referenceId: string
  ): Promise<InventoryMovement[]> {
    return this.getInventoryMovements({
      referenceType,
      referenceId
    });
  }

  async createInventoryMovement(movement: InsertInventoryMovement): Promise<InventoryMovement> {
    const [newMovement] = await db.insert(inventoryMovements).values({
      ...movement,
      createdAt: new Date(),
      processedAt: new Date()
    }).returning();
    
    return newMovement;
  }

  // Machine-Warehouse Assignment operations
  async getMachineWarehouseAssignments(params?: {
    machineId?: number;
    warehouseId?: number;
  }): Promise<MachineWarehouseAssignment[]> {
    let query = db.select({
      assignment: machineWarehouseAssignments,
      machine: machines,
      warehouse: warehouses
    })
    .from(machineWarehouseAssignments)
    .leftJoin(machines, eq(machineWarehouseAssignments.machineId, machines.id))
    .leftJoin(warehouses, eq(machineWarehouseAssignments.warehouseId, warehouses.id));
    
    const conditions = [];
    
    if (params?.machineId) {
      conditions.push(eq(machineWarehouseAssignments.machineId, params.machineId));
    }
    
    if (params?.warehouseId) {
      conditions.push(eq(machineWarehouseAssignments.warehouseId, params.warehouseId));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    query = query.orderBy(desc(machineWarehouseAssignments.isPrimary), asc(warehouses.name));
    
    const result = await query;
    
    // Formatieren der Ergebnisse für eine bessere Nutzbarkeit
    return result.map(row => ({
      ...row.assignment,
      machineName: row.machine?.machineName || "Unbekannter Automat",
      warehouseName: row.warehouse?.name
    })) as MachineWarehouseAssignment[];
  }
  
  async getMachineWarehouseAssignmentsByWarehouse(warehouseId: number): Promise<MachineWarehouseAssignment[]> {
    return this.getMachineWarehouseAssignments({ warehouseId });
  }

  async getMachineWarehouseAssignmentById(id: number): Promise<MachineWarehouseAssignment | undefined> {
    const [assignment] = await db.select()
      .from(machineWarehouseAssignments)
      .where(eq(machineWarehouseAssignments.id, id));
    
    return assignment;
  }

  async getMachineWarehouseAssignment(
    machineId: number, 
    warehouseId: number
  ): Promise<MachineWarehouseAssignment | undefined> {
    const [assignment] = await db.select()
      .from(machineWarehouseAssignments)
      .where(
        and(
          eq(machineWarehouseAssignments.machineId, machineId),
          eq(machineWarehouseAssignments.warehouseId, warehouseId)
        )
      );
    
    return assignment;
  }

  // Funktion zum Hinzufügen von Produkten in ein Lager, wenn sie in einem Automaten vorhanden sind, aber noch nicht im Lager
  async syncMachineProductsToWarehouse(machineId: number, warehouseId: number): Promise<{
    added: number,
    existing: number,
    error?: any
  }> {
    try {
      console.log(`Synchronisiere Produkte von Automat ${machineId} mit Lager ${warehouseId}...`);
      
      // Produkte des Automaten abrufen
      const machineProducts = await this.getMachineProducts(machineId);
      if (!machineProducts.length) {
        console.log(`Keine Produkte in Automat ${machineId} gefunden.`);
        return { added: 0, existing: 0 };
      }
      
      console.log(`Gefundene Produkte in Automat ${machineId}: ${machineProducts.length}`);
      
      // Existierende Lagerbestände abrufen
      const warehouseInventory = await this.getInventoryItems({ warehouseId });
      
      // Normalisierte Produktnamen für bessere Duplikatserkennung
      const normalizedExistingProductNames = new Map();
      
      // Erstelle Map aus normalisierten Namen zu existierenden Produkten
      warehouseInventory
        .filter(item => item.productName)
        .forEach(item => {
          const normalizedName = normalizeProductName(item.productName!);
          normalizedExistingProductNames.set(normalizedName, item);
        });
      
      console.log(`Existierende Produkte im Lager ${warehouseId}: ${normalizedExistingProductNames.size}`);
      
      let added = 0;
      let existing = 0;
      
      // Für jedes Produkt im Automaten:
      for (const machineProduct of machineProducts) {
        if (!machineProduct.productName) continue;
        
        // Normalisiere den Produktnamen für Vergleiche
        const normalizedName = normalizeProductName(machineProduct.productName);
        
        // Prüfen, ob das Produkt bereits im Lager existiert (mit normalisiertem Namen)
        if (normalizedExistingProductNames.has(normalizedName)) {
          console.log(`Produkt "${machineProduct.productName}" (normalisiert: "${normalizedName}") bereits im Lager ${warehouseId} vorhanden`);
          existing++;
          continue;
        }
        
        // Produkt im System suchen mit normalisiertem Namen für bessere Trefferquote
        let product = await this.getProductByNormalizedName(machineProduct.productName);
        
        if (!product) {
          console.log(`Produkt "${machineProduct.productName}" nicht in der Datenbank gefunden, erstelle es...`);
          // Produkt erstellen, wenn es noch nicht existiert
          product = await this.createProduct({
            productName: machineProduct.productName,
            vendonId: "", // Leere Vendon-ID, kann später aktualisiert werden
            price: machineProduct.price || 0,
            status: "active",
            category: "Automatisch hinzugefügt"
          });
          console.log(`Neues Produkt erstellt: ${product.id} - ${product.productName}`);
        }
        
        // Produkt zum Lagerbestand hinzufügen
        const newInventoryItem = await this.createInventoryItem({
          warehouseId,
          productId: product.id,
          quantity: 0, // Anfangsbestand ist 0
          minQuantity: 0, // Standardwert
          status: "active",
          locationInWarehouse: "Automatisch hinzugefügt"
        });
        
        console.log(`Produkt "${machineProduct.productName}" zu Lager ${warehouseId} hinzugefügt`);
        added++;
      }
      
      return { added, existing };
    } catch (error) {
      console.error("Fehler beim Synchronisieren von Produkten zum Lager:", error);
      return { added: 0, existing: 0, error };
    }
  }

  async createMachineWarehouseAssignment(
    assignment: InsertMachineWarehouseAssignment
  ): Promise<MachineWarehouseAssignment> {
    const [newAssignment] = await db.insert(machineWarehouseAssignments).values({
      ...assignment,
      createdAt: new Date()
    }).returning();
    
    // Nach dem Erstellen der Zuweisung synchronisieren wir die Produkte des Automaten mit dem Lager
    if (newAssignment) {
      try {
        await this.syncMachineProductsToWarehouse(newAssignment.machineId, newAssignment.warehouseId);
      } catch (syncError) {
        console.error("Fehler beim Synchronisieren von Produkten nach Automaten-Zuordnung:", syncError);
        // Wir lassen den Fehler nicht hochbubbling, da die Zuordnung trotzdem erfolgreich erstellt wurde
      }
    }
    
    return newAssignment;
  }

  async updateMachineWarehouseAssignment(
    id: number, 
    assignment: Partial<InsertMachineWarehouseAssignment>
  ): Promise<MachineWarehouseAssignment | undefined> {
    const [updatedAssignment] = await db
      .update(machineWarehouseAssignments)
      .set({
        ...assignment,
        updatedAt: new Date()
      })
      .where(eq(machineWarehouseAssignments.id, id))
      .returning();
    
    return updatedAssignment;
  }

  async deleteMachineWarehouseAssignment(id: number): Promise<boolean> {
    try {
      const result = await db
        .delete(machineWarehouseAssignments)
        .where(eq(machineWarehouseAssignments.id, id))
        .returning({ id: machineWarehouseAssignments.id });
      
      return result.length > 0;
    } catch (error) {
      console.error(`Fehler beim Löschen der Zuordnung mit ID ${id}:`, error);
      return false;
    }
  }

  async updatePrimaryWarehouseForMachine(machineId: number): Promise<void> {
    // Alle bisherigen Primär-Zuordnungen für die Maschine zurücksetzen
    await db
      .update(machineWarehouseAssignments)
      .set({ isPrimary: false })
      .where(
        and(
          eq(machineWarehouseAssignments.machineId, machineId),
          eq(machineWarehouseAssignments.isPrimary, true)
        )
      );
  }

  // Inventory Count operations
  async getInventoryCounts(params?: {
    warehouseId?: number;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<InventoryCount[]> {
    let query = db.select({
      count: inventoryCounts,
      warehouse: warehouses
    })
    .from(inventoryCounts)
    .leftJoin(warehouses, eq(inventoryCounts.warehouseId, warehouses.id));
    
    const conditions = [];
    
    if (params?.warehouseId) {
      conditions.push(eq(inventoryCounts.warehouseId, params.warehouseId));
    }
    
    if (params?.status) {
      if (params.status.includes(',')) {
        const statuses = params.status.split(',');
        conditions.push(
          or(...statuses.map(status => eq(inventoryCounts.status, status.trim())))
        );
      } else {
        conditions.push(eq(inventoryCounts.status, params.status));
      }
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    query = query.orderBy(desc(inventoryCounts.createdAt));
    
    if (params?.limit) {
      query = query.limit(params.limit);
    }
    
    if (params?.offset) {
      query = query.offset(params.offset);
    }
    
    const result = await query;
    
    // Formatieren der Ergebnisse für eine bessere Nutzbarkeit
    return result.map(row => ({
      ...row.count,
      warehouseName: row.warehouse?.name
    })) as InventoryCount[];
  }

  async getInventoryCount(id: number): Promise<InventoryCount | undefined> {
    const [count] = await db.select({
      count: inventoryCounts,
      warehouse: warehouses
    })
    .from(inventoryCounts)
    .leftJoin(warehouses, eq(inventoryCounts.warehouseId, warehouses.id))
    .where(eq(inventoryCounts.id, id));
    
    if (!count) return undefined;
    
    return {
      ...count.count,
      warehouseName: count.warehouse?.name
    } as InventoryCount;
  }
  
  // Alias für getInventoryCount mit Items
  async getInventoryCountById(id: number): Promise<InventoryCount | undefined> {
    // Rufe die Basisinformationen der Inventurzählung ab
    const count = await this.getInventoryCount(id);
    if (!count) return undefined;
    
    // Rufe die zugehörigen Items ab
    const items = await this.getInventoryCountItems(id);
    
    // Füge die Items zum Ergebnis hinzu
    return {
      ...count,
      items,
      itemCount: items.length,
      adjustmentCount: items.filter(item => item.difference !== 0).length
    };
  }

  async createInventoryCount(count: InsertInventoryCount): Promise<InventoryCount> {
    console.log(`Storage: Erstelle neue Inventurzählung für Lager ${count.warehouseId}`);
    
    // Prüfen, ob das Lager existiert
    const warehouse = await this.getWarehouse(count.warehouseId);
    if (!warehouse) {
      console.error(`Storage: Lager mit ID ${count.warehouseId} existiert nicht!`);
      throw new Error(`Warehouse with ID ${count.warehouseId} does not exist`);
    }
    
    console.log(`Storage: Lager gefunden: ${warehouse.name} (ID: ${warehouse.id})`);
    
    // Stelle sicher, dass ein Status gesetzt ist, standardmäßig "pending"
    const inventoryData = {
      ...count,
      status: count.status || 'pending', // Explizit den Status setzen, falls er fehlt
      createdAt: new Date()
    };
    
    console.log(`Storage: Erstelle Inventur mit Status: ${inventoryData.status}`);
    
    const [newCount] = await db.insert(inventoryCounts).values(inventoryData).returning();
    
    // Füge Lagernamen hinzu
    return {
      ...newCount,
      warehouseName: warehouse.name
    };
  }

  async updateInventoryCount(
    id: number, 
    count: Partial<InsertInventoryCount>
  ): Promise<InventoryCount | undefined> {
    const [updatedCount] = await db
      .update(inventoryCounts)
      .set({
        ...count,
        updatedAt: new Date()
      })
      .where(eq(inventoryCounts.id, id))
      .returning();
    
    return updatedCount;
  }

  async deleteInventoryCount(id: number): Promise<boolean> {
    try {
      const result = await db
        .delete(inventoryCounts)
        .where(eq(inventoryCounts.id, id))
        .returning({ id: inventoryCounts.id });
      
      return result.length > 0;
    } catch (error) {
      console.error(`Fehler beim Löschen der Inventur mit ID ${id}:`, error);
      return false;
    }
  }

  // Inventory Count Item operations
  async getInventoryCountItems(inventoryCountId: number): Promise<InventoryCountItem[]> {
    try {
      console.log(`Lade Inventurelemente für Inventur ${inventoryCountId}`);
      
      const result = await db.select({
        item: inventoryCountItems,
        product: products
      })
      .from(inventoryCountItems)
      .leftJoin(products, eq(inventoryCountItems.productId, products.id))
      .where(eq(inventoryCountItems.inventoryCountId, inventoryCountId))
      .orderBy(asc(products.productName));
      
      console.log(`Gefunden: ${result.length} Inventurelemente für Inventur ${inventoryCountId}`);
      
      // Das vollständige Produkt-Objekt zurückgeben anstatt nur den Namen
      return result.map(row => ({
        ...row.item,
        productName: row.product?.productName,
        product: row.product
      })) as InventoryCountItem[];
    } catch (error) {
      console.error(`Fehler beim Laden der Inventurelemente für Inventur ${inventoryCountId}:`, error);
      throw error;
    }
  }

  async getInventoryCountItemById(id: number): Promise<InventoryCountItem | undefined> {
    try {
      console.log(`Lade Inventurelement mit ID ${id}`);
      
      const [item] = await db.select({
        item: inventoryCountItems,
        product: products
      })
      .from(inventoryCountItems)
      .leftJoin(products, eq(inventoryCountItems.productId, products.id))
      .where(eq(inventoryCountItems.id, id));
      
      if (!item) {
        console.log(`Inventurelement mit ID ${id} nicht gefunden`);
        return undefined;
      }
      
      console.log(`Inventurelement mit ID ${id} gefunden`);
      
      // Das vollständige Produkt-Objekt zurückgeben
      return {
        ...item.item,
        productName: item.product?.productName,
        product: item.product
      } as InventoryCountItem;
    } catch (error) {
      console.error(`Fehler beim Laden des Inventurelements mit ID ${id}:`, error);
      throw error;
    }
  }

  async createInventoryCountItem(item: InsertInventoryCountItem): Promise<InventoryCountItem> {
    const [newItem] = await db.insert(inventoryCountItems).values({
      ...item,
      createdAt: new Date()
    }).returning();
    
    return newItem;
  }

  async updateInventoryCountItem(
    id: number, 
    item: Partial<InsertInventoryCountItem>
  ): Promise<InventoryCountItem | undefined> {
    const [updatedItem] = await db
      .update(inventoryCountItems)
      .set({
        ...item,
        updatedAt: new Date()
      })
      .where(eq(inventoryCountItems.id, id))
      .returning();
    
    return updatedItem;
  }

  async deleteInventoryCountItemsByInventoryCount(inventoryCountId: number): Promise<void> {
    await db
      .delete(inventoryCountItems)
      .where(eq(inventoryCountItems.inventoryCountId, inventoryCountId));
  }

  // Product Disposal operations
  async getProductDisposals(filter?: { status?: string; warehouseId?: string }): Promise<ProductDisposal[]> {
    let query = db.select().from(productDisposals).orderBy(desc(productDisposals.createdAt));
    
    if (filter) {
      const conditions = [];
      
      if (filter.status) {
        conditions.push(eq(productDisposals.status, filter.status));
      }
      
      if (filter.warehouseId) {
        conditions.push(eq(productDisposals.warehouseId, filter.warehouseId));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }
    }
    
    return await query;
  }

  async getProductDisposalById(id: number): Promise<ProductDisposal | undefined> {
    const [disposal] = await db
      .select()
      .from(productDisposals)
      .where(eq(productDisposals.id, id));
    
    return disposal;
  }

  async getProductDisposalItems(filter: { disposalId: number }): Promise<ProductDisposalItem[]> {
    return await db
      .select()
      .from(productDisposalItems)
      .where(eq(productDisposalItems.disposalId, filter.disposalId))
      .orderBy(asc(productDisposalItems.createdAt));
  }

  async createProductDisposal(disposal: InsertProductDisposal): Promise<ProductDisposal> {
    const [newDisposal] = await db
      .insert(productDisposals)
      .values(disposal)
      .returning();
    
    return newDisposal;
  }

  async createProductDisposalItems(items: InsertProductDisposalItem[]): Promise<ProductDisposalItem[]> {
    if (items.length === 0) {
      return [];
    }
    
    return await db
      .insert(productDisposalItems)
      .values(items)
      .returning();
  }

  async updateProductDisposal(
    id: number, 
    disposal: Partial<InsertProductDisposal>
  ): Promise<ProductDisposal | undefined> {
    const [updatedDisposal] = await db
      .update(productDisposals)
      .set(disposal)
      .where(eq(productDisposals.id, id))
      .returning();
    
    return updatedDisposal;
  }

  async deleteProductDisposal(id: number): Promise<boolean> {
    const [deletedDisposal] = await db
      .delete(productDisposals)
      .where(eq(productDisposals.id, id))
      .returning();
    
    return !!deletedDisposal;
  }

  async deleteProductDisposalItems(filter: { disposalId: number }): Promise<void> {
    await db
      .delete(productDisposalItems)
      .where(eq(productDisposalItems.disposalId, filter.disposalId));
  }

  async updateInventoryForDisposal(
    warehouseId: string, 
    productId: string, 
    quantity: number
  ): Promise<void> {
    // Finde das entsprechende Inventar-Item
    const [inventoryItem] = await db
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.warehouseId, parseInt(warehouseId)),
          eq(inventoryItems.productId, parseInt(productId))
        )
      );
    
    if (!inventoryItem) {
      console.error(`Kein Inventar-Item gefunden für Produkt ${productId} in Lager ${warehouseId}`);
      return;
    }
    
    // Aktualisiere die Menge
    const currentQuantity = inventoryItem.quantity || 0;
    const newQuantity = Math.max(0, currentQuantity - quantity); // Nie unter 0 gehen
    
    // Erstelle eine Inventarbewegung
    const movementData: InsertInventoryMovement = {
      productId: parseInt(productId),
      quantity,
      movementType: 'disposal', // Typ 'disposal' für Entsorgung/Entnahme
      referenceType: 'product_disposal',
      referenceId: `manual-${Date.now()}`, // Generiere eine eindeutige Referenz-ID
      sourceWarehouseId: parseInt(warehouseId),
      notes: `Warenentnahme von ${quantity} Einheiten`,
      performedAt: new Date(),
      performedById: 1, // System-ID oder aktueller Benutzer
    };
    
    // Speichere die Bewegung
    await this.createInventoryMovement(movementData);
    
    // Aktualisiere das Inventar-Item
    await db
      .update(inventoryItems)
      .set({ 
        quantity: newQuantity,
        updatedAt: new Date()
      })
      .where(eq(inventoryItems.id, inventoryItem.id));
  }

  // Inventory Transfer operations
  async getInventoryTransfers(filter: Record<string, any> = {}): Promise<InventoryTransfer[]> {
    // Basisabfrage
    let query = db
      .select()
      .from(inventoryTransfers)
      .orderBy(desc(inventoryTransfers.createdAt));
    
    // Filter anwenden
    if (filter.status) {
      query = query.where(eq(inventoryTransfers.status, filter.status));
    }
    
    // Lager-Filter (zeige Transfers entweder als Quelle oder Ziel)
    if (filter.warehouseId) {
      const warehouseId = parseInt(filter.warehouseId);
      if (!isNaN(warehouseId)) {
        query = query.where(
          or(
            eq(inventoryTransfers.sourceWarehouseId, warehouseId),
            eq(inventoryTransfers.targetWarehouseId, warehouseId)
          )
        );
      }
    }
    
    return await query;
  }

  async getInventoryTransferById(id: number): Promise<InventoryTransfer | undefined> {
    const [transfer] = await db
      .select()
      .from(inventoryTransfers)
      .where(eq(inventoryTransfers.id, id));
    
    return transfer;
  }

  async getInventoryTransferItems(filter: { transferId: number }): Promise<InventoryTransferItem[]> {
    return await db
      .select()
      .from(inventoryTransferItems)
      .where(eq(inventoryTransferItems.transferId, filter.transferId))
      .orderBy(asc(inventoryTransferItems.createdAt));
  }

  async createInventoryTransfer(transfer: InsertInventoryTransfer): Promise<InventoryTransfer> {
    const [newTransfer] = await db
      .insert(inventoryTransfers)
      .values(transfer)
      .returning();
    
    return newTransfer;
  }

  async createInventoryTransferItems(items: InsertInventoryTransferItem[]): Promise<InventoryTransferItem[]> {
    if (items.length === 0) {
      return [];
    }
    
    return await db
      .insert(inventoryTransferItems)
      .values(items)
      .returning();
  }

  async updateInventoryTransfer(
    id: number, 
    transfer: Partial<InsertInventoryTransfer> & { completedAt?: Date }
  ): Promise<InventoryTransfer | undefined> {
    const [updatedTransfer] = await db
      .update(inventoryTransfers)
      .set(transfer)
      .where(eq(inventoryTransfers.id, id))
      .returning();
    
    return updatedTransfer;
  }

  async updateInventoryForTransfer(
    sourceWarehouseId: number,
    targetWarehouseId: number,
    productId: string,
    quantity: number
  ): Promise<{
    sourceStock: number;
    targetStock: number;
    success: boolean;
  }> {
    // Prüfen, ob genug Bestand im Quelllager vorhanden ist
    const [sourceInventory] = await db
      .select()
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.warehouseId, sourceWarehouseId),
        eq(inventoryItems.productId, parseInt(productId))
      ));
    
    if (!sourceInventory || (sourceInventory.quantity || 0) < quantity) {
      return {
        sourceStock: sourceInventory?.quantity || 0,
        targetStock: 0,
        success: false
      };
    }
    
    // Bestand im Quelllager reduzieren
    const [updatedSourceInventory] = await db
      .update(inventoryItems)
      .set({
        quantity: (sourceInventory.quantity || 0) - quantity,
        updatedAt: new Date()
      })
      .where(eq(inventoryItems.id, sourceInventory.id))
      .returning();
    
    // Bestand im Ziellager erhöhen (oder inventoryItem erstellen, falls nicht vorhanden)
    let [targetInventory] = await db
      .select()
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.warehouseId, targetWarehouseId),
        eq(inventoryItems.productId, parseInt(productId))
      ));
    
    if (targetInventory) {
      // Bestehenden Bestand aktualisieren
      const [updatedTargetInventory] = await db
        .update(inventoryItems)
        .set({
          quantity: (targetInventory.quantity || 0) + quantity,
          updatedAt: new Date()
        })
        .where(eq(inventoryItems.id, targetInventory.id))
        .returning();
      
      targetInventory = updatedTargetInventory;
    } else {
      // Neuen Bestandseintrag erstellen
      const [newTargetInventory] = await db
        .insert(inventoryItems)
        .values({
          warehouseId: targetWarehouseId,
          productId: parseInt(productId),
          quantity,
          status: "active"
        })
        .returning();
      
      targetInventory = newTargetInventory;
    }
    
    // Erstelle eine Inventarbewegung für den Abgang aus dem Quelllager
    const sourceMovementData: InsertInventoryMovement = {
      productId: parseInt(productId),
      quantity,
      movementType: 'transfer_out',
      referenceType: 'inventory_transfer',
      referenceId: `transfer-${Date.now()}`,
      sourceWarehouseId,
      destinationWarehouseId: targetWarehouseId,
      notes: `Transfer von ${quantity} Einheiten von Lager ${sourceWarehouseId} nach Lager ${targetWarehouseId}`,
      performedAt: new Date(),
      performedById: 1, // System-ID oder aktueller Benutzer
    };
    
    await this.createInventoryMovement(sourceMovementData);
    
    // Erstelle eine Inventarbewegung für den Zugang im Ziellager
    const targetMovementData: InsertInventoryMovement = {
      productId: parseInt(productId),
      quantity,
      movementType: 'transfer_in',
      referenceType: 'inventory_transfer',
      referenceId: `transfer-${Date.now()}`,
      sourceWarehouseId,
      destinationWarehouseId: targetWarehouseId,
      notes: `Transfer von ${quantity} Einheiten von Lager ${sourceWarehouseId} nach Lager ${targetWarehouseId}`,
      performedAt: new Date(),
      performedById: 1, // System-ID oder aktueller Benutzer
    };
    
    await this.createInventoryMovement(targetMovementData);
    
    return {
      sourceStock: updatedSourceInventory.quantity || 0,
      targetStock: targetInventory.quantity || 0,
      success: true
    };
  }

  async deleteInventoryTransfer(id: number): Promise<boolean> {
    // Zuerst die Items löschen
    await db
      .delete(inventoryTransferItems)
      .where(eq(inventoryTransferItems.transferId, id));
    
    // Dann die Warenbewegung selbst löschen
    const result = await db
      .delete(inventoryTransfers)
      .where(eq(inventoryTransfers.id, id));
    
    return result.rowCount > 0;
  }
  
  // Product Batch operations - Neues Chargen-Management
  async getProductBatches(params?: {
    warehouseId?: number;
    productId?: number;
    supplierId?: number;
    status?: string;
    expiryBefore?: Date;
    expiryAfter?: Date;
    orderId?: number;
  }): Promise<ProductBatch[]> {
    let query = db.select({
      batch: productBatches,
      product: products,
      warehouse: warehouses,
      supplier: suppliers,
      order: orders
    })
    .from(productBatches)
    .leftJoin(products, eq(productBatches.productId, products.id))
    .leftJoin(warehouses, eq(productBatches.warehouseId, warehouses.id))
    .leftJoin(suppliers, eq(productBatches.supplierId, suppliers.id)) 
    .leftJoin(orders, eq(productBatches.orderId, orders.id));
    
    // Filter anwenden
    const conditions = [];
    
    if (params?.warehouseId !== undefined) {
      conditions.push(eq(productBatches.warehouseId, params.warehouseId));
    }
    
    if (params?.productId !== undefined) {
      conditions.push(eq(productBatches.productId, params.productId));
    }
    
    if (params?.supplierId !== undefined) {
      conditions.push(eq(productBatches.supplierId, params.supplierId));
    }
    
    if (params?.status !== undefined) {
      conditions.push(eq(productBatches.status, params.status));
    }
    
    if (params?.expiryBefore instanceof Date) {
      conditions.push(lte(productBatches.expiryDate, params.expiryBefore));
    }
    
    if (params?.expiryAfter instanceof Date) {
      conditions.push(gte(productBatches.expiryDate, params.expiryAfter));
    }
    
    if (params?.orderId !== undefined) {
      conditions.push(eq(productBatches.orderId, params.orderId));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    // Nach Ablaufdatum sortieren (FIFO-Prinzip)
    query = query.orderBy(asc(productBatches.expiryDate));
    
    const result = await query;
    
    // Umwandeln des Ergebnisses in das erwartete Format
    return result.map(row => ({
      ...row.batch,
      productName: row.product?.productName || '',
      warehouseName: row.warehouse?.name || '',
      supplierName: row.supplier?.name || ''
    }));
  }
  
  async getProductBatchById(id: number): Promise<ProductBatch | undefined> {
    const [result] = await db.select({
      batch: productBatches,
      product: products,
      warehouse: warehouses,
      supplier: suppliers,
      order: orders
    })
    .from(productBatches)
    .leftJoin(products, eq(productBatches.productId, products.id))
    .leftJoin(warehouses, eq(productBatches.warehouseId, warehouses.id))
    .leftJoin(suppliers, eq(productBatches.supplierId, suppliers.id))
    .leftJoin(orders, eq(productBatches.orderId, orders.id))
    .where(eq(productBatches.id, id));
    
    if (!result) return undefined;
    
    return {
      ...result.batch,
      productName: result.product?.productName || '',
      warehouseName: result.warehouse?.name || '',
      supplierName: result.supplier?.name || ''
    };
  }
  
  async getProductBatchByBatchNumber(
    batchNumber: string,
    productId: number,
    warehouseId: number
  ): Promise<ProductBatch | undefined> {
    const [result] = await db.select({
      batch: productBatches,
      product: products,
      warehouse: warehouses,
      supplier: suppliers
    })
    .from(productBatches)
    .leftJoin(products, eq(productBatches.productId, products.id))
    .leftJoin(warehouses, eq(productBatches.warehouseId, warehouses.id))
    .leftJoin(suppliers, eq(productBatches.supplierId, suppliers.id))
    .where(
      and(
        eq(productBatches.batchNumber, batchNumber),
        eq(productBatches.productId, productId),
        eq(productBatches.warehouseId, warehouseId)
      )
    );
    
    if (!result) return undefined;
    
    return {
      ...result.batch,
      productName: result.product?.productName || '',
      warehouseName: result.warehouse?.name || '',
      supplierName: result.supplier?.name || ''
    };
  }
  
  async createProductBatch(data: InsertProductBatch): Promise<ProductBatch> {
    // Datum-Formatierung für Datenbank
    const batchData = {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const [newBatch] = await db.insert(productBatches)
      .values(batchData)
      .returning();
    
    // Produktdetails abrufen
    const product = await this.getProduct(data.productId);
    const warehouse = await this.getWarehouse(data.warehouseId);
    const supplier = data.supplierId ? await this.getSupplierById(data.supplierId) : undefined;
    
    return {
      ...newBatch,
      productName: product?.productName || '',
      warehouseName: warehouse?.name || '',
      supplierName: supplier?.name || ''
    };
  }
  
  async updateProductBatch(id: number, data: Partial<InsertProductBatch>): Promise<ProductBatch | undefined> {
    const [updatedBatch] = await db.update(productBatches)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(productBatches.id, id))
      .returning();
    
    if (!updatedBatch) return undefined;
    
    // Produktdetails abrufen
    const product = await this.getProduct(updatedBatch.productId);
    const warehouse = await this.getWarehouse(updatedBatch.warehouseId);
    const supplier = updatedBatch.supplierId ? await this.getSupplierById(updatedBatch.supplierId) : undefined;
    
    return {
      ...updatedBatch,
      productName: product?.productName || '',
      warehouseName: warehouse?.name || '',
      supplierName: supplier?.name || ''
    };
  }
  
  async deleteProductBatch(id: number): Promise<boolean> {
    // Prüfen, ob Bewegungen mit diesem Batch verknüpft sind
    const movements = await this.getProductMovements({ productBatchId: id });
    
    if (movements.length > 0) {
      // Es gibt verknüpfte Bewegungen - keine Löschung erlaubt
      return false;
    }
    
    const result = await db.delete(productBatches)
      .where(eq(productBatches.id, id))
      .returning({ id: productBatches.id });
    
    return result.length > 0;
  }
  
  // Product Movement operations - Neues Bewegungsmanagement
  async getProductMovements(params?: {
    sourceType?: string;
    sourceId?: number;
    destinationType?: string;
    destinationId?: number;
    productId?: number;
    productBatchId?: number;
    movementType?: string;
    referenceType?: string;
    referenceId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<ProductMovement[]> {
    let query = db.select({
      movement: productMovements,
      product: products,
      batch: productBatches
    })
    .from(productMovements)
    .leftJoin(products, eq(productMovements.productId, products.id))
    .leftJoin(productBatches, eq(productMovements.productBatchId, productBatches.id));
    
    // Filter anwenden
    const conditions = [];
    
    if (params?.sourceType !== undefined) {
      conditions.push(eq(productMovements.sourceType, params.sourceType));
    }
    
    if (params?.sourceId !== undefined) {
      conditions.push(eq(productMovements.sourceId, params.sourceId));
    }
    
    if (params?.destinationType !== undefined) {
      conditions.push(eq(productMovements.destinationType, params.destinationType));
    }
    
    if (params?.destinationId !== undefined) {
      conditions.push(eq(productMovements.destinationId, params.destinationId));
    }
    
    if (params?.productId !== undefined) {
      conditions.push(eq(productMovements.productId, params.productId));
    }
    
    if (params?.productBatchId !== undefined) {
      conditions.push(eq(productMovements.productBatchId, params.productBatchId));
    }
    
    if (params?.movementType !== undefined) {
      conditions.push(eq(productMovements.movementType, params.movementType));
    }
    
    if (params?.referenceType !== undefined) {
      conditions.push(eq(productMovements.referenceType, params.referenceType));
    }
    
    if (params?.referenceId !== undefined) {
      conditions.push(eq(productMovements.referenceId, params.referenceId));
    }
    
    if (params?.startDate instanceof Date) {
      conditions.push(gte(productMovements.movementDate, params.startDate));
    }
    
    if (params?.endDate instanceof Date) {
      conditions.push(lte(productMovements.movementDate, params.endDate));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    // Nach Datum absteigend sortieren (neueste zuerst)
    query = query.orderBy(desc(productMovements.movementDate));
    
    // Limit und Offset anwenden
    if (params?.limit !== undefined) {
      query = query.limit(params.limit);
    }
    
    if (params?.offset !== undefined) {
      query = query.offset(params.offset);
    }
    
    const result = await query;
    
    // Umwandeln des Ergebnisses in das erwartete Format
    return result.map(row => ({
      ...row.movement,
      productName: row.product?.productName || '',
      batchNumber: row.batch?.batchNumber || '',
      expiryDate: row.batch?.expiryDate || null
    }));
  }
  
  async getProductMovementById(id: number): Promise<ProductMovement | undefined> {
    const [result] = await db.select({
      movement: productMovements,
      product: products,
      batch: productBatches
    })
    .from(productMovements)
    .leftJoin(products, eq(productMovements.productId, products.id))
    .leftJoin(productBatches, eq(productMovements.productBatchId, productBatches.id))
    .where(eq(productMovements.id, id));
    
    if (!result) return undefined;
    
    return {
      ...result.movement,
      productName: result.product?.productName || '',
      batchNumber: result.batch?.batchNumber || '',
      expiryDate: result.batch?.expiryDate || null
    };
  }
  
  async createProductMovement(data: InsertProductMovement): Promise<ProductMovement> {
    // Datum-Formatierung für Datenbank und Sicherstellung, dass ein Datum vorhanden ist
    const movementData = {
      ...data,
      movementDate: data.movementDate || new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const [newMovement] = await db.insert(productMovements)
      .values(movementData)
      .returning();
    
    // Produktdetails abrufen
    const product = await this.getProduct(data.productId);
    let batch = undefined;
    
    if (data.productBatchId) {
      batch = await this.getProductBatchById(data.productBatchId);
    }
    
    return {
      ...newMovement,
      productName: product?.productName || '',
      batchNumber: batch?.batchNumber || '',
      expiryDate: batch?.expiryDate || null
    };
  }
  
  // Implementierung der Inventory Batch Methoden
  async getInventoryBatches(params?: {
    warehouseId?: number;
    productId?: number;
    expired?: boolean;
    expiryDateBefore?: Date;
    expiryDateAfter?: Date;
    limit?: number;
    offset?: number;
  }): Promise<InventoryBatch[]> {
    let query = db.select({
      batch: inventoryBatches,
      product: products,
      warehouse: warehouses
    })
    .from(inventoryBatches)
    .leftJoin(products, eq(inventoryBatches.productId, products.id))
    .leftJoin(warehouses, eq(inventoryBatches.warehouseId, warehouses.id));
    
    const conditions = [];
    
    if (params?.warehouseId) {
      conditions.push(eq(inventoryBatches.warehouseId, params.warehouseId));
    }
    
    if (params?.productId) {
      conditions.push(eq(inventoryBatches.productId, params.productId));
    }
    
    if (params?.expired) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      conditions.push(lte(inventoryBatches.expiryDate, today));
    }
    
    if (params?.expiryDateBefore) {
      conditions.push(lte(inventoryBatches.expiryDate, params.expiryDateBefore));
    }
    
    if (params?.expiryDateAfter) {
      conditions.push(gte(inventoryBatches.expiryDate, params.expiryDateAfter));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    // FIFO-Prinzip: Älteste Chargen zuerst
    query = query.orderBy(asc(inventoryBatches.expiryDate), asc(inventoryBatches.createdAt));
    
    if (params?.limit) {
      query = query.limit(params.limit);
    }
    
    if (params?.offset) {
      query = query.offset(params.offset);
    }
    
    const result = await query;
    
    // Formatieren der Ergebnisse für eine bessere Nutzbarkeit
    return result.map(row => ({
      ...row.batch,
      productName: row.product?.productName,
      warehouseName: row.warehouse?.name
    }));
  }
  
  async getInventoryBatch(id: number): Promise<InventoryBatch | undefined> {
    const [result] = await db.select({
      batch: inventoryBatches,
      product: products,
      warehouse: warehouses
    })
    .from(inventoryBatches)
    .leftJoin(products, eq(inventoryBatches.productId, products.id))
    .leftJoin(warehouses, eq(inventoryBatches.warehouseId, warehouses.id))
    .where(eq(inventoryBatches.id, id));
    
    if (!result) return undefined;
    
    return {
      ...result.batch,
      productName: result.product?.productName,
      warehouseName: result.warehouse?.name
    };
  }
  
  async getInventoryBatchByBatchNumber(batchNumber: string, warehouseId: number): Promise<InventoryBatch | undefined> {
    const [result] = await db.select({
      batch: inventoryBatches,
      product: products,
      warehouse: warehouses
    })
    .from(inventoryBatches)
    .leftJoin(products, eq(inventoryBatches.productId, products.id))
    .leftJoin(warehouses, eq(inventoryBatches.warehouseId, warehouses.id))
    .where(
      and(
        eq(inventoryBatches.batchNumber, batchNumber),
        eq(inventoryBatches.warehouseId, warehouseId)
      )
    );
    
    if (!result) return undefined;
    
    return {
      ...result.batch,
      productName: result.product?.productName,
      warehouseName: result.warehouse?.name
    };
  }
  
  async createInventoryBatch(batch: InsertInventoryBatch): Promise<InventoryBatch> {
    // Überprüfen, ob bereits eine identische Charge existiert
    const existingBatch = await this.getInventoryBatchByBatchNumber(
      batch.batchNumber, 
      batch.warehouseId
    );
    
    if (existingBatch) {
      // Wenn die Charge bereits existiert, aktualisiere die Menge
      const updatedBatch = await this.updateInventoryBatch(
        existingBatch.id, 
        { 
          quantity: existingBatch.quantity + batch.quantity,
          updatedAt: new Date()
        }
      );
      return updatedBatch!;
    }
    
    // Neue Charge anlegen
    const [newBatch] = await db.insert(inventoryBatches).values({
      ...batch,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    
    return newBatch;
  }
  
  async updateInventoryBatch(id: number, batch: Partial<InsertInventoryBatch>): Promise<InventoryBatch | undefined> {
    const [updatedBatch] = await db
      .update(inventoryBatches)
      .set({ ...batch, updatedAt: new Date() })
      .where(eq(inventoryBatches.id, id))
      .returning();
    
    if (!updatedBatch) return undefined;
    
    const enrichedBatch = await this.getInventoryBatch(id);
    return enrichedBatch;
  }
  
  async deleteInventoryBatch(id: number): Promise<boolean> {
    try {
      await db.delete(inventoryBatches).where(eq(inventoryBatches.id, id));
      return true;
    } catch (error) {
      console.error(`Fehler beim Löschen der Charge mit ID ${id}:`, error);
      return false;
    }
  }
  
  // Inventory Movement with Batch operations
  async createInventoryMovementWithBatch(
    movement: InsertInventoryMovement, 
    batchId: number
  ): Promise<InventoryMovement> {
    const batch = await this.getInventoryBatch(batchId);
    
    if (!batch) {
      throw new Error(`Batch mit ID ${batchId} nicht gefunden`);
    }
    
    const [newMovement] = await db.insert(inventoryMovements).values({
      ...movement,
      batchId,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    
    // Aktualisiere die Mengen in der Charge
    await this.updateInventoryBatch(batchId, {
      quantity: batch.quantity - movement.quantity,
      updatedAt: new Date()
    });
    
    return newMovement;
  }
  
  // Refill Batch Movement operations
  async getRefillBatchMovements(params?: {
    refillId?: number;
    refillDetailId?: number;
    batchId?: number;
    warehouseId?: number;
    limit?: number;
    offset?: number;
  }): Promise<RefillBatchMovement[]> {
    let query = db.select().from(refillBatchMovements);
    
    const conditions = [];
    
    if (params?.refillId) {
      conditions.push(eq(refillBatchMovements.refillId, params.refillId));
    }
    
    if (params?.refillDetailId) {
      conditions.push(eq(refillBatchMovements.refillDetailId, params.refillDetailId));
    }
    
    if (params?.batchId) {
      conditions.push(eq(refillBatchMovements.batchId, params.batchId));
    }
    
    if (params?.warehouseId) {
      conditions.push(eq(refillBatchMovements.warehouseId, params.warehouseId));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    query = query.orderBy(desc(refillBatchMovements.performedAt));
    
    if (params?.limit) {
      query = query.limit(params.limit);
    }
    
    if (params?.offset) {
      query = query.offset(params.offset);
    }
    
    return await query;
  }
  
  async getRefillBatchMovement(id: number): Promise<RefillBatchMovement | undefined> {
    const [movement] = await db
      .select()
      .from(refillBatchMovements)
      .where(eq(refillBatchMovements.id, id));
    
    return movement;
  }
  
  async createRefillBatchMovement(movement: InsertRefillBatchMovement): Promise<RefillBatchMovement> {
    const [newMovement] = await db.insert(refillBatchMovements).values({
      ...movement,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    
    return newMovement;
  }
  
  // Diese Methode verarbeitet eine Nachfüllung nach dem FIFO-Prinzip
  async processRefillWithBatches(
    refillId: number, 
    refillDetailId: number, 
    warehouseId: number, 
    productId: number, 
    quantity: number
  ): Promise<RefillBatchMovement[]> {
    // Alle verfügbaren Chargen für dieses Produkt im Lager finden (sortiert nach Ablaufdatum FIFO)
    const batches = await this.getInventoryBatches({
      warehouseId,
      productId,
      expiryDateAfter: new Date(), // Nur nicht abgelaufene Chargen
    });
    
    let remainingQuantity = quantity;
    const movements: RefillBatchMovement[] = [];
    
    // Durchlaufe die Chargen nach FIFO-Prinzip
    for (const batch of batches) {
      if (remainingQuantity <= 0) break;
      
      const quantityFromBatch = Math.min(batch.quantity, remainingQuantity);
      
      if (quantityFromBatch <= 0) continue;
      
      // Erstelle eine Bewegung für diese Charge
      const movement = await this.createRefillBatchMovement({
        refillId,
        refillDetailId,
        batchId: batch.id,
        warehouseId,
        productId,
        quantity: quantityFromBatch,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        warehouseBefore: batch.quantity,
        warehouseAfter: batch.quantity - quantityFromBatch,
        movementType: "REFILL",
        status: "completed",
        performedAt: new Date(),
      });
      
      // Aktualisiere die Charge
      await this.updateInventoryBatch(batch.id, {
        quantity: batch.quantity - quantityFromBatch,
      });
      
      // Erstelle eine Inventarbewegung
      await this.createInventoryMovementWithBatch({
        sourceWarehouseId: warehouseId,
        productId,
        quantity: quantityFromBatch,
        movementType: "REFILL",
        referenceType: "REFILL",
        referenceId: refillId.toString(),
        performedAt: new Date(),
        status: "completed",
        notes: `Nachfüllung aus Charge ${batch.batchNumber}`
      }, batch.id);
      
      movements.push(movement);
      remainingQuantity -= quantityFromBatch;
    }
    
    // Falls die Menge nicht vollständig aus Chargen gedeckt werden konnte,
    // erstelle einen Eintrag ohne Batch (Altbestand)
    if (remainingQuantity > 0) {
      // Inventarbewegung ohne Batch
      await this.createInventoryMovement({
        sourceWarehouseId: warehouseId,
        productId,
        quantity: remainingQuantity,
        movementType: "REFILL",
        referenceType: "REFILL",
        referenceId: refillId.toString(),
        performedAt: new Date(),
        status: "completed",
        notes: `Nachfüllung aus Altbestand (ohne Charge)`
      });
      
      // Refill Batch Movement ohne Batch (mit Dummy-ID)
      const movementWithoutBatch = await this.createRefillBatchMovement({
        refillId,
        refillDetailId,
        batchId: -1, // Dummy-ID
        warehouseId,
        productId,
        quantity: remainingQuantity,
        batchNumber: "LEGACY",
        expiryDate: new Date(), // Setze heutiges Datum
        warehouseBefore: 0,
        warehouseAfter: 0,
        movementType: "REFILL",
        status: "completed",
        notes: "Altbestand ohne Chargeninformation",
        performedAt: new Date(),
      });
      
      movements.push(movementWithoutBatch);
    }
    
    return movements;
  }
}

// Stock / Lagerbestand Implementierung
class DatabaseStorageWithStock extends DatabaseStorage {
  // Stock Methoden
  async getStocks(limit?: number): Promise<Stock[]> {
    const query = db.select().from(stocks);
    if (limit && limit > 0) {
      query.limit(limit);
    }
    return await query;
  }
  
  async getStockById(id: number): Promise<Stock | null> {
    const results = await db.select().from(stocks).where(eq(stocks.id, id));
    return results.length > 0 ? results[0] : null;
  }
  
  async getStockByVendonId(vendonId: string): Promise<Stock | null> {
    const results = await db.select().from(stocks).where(eq(stocks.vendonId, vendonId));
    return results.length > 0 ? results[0] : null;
  }
  
  async createStock(stock: InsertStock): Promise<Stock> {
    const [newStock] = await db.insert(stocks).values({
      ...stock,
      createdAt: new Date()
    }).returning();
    return newStock;
  }
  
  async updateStock(id: number, updatedStock: Partial<InsertStock>): Promise<Stock> {
    const [stock] = await db.update(stocks)
      .set({
        ...updatedStock,
        updatedAt: new Date()
      })
      .where(eq(stocks.id, id))
      .returning();
    return stock;
  }
  
  async deleteStock(id: number): Promise<boolean> {
    try {
      await db.delete(stocks).where(eq(stocks.id, id));
      return true;
    } catch (error) {
      console.error(`Fehler beim Löschen des Stocks mit ID ${id}:`, error);
      return false;
    }
  }
  
  // Machine Stock Methoden
  async getMachineStocks(machineId: number): Promise<MachineStock[]> {
    const results = await db.select().from(machineStocks)
      .where(eq(machineStocks.machineId, machineId));
    return results;
  }
  
  async getMachineStockById(id: number): Promise<MachineStock | null> {
    const results = await db.select().from(machineStocks).where(eq(machineStocks.id, id));
    return results.length > 0 ? results[0] : null;
  }
  
  async createMachineStock(machineStock: InsertMachineStock): Promise<MachineStock> {
    const [newMachineStock] = await db.insert(machineStocks).values({
      ...machineStock,
      createdAt: new Date()
    }).returning();
    return newMachineStock;
  }
  
  async updateMachineStock(id: number, updatedMachineStock: Partial<InsertMachineStock>): Promise<MachineStock> {
    const [machineStock] = await db.update(machineStocks)
      .set({
        ...updatedMachineStock,
        updatedAt: new Date()
      })
      .where(eq(machineStocks.id, id))
      .returning();
    return machineStock;
  }
  
  async deleteMachineStock(id: number): Promise<boolean> {
    try {
      await db.delete(machineStocks).where(eq(machineStocks.id, id));
      return true;
    } catch (error) {
      console.error(`Fehler beim Löschen des Machine Stocks mit ID ${id}:`, error);
      return false;
    }
  }
}

// Export an instance of the DatabaseStorage implementation
export const storage = new DatabaseStorage();
