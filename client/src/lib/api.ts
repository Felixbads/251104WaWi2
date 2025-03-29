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