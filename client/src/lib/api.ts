import axios from 'axios';

const API_BASE_URL = '/api';

// Hilfsfunktionen
export function formatDateTime(dateString: string | Date, format: 'date' | 'datetime' | 'time' = 'datetime'): string {
  const date = new Date(dateString);
  
  if (isNaN(date.getTime())) {
    return '–';
  }
  
  const options: Intl.DateTimeFormatOptions = {};
  
  if (format === 'date' || format === 'datetime') {
    options.day = '2-digit';
    options.month = '2-digit';
    options.year = 'numeric';
  }
  
  if (format === 'time' || format === 'datetime') {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  
  return date.toLocaleString('de-DE', options);
}

/**
 * Formatiert eine Zeitdauer in Sekunden in ein menschenlesbares Format
 * @param seconds Dauer in Sekunden
 * @param short Wenn true, wird ein kurzes Format verwendet (z.B. "5m 30s" statt "5 Minuten 30 Sekunden")
 * @returns Formatierte Zeitdauer
 */
export function formatDuration(seconds: number, short = false): string {
  if (isNaN(seconds) || seconds < 0) {
    return '–';
  }
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  const parts: string[] = [];
  
  if (days > 0) {
    parts.push(short 
      ? `${days}d` 
      : `${days} ${days === 1 ? 'Tag' : 'Tage'}`);
  }
  
  if (hours > 0) {
    parts.push(short 
      ? `${hours}h` 
      : `${hours} ${hours === 1 ? 'Stunde' : 'Stunden'}`);
  }
  
  if (minutes > 0) {
    parts.push(short 
      ? `${minutes}m` 
      : `${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'}`);
  }
  
  if (remainingSeconds > 0 || parts.length === 0) {
    parts.push(short 
      ? `${remainingSeconds}s` 
      : `${remainingSeconds} ${remainingSeconds === 1 ? 'Sekunde' : 'Sekunden'}`);
  }
  
  return parts.join(short ? ' ' : ', ');
}

// Typ-Definitionen für API-Antworten
export interface Transaction {
  id: number;
  vendonId: string;
  machineId: string;
  machineName: string;
  datetime: string;
  quantity: number;
  price: number;
  currency: string;
  productName: string;
  paymentMethod: string;
}

export interface Machine {
  id: number;
  vendonId: string;
  machineName: string;
  location: string;
  status: string;
  address?: string;
  lastSync?: string;
  lastSale?: string;
  product_count?: number;
  error_count?: number;
}

export interface Product {
  id: number;
  vendonId: string;
  productName: string;  // Umbenannt von 'name' auf 'productName', um mit dem Schema übereinzustimmen
  description?: string;
  category?: string;
  price?: number;
  vat?: number;
  status?: string;
  sku?: string;
  barcode?: string;
  depositPrice?: number;
  depositVat?: number;
  productType?: string;
  article?: string;
  tags?: string;  // JSON array als String
  units?: string;
  costPrice?: number;
  warehouseLocation?: string;
  // Lagerbestand
  inStock?: number;  // Virtuelles Feld für den Gesamtbestand
  amountMax?: number;
  amountStandard?: number;
  amountCritical?: number;
  refillUnitSize?: number;
  minRefill?: number;
  critical?: boolean;
  // Zusätzliche Felder für UI
  requiresAgeVerification?: boolean;
  supplier?: string;
  salesCount?: number;  // Anzahl der Verkäufe
  lastSale?: string;    // Letzter Verkauf
  updatedAt?: string;
  createdAt?: string;
}

export interface SyncLog {
  id: number;
  syncType: string;
  startDate: string;
  endDate: string;
  status: string;
  itemsFound: number;
  itemsSaved: number;
  errorMessage?: string;
}

export interface Event {
  id: number;
  vendonId: string;
  eventType: string;
  machineId: string;
  machineName: string;
  datetime: string;
  description: string;
  severity: string;
  status: string;
}

// Basis API Anfrage Funktion
async function apiRequest<T>(
  method: 'get' | 'post' | 'put' | 'delete',
  endpoint: string,
  data?: any
): Promise<T> {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await axios({
      method,
      url,
      data,
    });
    return response.data;
  } catch (error: any) {
    if (error.response) {
      // Der Request wurde gemacht und der Server hat mit einem Statuscode geantwortet
      throw new Error(error.response.data.error || `${error.response.status}: ${error.response.statusText}`);
    } else if (error.request) {
      // Der Request wurde gemacht, aber keine Antwort erhalten
      throw new Error('Keine Antwort vom Server erhalten. Bitte überprüfen Sie Ihre Internetverbindung.');
    } else {
      // Ein Fehler ist beim Einrichten des Requests aufgetreten
      throw new Error(`Request-Fehler: ${error.message}`);
    }
  }
}

// API-Funktionen für verschiedene Endpunkte

// Transaktionen
export async function getTransactions(limit = 50, offset = 0): Promise<Transaction[]> {
  return apiRequest<Transaction[]>('get', `/transactions?limit=${limit}&offset=${offset}`);
}

// Dashboard-Zusammenfassung
export interface DashboardSummary {
  totalTransactions: number;
  totalRevenue: number;
  todayTransactions: number;
  todayRevenue: number;
  weeklyTransactions: number;
  weeklyRevenue: number;
  activeMachines: number;
  totalMachines: number;
  recentIssues: number;
  trendWeekly: number; // Prozentuale Änderung zum Vorwochenzeitraum
  trendDaily: number;  // Prozentuale Änderung zum Vortag
  popularProducts: {
    productName: string;
    count: number;
    revenue: number;
  }[];
  paymentMethods: {
    method: string;
    count: number;
    revenue: number;
  }[];
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return apiRequest<DashboardSummary>('get', '/transactions/summary');
}

export async function getTransactionsByDateRange(
  startDate: string,
  endDate: string,
  limit = 100
): Promise<Transaction[]> {
  return apiRequest<Transaction[]>(
    'get', 
    `/transactions/byDateRange?start=${startDate}&end=${endDate}&limit=${limit}`
  );
}

export async function getTransactionsByMachine(
  machineId: string,
  limit = 50,
  offset = 0
): Promise<Transaction[]> {
  return apiRequest<Transaction[]>(
    'get',
    `/machines/${machineId}/transactions?limit=${limit}&offset=${offset}`
  );
}

// Maschinen
export async function getMachines(): Promise<Machine[]> {
  return apiRequest<Machine[]>('get', '/machines');
}

export async function getMachine(id: string): Promise<Machine> {
  return apiRequest<Machine>('get', `/machines/${id}`);
}

// Produkte
export async function getProducts(): Promise<Product[]> {
  return apiRequest<Product[]>('get', '/products');
}

export async function getProduct(id: string): Promise<Product> {
  return apiRequest<Product>('get', `/products/${id}`);
}

// Synchronisierung
export async function getSyncStatus(): Promise<any> {
  return apiRequest<any>('get', '/sync/status');
}

export async function startSync(syncType: string): Promise<any> {
  return apiRequest<any>('post', `/sync/${syncType}`);
}

// Alias für startSync für bestehende Komponenten
export const triggerSync = startSync;

export async function getSyncLogs(limit = 20): Promise<SyncLog[]> {
  return apiRequest<SyncLog[]>('get', `/sync/logs?limit=${limit}`);
}

// Events/Ereignisse
export async function getEvents(limit = 50, offset = 0): Promise<Event[]> {
  return apiRequest<Event[]>('get', `/events?limit=${limit}&offset=${offset}`);
}

export async function getEventsByDateRange(
  startDate: string,
  endDate: string,
  limit = 100
): Promise<Event[]> {
  return apiRequest<Event[]>(
    'get', 
    `/events/byDateRange?start=${startDate}&end=${endDate}&limit=${limit}`
  );
}

// Scheduler/Planer
export async function getSchedulerStatus(): Promise<any> {
  return apiRequest<any>('get', '/scheduler/status');
}

export async function startScheduler(): Promise<any> {
  return apiRequest<any>('post', '/scheduler/start');
}

export async function stopScheduler(): Promise<any> {
  return apiRequest<any>('post', '/scheduler/stop');
}

// Lieferanten-Schnittstelle
export interface Supplier {
  id: number;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country: string;
  status: string;
  notes?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  minimumOrderValue?: number;
  deliveryDays?: string; // JSON array als String ["monday", "wednesday"]
  taxId?: string;
  accountNumber?: string;
  bankDetails?: string;
  createdAt: string;
  updatedAt: string;
  // Virtuelle Felder für die UI
  productsCount?: number;
  openOrdersCount?: number;
}

export interface SupplierResponse {
  data: Supplier[];
  meta: {
    total: number;
    offset: number;
    limit: number;
    page: number;
    pages: number;
  }
}

// Lieferanten-Funktionen
export async function getSuppliers(params?: {
  limit?: number;
  offset?: number;
  status?: string;
  search?: string;
}): Promise<SupplierResponse> {
  const queryParams = new URLSearchParams();
  
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.offset) queryParams.append('offset', params.offset.toString());
  if (params?.status) queryParams.append('status', params.status);
  if (params?.search) queryParams.append('search', params.search);
  
  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
  return apiRequest<SupplierResponse>('get', `/suppliers${queryString}`);
}

export async function getSupplier(id: number): Promise<Supplier> {
  return apiRequest<Supplier>('get', `/suppliers/${id}`);
}

export async function createSupplier(supplierData: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>): Promise<Supplier> {
  return apiRequest<Supplier>('post', '/suppliers', supplierData);
}

export async function updateSupplier(id: number, supplierData: Partial<Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Supplier> {
  return apiRequest<Supplier>('put', `/suppliers/${id}`, supplierData);
}

export async function deleteSupplier(id: number): Promise<{success: boolean; message: string}> {
  return apiRequest<{success: boolean; message: string}>('delete', `/suppliers/${id}`);
}

// Bestellungen (Orders)
export interface Order {
  id: number;
  orderNumber: string;
  supplierId: number;
  supplierName: string;
  locationId: number;
  locationName: string;
  status: string;
  orderDate: string;
  expectedDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  totalAmount: number;
  currency: string;
  vatAmount: number;
  discountAmount: number;
  shippingCost: number;
  paymentTerms: string | null;
  paymentStatus: string;
  paymentDate: string | null;
  paymentMethod: string | null;
  createdById: number;
  createdByName: string;
  lastModifiedById: number | null;
  lastModifiedByName: string | null;
  notes: string | null;
  internalNotes: string | null;
  documents: string | null; // JSON-String
  createdAt: string;
  updatedAt: string;
  isAutoGenerated: boolean;
  forecastId: number | null;
  priority: string;
  // UI-Felder
  itemCount?: number;
}

export interface OrderResponse {
  data: Order[];
  meta: {
    total: number;
    offset: number;
    limit: number;
    page: number;
    pages: number;
  }
}

export interface OrderItem {
  id: number;
  orderId: number;
  productId: number | null;
  productName: string;
  sku: string | null;
  supplierSku: string | null;
  quantity: number;
  unit: string;
  quantityDelivered: number;
  unitPrice: number;
  totalPrice: number;
  vatRate: number;
  vatAmount: number | null;
  discount: number;
  discountAmount: number;
  positionNumber: number | null;
  status: string;
  notes: string | null;
  targetMachineId: number | null;
  targetMachineName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetail extends Order {
  orderItems: OrderItem[];
  supplier: Supplier;
  statusHistory?: { date: string; status: string; user: string; note: string; }[];
}

// Bestellungen-Funktionen
export async function getOrders(params?: {
  limit?: number;
  offset?: number;
  status?: string;
  supplier?: string;
  location?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}): Promise<OrderResponse> {
  const queryParams = new URLSearchParams();
  
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.offset) queryParams.append('offset', params.offset.toString());
  if (params?.status) queryParams.append('status', params.status);
  if (params?.supplier) queryParams.append('supplier', params.supplier);
  if (params?.location) queryParams.append('location', params.location);
  if (params?.dateFrom) queryParams.append('dateFrom', params.dateFrom);
  if (params?.dateTo) queryParams.append('dateTo', params.dateTo);
  if (params?.search) queryParams.append('search', params.search);
  
  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
  return apiRequest<OrderResponse>('get', `/orders${queryString}`);
}

export async function getOrder(id: number): Promise<OrderDetail> {
  return apiRequest<OrderDetail>('get', `/orders/${id}`);
}

export async function createOrder(orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'orderNumber'>): Promise<Order> {
  return apiRequest<Order>('post', '/orders', orderData);
}

export async function updateOrder(id: number, orderData: Partial<Omit<Order, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Order> {
  return apiRequest<Order>('put', `/orders/${id}`, orderData);
}

export async function deleteOrder(id: number): Promise<{success: boolean; message: string}> {
  return apiRequest<{success: boolean; message: string}>('delete', `/orders/${id}`);
}

export async function updateOrderStatus(id: number, status: string, note?: string): Promise<Order> {
  return apiRequest<Order>('put', `/orders/${id}/status`, { status, note });
}

export async function addOrderItem(orderId: number, itemData: Omit<OrderItem, 'id' | 'orderId' | 'createdAt' | 'updatedAt'>): Promise<OrderItem> {
  return apiRequest<OrderItem>('post', `/orders/${orderId}/items`, itemData);
}

export async function updateOrderItem(orderId: number, itemId: number, itemData: Partial<Omit<OrderItem, 'id' | 'orderId' | 'createdAt' | 'updatedAt'>>): Promise<OrderItem> {
  return apiRequest<OrderItem>('put', `/orders/${orderId}/items/${itemId}`, itemData);
}

export async function deleteOrderItem(orderId: number, itemId: number): Promise<{success: boolean; message: string}> {
  return apiRequest<{success: boolean; message: string}>('delete', `/orders/${orderId}/items/${itemId}`);
}

// Locations (Standorte)
export interface Location {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getLocations(): Promise<Location[]> {
  return apiRequest<Location[]>('get', '/locations');
}

export async function getLocation(id: number): Promise<Location> {
  return apiRequest<Location>('get', `/locations/${id}`);
}

// Formatiert ein Datum im ISO-Format
export function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Wetterdaten für Dashboard
export interface WeatherCurrent {
  location: string;
  timestamp: string;
  temperature: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  description: string;
  icon: string;
}

export interface WeatherForecast {
  date: string;
  temperature: {
    min: number;
    max: number;
  };
  humidity: number;
  description: string;
  icon: string;
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
  type: string;
  state: string;
  createdAt: string;
  updatedAt: string;
}

export interface RevenueForecast {
  date: string;
  amount: number;
  confidence: number;
}

export interface ProductDemandForecast {
  productId: number;
  productName: string;
  machineId?: number;
  machineName?: string;
  date: string;
  quantity: number;
  confidence: number;
}

export async function getCurrentWeather(): Promise<WeatherCurrent> {
  return apiRequest<WeatherCurrent>('get', '/weather/current');
}

export async function getWeatherForecast(days = 5): Promise<WeatherForecast[]> {
  return apiRequest<WeatherForecast[]>('get', `/weather/forecast?days=${days}`);
}

// Feiertage für Dashboard
export async function getUpcomingHolidays(days = 7): Promise<Holiday[]> {
  const today = new Date();
  const endDate = new Date();
  endDate.setDate(today.getDate() + days);
  
  return apiRequest<Holiday[]>('get', `/holidays/by-date-range?startDate=${formatDateISO(today)}&endDate=${formatDateISO(endDate)}`);
}

// Umsatzprognose für Dashboard
export async function getRevenueForecast(days = 7): Promise<RevenueForecast[]> {
  const today = new Date();
  const endDate = new Date();
  endDate.setDate(today.getDate() + days);
  
  return apiRequest<RevenueForecast[]>('get', `/forecast/revenue?startDate=${formatDateISO(today)}&endDate=${formatDateISO(endDate)}`);
}

// Warenbedarf-Prognose
export async function getProductDemandForecast(params: {
  machineId?: number;
  productId?: number;
  startDate?: Date;
  endDate?: Date;
} = {}): Promise<ProductDemandForecast[]> {
  const queryParams = new URLSearchParams();
  
  if (params.machineId) queryParams.append('machineId', params.machineId.toString());
  if (params.productId) queryParams.append('productId', params.productId.toString());
  
  const startDate = params.startDate || new Date();
  const endDate = params.endDate || new Date();
  if (params.endDate === undefined) {
    endDate.setDate(startDate.getDate() + 7);
  }
  
  queryParams.append('startDate', formatDateISO(startDate));
  queryParams.append('endDate', formatDateISO(endDate));
  
  return apiRequest<ProductDemandForecast[]>('get', `/forecast/demand?${queryParams.toString()}`);
}