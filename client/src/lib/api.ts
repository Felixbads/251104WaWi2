import axios from 'axios';

const API_BASE_URL = '/api';

// Interface für Einkaufsbedingungen
export interface PurchaseCondition {
  id: number;
  supplierId: number;
  productId: number;
  productName?: string;
  productSku?: string;
  unitPrice: number;
  minQuantity?: number;
  validFrom?: Date | string;
  validTo?: Date | string;
  notes?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

// Interface für Maschinenbestand (MachineStock)
export interface MachineStock {
  id: number;
  machineId: number;
  machineVendonId: string;
  productVendonId: string;
  selectionNumber: string;
  quantity: number;
  status: string;
  lastFilled: string;
  rawData?: string;
  lastSync?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Interface für Standorte (Location)
export interface Location {
  id: number;
  name: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Interface für Produkt-Bestand (Stock)
export interface Stock {
  id: number;
  vendonId: string;
  productName: string;
  sku?: string;
  barcode?: string;
  price?: number;
  vat?: number;
  status: string;
  units?: string;
  warehouseLocation?: string;
  description?: string;
  productType?: string;
  amountMax?: number;
  amountStandard?: number;
  amountCritical?: number;
  refillUnitSize?: number;
  minRefill?: number;
  rawData?: string;
  lastSync?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Interface für Datenbankstatistiken
export interface DatabaseStatistics {
  transactions: number;
  openOrders: number;
  suppliers: number;
  products: number;
  machines: number;
  lastUpdated: string;
}

// Funktion zum Starten einer Synchronisierung
export async function triggerSync(type: string, options: any = {}) {
  const response = await axios.post(`${API_BASE_URL}/vendon/sync`, {
    type,
    ...options
  });
  
  // Wenn die Antwort eine apiResponse enthält, extrahieren wir diese
  if (response.data && response.data.apiResponse) {
    return {
      ...response.data,
      apiResponse: response.data.apiResponse
    };
  }
  
  return response.data;
}

// Funktion zum Abrufen aller Vendon-Produkte direkt von der Stock-API (ca. 109 Produkte)
export async function getAllVendonProducts(page = 0, limit = 100) {
  // Die korrekte Route ist /vendon/stocks
  console.log('Abrufen der Vendon-Stock-Produkte vom Server...');
  try {
    // Frage die ersten 100 Produkte ab
    const batch1Response = await axios.get(`${API_BASE_URL}/vendon/stocks?page=0&limit=${limit}`);
    let allProducts = batch1Response.data;
    console.log('Erster Batch Vendon-Stock-Produkte:', allProducts.length, 'Einträge');
    
    // Frage die nächsten 100 Produkte ab
    const batch2Response = await axios.get(`${API_BASE_URL}/vendon/stocks?page=1&limit=${limit}`);
    if (batch2Response.data && batch2Response.data.length > 0) {
      allProducts = [...allProducts, ...batch2Response.data];
      console.log('Zweiter Batch Vendon-Stock-Produkte:', batch2Response.data.length, 'Einträge');
    }
    
    // Optional: Dritter Batch, wenn nötig
    if (batch2Response.data && batch2Response.data.length === limit) {
      const batch3Response = await axios.get(`${API_BASE_URL}/vendon/stocks?page=2&limit=${limit}`);
      if (batch3Response.data && batch3Response.data.length > 0) {
        allProducts = [...allProducts, ...batch3Response.data];
        console.log('Dritter Batch Vendon-Stock-Produkte:', batch3Response.data.length, 'Einträge');
      }
    }
    
    console.log('Vendon-Stock-Produkte Struktur prüfen:', allProducts);
    console.log('Insgesamt Vendon-Stock-Produkte:', allProducts.length, 'Einträge');
    return allProducts;
  } catch (error) {
    console.error('Fehler beim Abrufen der Vendon-Stock-Produkte:', error);
    throw error;
  }
}

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
  supplierId?: number;
  salesCount?: number;  // Anzahl der Verkäufe
  lastSale?: string;    // Letzter Verkauf
  updatedAt?: string;
  createdAt?: string;
  // Neue Zusatzfelder für erweiterte Produktdetails
  articleSupplier?: string;  // Artikelnummer des Lieferanten
  minOrderQuantity?: number; // Mindestbestellmenge
  packageSize?: string;      // Gebindegröße, z.B. "6x0,5L" oder "24x330ml"
  shelfLifeDays?: number;    // MHD-Haltbarkeit in Tagen ab Lieferung
  alcoholPercent?: number;   // Alkoholgehalt in Prozent
  allergens?: string;        // Allergene als JSON-String
  nutritionalValues?: string; // Nährwerte als JSON-String
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

export interface RefillProduct {
  id: string;
  refillId: string;
  productId: string;
  productName: string;
  quantity: number;
  price?: number;
  slot?: string;
  position?: string;
  vendonProductId?: string;
  added?: number;            // Anzahl der hinzugefügten Produkte
  removed?: number;          // Anzahl der entfernten Produkte
  previousStock?: number;    // Vorheriger Lagerbestand
  currentStock?: number;     // Aktueller Lagerbestand nach der Auffüllung
  createdAt?: string;
  updatedAt?: string;
}

export interface Refill {
  id: number;
  vendonId: string;
  machineId: number;
  machineName: string;
  datetime: string;
  timestamp: string;
  status: string;
  notes?: string;
  warehouseId?: string;
  products: RefillProduct[];
  createdAt: string;
  updatedAt: string;
}

export interface RefillDetail {
  id: number;
  refillId: number;
  productId: number;
  productName: string;
  vendonProductId?: string;
  quantity: number;
  price?: number;
  position?: string;
  added?: number;           // Anzahl der hinzugefügten Produkte
  removed?: number;         // Anzahl der entfernten Produkte
  previousStock?: number;   // Vorheriger Lagerbestand
  currentStock?: number;    // Aktueller Lagerbestand
  datetime?: string;
  createdAt: string;
  updatedAt: string;
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

// Datenbankstatistiken abrufen
export async function getDatabaseStatistics(): Promise<DatabaseStatistics> {
  return apiRequest<DatabaseStatistics>('get', '/statistics/database');
}

// Wetter-API-Nutzung abrufen
export interface WeatherApiUsage {
  count: number;
  limit: number;
  remaining: number;
  resetDate: string;
  percentage: number;
}

export async function getWeatherApiUsage(): Promise<WeatherApiUsage> {
  return apiRequest<WeatherApiUsage>('get', '/weather/api-usage');
}

// Wetterdaten synchronisieren
export async function syncWeatherData(
  syncType: 'forecast' | 'historical' | 'historical_from_2023' | 'missing',
  options: any = {}
): Promise<any> {
  let endpoint = '';
  
  switch (syncType) {
    case 'forecast':
      endpoint = '/weather/forecast/sync';
      break;
    case 'historical':
      endpoint = '/weather/historical/sync';
      break;
    case 'historical_from_2023':
      endpoint = '/weather/historical/sync-from-2023';
      break;
    case 'missing':
      endpoint = '/weather/historical/sync-missing';
      break;
    default:
      throw new Error('Ungültiger Synchronisationstyp');
  }
  
  return apiRequest<any>('post', endpoint, options);
}

// Feiertage synchronisieren
export async function syncHolidays(
  syncType: 'holidays' | 'school' | 'all',
  options: any = {}
): Promise<any> {
  let endpoint = '';
  
  switch (syncType) {
    case 'holidays':
      endpoint = '/holidays/sync';
      break;
    case 'school':
      endpoint = '/holidays/sync-school';
      break;
    case 'all':
      endpoint = '/holidays/sync-all';
      break;
    default:
      throw new Error('Ungültiger Feiertagstyp');
  }
  
  return apiRequest<any>('post', endpoint, options);
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
export interface ProductsResponse {
  data: Product[];
  meta: {
    total: number;
    offset: number;
    limit: number;
    page: number;
    pages: number;
  }
}

// Zweite Deklaration wurde entfernt, die Funktion ist bereits oben definiert

export async function getProducts(params?: {
  limit?: number;
  offset?: number;
  category?: string;
  search?: string;
  supplierId?: number;
}): Promise<ProductsResponse> {
  const queryParams = new URLSearchParams();
  
  if (params) {
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.offset) queryParams.append('offset', params.offset.toString());
    if (params.category) queryParams.append('category', params.category);
    if (params.search) queryParams.append('search', params.search);
    if (params.supplierId) queryParams.append('supplierId', params.supplierId.toString());
  }
  
  const queryString = queryParams.toString();
  const url = `/products${queryString ? '?' + queryString : ''}`;
  
  return apiRequest<ProductsResponse>('get', url);
}

export async function getProduct(id: string): Promise<Product> {
  return apiRequest<Product>('get', `/products/${id}`);
}

// Neue Funktionen für die erweiterte Produktdetailseite
export async function getProductSalesTimeSeries(productId: string, period: 'day' | 'week' | 'month' | 'year' = 'month'): Promise<{date: string, count: number, revenue: number}[]> {
  return apiRequest<{date: string, count: number, revenue: number}[]>('get', `/products/${productId}/sales?period=${period}`);
}

export async function getProductRefills(productId: string, limit = 20): Promise<RefillDetail[]> {
  return apiRequest<RefillDetail[]>('get', `/products/${productId}/refills?limit=${limit}`);
}

export async function getProductMachines(productId: string): Promise<{machineId: string, machineName: string, currentStock: number, lastRefill: string}[]> {
  return apiRequest<{machineId: string, machineName: string, currentStock: number, lastRefill: string}[]>(
    'get', 
    `/products/${productId}/machines`
  );
}

export async function updateProduct(id: string, productData: Partial<Product>): Promise<Product> {
  return apiRequest<Product>('put', `/products/${id}`, productData);
}

export async function assignProductToSupplier(productId: number, supplierId: number, supplierName?: string): Promise<Product> {
  return apiRequest<Product>('put', `/products/${productId}`, {
    supplierId: supplierId,
    supplierName: supplierName
  });
}

/**
 * Produktdaten als Excel exportieren
 * @returns Ein Blob mit der Excel-Datei
 */
export async function exportProductsAsExcel(): Promise<Blob> {
  try {
    const response = await axios.get(`${API_BASE_URL}/products/export`, {
      responseType: 'blob'
    });
    return response.data;
  } catch (error) {
    console.error('Fehler beim Exportieren der Produktdaten:', error);
    throw error;
  }
}

/**
 * Importiert Produktdaten aus einer Excel-Datei
 * @param file Excel-Datei mit Produktdaten
 * @returns Ergebnis des Imports
 */
export async function importProductsFromExcel(file: File): Promise<{success: boolean, imported: number, errors: any[]}> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await axios.post(`${API_BASE_URL}/products/import`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Fehler beim Importieren der Produktdaten:', error);
    throw error;
  }
}

// Synchronisierung
export interface SyncStatusData {
  status: string;
  lastSync: number;
  count: number;
  latest?: number;
}

export interface HistoricalSyncStatus {
  inProgress: boolean;
  currentDate: string;
  targetDate: string;
  progress: number;
  completedMonths: string[];
  totalTransactions: number;
  processingTimeMin: number;
}

export interface SyncStatus {
  machines: SyncStatusData;
  products: SyncStatusData;
  transactions: SyncStatusData;
  refills: SyncStatusData;
  refillDetails?: SyncStatusData;
  events: SyncStatusData;
  historicalSync: HistoricalSyncStatus;
}

export async function getSyncStatus(): Promise<SyncStatus> {
  return apiRequest<SyncStatus>('get', '/sync/status');
}

export async function startSync(syncType: string, options?: {
  startDate?: Date,
  endDate?: Date,
  batchSize?: number,
  maxDays?: number,
  maxTransactions?: number,
  forceUpdate?: boolean
}): Promise<any> {
  try {
    console.log(`Sende Synchronisierungsanfrage für '${syncType}' mit Optionen:`, options);
    
    // Sende die Anfrage an den korrekten Endpunkt /vendon/sync und übergebe den syncType als Teil des Payloads
    const response = await apiRequest<any>('post', `/vendon/sync`, { 
      type: syncType, 
      ...options 
    });
    
    console.log(`Synchronisierungsantwort erhalten:`, response);
    
    // Prüfe auf leere Objekte oder fehlende syncLogId
    if (!response || Object.keys(response).length === 0) {
      throw new Error('Server hat eine leere Antwort zurückgegeben.');
    }
    
    return response;
  } catch (error) {
    console.error(`Fehler bei der Synchronisierung (${syncType}):`, error);
    // Füge einen detaillierteren Fehler für das Frontend hinzu
    throw new Error(`Fehler bei der ${syncType}-Synchronisierung: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
  }
}

// Die obere Deklaration von triggerSync wird für neue Komponenten verwendet, diese ist abwärtskompatibel

export async function getSyncLogs(limit = 20): Promise<SyncLog[]> {
  return apiRequest<SyncLog[]>('get', `/sync/logs?limit=${limit}`);
}

export async function getSyncLogsByType(syncType: string, limit = 20): Promise<SyncLog[]> {
  return apiRequest<SyncLog[]>('get', `/sync/logs?type=${syncType}&limit=${limit}`);
}

export async function getSyncLogById(id: number): Promise<SyncLog | null> {
  try {
    return await apiRequest<SyncLog | null>('get', `/sync/logs/${id}`);
  } catch (error) {
    console.error(`Error fetching sync log with ID ${id}:`, error);
    return null;
  }
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

// Lieferanten-Definition bereits oben vorhanden - diese Dopplung entfernt

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

// Einkaufsbedingungen (PurchaseConditions)
export interface PurchaseCondition {
  id: number;
  productId: number;
  supplierId: number;
  unitPrice: number;
  minQuantity?: number;
  packagingUnit?: string;
  deliveryTime?: string;
  validFrom?: string;
  validTo?: string;
  isPreferred: boolean;
  notes?: string;
  leadTime?: number;
  createdAt?: string;
  updatedAt?: string;
  // Erweiterte Felder für die Anzeige
  productName?: string;
  productSku?: string;
  supplierName?: string;
}

// API-Methoden für PurchaseConditions
export async function getPurchaseConditionsBySupplier(supplierId: number): Promise<PurchaseCondition[]> {
  return apiRequest<PurchaseCondition[]>('get', `/suppliers/${supplierId}/purchase-conditions`);
}

export async function getPurchaseConditionsByProduct(productId: number): Promise<PurchaseCondition[]> {
  return apiRequest<PurchaseCondition[]>('get', `/products/${productId}/purchase-conditions`);
}

export async function getPurchaseCondition(id: number): Promise<PurchaseCondition> {
  return apiRequest<PurchaseCondition>('get', `/purchase-conditions/${id}`);
}

export async function createPurchaseCondition(data: Omit<PurchaseCondition, 'id' | 'createdAt' | 'updatedAt'>): Promise<PurchaseCondition> {
  return apiRequest<PurchaseCondition>('post', `/purchase-conditions`, data);
}

export async function updatePurchaseCondition(id: number, data: Partial<Omit<PurchaseCondition, 'id' | 'createdAt' | 'updatedAt'>>): Promise<PurchaseCondition> {
  return apiRequest<PurchaseCondition>('put', `/purchase-conditions/${id}`, data);
}

export async function deletePurchaseCondition(id: number): Promise<{success: boolean; message: string}> {
  return apiRequest<{success: boolean; message: string}>('delete', `/purchase-conditions/${id}`);
}

// Bestellungen (Orders)
export interface Order {
  id: number;
  orderNumber: string;
  supplierId: number;
  supplierName: string;
  warehouseId: number;
  warehouseName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  expectedDeliveryDate: string | null;
  statusHistory: string | any[]; // Kann entweder ein JSON-String oder ein Array sein
  actualDeliveryDate: string | null;
  totalAmount: number;
  currency: string;
  vatAmount: number;
  discountAmount: number;
  shippingCost: number;
  trackingCode: string | null;
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
  isAutoGenerated: boolean;
  forecastId: number | null;
  priority: string;
  orderItems: OrderItem[];
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
  receivedQuantity?: number; // Für den Wareneingang
  isDamaged?: boolean;       // Für den Wareneingang
  damageReason?: string;    // Für den Wareneingang
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

export interface OrderDetail extends Omit<Order, 'statusHistory'> {
  orderItems: OrderItem[];
  supplier: Supplier;
  statusHistory: string | any[]; // Kann entweder ein JSON-String oder ein Array sein
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

export async function getOpenOrders(limit = 5): Promise<Order[]> {
  return apiRequest<Order[]>('get', `/orders/dashboard/open?limit=${limit}`);
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

/**
 * Verarbeitet den Wareneingang für eine Bestellung
 * @param id ID der Bestellung
 * @param receiptData Daten des Wareneingangs
 * @returns Die aktualisierte Bestellung
 */
export async function processOrderReceipt(id: number, receiptData: {
  receiptDate: Date;
  receiptNumber: string;
  deliveryNoteNumber?: string;
  qualityCheckPassed?: boolean;
  notes?: string;
  receivedItems: {
    orderItemId: number;
    receivedQuantity: number;
    qualityIssues?: boolean;
    damageDescription?: string;
  }[];
}): Promise<Order> {
  return apiRequest<Order>('post', `/orders/${id}/receipt`, receiptData);
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

// Neue Funktionen für Maschinenbestände
export async function getStocks(): Promise<Stock[]> {
  return apiRequest<Stock[]>('get', '/stocks');
}

export async function getMachineStocks(machineId?: number): Promise<MachineStock[]> {
  const url = machineId ? `/machine-stocks?machineId=${machineId}` : '/machine-stocks';
  return apiRequest<MachineStock[]>('get', url);
}

export async function getMachineStocksByLocation(locationId: number): Promise<MachineStock[]> {
  // Diese Funktion holt alle Maschinenbestände für einen bestimmten Standort,
  // indem sie zuerst alle Maschinen für diesen Standort abruft und dann
  // für jede Maschine die Bestände abfragt
  
  // Schritt 1: Alle Maschinen mit dem angegebenen locationId abrufen
  const machines = await getMachines();
  const locationMachines = machines.filter(machine => 
    machine.location && machine.location.toString().includes(locationId.toString()));
  
  if (locationMachines.length === 0) {
    return [];
  }
  
  // Schritt 2: Für jede Maschine die Bestände abrufen und zusammenführen
  const machineStocksPromises = locationMachines.map(machine => 
    getMachineStocks(Number(machine.id)));
  
  // Warten auf alle Anfragen und die Ergebnisse zusammenführen
  const machineStocksResults = await Promise.all(machineStocksPromises);
  
  // Alle Ergebnisse in einem Array zusammenführen
  return machineStocksResults.flat();
}

// Formatiert ein Datum im ISO-Format
export function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Datenbank-Statistiken
export interface DatabaseStats {
  transactions: { count: number; latest: Date | null };
  machines: { count: number; latest: Date | null };
  refills: { count: number; latest: Date | null };
  refillDetails: { count: number; latest: Date | null };
  events: { count: number; latest: Date | null };
  products: { count: number; latest: Date | null };
  stocks: { count: number; latest: Date | null };
  machineStocks: { count: number; latest: Date | null };
}

export async function getDatabaseStats(): Promise<DatabaseStats> {
  return apiRequest<DatabaseStats>('get', '/database/stats');
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

// Warenentnahme Interfaces
export interface ProductDisposalItem {
  id?: number;
  productId: string;
  productName: string;
  quantity: number;
  reason?: string;
  previousStock?: number;
  currentStock?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductDisposal {
  id: number;
  warehouseId: string;
  warehouseName: string;
  reason: string;
  description?: string;
  status: string;
  createdById?: number;
  createdByName?: string;
  createdAt: string;
  completedAt?: string;
  items: ProductDisposalItem[];
}

export async function getCurrentWeather(): Promise<WeatherCurrent> {
  return apiRequest<WeatherCurrent>('get', '/weather/current');
}

// Refills functions
export interface RefillsResponse {
  refills: Refill[];
  meta?: {
    total: number;
    page: number;
    limit: number;
  }
}

export async function getRefills(params?: {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  machineId?: string;
}): Promise<RefillsResponse> {
  const queryParams = new URLSearchParams();
  
  if (params) {
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.offset) queryParams.append('offset', params.offset.toString());
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.machineId) queryParams.append('machineId', params.machineId);
  } else {
    queryParams.append('limit', '50');
  }
  
  const queryString = queryParams.toString();
  const url = `/refills${queryString ? '?' + queryString : ''}`;
  
  return apiRequest<RefillsResponse>('get', url);
}

export async function getRefillsByMachine(
  machineId: string,
  limit = 50
): Promise<Refill[]> {
  return apiRequest<Refill[]>(
    'get',
    `/machines/${machineId}/refills?limit=${limit}`
  );
}

export async function getRefillDetails(refillId: number): Promise<RefillDetail[]> {
  return apiRequest<RefillDetail[]>('get', `/refills/${refillId}/details`);
}

export async function getRefillById(refillId: string): Promise<Refill> {
  return apiRequest<Refill>('get', `/refills/${refillId}`);
}

// Lager (Warehouse) API-Funktionen
export interface Warehouse {
  id: string;
  name: string;
  location: string;
  description?: string;
  machineIds?: string[]; // Zugeordnete Automaten
  createdAt?: string;
  updatedAt?: string;
}

export interface WarehouseProduct {
  id: string;
  warehouseId: string;
  productId: string;
  productName: string;
  quantity: number;
  minQuantity: number;
  lastUpdated: string;
}

export async function getWarehouseById(warehouseId?: string): Promise<Warehouse> {
  if (!warehouseId) throw new Error("Warehouse ID is required");
  return apiRequest<Warehouse>('get', `/warehouses/${warehouseId}`);
}

export async function getWarehouseInventory(warehouseId?: string): Promise<WarehouseProduct[]> {
  if (!warehouseId) throw new Error("Warehouse ID is required");
  return apiRequest<WarehouseProduct[]>('get', `/warehouses/${warehouseId}/inventory`);
}

export async function updateWarehouseInventory(
  warehouseId: string, 
  products: WarehouseProduct[]
): Promise<WarehouseProduct[]> {
  return apiRequest<WarehouseProduct[]>('put', `/warehouses/${warehouseId}/inventory`, { products });
}

export async function getWeatherForecast(days = 5): Promise<WeatherForecast[]> {
  return apiRequest<WeatherForecast[]>('get', `/weather/forecast?days=${days}`);
}

// Warehouses List API Functions
export async function getWarehouses(): Promise<Warehouse[]> {
  return apiRequest<Warehouse[]>('get', '/warehouses');
}

// Product Disposal API Functions
export async function getProductDisposals(params: {
  warehouseId?: string;
  status?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<ProductDisposal[]> {
  const queryParams = new URLSearchParams();
  
  if (params.warehouseId) queryParams.append('warehouseId', params.warehouseId);
  if (params.status) queryParams.append('status', params.status);
  if (params.limit) queryParams.append('limit', params.limit.toString());
  if (params.offset) queryParams.append('offset', params.offset.toString());
  
  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
  return apiRequest<ProductDisposal[]>('get', `/product-disposals${queryString}`);
}

export async function getProductDisposal(id: number): Promise<ProductDisposal> {
  return apiRequest<ProductDisposal>('get', `/product-disposals/${id}`);
}

export async function createProductDisposal(data: {
  warehouseId: string;
  reason: string;
  description?: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    reason?: string;
  }[];
}): Promise<ProductDisposal> {
  return apiRequest<ProductDisposal>('post', '/product-disposals', data);
}

export async function updateProductDisposalStatus(id: number, status: string): Promise<ProductDisposal> {
  return apiRequest<ProductDisposal>('put', `/product-disposals/${id}/status`, { status });
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

// Prognosemodelle abrufen
export async function getForecastModels() {
  return apiRequest('get', '/forecast/models');
}

export interface DashboardForecast {
  date: string;
  locationId?: number;
  locationName?: string;
  predictedQuantity: number;
  confidence?: number | null;
  isHoliday?: boolean;
  holidayName?: string;
}

export async function getDashboardForecasts(): Promise<DashboardForecast[]> {
  return apiRequest<DashboardForecast[]>('get', '/forecast/dashboard');
}

// Neue Funktion zum Training eines Prognosemodells
export async function trainForecastModel(modelId: number, startDate: string, endDate: string, locationIds?: number[], machineIds?: number[]) {
  const data = {
    startDate,
    endDate,
    locationIds: locationIds || [],
    machineIds: machineIds || []
  };
  return apiRequest('post', `/forecast/models/${modelId}/train`, data);
}

// Initialisiert das Standardprognosemodell mit sinnvollen Standardwerten
export async function initializeDefaultForecastModel() {
  try {
    // Starte die automatische Initialisierung auf dem Server
    const response = await apiRequest<{
      success: boolean; 
      message: string;
      modelId?: number;
      modelName?: string;
      trainingPeriodStart?: string;
      trainingPeriodEnd?: string;
    }>('post', '/forecast/auto-train');
    
    if (response && response.success) {
      return { 
        success: true, 
        message: 'Prognosemodell-Initialisierung gestartet. Die Prognosen werden in Kürze verfügbar sein.',
        result: response 
      };
    } else {
      console.error('Fehler bei der automatischen Initialisierung:', response);
      return { 
        success: false, 
        message: 'Die automatische Modell-Initialisierung konnte nicht durchgeführt werden.',
        details: response
      };
    }
  } catch (error) {
    console.error('Fehler bei der Initialisierung des Prognosemodells:', error);
    return { 
      success: false, 
      message: 'Fehler bei der Initialisierung des Prognosemodells. Bitte verwenden Sie die manuelle Initialisierung.',
      error: String(error)
    };
  }
}