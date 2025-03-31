import { apiRequest } from "./queryClient";

/**
 * Interface für die Parameter der Abfrage von entfernten Produkten
 */
export interface RemovedProductsParams {
  machineId?: string;
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
    machineId: string;
  }[];
  analytics: RemovedProductsSummary;
}

/**
 * Ruft entfernte Produkte (Produkte, die bei Auffüllungen entfernt wurden) ab
 * @param params Parameter für die Filterung (Maschine, Zeitraum, Limit)
 * @returns RemovedProductsResponse mit Produkten und Analysen
 */
export async function getRemovedProducts(params: RemovedProductsParams): Promise<RemovedProductsResponse> {
  const queryParams = new URLSearchParams();
  
  if (params.machineId) queryParams.append('machineId', params.machineId);
  if (params.startDate) queryParams.append('startDate', params.startDate);
  if (params.endDate) queryParams.append('endDate', params.endDate);
  if (params.limit) queryParams.append('limit', params.limit.toString());
  
  const url = `/api/removed-products${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  
  const response = await apiRequest(url);
  return response.json();
}

/**
 * Ruft eine Zusammenfassung von entfernten Produkten für Analysen ab
 * @param params Parameter für die Filterung (Maschine, Zeitraum)
 * @returns Zusammenfassung der entfernten Produkte
 */
export async function getRemovedProductsSummary(params: RemovedProductsParams): Promise<RemovedProductsSummary> {
  const queryParams = new URLSearchParams();
  
  if (params.machineId) queryParams.append('machineId', params.machineId);
  if (params.startDate) queryParams.append('startDate', params.startDate);
  if (params.endDate) queryParams.append('endDate', params.endDate);
  
  const url = `/api/removed-products/summary${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  
  const response = await apiRequest(url);
  return response.json();
}

/**
 * Exportiert die Daten der entfernten Produkte als CSV oder Excel
 * @param params Parameter für die Filterung (Maschine, Zeitraum)
 * @param format Das Exportformat ('csv' oder 'excel')
 * @returns Blob mit den exportierten Daten
 */
export async function exportRemovedProducts(params: RemovedProductsParams, format: 'csv' | 'excel'): Promise<Blob> {
  const queryParams = new URLSearchParams();
  
  if (params.machineId) queryParams.append('machineId', params.machineId);
  if (params.startDate) queryParams.append('startDate', params.startDate);
  if (params.endDate) queryParams.append('endDate', params.endDate);
  queryParams.append('format', format);
  
  const url = `/api/removed-products/export${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  
  const response = await apiRequest(url);
  return response.blob();
}