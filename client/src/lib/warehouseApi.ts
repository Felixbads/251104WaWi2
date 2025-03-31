import { apiRequest } from "./queryClient";

export interface Warehouse {
  id: string;
  name: string;
  location: string;
  description: string | null;
  createdAt: string;
  updatedAt: string | null;
  inventoryCount: number;
}

/**
 * Ruft alle Lager ab
 * @returns Eine Liste aller Lager
 */
export async function getWarehouses(): Promise<Warehouse[]> {
  const response = await apiRequest('/api/warehouses');
  return response.json();
}

/**
 * Ruft ein bestimmtes Lager anhand seiner ID ab
 * @param id Lager-ID
 * @returns Lager oder null, wenn nicht gefunden
 */
export async function getWarehouse(id: string): Promise<Warehouse | null> {
  try {
    const response = await apiRequest(`/api/warehouses/${id}`);
    return response.json();
  } catch (error) {
    if (error instanceof Response && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Ruft Produkte in einem bestimmten Lager ab
 * @param warehouseId Lager-ID
 * @param search Optionaler Suchbegriff für Produkte
 * @returns Liste der Produkte im Lager
 */
export async function getWarehouseProducts(warehouseId: string, search?: string): Promise<any[]> {
  const queryParams = new URLSearchParams();
  
  if (search) queryParams.append('search', search);
  
  const url = `/api/warehouses/${warehouseId}/products${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  
  const response = await apiRequest(url);
  return response.json();
}