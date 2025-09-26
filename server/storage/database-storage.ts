import { eq, desc, and, or, gte, lte, like, asc, count, sql, gt, ilike, isNull, isNotNull, inArray, between, ne, notLike } from "drizzle-orm";
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
  locationCosts, type LocationCost, type InsertLocationCost,
  suppliers, type Supplier, type InsertSupplier,
  warehouses, type Warehouse, type InsertWarehouse,
  inventoryItems, type InventoryItem, type InsertInventoryItem,
  inventoryBatches, type InventoryBatch, type InsertInventoryBatch,
  inventoryMovements, type InventoryMovement, type InsertInventoryMovement,
  inventoryCounts, type InventoryCount, type InsertInventoryCount,
  inventoryCountItems, type InventoryCountItem, type InsertInventoryCountItem,
  inventoryTransfers, type InventoryTransfer, type InsertInventoryTransfer,
  inventoryTransferItems, type InventoryTransferItem, type InsertInventoryTransferItem,
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
  pagePermissions, type PagePermission, type InsertPagePermission,
  machineDailyStats, type MachineDailyStats, type InsertMachineDailyStats,
  // Navigation Audit System tables
  navigationAuditSessions, navigationIssues, touchTargetMetrics, 
  scrollabilityTests, navigationFixes, auditPerformanceHistory
} from "@shared/schema";
import { IStorage, User as IUser, MachineDailyStats as IMachineDailyStats, Machine as IMachine } from "../storage";

// Type mapping functions to transform database schema types to interface types
function mapUserSchemaToInterface(dbUser: User): IUser {
  return {
    id: dbUser.id,
    username: dbUser.username,
    email: dbUser.email || '',
    role: dbUser.role || '',
    isApproved: dbUser.approved || false,
    createdAt: dbUser.createdAt || new Date(),
    lastLoginAt: undefined
  };
}

function mapMachineStatsSchemaToInterface(dbStats: MachineDailyStats): IMachineDailyStats {
  return {
    todayTransactions: dbStats.todayTransactions || 0,
    todayRevenue: dbStats.todayRevenue || 0,
    lastSale: dbStats.lastSaleDatetime ? {
      datetime: dbStats.lastSaleDatetime instanceof Date ? dbStats.lastSaleDatetime.toISOString() : dbStats.lastSaleDatetime,
      productName: dbStats.lastSaleProductName || undefined,
      amount: dbStats.lastSaleAmount || undefined
    } : null,
    lastCashlessSale: dbStats.lastCashlessSaleDatetime ? {
      datetime: dbStats.lastCashlessSaleDatetime instanceof Date ? dbStats.lastCashlessSaleDatetime.toISOString() : dbStats.lastCashlessSaleDatetime,
      productName: dbStats.lastCashlessSaleProductName || undefined,
      amount: dbStats.lastCashlessSaleAmount || undefined
    } : null,
    lastAlcoholSale: dbStats.lastAlcoholSaleDatetime ? {
      datetime: dbStats.lastAlcoholSaleDatetime instanceof Date ? dbStats.lastAlcoholSaleDatetime.toISOString() : dbStats.lastAlcoholSaleDatetime,
      productName: dbStats.lastAlcoholSaleProductName || undefined,
      amount: undefined // No amount field in schema for alcohol sales
    } : null,
    alcoholSales: {
      today: dbStats.alcoholTransactions || 0,
      weekAvg: dbStats.weeklyAvgTransactions || 0,
      monthAvg: dbStats.monthlyAvgTransactions || 0
    }
  };
}

function mapMachineSchemaToInterface(dbMachine: Machine): IMachine {
  return {
    id: dbMachine.id,
    vendonId: dbMachine.vendonId,
    name: dbMachine.machineName,
    location: dbMachine.locationId ? `Location ${dbMachine.locationId}` : undefined,
    warehouseId: undefined, // Not available in current schema
    isActive: dbMachine.status === 'active',
    lastMaintenance: undefined, // Not available in current schema
    notes: dbMachine.description || undefined,
    createdAt: dbMachine.createdAt || undefined,
    updatedAt: dbMachine.updatedAt || undefined
  };
}

function mapSupplierSchemaToInterface(dbSupplier: Supplier): import('../storage').Supplier {
  return {
    id: dbSupplier.id,
    name: dbSupplier.name,
    contactPerson: dbSupplier.contactPerson || undefined,
    email: dbSupplier.email || undefined,
    phone: dbSupplier.phone || undefined,
    address: dbSupplier.address || undefined,
    city: dbSupplier.city || undefined,
    postalCode: dbSupplier.postalCode || undefined,
    country: dbSupplier.country || undefined,
    notes: dbSupplier.notes || undefined,
    isActive: dbSupplier.status === 'active',
    createdAt: dbSupplier.createdAt || undefined,
    updatedAt: dbSupplier.updatedAt || undefined,
    showPricesInOrders: dbSupplier.showPricesInOrders || false
  };
}

function mapPurchaseConditionSchemaToInterface(dbCondition: PurchaseCondition): import('../storage').PurchaseCondition {
  return {
    id: dbCondition.id,
    supplierId: dbCondition.supplierId,
    productId: dbCondition.productId || undefined,
    packageTypeId: dbCondition.packagingQuantity || undefined,
    unitPrice: dbCondition.unitPrice,
    currency: 'EUR', // Default currency since not stored in current schema
    minQuantity: dbCondition.minQuantity || undefined,
    maxQuantity: undefined, // Not available in current schema
    validFrom: dbCondition.validFrom || undefined,
    validUntil: dbCondition.validTo || undefined,
    leadTime: dbCondition.leadTime || undefined,
    paymentTerms: undefined, // Not available in current schema
    discountType: undefined, // Not available in current schema  
    discountValue: undefined, // Not available in current schema
    depositPerUnit: dbCondition.depositPerUnit || undefined,
    minQuantityUnit: dbCondition.minQuantityUnit || undefined,
    isActive: true, // Default to active since not stored in current schema
    notes: dbCondition.notes || undefined,
    createdAt: dbCondition.createdAt || undefined,
    updatedAt: dbCondition.updatedAt || undefined
  };
}

/**
 * DatabaseStorage class that implements the IStorage interface
 * with PostgreSQL using the Neon database connection
 */
export class DatabaseStorage implements IStorage {
  // Expose drizzle instance for services that need direct access
  public readonly drizzle = db;
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
      const result = await rawDb.query(sqlText, params);
      return {
        rows: result.rows || [],
        rowCount: result.rowCount || 0
      };
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
        latest: latestMachine?.createdAt || null
      },
      refills: {
        count: parseInt(refillCountResult[0]?.count?.toString() || '0'),
        latest: latestRefill?.datetime || null
      },
      refillDetails: {
        count: parseInt(refillDetailCountResult[0]?.count?.toString() || '0'),
        latest: latestRefillDetail?.createdAt || null
      },
      events: {
        count: parseInt(eventCountResult[0]?.count?.toString() || '0'),
        latest: latestEvent?.datetime || null
      },
      products: {
        count: parseInt(productCountResult[0]?.count?.toString() || '0'),
        latest: latestProduct?.createdAt || null
      },
      stocks: {
        count: parseInt(stockCountResult[0]?.count?.toString() || '0'),
        latest: latestStock?.createdAt || null
      },
      machineStocks: {
        count: parseInt(machineStockCountResult[0]?.count?.toString() || '0'),
        latest: latestMachineStock?.createdAt || null
      }
    };
  }

  // User operations
  async getUserById(id: number): Promise<IUser | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user ? mapUserSchemaToInterface(user) : undefined;
  }

  async getUser(id: number): Promise<IUser | undefined> {
    return this.getUserById(id);
  }

  async getUserByUsername(username: string): Promise<IUser | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user ? mapUserSchemaToInterface(user) : undefined;
  }

  async getUserByEmail(email: string): Promise<IUser | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user ? mapUserSchemaToInterface(user) : undefined;
  }

  async createUser(user: Omit<IUser, 'id' | 'createdAt' | 'lastLoginAt'>): Promise<IUser> {
    const insertUser: InsertUser = {
      username: user.username,
      email: user.email || null,
      password: '', // This will need to be set by the caller
      role: user.role || null
    };
    
    // Insert user with basic data, then update approved status if needed
    const [newUser] = await db.insert(users).values(insertUser).returning();
    
    // If approved status needs to be set, update it separately
    if (user.isApproved) {
      await db.update(users)
        .set({ approved: user.isApproved })
        .where(eq(users.id, newUser.id));
      newUser.approved = user.isApproved;
    }
    
    return mapUserSchemaToInterface(newUser);
  }

  async getUsers(): Promise<IUser[]> {
    const dbUsers = await db.select().from(users).orderBy(desc(users.createdAt));
    return dbUsers.map(mapUserSchemaToInterface);
  }

  async listUsers(): Promise<IUser[]> {
    return this.getUsers();
  }

  async updateUser(id: number, updates: Partial<IUser>): Promise<IUser> {
    // Transform interface updates to database schema updates
    const updateData: any = {};
    if (updates.username !== undefined) updateData.username = updates.username;
    if (updates.email !== undefined) updateData.email = updates.email;
    if (updates.role !== undefined) updateData.role = updates.role;
    if (updates.isApproved !== undefined) updateData.approved = updates.isApproved;
    
    const [updatedUser] = await db.update(users)
      .set({
        ...updateData,
        updatedAt: new Date()
      })
      .where(eq(users.id, id))
      .returning();
    
    if (!updatedUser) {
      throw new Error(`User with ID ${id} not found`);
    }
    
    return mapUserSchemaToInterface(updatedUser);
  }

  async deleteUser(id: number): Promise<void> {
    try {
      await db.delete(users).where(eq(users.id, id));
    } catch (error) {
      console.error(`Error deleting user with ID ${id}:`, error);
      throw error;
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
        ...updateData
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
    try {
      // Build query step by step to avoid Drizzle type issues
      const baseQuery = db.select().from(syncLogs);
      
      // Apply filters if provided
      let finalQuery = baseQuery;
      
      if (options?.syncType && options?.syncStatus) {
        finalQuery = baseQuery.where(and(
          eq(syncLogs.syncType, options.syncType),
          eq(syncLogs.syncStatus, options.syncStatus)
        ));
      } else if (options?.syncType) {
        finalQuery = baseQuery.where(eq(syncLogs.syncType, options.syncType));
      } else if (options?.syncStatus) {
        finalQuery = baseQuery.where(eq(syncLogs.syncStatus, options.syncStatus));
      }
      
      // Apply ordering and pagination
      finalQuery = finalQuery.orderBy(desc(syncLogs.startDate));
      
      if (options?.limit) {
        finalQuery = finalQuery.limit(options.limit);
      }
      
      if (options?.offset) {
        finalQuery = finalQuery.offset(options.offset);
      }
      
      return await finalQuery;
    } catch (error) {
      console.error("Error fetching sync logs:", error);
      return [];
    }
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
   * Get machines with optional limit - prioritize machines with recent activity
   */
  async getMachines(limit?: number): Promise<any[]> {
    try {
      // Always use optimized query with proper filtering (set default limit if not provided)
      const actualLimit = limit && limit > 0 ? limit : 25;
      if (true) {  // Always use Raw SQL query with proper filtering
        // Join with machine_daily_stats to get machines with recent activity
        const recentMachinesQuery = `
          SELECT m.*, 
            COALESCE(mds.today_transactions, 0) as today_transactions,
            COALESCE(mds.today_revenue, 0) as today_revenue,
            mds.last_sale_datetime,
            CASE WHEN COALESCE(mds.today_transactions, 0) > 0 THEN 0 ELSE 1 END as has_transactions
          FROM machines m
          LEFT JOIN machine_daily_stats mds ON m.id = mds.machine_id 
            AND mds.date = CURRENT_DATE
          WHERE m.id > 1  -- Exclude demo machine ID 1
            AND m.machine_name IS NOT NULL 
            AND m.machine_name != '' 
            AND m.machine_name NOT LIKE '%Demo%'
            AND m.machine_name NOT LIKE '%Test%'
            AND m.machine_name != 'Automat A1'
            AND m.machine_name != '*869951036618662'
          ORDER BY 
            has_transactions,
            today_revenue DESC,
            mds.last_sale_datetime DESC NULLS LAST,
            m.machine_name ASC
          LIMIT $1
        `;
        
        console.log('[getMachines] Using optimized query with machine_daily_stats, limit:', limit);
        const result = await rawDb.query(recentMachinesQuery, [limit]);
        
        console.log(`[getMachines] Query returned ${result.rows.length} machines`);
        if (result.rows.length > 0) {
          console.log(`[getMachines] First machine: ID ${result.rows[0].id}, transactions: ${result.rows[0].today_transactions}`);
        }
        
        return result.rows.map(row => ({
          id: row.id,
          vendonId: row.vendon_id,
          machineName: row.machine_name,
          machineType: row.machine_type,
          status: row.status,
          model: row.model,
          serialNumber: row.serial_number,
          telemetryUnitId: row.telemetry_unit_id,
          power: row.power,
          powerStatus: row.power_status,
          currency: row.currency,
          description: row.description,
          lastSync: row.last_sync,
          additionalData: row.additional_data,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          locationId: row.location_id,
          locationName: row.location_name,
          locationAddress: row.location_address,
          lastPing: row.last_ping,
          lastVend: row.last_vend,
          extraData: row.extra_data
        }));
      } else {
        // Return only real machines (exclude demo machines)
        const query = db.select().from(machines)
          .where(and(
            gt(machines.id, 1),  // Exclude demo machine ID 1 and below
            ne(machines.machineName, 'Automat A1'),
            ne(machines.machineName, '*869951036618662'),
            isNotNull(machines.machineName),
            ne(machines.machineName, ''),
            notLike(machines.machineName, '%Demo%'),
            notLike(machines.machineName, '%Test%')
          ))
          .orderBy(asc(machines.machineName))
          .limit(25);  // Limit to 25 real machines
        
        console.log('[getMachines] Using Drizzle query with filters');
        const result = await query;
        console.log(`[getMachines] Drizzle query returned ${result.length} machines`);
        if (result.length > 0) {
          console.log(`[getMachines] First machine: ID ${result[0].id}, name: ${result[0].machineName}`);
        }
        return result;
        return await query;
      }
    } catch (error) {
      console.error("Error fetching machines with stats:", error);
      // Fallback to simple query if complex one fails
      try {
        console.log('[getMachines] Falling back to simple query due to error');
        const query = db.select().from(machines)
          .where(and(
            gt(machines.id, 1),  // Exclude demo machine ID 1 and below
            ne(machines.machineName, 'Automat A1'),
            ne(machines.machineName, '*869951036618662'),
            isNotNull(machines.machineName),
            ne(machines.machineName, ''),
            notLike(machines.machineName, '%Demo%'),
            notLike(machines.machineName, '%Test%')
          ))
          .orderBy(asc(machines.machineName))
          .limit(limit || 25);  // Default to 25 real machines
        
        const result = await query;
        console.log(`[getMachines] Fallback query returned ${result.length} machines`);
        return result;
      } catch (fallbackError) {
        console.error("Fallback query also failed:", fallbackError);
        return [];
      }
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


  // Persistent Machine Daily Stats methods for efficient KPI display
  async getMachineDailyStats(machineId: number, date?: string): Promise<IMachineDailyStats | null> {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];
      
      const result = await db
        .select()
        .from(machineDailyStats)
        .where(and(
          eq(machineDailyStats.machineId, machineId),
          eq(machineDailyStats.date, targetDate)
        ))
        .limit(1);
      
      if (result.length === 0) {
        // If no persistent data exists, calculate and store it
        return await this.calculateAndStoreDailyStats(machineId, targetDate);
      }
      
      return mapMachineStatsSchemaToInterface(result[0]);
    } catch (error) {
      console.error("Error fetching machine daily stats:", error);
      return null;
    }
  }

  async getBulkMachineDailyStats(machineIds: number[], date?: string): Promise<IMachineDailyStats[]> {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];
      
      const result = await db
        .select()
        .from(machineDailyStats)
        .where(and(
          inArray(machineDailyStats.machineId, machineIds),
          eq(machineDailyStats.date, targetDate)
        ));
      
      // For missing machines, calculate and store stats
      const existingMachineIds = result.map(r => r.machineId);
      const missingMachineIds = machineIds.filter(id => !existingMachineIds.includes(id));
      
      for (const machineId of missingMachineIds) {
        const calculated = await this.calculateAndStoreDailyStats(machineId, targetDate);
        if (calculated) {
          // Add the calculated stats as interface type
          const statsToAdd = {
            ...calculated,
            machineId, // Ensure we have machineId since calculated may be interface type
            date: targetDate // Ensure date field for mapping
          };
          // We need to construct a database record to add to result
          const fakeDbRecord: MachineDailyStats = {
            id: 0,
            machineId,
            date: targetDate,
            todayTransactions: calculated.todayTransactions,
            todayRevenue: calculated.todayRevenue,
            todayProfit: 0,
            lastSaleDatetime: calculated.lastSale?.datetime ? new Date(calculated.lastSale.datetime) : null,
            lastSaleProductName: calculated.lastSale?.productName || null,
            lastSaleAmount: calculated.lastSale?.amount || null,
            lastCashlessSaleDatetime: calculated.lastCashlessSale?.datetime ? new Date(calculated.lastCashlessSale.datetime) : null,
            lastCashlessSaleProductName: calculated.lastCashlessSale?.productName || null,
            lastCashlessSaleAmount: calculated.lastCashlessSale?.amount || null,
            cashlessTransactions: 0,
            cashlessRevenue: 0,
            alcoholRevenue: 0,
            lastAlcoholSaleDatetime: calculated.lastAlcoholSale?.datetime ? new Date(calculated.lastAlcoholSale.datetime) : null,
            lastAlcoholSaleProductName: calculated.lastAlcoholSale?.productName || null,
            weeklyAvgTransactions: 0,
            weeklyAvgRevenue: 0,
            monthlyAvgTransactions: 0,
            monthlyAvgRevenue: 0,
            alcoholTransactions: calculated.alcoholSales?.today || 0,
            weekAvgAlcoholSales: calculated.alcoholSales?.weekAvg || null,
            monthAvgAlcoholSales: calculated.alcoholSales?.monthAvg || null,
            lastSaleTime: calculated.lastSale?.datetime || null,
            lastProductName: calculated.lastSale?.productName || null,
            lastAmount: calculated.lastSale?.amount || null,
            lastCashlessTime: calculated.lastCashlessSale?.datetime || null,
            lastCashlessProduct: calculated.lastCashlessSale?.productName || null,
            lastCashlessAmount: calculated.lastCashlessSale?.amount || null,
            lastAlcoholTime: calculated.lastAlcoholSale?.datetime || null,
            lastAlcoholProduct: calculated.lastAlcoholSale?.productName || null,
            cashlessStatus: null,
            alcoholStatus: null,
            calculationSource: null,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          result.push(fakeDbRecord);
        }
      }
      
      return result.map(mapMachineStatsSchemaToInterface);
    } catch (error) {
      console.error("Error fetching bulk machine daily stats:", error);
      return [];
    }
  }

  async upsertMachineDailyStats(stats: InsertMachineDailyStats): Promise<IMachineDailyStats> {
    try {
      const result = await db
        .insert(machineDailyStats)
        .values({
          ...stats,
          updatedAt: sql`NOW()`
        })
        .onConflictDoUpdate({
          target: [machineDailyStats.machineId, machineDailyStats.date],
          set: {
            ...stats,
            updatedAt: sql`NOW()`
          }
        })
        .returning();
      
      return mapMachineStatsSchemaToInterface(result[0]);
    } catch (error) {
      console.error("Error upserting machine daily stats:", error);
      throw error;
    }
  }

  async calculateAndStoreDailyStats(machineId: number, date: string): Promise<IMachineDailyStats> {
    try {
      const startDate = new Date(date + 'T00:00:00.000Z');
      const endDate = new Date(date + 'T23:59:59.999Z');
      
      // Calculate daily metrics using real transaction data
      const dailyStatsQuery = `
        SELECT 
          COUNT(*) as transaction_count,
          COALESCE(SUM(price), 0) as total_revenue,
          COALESCE(SUM(price * 0.7), 0) as total_profit,  -- Estimate 30% margin since net_result doesn't exist
          COUNT(CASE WHEN payment_method IN ('CASHLESS', 'CARD', 'MOBILE', 'CONTACTLESS', 'NFC', 'QR') THEN 1 END) as cashless_count,
          COALESCE(SUM(CASE WHEN payment_method IN ('CASHLESS', 'CARD', 'MOBILE', 'CONTACTLESS', 'NFC', 'QR') THEN price ELSE 0 END), 0) as cashless_revenue,
          COUNT(CASE WHEN LOWER(product_name) LIKE '%bier%' OR LOWER(product_name) LIKE '%wine%' OR LOWER(product_name) LIKE '%alcohol%' THEN 1 END) as alcohol_count,
          COALESCE(SUM(CASE WHEN LOWER(product_name) LIKE '%bier%' OR LOWER(product_name) LIKE '%wine%' OR LOWER(product_name) LIKE '%alcohol%' THEN price ELSE 0 END), 0) as alcohol_revenue
        FROM transactions 
        WHERE machine_id = $1 AND datetime >= $2 AND datetime <= $3
      `;
      
      const dailyStats = await rawDb.query(dailyStatsQuery, [machineId, startDate.toISOString(), endDate.toISOString()]);
      
      // Get last sale information
      const lastSaleQuery = `
        SELECT datetime, product_name, price
        FROM transactions 
        WHERE machine_id = $1 
        ORDER BY datetime DESC 
        LIMIT 1
      `;
      
      const lastSale = await rawDb.query(lastSaleQuery, [machineId]);
      
      // Get last cashless sale (PROBLEM 2 BEHOBEN: Alle bargeldlosen Methoden)
      const lastCashlessSaleQuery = `
        SELECT datetime, product_name, price, payment_method
        FROM transactions 
        WHERE machine_id = $1 AND payment_method IN ('CASHLESS', 'CARD', 'MOBILE', 'CONTACTLESS', 'NFC', 'QR')
        ORDER BY datetime DESC 
        LIMIT 1
      `;
      
      const lastCashlessSale = await rawDb.query(lastCashlessSaleQuery, [machineId]);
      
      // Get last alcohol sale
      const lastAlcoholSaleQuery = `
        SELECT datetime, product_name
        FROM transactions 
        WHERE machine_id = $1 
          AND (LOWER(product_name) LIKE '%bier%' OR LOWER(product_name) LIKE '%wine%' OR LOWER(product_name) LIKE '%alcohol%')
        ORDER BY datetime DESC 
        LIMIT 1
      `;
      
      const lastAlcoholSale = await rawDb.query(lastAlcoholSaleQuery, [machineId]);
      
      // Calculate weekly and monthly averages
      const weekStart = new Date(startDate);
      weekStart.setDate(weekStart.getDate() - 7);
      
      const monthStart = new Date(startDate);
      monthStart.setMonth(monthStart.getMonth() - 1);
      
      const avgQuery = `
        SELECT 
          (SELECT COUNT(*) / 7.0 FROM transactions WHERE machine_id = $1 AND datetime >= $2 AND datetime < $3) as weekly_avg_transactions,
          (SELECT COALESCE(SUM(price), 0) / 7.0 FROM transactions WHERE machine_id = $1 AND datetime >= $2 AND datetime < $3) as weekly_avg_revenue,
          (SELECT COUNT(*) / 30.0 FROM transactions WHERE machine_id = $1 AND datetime >= $4 AND datetime < $3) as monthly_avg_transactions,
          (SELECT COALESCE(SUM(price), 0) / 30.0 FROM transactions WHERE machine_id = $1 AND datetime >= $4 AND datetime < $3) as monthly_avg_revenue
      `;
      
      const avgStats = await rawDb.query(avgQuery, [machineId, weekStart.toISOString(), startDate.toISOString(), monthStart.toISOString()]);
      
      const daily = dailyStats.rows[0];
      const last = lastSale.rows[0];
      const lastCashless = lastCashlessSale.rows[0];
      const lastAlcohol = lastAlcoholSale.rows[0];
      const avg = avgStats.rows[0];
      
      const statsData: InsertMachineDailyStats = {
        machineId,
        date,
        todayTransactions: parseInt(daily?.transaction_count || 0),
        todayRevenue: parseFloat(daily?.total_revenue || 0),
        todayProfit: parseFloat(daily?.total_profit || 0),
        lastSaleDatetime: last?.datetime || null,
        lastSaleProductName: last?.product_name || null,
        lastSaleAmount: parseFloat(last?.price || 0),
        lastCashlessSaleDatetime: lastCashless?.datetime || null,
        lastCashlessSaleProductName: lastCashless?.product_name || null,
        lastCashlessSaleAmount: parseFloat(lastCashless?.price || 0),
        cashlessTransactions: parseInt(daily?.cashless_count || 0),
        cashlessRevenue: parseFloat(daily?.cashless_revenue || 0),
        alcoholTransactions: parseInt(daily?.alcohol_count || 0),
        alcoholRevenue: parseFloat(daily?.alcohol_revenue || 0),
        lastAlcoholSaleDatetime: lastAlcohol?.datetime || null,
        lastAlcoholSaleProductName: lastAlcohol?.product_name || null,
        weeklyAvgTransactions: parseFloat(avg?.weekly_avg_transactions || 0),
        weeklyAvgRevenue: parseFloat(avg?.weekly_avg_revenue || 0),
        monthlyAvgTransactions: parseFloat(avg?.monthly_avg_transactions || 0),
        monthlyAvgRevenue: parseFloat(avg?.monthly_avg_revenue || 0),
        cashlessStatus: 'ok', // Can be enhanced with business logic
        alcoholStatus: 'ok',  // Can be enhanced with business logic
        calculationSource: 'batch'
      };
      
      const dbResult = await this.upsertMachineDailyStats(statsData);
      return dbResult; // upsertMachineDailyStats now returns IMachineDailyStats
    } catch (error) {
      console.error("Error calculating and storing daily stats:", error);
      throw error;
    }
  }

  /**
   * Create machine
   */
  async createMachine(machine: Omit<Machine, 'id' | 'createdAt' | 'updatedAt'>): Promise<Machine> {
    try {
      const now = new Date();
      const result = await db.insert(machines).values({
        ...machine,
        createdAt: now,
        updatedAt: now
      }).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating machine:", error);
      throw error;
    }
  }

  /**
   * Update machine
   */
  async updateMachine(id: number, updates: Partial<Machine>): Promise<Machine> {
    try {
      const result = await db.update(machines).set({
        ...updates,
        updatedAt: new Date()
      }).where(eq(machines.id, id)).returning();
      
      if (!result[0]) {
        throw new Error(`Machine with ID ${id} not found`);
      }
      
      return result[0];
    } catch (error) {
      console.error("Error updating machine:", error);
      throw error;
    }
  }

  /**
   * Delete machine
   */
  async deleteMachine(id: number): Promise<void> {
    try {
      const result = await db.delete(machines).where(eq(machines.id, id)).returning();
      
      if (!result[0]) {
        throw new Error(`Machine with ID ${id} not found`);
      }
    } catch (error) {
      console.error("Error deleting machine:", error);
      throw error;
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


  // Core stub methods for IStorage interface compatibility (removed duplicate implementations)
  
  async getProducts(): Promise<any[]> { return []; }
  async getProductById(id: number): Promise<any | undefined> { return undefined; }
  async getProductByVendonId(vendonId: string): Promise<any | undefined> { return undefined; }
  async createProduct(product: any): Promise<any> { throw new Error("Not implemented"); }
  async updateProduct(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteProduct(id: number): Promise<void> { throw new Error("Not implemented"); }
  
  async getSuppliers(): Promise<any[]> { return []; }
  async getSupplierById(id: number): Promise<any | undefined> { return undefined; }
  async createSupplier(supplier: InsertSupplier): Promise<Supplier> {
    try {
      const [newSupplier] = await db.insert(suppliers).values(supplier).returning();
      return newSupplier;
    } catch (error) {
      console.error("Error creating supplier:", error);
      throw error;
    }
  }
  async updateSupplier(id: number, updates: any): Promise<any> {
    console.log(`[DatabaseStorage] Updating supplier ${id} with data:`, updates);
    
    try {
      const result = await db
        .update(suppliers)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(suppliers.id, id))
        .returning();
      
      if (result.length === 0) {
        throw new Error(`Supplier with ID ${id} not found`);
      }
      
      console.log(`[DatabaseStorage] Successfully updated supplier ${id}`);
      return result[0];
    } catch (error) {
      console.error(`[DatabaseStorage] Error updating supplier ${id}:`, error);
      throw error;
    }
  }
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
    // 🚨 EMERGENCY BATCH OPTIMIZATION: Prevent SQL query flood
    console.warn(`🚨 INEFFICIENT: getTransactionByVendonId(${vendonId}) - Should use batch method!`);
    
    // Use existing batch method for better performance
    const existingIds = await this.getExistingTransactionIds([vendonId]);
    if (existingIds.has(vendonId)) {
      // If exists, get the full record
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
    return undefined;
  }

  // Batch-Cache für Performance-Optimierung
  private _batchCache: Map<string, any> = new Map();

  /**
   * Effiziente Batch-Duplikatsprüfung für Transaktionen
   * Prüft alle vendon_ids auf einmal statt einzeln
   */
  async getExistingTransactionIds(vendonIds: string[]): Promise<Set<string>> {
    console.log(`🔍 Batch-Duplikatsprüfung für ${vendonIds.length} vendon_ids`);
    
    if (vendonIds.length === 0) {
      return new Set();
    }

    try {
      // Eine einzige SQL-Abfrage für alle vendon_ids
      const result = await db.select({ vendonId: transactions.vendonId })
        .from(transactions)
        .where(inArray(transactions.vendonId, vendonIds));
      
      const existingIds = new Set(result.map(row => row.vendonId));
      console.log(`✅ Gefunden: ${existingIds.size}/${vendonIds.length} bereits existierende Transaktionen`);
      
      return existingIds;
    } catch (error) {
      console.error("Fehler bei Batch-Duplikatsprüfung:", error);
      return new Set();
    }
  }

  /**
   * Batch-Insertion für neue Transaktionen
   * Reduziert die Anzahl der Datenbankverbindungen erheblich
   */
  async createTransactionsBatch(transactionList: any[]): Promise<any[]> {
    console.log(`📦 Batch-Insertion für ${transactionList.length} Transaktionen`);
    
    if (transactionList.length === 0) {
      return [];
    }

    try {
      // Use raw SQL for batch insertion to avoid schema mismatch issues
      // Build VALUES clause for multiple transactions
      const values: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      for (const transaction of transactionList) {
        values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8})`);
        params.push(
          transaction.vendonId,
          transaction.machineId,
          transaction.machineName || 'Unbekannt',
          transaction.datetime,
          transaction.productName || 'Unbekanntes Produkt',
          transaction.price || 0,
          transaction.quantity || 1,
          transaction.source || 'vendon',
          transaction.extraData || null
        );
        paramIndex += 9;
      }

      const sql = `
        INSERT INTO transactions (
          vendon_id, machine_id, machine_name, datetime, 
          product_name, price, quantity, source, extra_data
        ) VALUES ${values.join(', ')}
        RETURNING id, vendon_id, machine_id, machine_name, datetime, 
                  product_name, price, quantity, source
      `;

      const result = await rawDb.query(sql, params);
      
      console.log(`✅ ${result.rows.length} neue Transaktionen erfolgreich eingefügt`);
      return result.rows;
    } catch (error) {
      console.error("Fehler bei Batch-Insertion:", error);
      throw error;
    }
  }
  async createTransaction(transaction: any): Promise<any> {
    // ✅ INSERT ... ON CONFLICT um UNIQUE CONSTRAINT Fehler zu vermeiden
    console.log(`💾 INSERT Transaction ${transaction.vendonId} mit ON CONFLICT Handling`);
    
    const result = await rawDb.query(`
      INSERT INTO transactions (
        vendon_id, machine_id, machine_name, datetime, 
        product_name, price, quantity, source, extra_data,
        payment_method, status, currency, vat, price_vat, price_wo_vat
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (vendon_id, machine_id, datetime) DO UPDATE SET
        machine_id = EXCLUDED.machine_id,
        machine_name = EXCLUDED.machine_name,
        datetime = EXCLUDED.datetime,
        product_name = EXCLUDED.product_name,
        price = EXCLUDED.price,
        quantity = EXCLUDED.quantity,
        payment_method = EXCLUDED.payment_method,
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING id, vendon_id, machine_id, machine_name, datetime, 
                product_name, price, quantity, source, payment_method, status
    `, [
      transaction.vendonId,
      transaction.machineId, 
      transaction.machineName,
      transaction.datetime,
      transaction.productName,
      transaction.price,
      transaction.quantity,
      transaction.source,
      transaction.extraData || null,
      transaction.paymentMethod || null,
      transaction.status || 'completed',
      transaction.currency || 'EUR',
      transaction.vat || null,
      transaction.priceVat || null,
      transaction.priceWoVat || null
    ]);
    return result.rows[0];
  }
  async updateTransaction(id: number, updates: any): Promise<any> { throw new Error("Not implemented"); }
  async deleteTransaction(id: number): Promise<void> { throw new Error("Not implemented"); }
  async getTransactionsByMachine(machineId: number): Promise<any[]> { return []; }
  async getTransactionsByDateRange(startDate: Date, endDate: Date): Promise<any[]> { return []; }

  /**
   * Upsert transaction with composite unique constraint (machine_id, vendon_id)
   * For idempotent historical backfill according to specification
   */
  async upsertTransaction(transaction: any): Promise<any> {
    console.log(`🔄 UPSERT Transaction ${transaction.vendonId} für Maschine ${transaction.machineId}`);
    
    try {
      const result = await rawDb.query(`
        INSERT INTO transactions (
          vendon_id, machine_id, machine_name, datetime, 
          product_name, price, quantity, source, extra_data,
          payment_method, status, currency, vat, price_vat, price_wo_vat,
          updated_at, transaction_dt, registered_dt, product_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (vendon_id, machine_id, datetime) DO UPDATE SET
          machine_name = EXCLUDED.machine_name,
          datetime = EXCLUDED.datetime,
          product_name = EXCLUDED.product_name,
          price = EXCLUDED.price,
          quantity = EXCLUDED.quantity,
          payment_method = EXCLUDED.payment_method,
          status = EXCLUDED.status,
          currency = EXCLUDED.currency,
          vat = EXCLUDED.vat,
          price_vat = EXCLUDED.price_vat,
          price_wo_vat = EXCLUDED.price_wo_vat,
          updated_at = EXCLUDED.updated_at,
          transaction_dt = EXCLUDED.transaction_dt,
          registered_dt = EXCLUDED.registered_dt,
          product_id = EXCLUDED.product_id
        RETURNING id, vendon_id, machine_id, machine_name, datetime, 
                  product_name, price, quantity, source, payment_method, status, updated_at
      `, [
        transaction.vendonId,
        transaction.machineId, 
        transaction.machineName,
        transaction.datetime,
        transaction.productName,
        transaction.price,
        transaction.quantity,
        transaction.source || 'vendon',
        transaction.extraData || null,
        transaction.paymentMethod || null,
        transaction.status || 'completed',
        transaction.currency || 'EUR',
        transaction.vat || null,
        transaction.priceVat || null,
        transaction.priceWoVat || null,
        transaction.updatedAt || new Date(),
        transaction.transactionDt || null,
        transaction.registeredDt || null,
        transaction.productId || null
      ]);
      
      return result.rows[0];
    } catch (error) {
      console.error(`Fehler beim Upsert der Transaktion ${transaction.vendonId}:`, error);
      throw error;
    }
  }

  /**
   * Batch upsert for multiple transactions with composite unique constraint
   * Optimized for historical backfill performance
   */
  async upsertTransactionsBatch(transactionList: any[]): Promise<any[]> {
    console.log(`📦 Batch-UPSERT für ${transactionList.length} Transaktionen`);
    
    if (transactionList.length === 0) {
      return [];
    }

    try {
      const values: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      for (const transaction of transactionList) {
        values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10}, $${paramIndex + 11}, $${paramIndex + 12}, $${paramIndex + 13}, $${paramIndex + 14}, $${paramIndex + 15}, $${paramIndex + 16}, $${paramIndex + 17}, $${paramIndex + 18})`);
        
        params.push(
          transaction.vendonId,
          transaction.machineId,
          transaction.machineName,
          transaction.datetime,
          transaction.productName || 'Unbekanntes Produkt',
          transaction.price || 0,
          transaction.quantity || 1,
          transaction.source || 'vendon',
          transaction.extraData || null,
          transaction.paymentMethod || null,
          transaction.status || 'completed',
          transaction.currency || 'EUR',
          transaction.vat || null,
          transaction.priceVat || null,
          transaction.priceWoVat || null,
          transaction.updatedAt || new Date(),
          transaction.transactionDt || null,
          transaction.registeredDt || null,
          transaction.productId || null
        );
        paramIndex += 19;
      }

      const sql = `
        INSERT INTO transactions (
          vendon_id, machine_id, machine_name, datetime, 
          product_name, price, quantity, source, extra_data,
          payment_method, status, currency, vat, price_vat, price_wo_vat,
          updated_at, transaction_dt, registered_dt, product_id
        ) VALUES ${values.join(', ')}
        ON CONFLICT (vendon_id, machine_id, datetime) DO UPDATE SET
          machine_name = EXCLUDED.machine_name,
          datetime = EXCLUDED.datetime,
          product_name = EXCLUDED.product_name,
          price = EXCLUDED.price,
          quantity = EXCLUDED.quantity,
          payment_method = EXCLUDED.payment_method,
          status = EXCLUDED.status,
          currency = EXCLUDED.currency,
          vat = EXCLUDED.vat,
          price_vat = EXCLUDED.price_vat,
          price_wo_vat = EXCLUDED.price_wo_vat,
          updated_at = EXCLUDED.updated_at,
          transaction_dt = EXCLUDED.transaction_dt,
          registered_dt = EXCLUDED.registered_dt,
          product_id = EXCLUDED.product_id
        RETURNING id, vendon_id, machine_id, machine_name, datetime, 
                  product_name, price, quantity, source, payment_method, status, updated_at
      `;

      const result = await rawDb.query(sql, params);
      
      console.log(`✅ ${result.rows.length} Transaktionen erfolgreich upserted (${transactionList.length} versucht)`);
      return result.rows;
    } catch (error) {
      console.error("Fehler bei Batch-Upsert:", error);
      throw error;
    }
  }
  
  async getMachineByVendonId(vendonId: string): Promise<any | undefined> { 
    try {
      const result = await db.select().from(machines).where(eq(machines.vendonId, vendonId)).limit(1);
      return result[0];
    } catch (error) {
      console.error(`Error fetching machine by vendon_id ${vendonId}:`, error);
      return undefined;
    }
  }
  // Machine CRUD methods implemented above - removing duplicates
  
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
  
  
  async createRefill(refill: any): Promise<any> { 
    try {
      const result = await db.insert(refills).values(refill).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating refill:", error);
      throw error;
    }
  }

  /**
   * Batch-Methoden für Refills - Performance-Optimierung für Vendon-Sync
   */
  async getExistingRefillIds(vendonIds: string[]): Promise<Set<string>> {
    console.log(`🔍 Batch-Duplikatsprüfung für ${vendonIds.length} Refill vendon_ids`);
    
    if (vendonIds.length === 0) {
      return new Set();
    }

    try {
      const result = await db.select({ vendonId: refills.vendonId })
        .from(refills)
        .where(inArray(refills.vendonId, vendonIds));
      
      const existingIds = new Set(result.map(row => row.vendonId));
      console.log(`✅ Gefunden: ${existingIds.size}/${vendonIds.length} bereits existierende Refills`);
      
      return existingIds;
    } catch (error) {
      console.error("Fehler bei Batch-Duplikatsprüfung für Refills:", error);
      return new Set();
    }
  }

  async createRefillsBatch(refillList: any[]): Promise<any[]> {
    console.log(`📦 Batch-Insertion für ${refillList.length} Refills`);
    
    if (refillList.length === 0) {
      return [];
    }

    try {
      // Use raw SQL for batch insertion
      const values: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      for (const refill of refillList) {
        values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5})`);
        params.push(
          refill.vendonId,
          refill.machineId,
          refill.machineName || 'Unbekannt',
          refill.datetime,
          refill.refillNumber || null,
          refill.extraData || null
        );
        paramIndex += 6;
      }

      const sql = `
        INSERT INTO refills (
          vendon_id, machine_id, machine_name, datetime, 
          refill_number, extra_data
        ) VALUES ${values.join(', ')}
        ON CONFLICT (vendon_id, machine_id, datetime) DO UPDATE SET
          machine_id = EXCLUDED.machine_id,
          machine_name = EXCLUDED.machine_name,
          datetime = EXCLUDED.datetime,
          updated_at = NOW()
        RETURNING id, vendon_id, machine_id, machine_name, datetime
      `;

      const result = await rawDb.query(sql, params);
      
      console.log(`✅ ${result.rows.length} Refills erfolgreich verarbeitet`);
      return result.rows;
    } catch (error) {
      console.error("Fehler bei Batch-Insertion für Refills:", error);
      throw error;
    }
  }

  async getRefillsByVendonIds(vendonIds: string[]): Promise<any[]> {
    if (vendonIds.length === 0) {
      return [];
    }

    try {
      return await db.select()
        .from(refills)
        .where(inArray(refills.vendonId, vendonIds));
    } catch (error) {
      console.error("Fehler beim Abrufen von Refills nach Vendon-IDs:", error);
      return [];
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

  /**
   * Batch-Methoden für Events - Performance-Optimierung für Vendon-Sync
   */
  async getExistingEventIds(vendonIds: string[]): Promise<Set<string>> {
    console.log(`🔍 Batch-Duplikatsprüfung für ${vendonIds.length} Event vendon_ids`);
    
    if (vendonIds.length === 0) {
      return new Set();
    }

    try {
      const result = await db.select({ vendonId: events.vendonId })
        .from(events)
        .where(inArray(events.vendonId, vendonIds));
      
      const existingIds = new Set(result.map(row => row.vendonId));
      console.log(`✅ Gefunden: ${existingIds.size}/${vendonIds.length} bereits existierende Events`);
      
      return existingIds;
    } catch (error) {
      console.error("Fehler bei Batch-Duplikatsprüfung für Events:", error);
      return new Set();
    }
  }

  async createEventsBatch(eventList: any[]): Promise<any[]> {
    console.log(`📦 Batch-Insertion für ${eventList.length} Events`);
    
    if (eventList.length === 0) {
      return [];
    }

    try {
      // Use raw SQL for batch insertion
      const values: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      for (const event of eventList) {
        values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6})`);
        params.push(
          event.vendonId,
          event.machineId,
          event.machineName || 'Unbekannt',
          event.datetime,
          event.eventType || 'unknown',
          event.description || null,
          event.extraData || null
        );
        paramIndex += 7;
      }

      const sql = `
        INSERT INTO events (
          vendon_id, machine_id, machine_name, datetime, 
          event_type, description, extra_data
        ) VALUES ${values.join(', ')}
        ON CONFLICT (vendon_id, machine_id, datetime) DO UPDATE SET
          machine_id = EXCLUDED.machine_id,
          machine_name = EXCLUDED.machine_name,
          datetime = EXCLUDED.datetime,
          event_type = EXCLUDED.event_type,
          description = EXCLUDED.description,
          updated_at = NOW()
        RETURNING id, vendon_id, machine_id, machine_name, datetime, event_type
      `;

      const result = await rawDb.query(sql, params);
      
      console.log(`✅ ${result.rows.length} Events erfolgreich verarbeitet`);
      return result.rows;
    } catch (error) {
      console.error("Fehler bei Batch-Insertion für Events:", error);
      throw error;
    }
  }

  async getEventsByVendonIds(vendonIds: string[]): Promise<any[]> {
    if (vendonIds.length === 0) {
      return [];
    }

    try {
      return await db.select()
        .from(events)
        .where(inArray(events.vendonId, vendonIds));
    } catch (error) {
      console.error("Fehler beim Abrufen von Events nach Vendon-IDs:", error);
      return [];
    }
  }

  async getTransactionsByVendonIds(vendonIds: string[]): Promise<any[]> {
    if (vendonIds.length === 0) {
      return [];
    }

    try {
      return await db.select()
        .from(transactions)
        .where(inArray(transactions.vendonId, vendonIds));
    } catch (error) {
      console.error("Fehler beim Abrufen von Transaktionen nach Vendon-IDs:", error);
      return [];
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

  // SECURITY HARDENED: No automatic admin creation
  // Admin users must be created manually with secure credentials
  async ensureAdminUserExists(): Promise<User> {
    try {
      // Check if any admin user exists
      const adminUser = await this.getUserByUsername('Admin');
      
      if (!adminUser) {
        console.warn('⚠️ No admin user found. Admin users must be created manually for security.');
        console.warn('⚠️ Use the user management interface or database tools to create admin accounts.');
        throw new Error('No admin user available. Manual admin creation required.');
      }
      
      return adminUser;
    } catch (error) {
      console.error("Error checking admin user:", error);
      throw error;
    }
  }

  // 🚀 FEHLENDE METHODEN FÜR LAGERABGLEICH

  // Legacy alias for backwards compatibility
  async getWarehouse(id: number): Promise<Warehouse | undefined> {
    return this.getWarehouseById(id);
  }

  // Machine-Warehouse Assignment operations
  async getMachineWarehouseAssignments(): Promise<MachineWarehouseAssignment[]> {
    const result = await db.select().from(machineWarehouseAssignments).orderBy(desc(machineWarehouseAssignments.createdAt));
    return result;
  }

  async getMachineWarehouseAssignmentsByWarehouse(warehouseId: number): Promise<MachineWarehouseAssignment[]> {
    const result = await db.select()
      .from(machineWarehouseAssignments)
      .where(eq(machineWarehouseAssignments.warehouseId, warehouseId))
      .orderBy(desc(machineWarehouseAssignments.createdAt));
    return result;
  }

  async getMachineWarehouseAssignmentByMachine(machineId: number): Promise<MachineWarehouseAssignment | undefined> {
    const result = await db.select()
      .from(machineWarehouseAssignments)
      .where(eq(machineWarehouseAssignments.machineId, machineId))
      .limit(1);
    return result[0];
  }

  async createMachineWarehouseAssignment(assignment: InsertMachineWarehouseAssignment): Promise<MachineWarehouseAssignment> {
    const result = await db.insert(machineWarehouseAssignments).values(assignment).returning();
    return result[0];
  }

  async updateMachineWarehouseAssignment(id: number, updates: Partial<MachineWarehouseAssignment>): Promise<MachineWarehouseAssignment> {
    const result = await db.update(machineWarehouseAssignments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(machineWarehouseAssignments.id, id))
      .returning();
    return result[0];
  }

  async deleteMachineWarehouseAssignment(id: number): Promise<void> {
    await db.delete(machineWarehouseAssignments).where(eq(machineWarehouseAssignments.id, id));
  }

  // 🚀 INVENTORY TRANSFER OPERATIONS
  async getInventoryTransfers(filter?: Record<string, any>): Promise<any[]> {
    try {
      console.log('[STORAGE] Getting inventory transfers with filter:', filter);
      const query = db.select().from(inventoryTransfers);
      
      if (filter?.status) {
        query.where(eq(inventoryTransfers.status, filter.status));
      }
      if (filter?.warehouseId) {
        query.where(or(
          eq(inventoryTransfers.sourceWarehouseId, parseInt(filter.warehouseId)),
          eq(inventoryTransfers.targetWarehouseId, parseInt(filter.warehouseId))
        ));
      }
      
      const result = await query.orderBy(desc(inventoryTransfers.createdAt));
      console.log(`[STORAGE] Found ${result.length} inventory transfers`);
      return result;
    } catch (error) {
      console.error('[STORAGE] Error getting inventory transfers:', error);
      throw error;
    }
  }

  async getInventoryTransferById(id: number): Promise<any | undefined> {
    try {
      console.log('[STORAGE] Getting inventory transfer by ID:', id);
      const result = await db.select().from(inventoryTransfers).where(eq(inventoryTransfers.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error getting inventory transfer by ID:', error);
      throw error;
    }
  }

  async createInventoryTransfer(transfer: any): Promise<any> {
    try {
      console.log('[STORAGE] Creating inventory transfer:', transfer);
      const result = await db.insert(inventoryTransfers).values({
        ...transfer,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      console.log('[STORAGE] Created inventory transfer:', result[0]);
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error creating inventory transfer:', error);
      throw error;
    }
  }

  async updateInventoryTransfer(id: number, updates: any): Promise<any> {
    try {
      console.log('[STORAGE] Updating inventory transfer:', id, updates);
      const result = await db.update(inventoryTransfers)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(inventoryTransfers.id, id))
        .returning();
      console.log('[STORAGE] Updated inventory transfer:', result[0]);
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error updating inventory transfer:', error);
      throw error;
    }
  }

  async deleteInventoryTransfer(id: number): Promise<void> {
    try {
      console.log('[STORAGE] Deleting inventory transfer:', id);
      // First delete all related items
      await db.delete(inventoryTransferItems).where(eq(inventoryTransferItems.transferId, id));
      // Then delete the transfer itself
      await db.delete(inventoryTransfers).where(eq(inventoryTransfers.id, id));
      console.log('[STORAGE] Deleted inventory transfer and items:', id);
    } catch (error) {
      console.error('[STORAGE] Error deleting inventory transfer:', error);
      throw error;
    }
  }

  async getInventoryTransferItems(filter: { transferId: number }): Promise<any[]> {
    try {
      console.log('[STORAGE] Getting inventory transfer items for transfer:', filter.transferId);
      const result = await db.select().from(inventoryTransferItems).where(eq(inventoryTransferItems.transferId, filter.transferId));
      console.log(`[STORAGE] Found ${result.length} inventory transfer items`);
      return result;
    } catch (error) {
      console.error('[STORAGE] Error getting inventory transfer items:', error);
      throw error;
    }
  }

  async createInventoryTransferItems(items: any[]): Promise<any[]> {
    try {
      console.log('[STORAGE] Creating inventory transfer items:', items.length);
      const result = await db.insert(inventoryTransferItems).values(
        items.map(item => ({
          ...item,
          createdAt: new Date(),
          updatedAt: new Date()
        }))
      ).returning();
      console.log(`[STORAGE] Created ${result.length} inventory transfer items`);
      return result;
    } catch (error) {
      console.error('[STORAGE] Error creating inventory transfer items:', error);
      throw error;
    }
  }

  // 🚀 INVENTORY UTILITIES
  async getInventoryItemByProductAndWarehouse(productId: number, warehouseId: number): Promise<any | undefined> {
    try {
      console.log('[STORAGE] Getting inventory item by product and warehouse:', productId, warehouseId);
      const result = await db.select().from(inventoryItems)
        .where(and(
          eq(inventoryItems.productId, productId),
          eq(inventoryItems.warehouseId, warehouseId)
        ))
        .limit(1);
      console.log('[STORAGE] Found inventory item:', result[0] || 'not found');
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error getting inventory item by product and warehouse:', error);
      throw error;
    }
  }

  async updateInventoryForTransfer(sourceWarehouseId: number, targetWarehouseId: number, productId: number, quantity: number): Promise<any> {
    try {
      console.log('[STORAGE] Updating inventory for transfer:', { sourceWarehouseId, targetWarehouseId, productId, quantity });
      
      // Get source inventory item
      const sourceItem = await this.getInventoryItemByProductAndWarehouse(productId, sourceWarehouseId);
      if (!sourceItem || (sourceItem.quantity || 0) < quantity) {
        return {
          success: false,
          sourceStock: sourceItem?.quantity || 0,
          message: `Insufficient stock in source warehouse (available: ${sourceItem?.quantity || 0}, requested: ${quantity})`
        };
      }

      // Update source warehouse - decrease quantity
      await db.update(inventoryItems)
        .set({ 
          quantity: (sourceItem.quantity || 0) - quantity,
          updatedAt: new Date()
        })
        .where(and(
          eq(inventoryItems.productId, productId),
          eq(inventoryItems.warehouseId, sourceWarehouseId)
        ));

      // Get or create target inventory item
      const targetItem = await this.getInventoryItemByProductAndWarehouse(productId, targetWarehouseId);
      
      if (targetItem) {
        // Update existing target inventory - increase quantity
        await db.update(inventoryItems)
          .set({ 
            quantity: (targetItem.quantity || 0) + quantity,
            updatedAt: new Date()
          })
          .where(and(
            eq(inventoryItems.productId, productId),
            eq(inventoryItems.warehouseId, targetWarehouseId)
          ));
      } else {
        // Create new target inventory item
        await db.insert(inventoryItems).values({
          productId,
          warehouseId: targetWarehouseId,
          quantity,
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      // Create inventory movements for audit trail
      await db.insert(inventoryMovements).values([
        {
          productId,
          sourceWarehouseId,
          destinationWarehouseId: null,
          movementType: 'transfer_out',
          quantity: -quantity,
          referenceType: 'transfer',
          notes: `Transfer to warehouse ${targetWarehouseId}`,
          createdAt: new Date(),
          performedAt: new Date(),
          performedBy: null
        },
        {
          productId,
          sourceWarehouseId: null,
          destinationWarehouseId: targetWarehouseId,
          movementType: 'transfer_in',
          quantity: quantity,
          referenceType: 'transfer',
          notes: `Transfer from warehouse ${sourceWarehouseId}`,
          createdAt: new Date(),
          performedAt: new Date(),
          performedBy: null
        }
      ]);

      console.log('[STORAGE] Successfully updated inventory for transfer');
      return {
        success: true,
        sourceStock: (sourceItem.quantity || 0) - quantity,
        targetStock: (targetItem?.quantity || 0) + quantity
      };
    } catch (error) {
      console.error('[STORAGE] Error updating inventory for transfer:', error);
      throw error;
    }
  }

  // ==================== KOSTEN MANAGEMENT ====================

  /**
   * Get all costs for a specific machine
   */
  async getMachineCosts(machineId: number): Promise<LocationCost[]> {
    try {
      const costs = await db.select()
        .from(locationCosts)
        .where(and(
          eq(locationCosts.machineId, machineId),
          eq(locationCosts.isActive, true)
        ))
        .orderBy(desc(locationCosts.createdAt));
      
      return costs;
    } catch (error) {
      console.error('[STORAGE] Error getting machine costs:', error);
      throw error;
    }
  }

  /**
   * Create a new cost entry for a machine
   */
  async createMachineCost(data: Omit<InsertLocationCost, 'id' | 'createdAt' | 'updatedAt'>): Promise<LocationCost> {
    try {
      const [newCost] = await db.insert(locationCosts)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      console.log('[STORAGE] Created new machine cost:', newCost.id);
      return newCost;
    } catch (error) {
      console.error('[STORAGE] Error creating machine cost:', error);
      throw error;
    }
  }

  /**
   * Update an existing cost entry
   */
  async updateMachineCost(id: number, data: Partial<Omit<InsertLocationCost, 'id' | 'createdAt' | 'updatedAt'>>): Promise<LocationCost> {
    try {
      const [updatedCost] = await db.update(locationCosts)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(eq(locationCosts.id, id))
        .returning();
      
      if (!updatedCost) {
        throw new Error('Cost entry not found');
      }
      
      console.log('[STORAGE] Updated machine cost:', id);
      return updatedCost;
    } catch (error) {
      console.error('[STORAGE] Error updating machine cost:', error);
      throw error;
    }
  }

  /**
   * Delete a cost entry (soft delete by setting isActive to false)
   */
  async deleteMachineCost(id: number): Promise<boolean> {
    try {
      const [deletedCost] = await db.update(locationCosts)
        .set({
          isActive: false,
          updatedAt: new Date()
        })
        .where(eq(locationCosts.id, id))
        .returning();
      
      if (!deletedCost) {
        throw new Error('Cost entry not found');
      }
      
      console.log('[STORAGE] Deleted machine cost:', id);
      return true;
    } catch (error) {
      console.error('[STORAGE] Error deleting machine cost:', error);
      throw error;
    }
  }

  /**
   * Get cost summary for a machine (monthly total, etc.)
   */
  async getMachineCostSummary(machineId: number): Promise<{
    totalMonthly: number;
    totalYearly: number;
    activeCosts: number;
    costsByCategory: { category: string; amount: number }[];
  }> {
    try {
      const costs = await this.getMachineCosts(machineId);
      
      let totalMonthly = 0;
      let totalYearly = 0;
      const costsByCategory: { [key: string]: number } = {};
      
      costs.forEach(cost => {
        const amount = cost.amountNet || 0;
        
        // Calculate monthly equivalent
        switch (cost.billingCycle) {
          case 'monthly':
            totalMonthly += amount;
            break;
          case 'quarterly':
            totalMonthly += amount / 3;
            break;
          case 'yearly':
            totalMonthly += amount / 12;
            break;
          case 'weekly':
            totalMonthly += amount * 4.33; // Average weeks per month
            break;
          case 'one_time':
            // Don't include one-time costs in recurring totals
            break;
        }
        
        // Calculate yearly equivalent
        switch (cost.billingCycle) {
          case 'monthly':
            totalYearly += amount * 12;
            break;
          case 'quarterly':
            totalYearly += amount * 4;
            break;
          case 'yearly':
            totalYearly += amount;
            break;
          case 'weekly':
            totalYearly += amount * 52;
            break;
          case 'one_time':
            totalYearly += amount; // Include one-time costs in yearly total
            break;
        }
        
        // Group by category
        const category = cost.category || cost.costType || 'Sonstige';
        costsByCategory[category] = (costsByCategory[category] || 0) + amount;
      });
      
      return {
        totalMonthly: Math.round(totalMonthly * 100) / 100,
        totalYearly: Math.round(totalYearly * 100) / 100,
        activeCosts: costs.length,
        costsByCategory: Object.entries(costsByCategory).map(([category, amount]) => ({
          category,
          amount: Math.round(amount * 100) / 100
        }))
      };
    } catch (error) {
      console.error('[STORAGE] Error getting machine cost summary:', error);
      throw error;
    }
  }

  // ==================== REFILL OPERATIONS ====================
  
  /**
   * Get all refills
   */
  async getRefills(options?: { limit?: number; offset?: number }): Promise<Refill[]> {
    try {
      let query = db.select().from(refills);
      
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      
      if (options?.offset) {
        query = query.offset(options.offset);
      }
      
      const results = await query.orderBy(desc(refills.datetime));
      return results;
    } catch (error) {
      console.error('[STORAGE] Error getting refills:', error);
      throw error;
    }
  }

  /**
   * Get refill details
   */
  async getRefillDetails(refillId: number): Promise<RefillDetail[]> {
    try {
      const details = await db.select()
        .from(refillDetails)
        .where(eq(refillDetails.refillId, refillId))
        .orderBy(refillDetails.id);
      
      return details;
    } catch (error) {
      console.error('[STORAGE] Error getting refill details:', error);
      throw error;
    }
  }

  /**
   * Get refills by machine ID
   */
  async getRefillsByMachine(machineId: number): Promise<Refill[]> {
    try {
      const refillList = await db.select()
        .from(refills)
        .where(eq(refills.machineId, machineId))
        .orderBy(desc(refills.datetime));
      
      return refillList;
    } catch (error) {
      console.error('[STORAGE] Error getting refills by machine:', error);
      throw error;
    }
  }

  /**
   * Create a new refill
   */
  async createRefill(refill: Omit<InsertRefill, 'id'>): Promise<Refill> {
    try {
      const [newRefill] = await db.insert(refills)
        .values(refill)
        .returning();
      
      console.log('[STORAGE] Created refill:', newRefill.id);
      return newRefill;
    } catch (error) {
      console.error('[STORAGE] Error creating refill:', error);
      throw error;
    }
  }

  /**
   * Update a refill
   */
  async updateRefill(id: number, updates: Partial<InsertRefill>): Promise<Refill> {
    try {
      const [updatedRefill] = await db.update(refills)
        .set(updates)
        .where(eq(refills.id, id))
        .returning();
      
      if (!updatedRefill) {
        throw new Error('Refill not found');
      }
      
      console.log('[STORAGE] Updated refill:', id);
      return updatedRefill;
    } catch (error) {
      console.error('[STORAGE] Error updating refill:', error);
      throw error;
    }
  }

  /**
   * Delete a refill
   */
  async deleteRefill(id: number): Promise<void> {
    try {
      await db.delete(refills)
        .where(eq(refills.id, id));
      
      console.log('[STORAGE] Deleted refill:', id);
    } catch (error) {
      console.error('[STORAGE] Error deleting refill:', error);
      throw error;
    }
  }

  // ==================== EVENT OPERATIONS ====================

  /**
   * Get all events
   */
  async getEvents(options?: { limit?: number; offset?: number }): Promise<Event[]> {
    try {
      let query = db.select().from(events);
      
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      
      if (options?.offset) {
        query = query.offset(options.offset);
      }
      
      const results = await query.orderBy(desc(events.datetime));
      return results;
    } catch (error) {
      console.error('[STORAGE] Error getting events:', error);
      throw error;
    }
  }

  /**
   * Get events by date range
   */
  async getEventsByDateRange(startDate: Date, endDate: Date): Promise<Event[]> {
    try {
      const eventList = await db.select()
        .from(events)
        .where(and(
          gte(events.datetime, startDate),
          lte(events.datetime, endDate)
        ))
        .orderBy(events.datetime);
      
      return eventList;
    } catch (error) {
      console.error('[STORAGE] Error getting events by date range:', error);
      throw error;
    }
  }

  /**
   * Get events by machine ID
   */
  async getEventsByMachine(machineId: number): Promise<Event[]> {
    try {
      const eventList = await db.select()
        .from(events)
        .where(eq(events.machineId, machineId))
        .orderBy(desc(events.datetime));
      
      return eventList;
    } catch (error) {
      console.error('[STORAGE] Error getting events by machine:', error);
      throw error;
    }
  }

  /**
   * Create a new event
   */
  async createEvent(event: Omit<InsertEvent, 'id'>): Promise<Event> {
    try {
      const [newEvent] = await db.insert(events)
        .values(event)
        .returning();
      
      console.log('[STORAGE] Created event:', newEvent.id);
      return newEvent;
    } catch (error) {
      console.error('[STORAGE] Error creating event:', error);
      throw error;
    }
  }

  /**
   * Update an event
   */
  async updateEvent(id: number, updates: Partial<InsertEvent>): Promise<Event> {
    try {
      const [updatedEvent] = await db.update(events)
        .set(updates)
        .where(eq(events.id, id))
        .returning();
      
      if (!updatedEvent) {
        throw new Error('Event not found');
      }
      
      console.log('[STORAGE] Updated event:', id);
      return updatedEvent;
    } catch (error) {
      console.error('[STORAGE] Error updating event:', error);
      throw error;
    }
  }

  /**
   * Delete an event
   */
  async deleteEvent(id: number): Promise<void> {
    try {
      await db.delete(events)
        .where(eq(events.id, id));
      
      console.log('[STORAGE] Deleted event:', id);
    } catch (error) {
      console.error('[STORAGE] Error deleting event:', error);
      throw error;
    }
  }

  // ==================== SYNC LOG OPERATIONS ====================

  /**
   * Get sync logs by type
   */
  async getSyncLogsByType(syncType: string, options?: { limit?: number; offset?: number; syncStatus?: string }): Promise<SyncLog[]> {
    try {
      let query = db.select().from(syncLogs).where(eq(syncLogs.syncType, syncType));
      
      if (options?.syncStatus) {
        query = query.where(and(eq(syncLogs.syncType, syncType), eq(syncLogs.status, options.syncStatus)));
      }
      
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      
      if (options?.offset) {
        query = query.offset(options.offset);
      }
      
      const results = await query.orderBy(desc(syncLogs.createdAt));
      return results;
    } catch (error) {
      console.error('[STORAGE] Error getting sync logs by type:', error);
      throw error;
    }
  }

  /**
   * Create a sync log entry
   */
  async createSyncLog(log: Omit<InsertSyncLog, 'id'>): Promise<SyncLog> {
    try {
      const [newLog] = await db.insert(syncLogs)
        .values(log)
        .returning();
      
      console.log('[STORAGE] Created sync log:', newLog.id);
      return newLog;
    } catch (error) {
      console.error('[STORAGE] Error creating sync log:', error);
      throw error;
    }
  }

  // ==================== EXTENDED PRODUCT OPERATIONS ====================

  /**
   * Get a single product by ID (explicit implementation)
   */
  async getProduct(id: number): Promise<Product | undefined> {
    return this.getProductById(id);
  }

  /**
   * Get product machines (products available in specific machines)
   */
  async getProductMachines(productId: number): Promise<any[]> {
    try {
      // This could be machine-product assignments or stock levels
      const machineProducts = await db.select({
        machineId: machineStocks.machineId,
        productId: machineStocks.productId,
        quantity: machineStocks.quantity,
        machineName: machines.machineName
      })
      .from(machineStocks)
      .leftJoin(machines, eq(machineStocks.machineId, machines.id))
      .where(eq(machineStocks.productId, productId));
      
      return machineProducts;
    } catch (error) {
      console.error('[STORAGE] Error getting product machines:', error);
      throw error;
    }
  }

  /**
   * Get product batches
   */
  async getProductBatches(productId: number): Promise<ProductBatch[]> {
    try {
      const batches = await db.select()
        .from(productBatches)
        .where(eq(productBatches.productId, productId))
        .orderBy(desc(productBatches.createdAt));
      
      return batches;
    } catch (error) {
      console.error('[STORAGE] Error getting product batches:', error);
      throw error;
    }
  }

  /**
   * Get product refills
   */
  async getProductRefills(productId: number): Promise<Refill[]> {
    try {
      const productRefills = await db.select()
        .from(refills)
        .where(eq(refills.productId, productId))
        .orderBy(desc(refills.datetime));
      
      return productRefills;
    } catch (error) {
      console.error('[STORAGE] Error getting product refills:', error);
      throw error;
    }
  }

  // ==================== MACHINE STATUS OPERATIONS ====================

  /**
   * Get machine status overview
   */
  async getMachineStatusOverview(): Promise<any[]> {
    try {
      const overview = await db.select({
        id: machines.id,
        machineName: machines.machineName,
        vendonId: machines.vendonId,
        locationId: machines.locationId,
        warehouseId: machines.warehouseId,
        isActive: machines.isActive,
        lastMaintenance: machines.lastMaintenance,
        lastTransaction: sql<Date>`(
          SELECT MAX(datetime) 
          FROM transactions 
          WHERE transactions.machine_id = machines.id
        )`,
        transactionCount: sql<number>`(
          SELECT COUNT(*) 
          FROM transactions 
          WHERE transactions.machine_id = machines.id 
            AND transactions.datetime >= NOW() - INTERVAL '24 hours'
        )`
      })
      .from(machines)
      .where(eq(machines.isActive, true));
      
      return overview;
    } catch (error) {
      console.error('[STORAGE] Error getting machine status overview:', error);
      throw error;
    }
  }

  /**
   * Get transaction count for sync status
   */
  async getTransactionCount(): Promise<number> {
    try {
      const result = await db.select({ count: count() }).from(transactions);
      return parseInt(result[0]?.count?.toString() || '0');
    } catch (error) {
      console.error('[STORAGE] Error getting transaction count:', error);
      throw error;
    }
  }

  // ==================== NAVIGATION AUDIT SYSTEM OPERATIONS ====================

  // Navigation Audit Session operations
  async getNavigationAuditSessions(options?: { 
    deviceType?: string; 
    auditType?: string; 
    limit?: number; 
    offset?: number 
  }): Promise<import('@shared/schema').NavigationAuditSession[]> {
    try {
      let query = db.select().from(navigationAuditSessions);
      
      if (options?.deviceType) {
        query = query.where(eq(navigationAuditSessions.deviceType, options.deviceType));
      }
      
      if (options?.auditType) {
        query = query.where(eq(navigationAuditSessions.auditType, options.auditType));
      }
      
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      
      if (options?.offset) {
        query = query.offset(options.offset);
      }
      
      return await query.orderBy(desc(navigationAuditSessions.createdAt));
    } catch (error) {
      console.error('[STORAGE] Error getting navigation audit sessions:', error);
      throw error;
    }
  }

  async getNavigationAuditSessionById(id: number): Promise<import('@shared/schema').NavigationAuditSession | undefined> {
    try {
      const result = await db.select()
        .from(navigationAuditSessions)
        .where(eq(navigationAuditSessions.id, id))
        .limit(1);
      
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error getting navigation audit session by id:', error);
      throw error;
    }
  }

  async getNavigationAuditSessionBySessionId(sessionId: string): Promise<import('@shared/schema').NavigationAuditSession | undefined> {
    try {
      const result = await db.select()
        .from(navigationAuditSessions)
        .where(eq(navigationAuditSessions.sessionId, sessionId))
        .limit(1);
      
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error getting navigation audit session by session id:', error);
      throw error;
    }
  }

  async createNavigationAuditSession(session: Omit<import('@shared/schema').NavigationAuditSession, 'id' | 'createdAt'>): Promise<import('@shared/schema').NavigationAuditSession> {
    try {
      const result = await db.insert(navigationAuditSessions)
        .values({
          ...session,
          createdAt: new Date()
        })
        .returning();
      
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error creating navigation audit session:', error);
      throw error;
    }
  }

  async updateNavigationAuditSession(id: number, updates: Partial<import('@shared/schema').NavigationAuditSession>): Promise<import('@shared/schema').NavigationAuditSession> {
    try {
      const result = await db.update(navigationAuditSessions)
        .set(updates)
        .where(eq(navigationAuditSessions.id, id))
        .returning();
      
      if (!result[0]) {
        throw new Error(`Navigation audit session with id ${id} not found`);
      }
      
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error updating navigation audit session:', error);
      throw error;
    }
  }

  async deleteNavigationAuditSession(id: number): Promise<void> {
    try {
      await db.delete(navigationAuditSessions)
        .where(eq(navigationAuditSessions.id, id));
    } catch (error) {
      console.error('[STORAGE] Error deleting navigation audit session:', error);
      throw error;
    }
  }

  // Navigation Issues operations
  async getNavigationIssues(options?: { 
    sessionId?: number; 
    severity?: string; 
    component?: string; 
    isFixed?: boolean;
    limit?: number 
  }): Promise<import('@shared/schema').NavigationIssue[]> {
    try {
      let query = db.select().from(navigationIssues);
      
      const conditions = [];
      
      if (options?.sessionId) {
        conditions.push(eq(navigationIssues.sessionId, options.sessionId));
      }
      
      if (options?.severity) {
        conditions.push(eq(navigationIssues.severity, options.severity));
      }
      
      if (options?.component) {
        conditions.push(eq(navigationIssues.component, options.component));
      }
      
      if (options?.isFixed !== undefined) {
        conditions.push(eq(navigationIssues.isFixed, options.isFixed));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }
      
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      
      return await query.orderBy(desc(navigationIssues.createdAt));
    } catch (error) {
      console.error('[STORAGE] Error getting navigation issues:', error);
      throw error;
    }
  }

  async getNavigationIssueById(id: number): Promise<import('@shared/schema').NavigationIssue | undefined> {
    try {
      const result = await db.select()
        .from(navigationIssues)
        .where(eq(navigationIssues.id, id))
        .limit(1);
      
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error getting navigation issue by id:', error);
      throw error;
    }
  }

  async getNavigationIssuesBySession(sessionId: number): Promise<import('@shared/schema').NavigationIssue[]> {
    try {
      return await db.select()
        .from(navigationIssues)
        .where(eq(navigationIssues.sessionId, sessionId))
        .orderBy(desc(navigationIssues.createdAt));
    } catch (error) {
      console.error('[STORAGE] Error getting navigation issues by session:', error);
      throw error;
    }
  }

  async createNavigationIssue(issue: Omit<import('@shared/schema').NavigationIssue, 'id' | 'createdAt'>): Promise<import('@shared/schema').NavigationIssue> {
    try {
      const result = await db.insert(navigationIssues)
        .values({
          ...issue,
          createdAt: new Date()
        })
        .returning();
      
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error creating navigation issue:', error);
      throw error;
    }
  }

  async updateNavigationIssue(id: number, updates: Partial<import('@shared/schema').NavigationIssue>): Promise<import('@shared/schema').NavigationIssue> {
    try {
      const result = await db.update(navigationIssues)
        .set(updates)
        .where(eq(navigationIssues.id, id))
        .returning();
      
      if (!result[0]) {
        throw new Error(`Navigation issue with id ${id} not found`);
      }
      
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error updating navigation issue:', error);
      throw error;
    }
  }

  async deleteNavigationIssue(id: number): Promise<void> {
    try {
      await db.delete(navigationIssues)
        .where(eq(navigationIssues.id, id));
    } catch (error) {
      console.error('[STORAGE] Error deleting navigation issue:', error);
      throw error;
    }
  }

  async markNavigationIssueAsFixed(id: number, fixedBy: number): Promise<import('@shared/schema').NavigationIssue> {
    try {
      const result = await db.update(navigationIssues)
        .set({
          isFixed: true,
          fixedBy: fixedBy,
          fixedAt: new Date()
        })
        .where(eq(navigationIssues.id, id))
        .returning();
      
      if (!result[0]) {
        throw new Error(`Navigation issue with id ${id} not found`);
      }
      
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error marking navigation issue as fixed:', error);
      throw error;
    }
  }

  async getUnfixedCriticalIssues(): Promise<import('@shared/schema').NavigationIssue[]> {
    try {
      return await db.select()
        .from(navigationIssues)
        .where(and(
          eq(navigationIssues.severity, 'critical'),
          eq(navigationIssues.isFixed, false)
        ))
        .orderBy(desc(navigationIssues.createdAt));
    } catch (error) {
      console.error('[STORAGE] Error getting unfixed critical issues:', error);
      throw error;
    }
  }

  // Touch Target Metrics operations  
  async getTouchTargetMetrics(options?: { 
    sessionId?: number; 
    isCompliant?: boolean; 
    elementType?: string 
  }): Promise<import('@shared/schema').TouchTargetMetric[]> {
    try {
      let query = db.select().from(touchTargetMetrics);
      
      const conditions = [];
      
      if (options?.sessionId) {
        conditions.push(eq(touchTargetMetrics.sessionId, options.sessionId));
      }
      
      if (options?.isCompliant !== undefined) {
        conditions.push(eq(touchTargetMetrics.isCompliant, options.isCompliant));
      }
      
      if (options?.elementType) {
        conditions.push(eq(touchTargetMetrics.elementType, options.elementType));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }
      
      return await query.orderBy(desc(touchTargetMetrics.createdAt));
    } catch (error) {
      console.error('[STORAGE] Error getting touch target metrics:', error);
      throw error;
    }
  }

  async getTouchTargetMetricById(id: number): Promise<import('@shared/schema').TouchTargetMetric | undefined> {
    try {
      const result = await db.select()
        .from(touchTargetMetrics)
        .where(eq(touchTargetMetrics.id, id))
        .limit(1);
      
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error getting touch target metric by id:', error);
      throw error;
    }
  }

  async getTouchTargetMetricsBySession(sessionId: number): Promise<import('@shared/schema').TouchTargetMetric[]> {
    try {
      return await db.select()
        .from(touchTargetMetrics)
        .where(eq(touchTargetMetrics.sessionId, sessionId))
        .orderBy(desc(touchTargetMetrics.createdAt));
    } catch (error) {
      console.error('[STORAGE] Error getting touch target metrics by session:', error);
      throw error;
    }
  }

  async createTouchTargetMetric(metric: Omit<import('@shared/schema').TouchTargetMetric, 'id' | 'createdAt'>): Promise<import('@shared/schema').TouchTargetMetric> {
    try {
      const result = await db.insert(touchTargetMetrics)
        .values({
          ...metric,
          createdAt: new Date()
        })
        .returning();
      
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error creating touch target metric:', error);
      throw error;
    }
  }

  async updateTouchTargetMetric(id: number, updates: Partial<import('@shared/schema').TouchTargetMetric>): Promise<import('@shared/schema').TouchTargetMetric> {
    try {
      const result = await db.update(touchTargetMetrics)
        .set(updates)
        .where(eq(touchTargetMetrics.id, id))
        .returning();
      
      if (!result[0]) {
        throw new Error(`Touch target metric with id ${id} not found`);
      }
      
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error updating touch target metric:', error);
      throw error;
    }
  }

  async deleteTouchTargetMetric(id: number): Promise<void> {
    try {
      await db.delete(touchTargetMetrics)
        .where(eq(touchTargetMetrics.id, id));
    } catch (error) {
      console.error('[STORAGE] Error deleting touch target metric:', error);
      throw error;
    }
  }

  async getTouchTargetComplianceStats(deviceType?: string): Promise<{ compliant: number; total: number; percentage: number }> {
    try {
      let query = db.select({
        total: count(),
        compliant: sql<number>`SUM(CASE WHEN ${touchTargetMetrics.isCompliant} = true THEN 1 ELSE 0 END)`
      }).from(touchTargetMetrics);
      
      if (deviceType) {
        // Join with sessions to filter by device type
        query = query.innerJoin(navigationAuditSessions, eq(touchTargetMetrics.sessionId, navigationAuditSessions.id))
          .where(eq(navigationAuditSessions.deviceType, deviceType));
      }
      
      const result = await query;
      const total = parseInt(result[0]?.total?.toString() || '0');
      const compliant = parseInt(result[0]?.compliant?.toString() || '0');
      const percentage = total > 0 ? (compliant / total) * 100 : 0;
      
      return { compliant, total, percentage };
    } catch (error) {
      console.error('[STORAGE] Error getting touch target compliance stats:', error);
      throw error;
    }
  }

  // Scrollability Tests operations
  async getScrollabilityTests(options?: { 
    sessionId?: number; 
    containerType?: string; 
    isScrollable?: boolean 
  }): Promise<import('@shared/schema').ScrollabilityTest[]> {
    try {
      let query = db.select().from(scrollabilityTests);
      
      const conditions = [];
      
      if (options?.sessionId) {
        conditions.push(eq(scrollabilityTests.sessionId, options.sessionId));
      }
      
      if (options?.containerType) {
        conditions.push(eq(scrollabilityTests.containerType, options.containerType));
      }
      
      if (options?.isScrollable !== undefined) {
        conditions.push(eq(scrollabilityTests.isScrollable, options.isScrollable));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }
      
      return await query.orderBy(desc(scrollabilityTests.createdAt));
    } catch (error) {
      console.error('[STORAGE] Error getting scrollability tests:', error);
      throw error;
    }
  }

  async getScrollabilityTestById(id: number): Promise<import('@shared/schema').ScrollabilityTest | undefined> {
    try {
      const result = await db.select()
        .from(scrollabilityTests)
        .where(eq(scrollabilityTests.id, id))
        .limit(1);
      
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error getting scrollability test by id:', error);
      throw error;
    }
  }

  async getScrollabilityTestsBySession(sessionId: number): Promise<import('@shared/schema').ScrollabilityTest[]> {
    try {
      return await db.select()
        .from(scrollabilityTests)
        .where(eq(scrollabilityTests.sessionId, sessionId))
        .orderBy(desc(scrollabilityTests.createdAt));
    } catch (error) {
      console.error('[STORAGE] Error getting scrollability tests by session:', error);
      throw error;
    }
  }

  async createScrollabilityTest(test: Omit<import('@shared/schema').ScrollabilityTest, 'id' | 'createdAt'>): Promise<import('@shared/schema').ScrollabilityTest> {
    try {
      const result = await db.insert(scrollabilityTests)
        .values({
          ...test,
          createdAt: new Date()
        })
        .returning();
      
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error creating scrollability test:', error);
      throw error;
    }
  }

  async updateScrollabilityTest(id: number, updates: Partial<import('@shared/schema').ScrollabilityTest>): Promise<import('@shared/schema').ScrollabilityTest> {
    try {
      const result = await db.update(scrollabilityTests)
        .set(updates)
        .where(eq(scrollabilityTests.id, id))
        .returning();
      
      if (!result[0]) {
        throw new Error(`Scrollability test with id ${id} not found`);
      }
      
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error updating scrollability test:', error);
      throw error;
    }
  }

  async deleteScrollabilityTest(id: number): Promise<void> {
    try {
      await db.delete(scrollabilityTests)
        .where(eq(scrollabilityTests.id, id));
    } catch (error) {
      console.error('[STORAGE] Error deleting scrollability test:', error);
      throw error;
    }
  }

  async getScrollabilityComplianceStats(deviceType?: string): Promise<{ compliant: number; total: number; percentage: number }> {
    try {
      let query = db.select({
        total: count(),
        compliant: sql<number>`SUM(CASE WHEN ${scrollabilityTests.isScrollable} = true THEN 1 ELSE 0 END)`
      }).from(scrollabilityTests);
      
      if (deviceType) {
        // Join with sessions to filter by device type
        query = query.innerJoin(navigationAuditSessions, eq(scrollabilityTests.sessionId, navigationAuditSessions.id))
          .where(eq(navigationAuditSessions.deviceType, deviceType));
      }
      
      const result = await query;
      const total = parseInt(result[0]?.total?.toString() || '0');
      const compliant = parseInt(result[0]?.compliant?.toString() || '0');
      const percentage = total > 0 ? (compliant / total) * 100 : 0;
      
      return { compliant, total, percentage };
    } catch (error) {
      console.error('[STORAGE] Error getting scrollability compliance stats:', error);
      throw error;
    }
  }

  // Navigation Fixes operations
  async getNavigationFixes(options?: { 
    issueId?: number; 
    fixType?: string; 
    success?: boolean 
  }): Promise<import('@shared/schema').NavigationFix[]> {
    try {
      let query = db.select().from(navigationFixes);
      
      const conditions = [];
      
      if (options?.issueId) {
        conditions.push(eq(navigationFixes.issueId, options.issueId));
      }
      
      if (options?.fixType) {
        conditions.push(eq(navigationFixes.fixType, options.fixType));
      }
      
      if (options?.success !== undefined) {
        conditions.push(eq(navigationFixes.success, options.success));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }
      
      return await query.orderBy(desc(navigationFixes.appliedAt));
    } catch (error) {
      console.error('[STORAGE] Error getting navigation fixes:', error);
      throw error;
    }
  }

  async getNavigationFixById(id: number): Promise<import('@shared/schema').NavigationFix | undefined> {
    try {
      const result = await db.select()
        .from(navigationFixes)
        .where(eq(navigationFixes.id, id))
        .limit(1);
      
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error getting navigation fix by id:', error);
      throw error;
    }
  }

  async getNavigationFixesByIssue(issueId: number): Promise<import('@shared/schema').NavigationFix[]> {
    try {
      return await db.select()
        .from(navigationFixes)
        .where(eq(navigationFixes.issueId, issueId))
        .orderBy(desc(navigationFixes.appliedAt));
    } catch (error) {
      console.error('[STORAGE] Error getting navigation fixes by issue:', error);
      throw error;
    }
  }

  async createNavigationFix(fix: Omit<import('@shared/schema').NavigationFix, 'id' | 'appliedAt'>): Promise<import('@shared/schema').NavigationFix> {
    try {
      const result = await db.insert(navigationFixes)
        .values({
          ...fix,
          appliedAt: new Date()
        })
        .returning();
      
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error creating navigation fix:', error);
      throw error;
    }
  }

  async updateNavigationFix(id: number, updates: Partial<import('@shared/schema').NavigationFix>): Promise<import('@shared/schema').NavigationFix> {
    try {
      const result = await db.update(navigationFixes)
        .set(updates)
        .where(eq(navigationFixes.id, id))
        .returning();
      
      if (!result[0]) {
        throw new Error(`Navigation fix with id ${id} not found`);
      }
      
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error updating navigation fix:', error);
      throw error;
    }
  }

  async deleteNavigationFix(id: number): Promise<void> {
    try {
      await db.delete(navigationFixes)
        .where(eq(navigationFixes.id, id));
    } catch (error) {
      console.error('[STORAGE] Error deleting navigation fix:', error);
      throw error;
    }
  }

  // Audit Performance History operations
  async getAuditPerformanceHistory(options?: { 
    deviceType?: string; 
    dateFrom?: string; 
    dateTo?: string 
  }): Promise<import('@shared/schema').AuditPerformanceHistory[]> {
    try {
      let query = db.select().from(auditPerformanceHistory);
      
      const conditions = [];
      
      if (options?.deviceType) {
        conditions.push(eq(auditPerformanceHistory.deviceType, options.deviceType));
      }
      
      if (options?.dateFrom) {
        conditions.push(gte(auditPerformanceHistory.date, options.dateFrom));
      }
      
      if (options?.dateTo) {
        conditions.push(lte(auditPerformanceHistory.date, options.dateTo));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }
      
      return await query.orderBy(desc(auditPerformanceHistory.date));
    } catch (error) {
      console.error('[STORAGE] Error getting audit performance history:', error);
      throw error;
    }
  }

  async getAuditPerformanceHistoryById(id: number): Promise<import('@shared/schema').AuditPerformanceHistory | undefined> {
    try {
      const result = await db.select()
        .from(auditPerformanceHistory)
        .where(eq(auditPerformanceHistory.id, id))
        .limit(1);
      
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error getting audit performance history by id:', error);
      throw error;
    }
  }

  async getLatestAuditPerformanceByDevice(deviceType: string): Promise<import('@shared/schema').AuditPerformanceHistory | undefined> {
    try {
      const result = await db.select()
        .from(auditPerformanceHistory)
        .where(eq(auditPerformanceHistory.deviceType, deviceType))
        .orderBy(desc(auditPerformanceHistory.date))
        .limit(1);
      
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error getting latest audit performance by device:', error);
      throw error;
    }
  }

  async upsertAuditPerformanceHistory(history: Omit<import('@shared/schema').AuditPerformanceHistory, 'id' | 'updatedAt'>): Promise<import('@shared/schema').AuditPerformanceHistory> {
    try {
      // Try to find existing record for the same device type and date
      const existing = await db.select()
        .from(auditPerformanceHistory)
        .where(and(
          eq(auditPerformanceHistory.deviceType, history.deviceType),
          eq(auditPerformanceHistory.date, history.date)
        ))
        .limit(1);
      
      if (existing[0]) {
        // Update existing record
        const result = await db.update(auditPerformanceHistory)
          .set({
            ...history,
            updatedAt: new Date()
          })
          .where(eq(auditPerformanceHistory.id, existing[0].id))
          .returning();
        
        return result[0];
      } else {
        // Insert new record
        const result = await db.insert(auditPerformanceHistory)
          .values({
            ...history,
            updatedAt: new Date()
          })
          .returning();
        
        return result[0];
      }
    } catch (error) {
      console.error('[STORAGE] Error upserting audit performance history:', error);
      throw error;
    }
  }

  async updateAuditPerformanceHistory(id: number, updates: Partial<import('@shared/schema').AuditPerformanceHistory>): Promise<import('@shared/schema').AuditPerformanceHistory> {
    try {
      const result = await db.update(auditPerformanceHistory)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(auditPerformanceHistory.id, id))
        .returning();
      
      if (!result[0]) {
        throw new Error(`Audit performance history with id ${id} not found`);
      }
      
      return result[0];
    } catch (error) {
      console.error('[STORAGE] Error updating audit performance history:', error);
      throw error;
    }
  }

  async deleteAuditPerformanceHistory(id: number): Promise<void> {
    try {
      await db.delete(auditPerformanceHistory)
        .where(eq(auditPerformanceHistory.id, id));
    } catch (error) {
      console.error('[STORAGE] Error deleting audit performance history:', error);
      throw error;
    }
  }

  // Audit Analytics and Reporting
  async getAuditSummaryStats(options?: { 
    deviceType?: string; 
    dateFrom?: string; 
    dateTo?: string 
  }): Promise<{
    totalSessions: number;
    avgPerformanceScore: number;
    totalIssues: number;
    criticalIssues: number;
    warningIssues: number;
    fixedIssues: number;
    touchTargetCompliance: number;
    scrollContainerCompliance: number;
  }> {
    try {
      // Get sessions count and average performance score
      let sessionsQuery = db.select({
        totalSessions: count(),
        avgPerformanceScore: sql<number>`COALESCE(AVG(${navigationAuditSessions.performanceScore}), 0)`
      }).from(navigationAuditSessions);
      
      if (options?.deviceType) {
        sessionsQuery = sessionsQuery.where(eq(navigationAuditSessions.deviceType, options.deviceType));
      }
      
      if (options?.dateFrom || options?.dateTo) {
        const dateConditions = [];
        if (options.dateFrom) {
          dateConditions.push(gte(navigationAuditSessions.createdAt, new Date(options.dateFrom)));
        }
        if (options.dateTo) {
          dateConditions.push(lte(navigationAuditSessions.createdAt, new Date(options.dateTo)));
        }
        if (dateConditions.length > 0) {
          sessionsQuery = sessionsQuery.where(and(...dateConditions));
        }
      }
      
      const sessionStats = await sessionsQuery;
      
      // Get issues stats
      let issuesQuery = db.select({
        totalIssues: count(),
        criticalIssues: sql<number>`SUM(CASE WHEN ${navigationIssues.severity} = 'critical' THEN 1 ELSE 0 END)`,
        warningIssues: sql<number>`SUM(CASE WHEN ${navigationIssues.severity} = 'warning' THEN 1 ELSE 0 END)`,
        fixedIssues: sql<number>`SUM(CASE WHEN ${navigationIssues.isFixed} = true THEN 1 ELSE 0 END)`
      }).from(navigationIssues);
      
      if (options?.deviceType || options?.dateFrom || options?.dateTo) {
        issuesQuery = issuesQuery.innerJoin(navigationAuditSessions, eq(navigationIssues.sessionId, navigationAuditSessions.id));
        
        const issueConditions = [];
        if (options?.deviceType) {
          issueConditions.push(eq(navigationAuditSessions.deviceType, options.deviceType));
        }
        if (options?.dateFrom) {
          issueConditions.push(gte(navigationAuditSessions.createdAt, new Date(options.dateFrom)));
        }
        if (options?.dateTo) {
          issueConditions.push(lte(navigationAuditSessions.createdAt, new Date(options.dateTo)));
        }
        if (issueConditions.length > 0) {
          issuesQuery = issuesQuery.where(and(...issueConditions));
        }
      }
      
      const issueStats = await issuesQuery;
      
      // Get touch target compliance
      const touchTargetStats = await this.getTouchTargetComplianceStats(options?.deviceType);
      
      // Get scrollability compliance
      const scrollabilityStats = await this.getScrollabilityComplianceStats(options?.deviceType);
      
      return {
        totalSessions: parseInt(sessionStats[0]?.totalSessions?.toString() || '0'),
        avgPerformanceScore: parseFloat(sessionStats[0]?.avgPerformanceScore?.toString() || '0'),
        totalIssues: parseInt(issueStats[0]?.totalIssues?.toString() || '0'),
        criticalIssues: parseInt(issueStats[0]?.criticalIssues?.toString() || '0'),
        warningIssues: parseInt(issueStats[0]?.warningIssues?.toString() || '0'),
        fixedIssues: parseInt(issueStats[0]?.fixedIssues?.toString() || '0'),
        touchTargetCompliance: touchTargetStats.percentage,
        scrollContainerCompliance: scrollabilityStats.percentage
      };
    } catch (error) {
      console.error('[STORAGE] Error getting audit summary stats:', error);
      throw error;
    }
  }

  // Automated Fix Helpers
  async getAutoFixableIssues(): Promise<import('@shared/schema').NavigationIssue[]> {
    try {
      return await db.select()
        .from(navigationIssues)
        .where(and(
          eq(navigationIssues.isFixed, false),
          eq(navigationIssues.autoFixable, true)
        ))
        .orderBy(desc(navigationIssues.createdAt));
    } catch (error) {
      console.error('[STORAGE] Error getting auto-fixable issues:', error);
      throw error;
    }
  }

  async bulkApplyAutomaticFixes(issueIds: number[], appliedBy: number): Promise<import('@shared/schema').NavigationFix[]> {
    try {
      const fixes: import('@shared/schema').NavigationFix[] = [];
      
      for (const issueId of issueIds) {
        const issue = await this.getNavigationIssueById(issueId);
        if (issue && issue.autoFixable && !issue.isFixed) {
          // Create fix record
          const fix = await this.createNavigationFix({
            issueId: issueId,
            fixType: 'automatic',
            description: `Automatic fix applied for ${issue.component}`,
            appliedBy: appliedBy,
            success: true,
            details: issue.recommendedFix || 'Automatic fix applied'
          });
          
          // Mark issue as fixed
          await this.markNavigationIssueAsFixed(issueId, appliedBy);
          
          fixes.push(fix);
        }
      }
      
      return fixes;
    } catch (error) {
      console.error('[STORAGE] Error applying bulk automatic fixes:', error);
      throw error;
    }
  }
}