import { eq, desc, and, gte, lte } from "drizzle-orm";
import { db } from "./db";
import { 
  users, type User, type InsertUser,
  machines, type Machine, type InsertMachine,
  transactions, type Transaction, type InsertTransaction,
  products, type Product, type InsertProduct,
  refills, type Refill, type InsertRefill,
  refillDetails, type RefillDetail, type InsertRefillDetail,
  events, type Event, type InsertEvent,
  syncLogs, type SyncLog, type InsertSyncLog,
  locations, type Location, type InsertLocation
} from "@shared/schema";

// Interface defining all storage operations
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Machine operations
  getMachines(limit?: number): Promise<Machine[]>;
  getAllMachines(): Promise<Machine[]>;
  getMachine(id: number): Promise<Machine | undefined>;
  getMachineByVendonId(vendonId: string): Promise<Machine | undefined>;
  createMachine(machine: InsertMachine): Promise<Machine>;
  updateMachine(id: number, machine: Partial<InsertMachine>): Promise<Machine | undefined>;

  // Transaction operations
  getTransactions(limit?: number): Promise<Transaction[]>;
  getTransactionsByDateRange(startDate: Date, endDate: Date, limit?: number): Promise<Transaction[]>;
  getTransactionsByMachine(machineId: number, limit?: number): Promise<Transaction[]>;
  getTransactionByVendonId(vendonId: string): Promise<Transaction | undefined>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransaction(id: number, transaction: Partial<InsertTransaction>): Promise<Transaction | undefined>;
  getTransactionsForProcessing(limit?: number, offset?: number): Promise<Transaction[]>;
  updateTransactionProcessingStatus(id: number, status: string, errorMessage?: string): Promise<void>;
  getTransactionStats(): Promise<{total: number; processed: number; pending: number; error: number}>;

  // Product operations
  getProducts(limit?: number): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  getProductByVendonId(vendonId: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined>;

  // Refill operations
  getRefills(limit?: number): Promise<Refill[]>;
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
  getSyncLog(id: number): Promise<SyncLog | undefined>;
  createSyncLog(log: InsertSyncLog): Promise<SyncLog>;
  updateSyncLog(id: number, log: Partial<InsertSyncLog>): Promise<SyncLog | undefined>;
  getLatestSyncLog(syncType: string): Promise<SyncLog | undefined>;

  // Location operations
  getLocations(): Promise<Location[]>;
  getLocation(id: number): Promise<Location | undefined>;
  createLocation(location: InsertLocation): Promise<Location>;
}

// Database storage implementation
export class DatabaseStorage implements IStorage {
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
    const [machine] = await db.select().from(machines).where(eq(machines.vendonId, vendonId));
    return machine;
  }

  async createMachine(machine: InsertMachine): Promise<Machine> {
    const [newMachine] = await db.insert(machines).values(machine).returning();
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

  async getTransactionByVendonId(vendonId: string): Promise<Transaction | undefined> {
    const [transaction] = await db.select().from(transactions).where(eq(transactions.vendonId, vendonId));
    return transaction;
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [newTransaction] = await db.insert(transactions).values(transaction).returning();
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
  
  async getTransactionsForProcessing(limit: number = 100, offset: number = 0): Promise<Transaction[]> {
    return await db
      .select()
      .from(transactions)
      .where(eq(transactions.processingStatus, 'pending'))
      .orderBy(transactions.id)
      .limit(limit)
      .offset(offset);
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
      .select({ count: db.fn.count().as('count') })
      .from(transactions);
    
    const processedResult = await db
      .select({ count: db.fn.count().as('count') })
      .from(transactions)
      .where(eq(transactions.processingStatus, 'processed'));
    
    const pendingResult = await db
      .select({ count: db.fn.count().as('count') })
      .from(transactions)
      .where(eq(transactions.processingStatus, 'pending'));
    
    const errorResult = await db
      .select({ count: db.fn.count().as('count') })
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
  async getProducts(limit: number = 100): Promise<Product[]> {
    return await db.select().from(products).limit(limit);
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async getProductByVendonId(vendonId: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.vendonId, vendonId));
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(products).values(product).returning();
    return newProduct;
  }

  async updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined> {
    const [updatedProduct] = await db
      .update(products)
      .set({ ...product, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return updatedProduct;
  }

  // Refill operations
  async getRefills(limit: number = 100): Promise<Refill[]> {
    return await db.select().from(refills).orderBy(desc(refills.datetime)).limit(limit);
  }

  async getRefill(id: number): Promise<Refill | undefined> {
    const [refill] = await db.select().from(refills).where(eq(refills.id, id));
    return refill;
  }

  async getRefillByVendonId(vendonId: string): Promise<Refill | undefined> {
    const [refill] = await db.select().from(refills).where(eq(refills.vendonId, vendonId));
    return refill;
  }
  
  async getRefillDetails(refillId: number): Promise<RefillDetail[]> {
    return await db
      .select()
      .from(refillDetails)
      .where(eq(refillDetails.refillId, refillId))
      .orderBy(refillDetails.id);
  }

  async createRefill(refill: InsertRefill): Promise<Refill> {
    const [newRefill] = await db.insert(refills).values(refill).returning();
    return newRefill;
  }

  async createRefillDetail(detail: InsertRefillDetail): Promise<RefillDetail> {
    const [newDetail] = await db.insert(refillDetails).values(detail).returning();
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
    const [newEvent] = await db.insert(events).values(event).returning();
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

  async getSyncLog(id: number): Promise<SyncLog | undefined> {
    const [log] = await db.select().from(syncLogs).where(eq(syncLogs.id, id));
    return log;
  }

  async createSyncLog(log: InsertSyncLog): Promise<SyncLog> {
    const [newLog] = await db.insert(syncLogs).values(log).returning();
    return newLog;
  }

  async updateSyncLog(id: number, log: Partial<InsertSyncLog>): Promise<SyncLog | undefined> {
    const [updatedLog] = await db
      .update(syncLogs)
      .set(log)
      .where(eq(syncLogs.id, id))
      .returning();
    return updatedLog;
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
}

export const storage = new DatabaseStorage();
