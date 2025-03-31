import { apiRequest } from './queryClient';

/**
 * Interface für entfernte Produkte aus Refill Details
 */
export interface RemovedProduct {
  id: number;
  refillId: number;
  productName: string;
  removed: number;
  datetime: string;
  machineId: number;
  machineName: string;
}

/**
 * Interface für die Gruppierung der entfernten Produkte
 */
export interface RemovedProductsAnalytics {
  byProduct: {name: string; count: number}[];
  byMachine: {name: string; count: number}[];
  byDate: {date: string; count: number}[];
}

/**
 * Interface für die Antwort der API mit Produktdaten und Analyse
 */
export interface RemovedProductsResponse {
  products: RemovedProduct[];
  analytics: RemovedProductsAnalytics;
}

/**
 * Ruft alle entfernten Produkte ab (aus Refill Details mit removed > 0)
 * @param params Parameter für die Abfrage (Maschinen-ID, Datumsbereich)
 * @returns Liste aller entfernten Produkte mit Analyse
 */
export async function getRemovedProducts(params?: {
  machineId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<RemovedProductsResponse> {
  // Parameter in URL-Query umwandeln
  const queryParams = [];
  if (params?.machineId) queryParams.push(`machineId=${params.machineId}`);
  if (params?.startDate) queryParams.push(`startDate=${params.startDate}`);
  if (params?.endDate) queryParams.push(`endDate=${params.endDate}`);
  if (params?.limit) queryParams.push(`limit=${params.limit}`);
  
  const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
  
  return apiRequest<RemovedProductsResponse>('get', `/removed-products${queryString}`);
}

/**
 * Ruft eine Zusammenfassung der entfernten Produkte nach Gruppierung ab
 * @param groupBy Gruppierung (product, machine, date)
 * @param startDate Startdatum (optional)
 * @param endDate Enddatum (optional)
 * @returns Gruppierte Zusammenfassung der entfernten Produkte
 */
export async function getRemovedProductsSummary(
  groupBy: 'product' | 'machine' | 'date' = 'product',
  startDate?: string,
  endDate?: string
): Promise<{name: string; total_removed: number}[]> {
  // Parameter in URL-Query umwandeln
  const queryParams = [`groupBy=${groupBy}`];
  if (startDate) queryParams.push(`startDate=${startDate}`);
  if (endDate) queryParams.push(`endDate=${endDate}`);
  
  const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
  
  return apiRequest<{name: string; total_removed: number}[]>('get', `/removed-products/summary${queryString}`);
}