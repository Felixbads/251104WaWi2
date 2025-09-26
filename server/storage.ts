import { eq, and, desc, sql, count, sum, avg, max, min, ne, isNull } from 'drizzle-orm';
import { PgDatabase } from 'drizzle-orm/pg-core';
import { 
  warehouses, products, transactions, machines, orders, orderItems, suppliers, 
  supplierDiscountConditions, inventoryItems, inventoryMovements, refills, weatherData, 
  supplierAccessPins, productCategories, 
  packageTypes, purchaseConditions, recurringOrders, recurringOrderItems, 
  forecasts, users, events,
  locationCosts, machineDailyStats, machineWarehouseAssignments,
  type InsertMachineDailyStats, type MachineWarehouseAssignment,
  // Navigation Audit System Types
  navigationAuditSessions, type NavigationAuditSession, type InsertNavigationAuditSession,
  navigationIssues, type NavigationIssue, type InsertNavigationIssue,
  touchTargetMetrics, type TouchTargetMetric, type InsertTouchTargetMetric,
  scrollabilityTests, type ScrollabilityTest, type InsertScrollabilityTest,
  navigationFixes, type NavigationFix, type InsertNavigationFix,
  auditPerformanceHistory, type AuditPerformanceHistory, type InsertAuditPerformanceHistory
} from '../shared/schema.js';

// Core types and interfaces
export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  isApproved: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
}

export interface Product {
  id: number;
  vendonId: string;
  productName: string;
  sku?: string;
  barcode?: string;
  price?: number;
  vat?: number;
  status?: string;
  units?: string;
  categoryId?: number;
  shortDescription?: string;
  detailDescription?: string;
  ingredients?: string;
  allergens?: string;
  nutritionalInfo?: string;
  packageSize?: string;
  minOrderQuantity?: number;
  shelfLife?: number;
  isAlcoholic?: boolean;
  imageUrl?: string;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Supplier {
  id: number;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  showPricesInOrders?: boolean;
}

export interface Warehouse {
  id: number;
  name: string;
  address?: string;
  city?: string;
  postalCode?: string;
  managerId?: number;
  isActive: boolean;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Order {
  id: number;
  orderNumber: string;
  warehouseId: number;
  supplierId: number;
  status: string;
  orderDate: Date;
  deliveryDate?: Date;
  totalAmount?: number;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface OrderItem {
  id: number;
  orderId: number;
  productId: number;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
  notes?: string;
}

export interface Transaction {
  id: number;
  vendonId: string;
  machineId?: number;
  productId?: number;
  timestamp: Date;
  amount?: number;
  paymentMethod?: string;
  quantity?: number;
  success?: boolean;
  vendonData?: any;
  processed?: boolean;
}

export interface Machine {
  id: number;
  vendonId: string;
  name: string;
  location?: string;
  warehouseId?: number;
  isActive: boolean;
  lastMaintenance?: Date;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MachineDailyStats {
  todayTransactions: number;
  todayRevenue: number;
  lastSale?: {
    datetime: string;
    productName?: string;
    amount?: number;
  } | null;
  lastCashlessSale?: {
    datetime: string;
    productName?: string;
    amount?: number;
  } | null;
  lastAlcoholSale?: {
    datetime: string;
    productName?: string;
    amount?: number;
  } | null;
  alcoholSales?: {
    today: number;
    weekAvg: number;
    monthAvg: number;
  };
}

export interface InventoryItem {
  id: number;
  warehouseId: number;
  productId: number;
  quantity: number;
  reservedQuantity?: number;
  expiryDate?: Date;
  batchId?: string;
  receivedDate?: Date;
  notes?: string;
  updatedAt?: Date;
}

export interface InventoryMovement {
  id: number;
  warehouseId: number;
  productId: number;
  movementType: string;
  quantity: number;
  fromLocationId?: number;
  toLocationId?: number;
  orderId?: number;
  refillId?: number;
  userId?: number;
  notes?: string;
  timestamp: Date;
}

export interface Refill {
  id: number;
  machineId: number;
  productId: number;
  quantity: number;
  operatorName?: string;
  timestamp: Date;
  notes?: string;
  processed?: boolean;
  vendonRefillId?: string;
  vendonData?: any;
}

export interface SupplierDiscount {
  id: number;
  supplierId: number;
  discountType: string;
  value: number;
  minQuantity?: number;
  minOrderValue?: number;
  isActive: boolean;
  validFrom?: Date;
  validUntil?: Date;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface WeatherData {
  id: number;
  locationId: number;
  date: Date;
  temperature?: number;
  humidity?: number;
  precipitation?: number;
  windSpeed?: number;
  weatherCondition?: string;
  createdAt?: Date;
}

export interface SupplierPortalPin {
  id: number;
  supplierId: number;
  pin: string;
  accessToken: string;
  isActive: boolean;
  validUntil?: Date;
  lastAccess?: Date;
  accessCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SupplierProductAssignment {
  id: number;
  supplierId: number;
  productId: number;
  isActive: boolean;
  priority?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ProductCategory {
  id: number;
  name: string;
  description?: string;
  parentId?: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PackageType {
  id: number;
  name: string;
  description?: string;
  multiplier: number;
  baseUnit?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PurchaseCondition {
  id: number;
  supplierId: number;
  productId?: number;
  packageTypeId?: number;
  unitPrice: number;
  currency: string;
  minQuantity?: number;
  maxQuantity?: number;
  validFrom?: Date;
  validUntil?: Date;
  leadTime?: number;
  paymentTerms?: string;
  discountType?: string;
  discountValue?: number;
  depositPerUnit?: number;
  minQuantityUnit?: string;
  isActive: boolean;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface RecurringOrder {
  id: number;
  name: string;
  warehouseId: number;
  supplierId: number;
  frequency: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  isActive: boolean;
  lastExecuted?: Date;
  nextExecution?: Date;
  orderType?: string;
  forecastEnabled?: boolean;
  emailNotifications?: boolean;
  deliveryLogic?: string;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface RecurringOrderItem {
  id: number;
  recurringOrderId: number;
  productId: number;
  baseQuantity: number;
  unitPrice?: number;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ProductForecast {
  id: number;
  productId: number;
  machineId?: number;
  warehouseId?: number;
  forecastDate: Date;
  predictedSales: number;
  confidence?: number;
  seasonalFactor?: number;
  trendFactor?: number;
  weatherFactor?: number;
  holidayFactor?: number;
  model?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface VendonProduct {
  id: number;
  vendonId: string;
  name: string;
  barcode?: string;
  price?: number;
  categoryId?: number;
  isActive: boolean;
  lastSync?: Date;
  vendonData?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Event {
  id: number;
  vendonId: string;
  machineId?: number;
  eventType: string;
  eventName?: string;
  description?: string;
  timestamp: Date;
  severity?: string;
  isResolved?: boolean;
  vendonData?: any;
  processed?: boolean;
  createdAt?: Date;
}

export interface WarehouseOperator {
  id: number;
  warehouseId: number;
  userId: number;
  role: string;
  isActive: boolean;
  assignedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface LocationCost {
  id: number;
  locationId: number;
  costType: string;
  amount: number;
  currency: string;
  frequency: string;
  description?: string;
  isActive: boolean;
  validFrom: string;
  validUntil?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSession {
  id: string;
  userId: number;
  expiresAt: Date;
  data?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

// Main storage interface
export interface IStorage {
  // Raw SQL queries
  query(sql: string, params?: any[]): Promise<any[]>;
  executeRawQuery(sql: string, params?: any[]): Promise<{rows: any[], rowCount: number}>;
  
  // Transaction count for sync status
  getTransactionCount(): Promise<number>;
  
  // Batch operations for Vendon sync (performance optimization)
  getExistingTransactionIds(vendonIds: string[]): Promise<Set<string>>;
  createTransactionsBatch(transactions: any[]): Promise<any[]>;
  getExistingEventIds(vendonIds: string[]): Promise<Set<string>>;
  createEventsBatch(events: any[]): Promise<any[]>;
  getExistingRefillIds(vendonIds: string[]): Promise<Set<string>>;
  createRefillsBatch(refills: any[]): Promise<any[]>;
  getTransactionsByVendonIds(vendonIds: string[]): Promise<any[]>;
  getEventsByVendonIds(vendonIds: string[]): Promise<any[]>;
  getRefillsByVendonIds(vendonIds: string[]): Promise<any[]>;
  
  // User operations
  getUserById(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: Omit<User, 'id' | 'createdAt' | 'lastLoginAt'>): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User>;
  deleteUser(id: number): Promise<void>;
  listUsers(): Promise<User[]>;
  
  // Product operations
  getProducts(): Promise<Product[]>;
  getProductById(id: number): Promise<Product | undefined>;
  getProductByVendonId(vendonId: string): Promise<Product | undefined>;
  createProduct(product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product>;
  updateProduct(id: number, updates: Partial<Product>): Promise<Product>;
  deleteProduct(id: number): Promise<void>;
  
  // Supplier operations
  getSuppliers(): Promise<Supplier[]>;
  getSupplierById(id: number): Promise<Supplier | undefined>;
  createSupplier(supplier: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>): Promise<Supplier>;
  updateSupplier(id: number, updates: Partial<Supplier>): Promise<Supplier>;
  deleteSupplier(id: number): Promise<void>;
  
  // Warehouse operations
  getWarehouses(): Promise<Warehouse[]>;
  getWarehouse(id: number): Promise<Warehouse | undefined>; // Legacy alias
  getWarehouseById(id: number): Promise<Warehouse | undefined>;
  createWarehouse(warehouse: Omit<Warehouse, 'id' | 'createdAt' | 'updatedAt'>): Promise<Warehouse>;
  updateWarehouse(id: number, updates: Partial<Warehouse>): Promise<Warehouse>;
  deleteWarehouse(id: number): Promise<void>;
  
  // Machine-Warehouse Assignment operations
  getMachineWarehouseAssignments(): Promise<MachineWarehouseAssignment[]>;
  getMachineWarehouseAssignmentsByWarehouse(warehouseId: number): Promise<MachineWarehouseAssignment[]>;
  getMachineWarehouseAssignmentByMachine(machineId: number): Promise<MachineWarehouseAssignment | undefined>;
  createMachineWarehouseAssignment(assignment: Omit<MachineWarehouseAssignment, 'id' | 'createdAt' | 'updatedAt'>): Promise<MachineWarehouseAssignment>;
  updateMachineWarehouseAssignment(id: number, updates: Partial<MachineWarehouseAssignment>): Promise<MachineWarehouseAssignment>;
  deleteMachineWarehouseAssignment(id: number): Promise<void>;
  
  // Order operations
  getOrders(): Promise<Order[]>;
  getOrderById(id: number): Promise<Order | undefined>;
  createOrder(order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order>;
  updateOrder(id: number, updates: Partial<Order>): Promise<Order>;
  deleteOrder(id: number): Promise<void>;
  getOrdersByWarehouse(warehouseId: number): Promise<Order[]>;
  getOrdersBySupplier(supplierId: number): Promise<Order[]>;
  
  // Order item operations
  getOrderItems(orderId: number): Promise<OrderItem[]>;
  createOrderItem(item: Omit<OrderItem, 'id'>): Promise<OrderItem>;
  updateOrderItem(id: number, updates: Partial<OrderItem>): Promise<OrderItem>;
  deleteOrderItem(id: number): Promise<void>;
  
  // Transaction operations
  getTransactions(): Promise<Transaction[]>;
  getTransactionById(id: number): Promise<Transaction | undefined>;
  createTransaction(transaction: Omit<Transaction, 'id'>): Promise<Transaction>;
  updateTransaction(id: number, updates: Partial<Transaction>): Promise<Transaction>;
  deleteTransaction(id: number): Promise<void>;
  getTransactionsByMachine(machineId: number): Promise<Transaction[]>;
  getTransactionsByDateRange(startDate: Date, endDate: Date): Promise<Transaction[]>;
  
  // Upsert operation for idempotent transaction handling (historical backfill)
  upsertTransaction(transaction: Omit<Transaction, 'id'>): Promise<Transaction>;
  upsertTransactionsBatch(transactions: Omit<Transaction, 'id'>[]): Promise<Transaction[]>;
  
  // Machine operations
  getMachines(limit?: number): Promise<Machine[]>;
  getMachineById(id: number): Promise<Machine | undefined>;
  getMachineByVendonId(vendonId: string): Promise<Machine | undefined>;
  createMachine(machine: Omit<Machine, 'id' | 'createdAt' | 'updatedAt'>): Promise<Machine>;
  updateMachine(id: number, updates: Partial<Machine>): Promise<Machine>;
  deleteMachine(id: number): Promise<void>;
  
  // Machine Daily Stats - Persistent KPIs
  getMachineDailyStats(machineId: number, date?: string): Promise<MachineDailyStats | null>;
  getBulkMachineDailyStats(machineIds: number[], date?: string): Promise<MachineDailyStats[]>;
  upsertMachineDailyStats(stats: InsertMachineDailyStats): Promise<MachineDailyStats>;
  calculateAndStoreDailyStats(machineId: number, date: string): Promise<MachineDailyStats>;

  // Location operations
  getLocations(): Promise<any[]>;
  getLocationById(id: number): Promise<any | undefined>;
  
  // Inventory operations
  getInventoryItems(): Promise<InventoryItem[]>;
  getInventoryItemById(id: number): Promise<InventoryItem | undefined>;
  getInventoryByWarehouse(warehouseId: number): Promise<InventoryItem[]>;
  getInventoryByProduct(productId: number): Promise<InventoryItem[]>;
  createInventoryItem(item: Omit<InventoryItem, 'id' | 'updatedAt'>): Promise<InventoryItem>;
  updateInventoryItem(id: number, updates: Partial<InventoryItem>): Promise<InventoryItem>;
  deleteInventoryItem(id: number): Promise<void>;
  
  // Inventory movement operations
  getInventoryMovements(): Promise<InventoryMovement[]>;
  getInventoryMovementById(id: number): Promise<InventoryMovement | undefined>;
  getInventoryMovementsByWarehouse(warehouseId: number): Promise<InventoryMovement[]>;
  createInventoryMovement(movement: Omit<InventoryMovement, 'id'>): Promise<InventoryMovement>;
  updateInventoryMovement(id: number, updates: Partial<InventoryMovement>): Promise<InventoryMovement>;
  deleteInventoryMovement(id: number): Promise<void>;
  
  // Inventory transfer operations
  getInventoryTransfers(filter?: Record<string, any>): Promise<any[]>;
  getInventoryTransferById(id: number): Promise<any | undefined>;
  createInventoryTransfer(transfer: any): Promise<any>;
  updateInventoryTransfer(id: number, updates: any): Promise<any>;
  deleteInventoryTransfer(id: number): Promise<void>;
  getInventoryTransferItems(filter: { transferId: number }): Promise<any[]>;
  createInventoryTransferItems(items: any[]): Promise<any[]>;
  
  // Inventory utilities
  getInventoryItemByProductAndWarehouse(productId: number, warehouseId: number): Promise<any | undefined>;
  updateInventoryForTransfer(sourceWarehouseId: number, targetWarehouseId: number, productId: number, quantity: number): Promise<any>;
  
  // Refill operations
  getRefills(options?: { warehouseId?: number; startDate?: Date; endDate?: Date; limit?: number }): Promise<Refill[]>;
  getRefillById(id: number): Promise<Refill | undefined>;
  getRefillsByMachine(machineId: number): Promise<Refill[]>;
  createRefill(refill: Omit<Refill, 'id'>): Promise<Refill>;
  updateRefill(id: number, updates: Partial<Refill>): Promise<Refill>;
  deleteRefill(id: number): Promise<void>;
  
  // Supplier discount operations
  getSupplierDiscounts(): Promise<SupplierDiscount[]>;
  getSupplierDiscountById(id: number): Promise<SupplierDiscount | undefined>;
  getSupplierDiscountsBySupplier(supplierId: number): Promise<SupplierDiscount[]>;
  createSupplierDiscount(discount: Omit<SupplierDiscount, 'id' | 'createdAt' | 'updatedAt'>): Promise<SupplierDiscount>;
  updateSupplierDiscount(id: number, updates: Partial<SupplierDiscount>): Promise<SupplierDiscount>;
  deleteSupplierDiscount(id: number): Promise<void>;
  
  // Weather data operations
  getWeatherData(): Promise<WeatherData[]>;
  getWeatherDataById(id: number): Promise<WeatherData | undefined>;
  getWeatherDataByLocation(locationId: number): Promise<WeatherData[]>;
  createWeatherData(data: Omit<WeatherData, 'id' | 'createdAt'>): Promise<WeatherData>;
  updateWeatherData(id: number, updates: Partial<WeatherData>): Promise<WeatherData>;
  deleteWeatherData(id: number): Promise<void>;
  
  // Supplier portal operations
  getSupplierPortalPins(): Promise<SupplierPortalPin[]>;
  getSupplierPortalPinById(id: number): Promise<SupplierPortalPin | undefined>;
  getSupplierPortalPinBySupplier(supplierId: number): Promise<SupplierPortalPin | undefined>;
  createSupplierPortalPin(pin: Omit<SupplierPortalPin, 'id' | 'createdAt' | 'updatedAt'>): Promise<SupplierPortalPin>;
  updateSupplierPortalPin(id: number, updates: Partial<SupplierPortalPin>): Promise<SupplierPortalPin>;
  deleteSupplierPortalPin(id: number): Promise<void>;
  
  // Supplier product assignment operations
  getSupplierProductAssignments(): Promise<SupplierProductAssignment[]>;
  getSupplierProductAssignmentById(id: number): Promise<SupplierProductAssignment | undefined>;
  getSupplierProductAssignmentsBySupplier(supplierId: number): Promise<SupplierProductAssignment[]>;
  createSupplierProductAssignment(assignment: Omit<SupplierProductAssignment, 'id' | 'createdAt' | 'updatedAt'>): Promise<SupplierProductAssignment>;
  updateSupplierProductAssignment(id: number, updates: Partial<SupplierProductAssignment>): Promise<SupplierProductAssignment>;
  deleteSupplierProductAssignment(id: number): Promise<void>;
  
  // Product category operations
  getProductCategories(): Promise<ProductCategory[]>;
  getProductCategoryById(id: number): Promise<ProductCategory | undefined>;
  createProductCategory(category: Omit<ProductCategory, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProductCategory>;
  updateProductCategory(id: number, updates: Partial<ProductCategory>): Promise<ProductCategory>;
  deleteProductCategory(id: number): Promise<void>;
  
  // Package type operations
  getPackageTypes(): Promise<PackageType[]>;
  getPackageTypeById(id: number): Promise<PackageType | undefined>;
  createPackageType(type: Omit<PackageType, 'id' | 'createdAt' | 'updatedAt'>): Promise<PackageType>;
  updatePackageType(id: number, updates: Partial<PackageType>): Promise<PackageType>;
  deletePackageType(id: number): Promise<void>;
  
  // Purchase condition operations
  getPurchaseConditions(): Promise<PurchaseCondition[]>;
  getPurchaseConditionById(id: number): Promise<PurchaseCondition | undefined>;
  getPurchaseConditionsBySupplier(supplierId: number): Promise<PurchaseCondition[]>;
  getPurchaseConditionsByProduct(productId: number): Promise<PurchaseCondition[]>;
  createPurchaseCondition(condition: Omit<PurchaseCondition, 'id' | 'createdAt' | 'updatedAt'>): Promise<PurchaseCondition>;
  updatePurchaseCondition(id: number, updates: Partial<PurchaseCondition>): Promise<PurchaseCondition>;
  deletePurchaseCondition(id: number): Promise<void>;
  
  // Recurring order operations
  getRecurringOrders(): Promise<RecurringOrder[]>;
  getRecurringOrderById(id: number): Promise<RecurringOrder | undefined>;
  getRecurringOrdersByWarehouse(warehouseId: number): Promise<RecurringOrder[]>;
  createRecurringOrder(order: Omit<RecurringOrder, 'id' | 'createdAt' | 'updatedAt'>): Promise<RecurringOrder>;
  updateRecurringOrder(id: number, updates: Partial<RecurringOrder>): Promise<RecurringOrder>;
  deleteRecurringOrder(id: number): Promise<void>;
  
  // Recurring order item operations
  getRecurringOrderItems(recurringOrderId: number): Promise<RecurringOrderItem[]>;
  createRecurringOrderItem(item: Omit<RecurringOrderItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<RecurringOrderItem>;
  updateRecurringOrderItem(id: number, updates: Partial<RecurringOrderItem>): Promise<RecurringOrderItem>;
  deleteRecurringOrderItem(id: number): Promise<void>;
  
  // Product forecast operations
  getProductForecasts(): Promise<ProductForecast[]>;
  getProductForecastById(id: number): Promise<ProductForecast | undefined>;
  getProductForecastsByProduct(productId: number): Promise<ProductForecast[]>;
  getProductForecastsByMachine(machineId: number): Promise<ProductForecast[]>;
  createProductForecast(forecast: Omit<ProductForecast, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProductForecast>;
  updateProductForecast(id: number, updates: Partial<ProductForecast>): Promise<ProductForecast>;
  deleteProductForecast(id: number): Promise<void>;
  
  // Vendon product operations
  getVendonProducts(): Promise<VendonProduct[]>;
  getVendonProductById(id: number): Promise<VendonProduct | undefined>;
  getVendonProductByVendonId(vendonId: string): Promise<VendonProduct | undefined>;
  createVendonProduct(product: Omit<VendonProduct, 'id' | 'createdAt' | 'updatedAt'>): Promise<VendonProduct>;
  updateVendonProduct(id: number, updates: Partial<VendonProduct>): Promise<VendonProduct>;
  deleteVendonProduct(id: number): Promise<void>;
  
  // Event operations
  getEvents(): Promise<Event[]>;
  getEventById(id: number): Promise<Event | undefined>;
  getEventsByMachine(machineId: number): Promise<Event[]>;
  createEvent(event: Omit<Event, 'id' | 'createdAt'>): Promise<Event>;
  updateEvent(id: number, updates: Partial<Event>): Promise<Event>;
  deleteEvent(id: number): Promise<void>;
  
  // Warehouse operator operations
  getWarehouseOperators(): Promise<WarehouseOperator[]>;
  getWarehouseOperatorById(id: number): Promise<WarehouseOperator | undefined>;
  getWarehouseOperatorsByWarehouse(warehouseId: number): Promise<WarehouseOperator[]>;
  createWarehouseOperator(operator: Omit<WarehouseOperator, 'id' | 'createdAt' | 'updatedAt'>): Promise<WarehouseOperator>;
  updateWarehouseOperator(id: number, updates: Partial<WarehouseOperator>): Promise<WarehouseOperator>;
  deleteWarehouseOperator(id: number): Promise<void>;
  
  // Location cost operations
  getLocationCosts(): Promise<LocationCost[]>;
  getLocationCostById(id: number): Promise<LocationCost | undefined>;
  getLocationCostsByLocation(locationId: number): Promise<LocationCost[]>;
  createLocationCost(cost: Omit<LocationCost, 'id' | 'createdAt' | 'updatedAt'>): Promise<LocationCost>;
  updateLocationCost(id: number, updates: Partial<LocationCost>): Promise<LocationCost>;
  deleteLocationCost(id: number): Promise<void>;
  
  // User session operations
  getUserSessions(): Promise<UserSession[]>;
  getUserSessionById(id: string): Promise<UserSession | undefined>;
  getUserSessionsByUser(userId: number): Promise<UserSession[]>;
  createUserSession(session: Omit<UserSession, 'createdAt' | 'updatedAt'>): Promise<UserSession>;
  updateUserSession(id: string, updates: Partial<UserSession>): Promise<UserSession>;
  deleteUserSession(id: string): Promise<void>;
  
  // Product operations extended for package support
  getProductById(id: number): Promise<Product | undefined>;
  
  // Navigation Audit System Operations
  // ================================
  
  // Navigation Audit Session operations
  getNavigationAuditSessions(options?: { 
    deviceType?: string; 
    auditType?: string; 
    limit?: number; 
    offset?: number 
  }): Promise<NavigationAuditSession[]>;
  getNavigationAuditSessionById(id: number): Promise<NavigationAuditSession | undefined>;
  getNavigationAuditSessionBySessionId(sessionId: string): Promise<NavigationAuditSession | undefined>;
  createNavigationAuditSession(session: Omit<NavigationAuditSession, 'id' | 'createdAt'>): Promise<NavigationAuditSession>;
  updateNavigationAuditSession(id: number, updates: Partial<NavigationAuditSession>): Promise<NavigationAuditSession>;
  deleteNavigationAuditSession(id: number): Promise<void>;
  
  // Navigation Issues operations
  getNavigationIssues(options?: { 
    sessionId?: number; 
    severity?: string; 
    component?: string; 
    isFixed?: boolean;
    limit?: number 
  }): Promise<NavigationIssue[]>;
  getNavigationIssueById(id: number): Promise<NavigationIssue | undefined>;
  getNavigationIssuesBySession(sessionId: number): Promise<NavigationIssue[]>;
  createNavigationIssue(issue: Omit<NavigationIssue, 'id' | 'createdAt'>): Promise<NavigationIssue>;
  updateNavigationIssue(id: number, updates: Partial<NavigationIssue>): Promise<NavigationIssue>;
  deleteNavigationIssue(id: number): Promise<void>;
  markNavigationIssueAsFixed(id: number, fixedBy: number): Promise<NavigationIssue>;
  getUnfixedCriticalIssues(): Promise<NavigationIssue[]>;
  
  // Touch Target Metrics operations  
  getTouchTargetMetrics(options?: { 
    sessionId?: number; 
    isCompliant?: boolean; 
    elementType?: string 
  }): Promise<TouchTargetMetric[]>;
  getTouchTargetMetricById(id: number): Promise<TouchTargetMetric | undefined>;
  getTouchTargetMetricsBySession(sessionId: number): Promise<TouchTargetMetric[]>;
  createTouchTargetMetric(metric: Omit<TouchTargetMetric, 'id' | 'createdAt'>): Promise<TouchTargetMetric>;
  updateTouchTargetMetric(id: number, updates: Partial<TouchTargetMetric>): Promise<TouchTargetMetric>;
  deleteTouchTargetMetric(id: number): Promise<void>;
  getTouchTargetComplianceStats(deviceType?: string): Promise<{ compliant: number; total: number; percentage: number }>;
  
  // Scrollability Tests operations
  getScrollabilityTests(options?: { 
    sessionId?: number; 
    containerType?: string; 
    isScrollable?: boolean 
  }): Promise<ScrollabilityTest[]>;
  getScrollabilityTestById(id: number): Promise<ScrollabilityTest | undefined>;
  getScrollabilityTestsBySession(sessionId: number): Promise<ScrollabilityTest[]>;
  createScrollabilityTest(test: Omit<ScrollabilityTest, 'id' | 'createdAt'>): Promise<ScrollabilityTest>;
  updateScrollabilityTest(id: number, updates: Partial<ScrollabilityTest>): Promise<ScrollabilityTest>;
  deleteScrollabilityTest(id: number): Promise<void>;
  getScrollabilityComplianceStats(deviceType?: string): Promise<{ compliant: number; total: number; percentage: number }>;
  
  // Navigation Fixes operations
  getNavigationFixes(options?: { 
    issueId?: number; 
    fixType?: string; 
    success?: boolean 
  }): Promise<NavigationFix[]>;
  getNavigationFixById(id: number): Promise<NavigationFix | undefined>;
  getNavigationFixesByIssue(issueId: number): Promise<NavigationFix[]>;
  createNavigationFix(fix: Omit<NavigationFix, 'id' | 'appliedAt'>): Promise<NavigationFix>;
  updateNavigationFix(id: number, updates: Partial<NavigationFix>): Promise<NavigationFix>;
  deleteNavigationFix(id: number): Promise<void>;
  
  // Audit Performance History operations
  getAuditPerformanceHistory(options?: { 
    deviceType?: string; 
    dateFrom?: string; 
    dateTo?: string 
  }): Promise<AuditPerformanceHistory[]>;
  getAuditPerformanceHistoryById(id: number): Promise<AuditPerformanceHistory | undefined>;
  getLatestAuditPerformanceByDevice(deviceType: string): Promise<AuditPerformanceHistory | undefined>;
  upsertAuditPerformanceHistory(history: Omit<AuditPerformanceHistory, 'id' | 'updatedAt'>): Promise<AuditPerformanceHistory>;
  updateAuditPerformanceHistory(id: number, updates: Partial<AuditPerformanceHistory>): Promise<AuditPerformanceHistory>;
  deleteAuditPerformanceHistory(id: number): Promise<void>;
  
  // Audit Analytics and Reporting
  getAuditSummaryStats(options?: { 
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
  }>;
  
  // Automated Fix Helpers
  getAutoFixableIssues(): Promise<NavigationIssue[]>;
  bulkApplyAutomaticFixes(issueIds: number[], appliedBy: number): Promise<NavigationFix[]>;
}

// Export the DatabaseStorage implementation from the separate file
export { DatabaseStorage } from './storage/database-storage.js';

// Create and export a storage instance for backwards compatibility
import { DatabaseStorage } from './storage/database-storage.js';
export const storage = new DatabaseStorage();