import { eq, desc, and, or, gte, lte, like, asc, count, sql, gt, ilike, isNull, isNotNull, inArray, between } from "drizzle-orm";
import { db, rawDb } from "../db";
import { normalizeProductName } from "../utils/stringUtils";
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
  stocks, type Stock, type InsertStock,
  machineStocks, type MachineStock, type InsertMachineStock,
  orders, type Order, type InsertOrder,
  orderItems, type OrderItem, type InsertOrderItem,
  purchaseConditions, type PurchaseCondition, type InsertPurchaseCondition,
  refillBatchMovements, type RefillBatchMovement, type InsertRefillBatchMovement,
  productBatches, type ProductBatch, type InsertProductBatch,
  productMovements, type ProductMovement, type InsertProductMovement,
  pagePermissions, type PagePermission, type InsertPagePermission
} from "@shared/schema";
import { IStorage } from "../storage";

/**
 * DatabaseStorage class that implements the IStorage interface
 * with PostgreSQL using the Neon database connection
 */
export class DatabaseStorage implements IStorage {
  /**
   * Execute a raw SQL query
   */
  async query(sqlText: string, params?: any[]): Promise<any[]> {
    try {
      const result = await rawDb.query(sqlText, params);
      return result.rows;
    } catch (error) {
      console.error("Error executing query:", error);
      throw error;
    }
  }
  
  /**
   * Direct raw query execution with full result object
   */
  async executeRawQuery(sqlText: string, params?: any[]): Promise<{rows: any[], rowCount: number}> {
    try {
      return await rawDb.query(sqlText, params);
    } catch (error) {
      console.error("Error executing raw query:", error);
      throw error;
    }
  }
  
  /**
   * Get database statistics for key tables
   */
  async getDatabaseStats(): Promise<{
    transactions: { count: number; latest: Date | null };
    machines: { count: number; latest: Date | null };
    refills: { count: number; latest: Date | null };
    refillDetails: { count: number; latest: Date | null };
    events: { count: number; latest: Date | null };
    products: { count: number; latest: Date | null };
    stocks: { count: number; latest: Date | null };
    machineStocks: { count: number; latest: Date | null };
  }> {
    // Transactions count and latest
    const transactionCountResult = await db.select({ count: count() }).from(transactions);
    const [latestTransaction] = await db.select().from(transactions).orderBy(desc(transactions.datetime)).limit(1);
    
    // Machines count and latest
    const machineCountResult = await db.select({ count: count() }).from(machines);
    const [latestMachine] = await db.select().from(machines).orderBy(desc(machines.id)).limit(1);
    
    // Refills count and latest
    const refillCountResult = await db.select({ count: count() }).from(refills);
    const [latestRefill] = await db.select().from(refills).orderBy(desc(refills.datetime)).limit(1);
    
    // Refill details count and latest
    const refillDetailCountResult = await db.select({ count: count() }).from(refillDetails);
    const [latestRefillDetail] = await db.select().from(refillDetails).orderBy(desc(refillDetails.id)).limit(1);
    
    // Events count and latest
    const eventCountResult = await db.select({ count: count() }).from(events);
    const [latestEvent] = await db.select().from(events).orderBy(desc(events.datetime)).limit(1);
    
    // Products count and latest
    const productCountResult = await db.select({ count: count() }).from(products);
    const [latestProduct] = await db.select().from(products).orderBy(desc(products.id)).limit(1);
    
    // Stocks count and latest
    const stockCountResult = await db.select({ count: count() }).from(stocks);
    const [latestStock] = await db.select().from(stocks).orderBy(desc(stocks.id)).limit(1);
    
    // Machine stocks count and latest
    const machineStockCountResult = await db.select({ count: count() }).from(machineStocks);
    const [latestMachineStock] = await db.select().from(machineStocks).orderBy(desc(machineStocks.id)).limit(1);
    
    return {
      transactions: {
        count: parseInt(transactionCountResult[0]?.count?.toString() || '0'),
        latest: latestTransaction?.datetime || null
      },
      machines: {
        count: parseInt(machineCountResult[0]?.count?.toString() || '0'),
        latest: latestMachine?.id || null
      },
      refills: {
        count: parseInt(refillCountResult[0]?.count?.toString() || '0'),
        latest: latestRefill?.datetime || null
      },
      refillDetails: {
        count: parseInt(refillDetailCountResult[0]?.count?.toString() || '0'),
        latest: latestRefillDetail?.id || null
      },
      events: {
        count: parseInt(eventCountResult[0]?.count?.toString() || '0'),
        latest: latestEvent?.datetime || null
      },
      products: {
        count: parseInt(productCountResult[0]?.count?.toString() || '0'),
        latest: latestProduct?.id || null
      },
      stocks: {
        count: parseInt(stockCountResult[0]?.count?.toString() || '0'),
        latest: latestStock?.id || null
      },
      machineStocks: {
        count: parseInt(machineStockCountResult[0]?.count?.toString() || '0'),
        latest: latestMachineStock?.id || null
      }
    };
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

  // Transaction operations
  async getTransactionCount(): Promise<number> {
    const result = await db.select({ count: count() }).from(transactions);
    return parseInt(result[0]?.count?.toString() || '0');
  }

  async getTransactionStatistics(): Promise<{
    earliest_date: string | null;
    latest_date: string | null;
    count: number;
    quality: number | null;
    coverage_percentage: number;
  }> {
    const query = `
      SELECT 
        MIN(datetime) as earliest_date,
        MAX(datetime) as latest_date,
        COUNT(*) as count,
        (COUNT(DISTINCT DATE(datetime)) * 100.0 / NULLIF(DATE_PART('day', MAX(datetime) - MIN(datetime)) + 1, 0)) as coverage_percentage,
        NULL as quality
      FROM transactions
    `;
      
    const result = await rawDb.query(query);
    return result.rows[0] || {
      earliest_date: null,
      latest_date: null,
      count: 0,
      quality: null,
      coverage_percentage: 0
    };
  }

  // Sync logs operations
  async createSyncLog(syncLog: InsertSyncLog): Promise<SyncLog> {
    const [newLog] = await db.insert(syncLogs).values(syncLog).returning();
    return newLog;
  }

  async updateSyncLog(id: number, updateData: Partial<InsertSyncLog>): Promise<SyncLog | undefined> {
    const [updatedLog] = await db
      .update(syncLogs)
      .set({
        ...updateData,
        updatedAt: new Date()
      })
      .where(eq(syncLogs.id, id))
      .returning();
    return updatedLog;
  }

  async getSyncLogById(id: number): Promise<SyncLog | undefined> {
    const [log] = await db.select().from(syncLogs).where(eq(syncLogs.id, id));
    return log;
  }

  async getSyncLogs(options?: { limit?: number; offset?: number; syncType?: string; syncStatus?: string }): Promise<SyncLog[]> {
    let query = db.select().from(syncLogs);
    
    if (options?.syncType) {
      query = query.where(eq(syncLogs.syncType, options.syncType));
    }
    
    if (options?.syncStatus) {
      query = query.where(eq(syncLogs.syncStatus, options.syncStatus));
    }
    
    query = query.orderBy(desc(syncLogs.startDate));
    
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    
    if (options?.offset) {
      query = query.offset(options.offset);
    }
    
    return await query;
  }

  // Weather related operations
  async getWeatherStatistics(): Promise<{
    earliest_date: string | null;
    latest_date: string | null;
    count: number;
    quality: number | null;
    coverage_percentage: number;
  }> {
    const query = `
      SELECT 
        MIN(date) as earliest_date, 
        MAX(date) as latest_date,
        COUNT(*) as count,
        CASE 
          WHEN MIN(date) IS NULL OR MAX(date) IS NULL THEN 0
          ELSE (COUNT(DISTINCT date) * 100.0 / NULLIF(DATE_PART('day', AGE(MAX(date), MIN(date))) + 1, 0))
        END as coverage_percentage,
        NULL as quality
      FROM weather_data
    `;
      
    const result = await rawDb.query(query);
    return result.rows[0] || {
      earliest_date: null,
      latest_date: null,
      count: 0,
      quality: null,
      coverage_percentage: 0
    };
  }

  /**
   * Get machines with optional limit
   */
  async getMachines(limit?: number): Promise<any[]> {
    try {
      const query = db.select().from(machines).orderBy(asc(machines.machineName));
      if (limit && limit > 0) {
        return await query.limit(limit);
      }
      return await query;
    } catch (error) {
      console.error("Error fetching machines:", error);
      return [];
    }
  }

  /**
   * Get machine by ID
   */
  async getMachineById(id: number): Promise<any | undefined> {
    try {
      const result = await db.select().from(machines).where(eq(machines.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error fetching machine by ID:", error);
      return undefined;
    }
  }

  /**
   * Get locations
   */
  async getLocations(): Promise<any[]> {
    try {
      return await db.select().from(locations).orderBy(asc(locations.name));
    } catch (error) {
      console.error("Error fetching locations:", error);
      return [];
    }
  }

  /**
   * Get location by ID
   */
  async getLocationById(id: number): Promise<any | undefined> {
    try {
      const result = await db.select().from(locations).where(eq(locations.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error fetching location by ID:", error);
      return undefined;
    }
  }

  /**
   * Get transaction count for sync status
   */
  async getTransactionCount(): Promise<number> {
    const result = await db.select({ count: count() }).from(transactions);
    return parseInt(result[0]?.count?.toString() || '0');
  }

  // Core stub methods for IStorage interface compatibility (removed duplicate implementations)
  async getUserByEmail(email: string): Promise<any | undefined> { return undefined; }
  async listUsers(): Promise<any[]> { return []; }
  
  async getProducts(): Promise<any[]> { return []; }
  async getProductById(id: number): Promise<any | undefined> { return undefined; }
  async getProductByVendonId(vendonId: string): Promise<any | undefined> { return undefined; }
  async createProduct(product: any): Promise<any> { throw new Error("Not implemented"); }
  async updateProduct(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteProduct(id: number): Promise<void> { throw new Error("Not implemented"); }
  
  async getSuppliers(): Promise<any[]> { return []; }
  async getSupplierById(id: number): Promise<any | undefined> { return undefined; }
  async createSupplier(supplier: any): Promise<any> { throw new Error("Not implemented"); }
  async updateSupplier(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteSupplier(id: number): Promise<void> { throw new Error("Not implemented"); }
  
  async getWarehouses(): Promise<any[]> { return []; }
  async getWarehouseById(id: number): Promise<any | undefined> { return undefined; }
  async createWarehouse(warehouse: any): Promise<any> { throw new Error("Not implemented"); }
  async updateWarehouse(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteWarehouse(id: number): Promise<void> { throw new Error("Not implemented"); }
  
  async getOrders(): Promise<any[]> { return []; }
  async getOrderById(id: number): Promise<any | undefined> { return undefined; }
  async createOrder(order: any): Promise<any> { throw new Error("Not implemented"); }
  async updateOrder(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteOrder(id: number): Promise<void> { throw new Error("Not implemented"); }
  async getOrdersByWarehouse(warehouseId: number): Promise<any[]> { return []; }
  async getOrdersBySupplier(supplierId: number): Promise<any[]> { return []; }
  
  async getOrderItems(orderId: number): Promise<any[]> { return []; }
  async createOrderItem(item: any): Promise<any> { throw new Error("Not implemented"); }
  async updateOrderItem(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteOrderItem(id: number): Promise<void> { throw new Error("Not implemented"); }
  
  async getTransactions(): Promise<any[]> { return []; }
  async getTransactionById(id: number): Promise<any | undefined> { return undefined; }
  async getTransactionByVendonId(vendonId: string): Promise<any | undefined> {
    const result = await db.select({
      id: transactions.id,
      vendonId: transactions.vendonId,
      machineId: transactions.machineId,
      machineName: transactions.machineName,
      datetime: transactions.datetime,
      productName: transactions.productName,
      price: transactions.price,
      quantity: transactions.quantity,
      source: transactions.source
    }).from(transactions).where(eq(transactions.vendonId, vendonId)).limit(1);
    return result[0];
  }
  async createTransaction(transaction: any): Promise<any> {
    // Direkte SQL-Insertion um Schema-Konflikte zu vermeiden
    const result = await rawDb.query(`
      INSERT INTO transactions (
        vendon_id, machine_id, machine_name, datetime, 
        product_name, price, quantity, source, extra_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, vendon_id, machine_id, machine_name, datetime, 
                product_name, price, quantity, source
    `, [
      transaction.vendonId,
      transaction.machineId, 
      transaction.machineName,
      transaction.datetime,
      transaction.productName,
      transaction.price,
      transaction.quantity,
      transaction.source,
      transaction.extraData || null
    ]);
    return result.rows[0];
  }
  async updateTransaction(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteTransaction(id: number): Promise<void> { throw new Error("Not implemented"); }
  async getTransactionsByMachine(machineId: number): Promise<any[]> { return []; }
  async getTransactionsByDateRange(startDate: Date, endDate: Date): Promise<any[]> { return []; }
  
  async getMachineByVendonId(vendonId: string): Promise<any | undefined> { return undefined; }
  async createMachine(machine: any): Promise<any> { 
    const result = await db.insert(machines).values(machine).returning();
    return result[0];
  }
  async updateMachine(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteMachine(id: number): Promise<void> { throw new Error("Not implemented"); }
  
  async getInventoryItems(): Promise<any[]> { return []; }
  async getInventoryItemById(id: number): Promise<any | undefined> { return undefined; }
  async getInventoryByWarehouse(warehouseId: number): Promise<any[]> { return []; }
  async getInventoryByProduct(productId: number): Promise<any[]> { return []; }
  async createInventoryItem(item: any): Promise<any> { throw new Error("Not implemented"); }
  async updateInventoryItem(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteInventoryItem(id: number): Promise<void> { throw new Error("Not implemented"); }
  
  async getInventoryMovements(): Promise<any[]> { return []; }
  async getInventoryMovementById(id: number): Promise<any | undefined> { return undefined; }
  async getInventoryMovementsByWarehouse(warehouseId: number): Promise<any[]> { return []; }
  async createInventoryMovement(movement: any): Promise<any> { throw new Error("Not implemented"); }
  async updateInventoryMovement(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteInventoryMovement(id: number): Promise<void> { throw new Error("Not implemented"); }
  
  async getRefills(): Promise<any[]> { 
    try {
      return await db.select().from(refills).orderBy(desc(refills.updatedAt));
    } catch (error) {
      console.error("Error fetching refills:", error);
      return [];
    }
  }
  
  async getRefillById(id: number): Promise<any | undefined> { 
    try {
      const result = await db.select().from(refills).where(eq(refills.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error fetching refill by ID:", error);
      return undefined;
    }
  }
  
  async getRefillByVendonId(vendonId: string): Promise<any | undefined> {
    try {
      const result = await db.select().from(refills).where(eq(refills.vendonId, vendonId)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error fetching refill by Vendon ID:", error);
      return undefined;
    }
  }
  
  async getRefillsByMachine(machineId: number): Promise<any[]> { 
    try {
      return await db.select().from(refills).where(eq(refills.machineId, machineId)).orderBy(desc(refills.updatedAt));
    } catch (error) {
      console.error("Error fetching refills by machine:", error);
      return [];
    }
  }
  
  async createRefill(refill: any): Promise<any> { 
    try {
      const result = await db.insert(refills).values(refill).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating refill:", error);
      throw error;
    }
  }
  
  async updateRefill(id: number, updates: any): Promise<any> { 
    try {
      const result = await db.update(refills).set(updates).where(eq(refills.id, id)).returning();
      return result[0];
    } catch (error) {
      console.error("Error updating refill:", error);
      throw error;
    }
  }
  
  async deleteRefill(id: number): Promise<void> { 
    try {
      await db.delete(refills).where(eq(refills.id, id));
    } catch (error) {
      console.error("Error deleting refill:", error);
      throw error;
    }
  }
  
  async getSupplierDiscounts(): Promise<any[]> { return []; }
  async getSupplierDiscountById(id: number): Promise<any | undefined> { return undefined; }
  async getSupplierDiscountsBySupplier(supplierId: number): Promise<any[]> { return []; }
  async createSupplierDiscount(discount: any): Promise<any> { throw new Error("Not implemented"); }
  async updateSupplierDiscount(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteSupplierDiscount(id: number): Promise<void> { throw new Error("Not implemented"); }
  
  async getWeatherData(): Promise<any[]> { return []; }
  async getWeatherDataById(id: number): Promise<any | undefined> { return undefined; }
  async getWeatherDataByLocation(locationId: number): Promise<any[]> { return []; }
  async createWeatherData(data: any): Promise<any> { throw new Error("Not implemented"); }
  async updateWeatherData(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteWeatherData(id: number): Promise<void> { throw new Error("Not implemented"); }
  
  async getSupplierPortalPins(): Promise<any[]> { return []; }
  async getSupplierPortalPinById(id: number): Promise<any | undefined> { return undefined; }
  async getSupplierPortalPinBySupplier(supplierId: number): Promise<any | undefined> { return undefined; }
  async createSupplierPortalPin(pin: any): Promise<any> { throw new Error("Not implemented"); }
  async updateSupplierPortalPin(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteSupplierPortalPin(id: number): Promise<void> { throw new Error("Not implemented"); }
  
  async getSupplierProductAssignments(): Promise<any[]> { return []; }
  async getSupplierProductAssignmentById(id: number): Promise<any | undefined> { return undefined; }
  async getSupplierProductAssignmentsBySupplier(supplierId: number): Promise<any[]> { return []; }
  async createSupplierProductAssignment(assignment: any): Promise<any> { throw new Error("Not implemented"); }
  async updateSupplierProductAssignment(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteSupplierProductAssignment(id: number): Promise<void> { throw new Error("Not implemented"); }
  
  async getProductCategories(): Promise<any[]> { return []; }
  async getProductCategoryById(id: number): Promise<any | undefined> { return undefined; }
  async createProductCategory(category: any): Promise<any> { throw new Error("Not implemented"); }
  async updateProductCategory(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteProductCategory(id: number): Promise<void> { throw new Error("Not implemented"); }
  
  async getPackageTypes(): Promise<any[]> { return []; }
  async getPackageTypeById(id: number): Promise<any | undefined> { return undefined; }
  async createPackageType(type: any): Promise<any> { throw new Error("Not implemented"); }
  async updatePackageType(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deletePackageType(id: number): Promise<void> { throw new Error("Not implemented"); }
  
  async getPurchaseConditions(): Promise<any[]> { return []; }
  async getPurchaseConditionById(id: number): Promise<PurchaseCondition | undefined> {
    try {
      const result = await db
        .select({
          id: purchaseConditions.id,
          productId: purchaseConditions.productId,
          productName: products.productName,
          supplierId: purchaseConditions.supplierId,
          supplierName: suppliers.name,
          unitPrice: purchaseConditions.unitPrice,
          taxRate: purchaseConditions.taxRate,
          grossPrice: purchaseConditions.grossPrice,
          minQuantity: purchaseConditions.minQuantity,
          minQuantityUnit: purchaseConditions.minQuantityUnit,
          packagingUnit: purchaseConditions.packagingUnit,
          packagingQuantity: purchaseConditions.packagingQuantity,
          depositPerUnit: purchaseConditions.depositPerUnit,
          deliveryTime: purchaseConditions.deliveryTime,
          validFrom: purchaseConditions.validFrom,
          validTo: purchaseConditions.validTo,
          isPreferred: purchaseConditions.isPreferred,
          notes: purchaseConditions.notes,
          leadTime: purchaseConditions.leadTime,
          packagingType: purchaseConditions.packagingType,
          supplierArticleNumber: purchaseConditions.supplierArticleNumber,
          createdAt: purchaseConditions.createdAt,
          updatedAt: purchaseConditions.updatedAt,
        })
        .from(purchaseConditions)
        .leftJoin(products, eq(purchaseConditions.productId, products.id))
        .leftJoin(suppliers, eq(purchaseConditions.supplierId, suppliers.id))
        .where(eq(purchaseConditions.id, id))
        .limit(1);
      
      return result[0];
    } catch (error) {
      console.error("Error fetching purchase condition by ID:", error);
      return undefined;
    }
  }

  async getPurchaseConditionsBySupplier(supplierId: number): Promise<PurchaseCondition[]> {
    try {
      const result = await db
        .select({
          id: purchaseConditions.id,
          productId: purchaseConditions.productId,
          productName: products.productName,
          supplierId: purchaseConditions.supplierId,
          supplierName: suppliers.name,
          unitPrice: purchaseConditions.unitPrice,
          taxRate: purchaseConditions.taxRate,
          grossPrice: purchaseConditions.grossPrice,
          minQuantity: purchaseConditions.minQuantity,
          minQuantityUnit: purchaseConditions.minQuantityUnit,
          packagingUnit: purchaseConditions.packagingUnit,
          packagingQuantity: purchaseConditions.packagingQuantity,
          depositPerUnit: purchaseConditions.depositPerUnit,
          deliveryTime: purchaseConditions.deliveryTime,
          validFrom: purchaseConditions.validFrom,
          validTo: purchaseConditions.validTo,
          isPreferred: purchaseConditions.isPreferred,
          notes: purchaseConditions.notes,
          leadTime: purchaseConditions.leadTime,
          packagingType: purchaseConditions.packagingType,
          supplierArticleNumber: purchaseConditions.supplierArticleNumber,
          createdAt: purchaseConditions.createdAt,
          updatedAt: purchaseConditions.updatedAt,
        })
        .from(purchaseConditions)
        .leftJoin(products, eq(purchaseConditions.productId, products.id))
        .leftJoin(suppliers, eq(purchaseConditions.supplierId, suppliers.id))
        .where(eq(purchaseConditions.supplierId, supplierId))
        .orderBy(desc(purchaseConditions.createdAt));
      
      return result;
    } catch (error) {
      console.error("Error fetching purchase conditions by supplier:", error);
      return [];
    }
  }
  
  async getPurchaseConditionsByProduct(productId: number): Promise<PurchaseCondition[]> {
    try {
      const result = await db
        .select({
          id: purchaseConditions.id,
          productId: purchaseConditions.productId,
          productName: products.productName,
          supplierId: purchaseConditions.supplierId,
          supplierName: suppliers.name,
          unitPrice: purchaseConditions.unitPrice,
          taxRate: purchaseConditions.taxRate,
          grossPrice: purchaseConditions.grossPrice,
          minQuantity: purchaseConditions.minQuantity,
          minQuantityUnit: purchaseConditions.minQuantityUnit,
          packagingUnit: purchaseConditions.packagingUnit,
          packagingQuantity: purchaseConditions.packagingQuantity,
          depositPerUnit: purchaseConditions.depositPerUnit,
          deliveryTime: purchaseConditions.deliveryTime,
          validFrom: purchaseConditions.validFrom,
          validTo: purchaseConditions.validTo,
          isPreferred: purchaseConditions.isPreferred,
          notes: purchaseConditions.notes,
          leadTime: purchaseConditions.leadTime,
          packagingType: purchaseConditions.packagingType,
          supplierArticleNumber: purchaseConditions.supplierArticleNumber,
          createdAt: purchaseConditions.createdAt,
          updatedAt: purchaseConditions.updatedAt,
        })
        .from(purchaseConditions)
        .leftJoin(products, eq(purchaseConditions.productId, products.id))
        .leftJoin(suppliers, eq(purchaseConditions.supplierId, suppliers.id))
        .where(eq(purchaseConditions.productId, productId))
        .orderBy(desc(purchaseConditions.createdAt));
      
      return result;
    } catch (error) {
      console.error("Error fetching purchase conditions by product:", error);
      return [];
    }
  }
  
  async createPurchaseCondition(condition: InsertPurchaseCondition): Promise<PurchaseCondition> {
    try {
      const result = await db
        .insert(purchaseConditions)
        .values(condition)
        .returning();
      
      return result[0];
    } catch (error) {
      console.error("Error creating purchase condition:", error);
      throw error;
    }
  }
  
  async updatePurchaseCondition(id: number, updates: Partial<PurchaseCondition>): Promise<PurchaseCondition> {
    try {
      const result = await db
        .update(purchaseConditions)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(purchaseConditions.id, id))
        .returning();
      
      if (result.length === 0) {
        throw new Error(`Purchase condition with ID ${id} not found`);
      }
      
      return result[0];
    } catch (error) {
      console.error("Error updating purchase condition:", error);
      throw error;
    }
  }
  
  async deletePurchaseCondition(id: number): Promise<void> {
    try {
      const result = await db
        .delete(purchaseConditions)
        .where(eq(purchaseConditions.id, id))
        .returning();
      
      if (result.length === 0) {
        throw new Error(`Purchase condition with ID ${id} not found`);
      }
    } catch (error) {
      console.error("Error deleting purchase condition:", error);
      throw error;
    }
  }
  
  async getRecurringOrders(): Promise<any[]> { return []; }
  async getRecurringOrderById(id: number): Promise<any | undefined> { return undefined; }
  async getRecurringOrdersByWarehouse(warehouseId: number): Promise<any[]> { return []; }
  async createRecurringOrder(order: any): Promise<any> { throw new Error("Not implemented"); }
  async updateRecurringOrder(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteRecurringOrder(id: number): Promise<void> { throw new Error("Not implemented"); }
  
  async getRecurringOrderItems(recurringOrderId: number): Promise<any[]> { return []; }
  async createRecurringOrderItem(item: any): Promise<any> { throw new Error("Not implemented"); }
  async updateRecurringOrderItem(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteRecurringOrderItem(id: number): Promise<void> { throw new Error("Not implemented"); }
  
  async getProductForecasts(): Promise<any[]> { return []; }
  async getProductForecastById(id: number): Promise<any | undefined> { return undefined; }
  async getProductForecastsByProduct(productId: number): Promise<any[]> { return []; }
  async getProductForecastsByMachine(machineId: number): Promise<any[]> { return []; }
  async createProductForecast(forecast: any): Promise<any> { throw new Error("Not implemented"); }
  async updateProductForecast(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteProductForecast(id: number): Promise<void> { throw new Error("Not implemented"); }
  
  async getVendonProducts(): Promise<any[]> { return []; }
  async getVendonProductById(id: number): Promise<any | undefined> { return undefined; }
  async getVendonProductByVendonId(vendonId: string): Promise<any | undefined> { return undefined; }
  async createVendonProduct(product: any): Promise<any> { throw new Error("Not implemented"); }
  async updateVendonProduct(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteVendonProduct(id: number): Promise<void> { throw new Error("Not implemented"); }
  
  async getEvents(): Promise<any[]> { 
    try {
      return await db.select().from(events).orderBy(desc(events.updatedAt));
    } catch (error) {
      console.error("Error fetching events:", error);
      return [];
    }
  }
  
  async getEventById(id: number): Promise<any | undefined> { 
    try {
      const result = await db.select().from(events).where(eq(events.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error fetching event by ID:", error);
      return undefined;
    }
  }
  
  async getEventByVendonId(vendonId: string): Promise<any | undefined> {
    try {
      const result = await db.select().from(events).where(eq(events.vendonId, vendonId)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error fetching event by Vendon ID:", error);
      return undefined;
    }
  }
  
  async getEventsByMachine(machineId: number): Promise<any[]> { 
    try {
      return await db.select().from(events).where(eq(events.machineId, machineId)).orderBy(desc(events.updatedAt));
    } catch (error) {
      console.error("Error fetching events by machine:", error);
      return [];
    }
  }
  
  async createEvent(event: any): Promise<any> { 
    try {
      const result = await db.insert(events).values(event).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating event:", error);
      throw error;
    }
  }
  
  async updateEvent(id: number, updates: any): Promise<any> { 
    try {
      const result = await db.update(events).set(updates).where(eq(events.id, id)).returning();
      return result[0];
    } catch (error) {
      console.error("Error updating event:", error);
      throw error;
    }
  }
  
  async deleteEvent(id: number): Promise<void> { 
    try {
      await db.delete(events).where(eq(events.id, id));
    } catch (error) {
      console.error("Error deleting event:", error);
      throw error;
    }
  }
  
  async getWarehouseOperators(): Promise<any[]> { return []; }
  async getWarehouseOperatorById(id: number): Promise<any | undefined> { return undefined; }
  async getWarehouseOperatorsByWarehouse(warehouseId: number): Promise<any[]> { return []; }
  async createWarehouseOperator(operator: any): Promise<any> { throw new Error("Not implemented"); }
  async updateWarehouseOperator(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteWarehouseOperator(id: number): Promise<void> { throw new Error("Not implemented"); }
  
  async getLocationCosts(): Promise<any[]> { return []; }
  async getLocationCostById(id: number): Promise<any | undefined> { return undefined; }
  async getLocationCostsByLocation(locationId: number): Promise<any[]> { return []; }
  async createLocationCost(cost: any): Promise<any> { throw new Error("Not implemented"); }
  async updateLocationCost(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteLocationCost(id: number): Promise<void> { throw new Error("Not implemented"); }
  
  async getUserSessions(): Promise<any[]> { return []; }
  async getUserSessionById(id: string): Promise<any | undefined> { return undefined; }
  async getUserSessionsByUser(userId: number): Promise<any[]> { return []; }
  async createUserSession(session: any): Promise<any> { throw new Error("Not implemented"); }
  async updateUserSession(id: string, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteUserSession(id: string): Promise<void> { throw new Error("Not implemented"); }

  // Page Permissions operations
  async getPagePermissions(): Promise<PagePermission[]> {
    try {
      return await db.select().from(pagePermissions).orderBy(pagePermissions.pageTitle);
    } catch (error) {
      console.error("Error fetching page permissions:", error);
      return [];
    }
  }

  async getPagePermission(pageId: string): Promise<PagePermission | undefined> {
    try {
      const [permission] = await db.select().from(pagePermissions).where(eq(pagePermissions.pageId, pageId));
      return permission;
    } catch (error) {
      console.error("Error fetching page permission:", error);
      return undefined;
    }
  }

  async createPagePermission(permission: InsertPagePermission): Promise<PagePermission> {
    try {
      const [result] = await db.insert(pagePermissions).values(permission).returning();
      return result;
    } catch (error) {
      console.error("Error creating page permission:", error);
      throw error;
    }
  }

  async updatePagePermission(pageId: string, updates: Partial<PagePermission>): Promise<PagePermission> {
    try {
      const [result] = await db
        .update(pagePermissions)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(pagePermissions.pageId, pageId))
        .returning();
      return result;
    } catch (error) {
      console.error("Error updating page permission:", error);
      throw error;
    }
  }

  async deletePagePermission(pageId: string): Promise<boolean> {
    try {
      await db.delete(pagePermissions).where(eq(pagePermissions.pageId, pageId));
      return true;
    } catch (error) {
      console.error("Error deleting page permission:", error);
      return false;
    }
  }

  // Admin user seed function
  async ensureAdminUserExists(): Promise<User> {
    try {
      // Check if Admin user exists
      let adminUser = await this.getUserByUsername('Admin');
      
      if (!adminUser) {
        console.log('Creating default Admin user...');
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash('admin123', 10);
        
        adminUser = await this.createUser({
          username: 'Admin',
          email: 'admin@example.com',
          password: hashedPassword,
          role: 'admin',
          approved: true,
          approvedBy: null,
          approvedAt: new Date()
        });
        
        console.log('✅ Default Admin user created successfully');
      }
      
      return adminUser;
    } catch (error) {
      console.error("Error ensuring admin user exists:", error);
      throw error;
    }
  }
}