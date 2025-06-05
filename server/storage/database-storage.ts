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
  productMovements, type ProductMovement, type InsertProductMovement
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
    const [latestTransaction] = await db.select().from(transactions).orderBy(desc(transactions.updatedAt)).limit(1);
    
    // Machines count and latest
    const machineCountResult = await db.select({ count: count() }).from(machines);
    const [latestMachine] = await db.select().from(machines).orderBy(desc(machines.updatedAt)).limit(1);
    
    // Refills count and latest
    const refillCountResult = await db.select({ count: count() }).from(refills);
    const [latestRefill] = await db.select().from(refills).orderBy(desc(refills.updatedAt)).limit(1);
    
    // Refill details count and latest
    const refillDetailCountResult = await db.select({ count: count() }).from(refillDetails);
    const [latestRefillDetail] = await db.select().from(refillDetails).orderBy(desc(refillDetails.updatedAt)).limit(1);
    
    // Events count and latest
    const eventCountResult = await db.select({ count: count() }).from(events);
    const [latestEvent] = await db.select().from(events).orderBy(desc(events.updatedAt)).limit(1);
    
    // Products count and latest
    const productCountResult = await db.select({ count: count() }).from(products);
    const [latestProduct] = await db.select().from(products).orderBy(desc(products.updatedAt)).limit(1);
    
    // Stocks count and latest
    const stockCountResult = await db.select({ count: count() }).from(stocks);
    const [latestStock] = await db.select().from(stocks).orderBy(desc(stocks.updatedAt)).limit(1);
    
    // Machine stocks count and latest
    const machineStockCountResult = await db.select({ count: count() }).from(machineStocks);
    const [latestMachineStock] = await db.select().from(machineStocks).orderBy(desc(machineStocks.updatedAt)).limit(1);
    
    return {
      transactions: {
        count: parseInt(transactionCountResult[0]?.count?.toString() || '0'),
        latest: latestTransaction?.updatedAt || null
      },
      machines: {
        count: parseInt(machineCountResult[0]?.count?.toString() || '0'),
        latest: latestMachine?.updatedAt || null
      },
      refills: {
        count: parseInt(refillCountResult[0]?.count?.toString() || '0'),
        latest: latestRefill?.updatedAt || null
      },
      refillDetails: {
        count: parseInt(refillDetailCountResult[0]?.count?.toString() || '0'),
        latest: latestRefillDetail?.updatedAt || null
      },
      events: {
        count: parseInt(eventCountResult[0]?.count?.toString() || '0'),
        latest: latestEvent?.updatedAt || null
      },
      products: {
        count: parseInt(productCountResult[0]?.count?.toString() || '0'),
        latest: latestProduct?.updatedAt || null
      },
      stocks: {
        count: parseInt(stockCountResult[0]?.count?.toString() || '0'),
        latest: latestStock?.updatedAt || null
      },
      machineStocks: {
        count: parseInt(machineStockCountResult[0]?.count?.toString() || '0'),
        latest: latestMachineStock?.updatedAt || null
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
        (COUNT(DISTINCT date) * 100.0 / NULLIF(DATE_PART('day', MAX(date) - MIN(date)) + 1, 0)) as coverage_percentage,
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
}