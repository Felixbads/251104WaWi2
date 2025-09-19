import { apiRequest } from "./queryClient";

/**
 * Interface für die Parameter der Abfrage von entfernten Produkten
 */
export interface RemovedProductsParams {
  machineId?: number;
  productName?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

/**
 * Interface für die Zusammenfassung von entfernten Produkten
 */
export interface RemovedProductsSummary {
  total: number;
  byProduct: { name: string; count: number }[];
  byMachine: { name: string; count: number }[];
  byDate: { date: string; count: number }[];
  byTimePeriod: { period: string; count: number }[];
}

/**
 * Interface für die Antwort der API-Abfrage von entfernten Produkten
 */
export interface RemovedProductsResponse {
  products: {
    id: number;
    refillId: number;
    datetime: string;
    productId: string;
    productName: string;
    removed: number;
    machineName: string;
    machineId: number;
  }[];
  analytics: RemovedProductsSummary;
}

/**
 * Ruft entfernte Produkte (Produkte, die bei Auffüllungen entfernt wurden) ab
 * @param params Parameter für die Filterung (Maschine, Zeitraum, Limit)
 * @returns RemovedProductsResponse mit Produkten und Analysen
 */
export async function getRemovedProducts(params: RemovedProductsParams): Promise<RemovedProductsResponse> {
  const queryParams: any = {};
  
  if (params.machineId) queryParams.machineId = params.machineId;
  if (params.productName) queryParams.productName = params.productName;
  if (params.startDate) queryParams.startDate = params.startDate;
  if (params.endDate) queryParams.endDate = params.endDate;
  if (params.limit) queryParams.limit = params.limit;
  
  return apiRequest('/removed-products', queryParams, 'GET');
}

/**
 * Ruft eine Zusammenfassung von entfernten Produkten für Analysen ab
 * @param params Parameter für die Filterung (Maschine, Zeitraum)
 * @returns Zusammenfassung der entfernten Produkte
 */
export async function getRemovedProductsSummary(params: RemovedProductsParams): Promise<RemovedProductsSummary> {
  const queryParams: any = {};
  
  if (params.machineId) queryParams.machineId = params.machineId;
  if (params.productName) queryParams.productName = params.productName;
  if (params.startDate) queryParams.startDate = params.startDate;
  if (params.endDate) queryParams.endDate = params.endDate;
  
  return apiRequest('/removed-products/summary', queryParams, 'GET');
}

/**
 * Exportiert die Daten der entfernten Produkte als CSV oder Excel
 * @param params Parameter für die Filterung (Maschine, Zeitraum)
 * @param format Das Exportformat ('csv' oder 'excel')
 * @returns Blob mit den exportierten Daten
 */
export async function exportRemovedProducts(params: RemovedProductsParams, format: 'csv' | 'excel'): Promise<Blob> {
  const queryParams: any = {};
  
  if (params.machineId) queryParams.machineId = params.machineId;
  if (params.productName) queryParams.productName = params.productName;
  if (params.startDate) queryParams.startDate = params.startDate;
  if (params.endDate) queryParams.endDate = params.endDate;
  queryParams.format = format;
  
  // For blob downloads, we need to handle the response differently
  const token = localStorage.getItem('auth_token');
  const queryString = new URLSearchParams(queryParams).toString();
  const response = await fetch(`/api/removed-products/export?${queryString}`, {
    method: 'GET',
    headers: {
      'Authorization': token ? `Bearer ${token}` : ''
    }
  });
  
  if (!response.ok) {
    throw new Error(`Export failed: ${response.statusText}`);
  }
  
  return response.blob();
}