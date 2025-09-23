/**
 * Zentrale Route-Definitionen für Warehouse V3 System
 * Eliminiert alle String-Literale für konsistente Navigation
 */

/**
 * Warehouse V3 Route Builder - Zentrale Quelle für alle Warehouse-URLs
 */
export const warehouseRoutes = {
  // Hauptpfade
  dashboard: '/lager',
  warehouseDetail: (id: string | number) => `/lager/${id}`,
  
  // Warehouse-spezifische Tabs/Subrouten
  warehouseBatches: (id: string | number) => `/lager/${id}/chargen`,
  warehouseMovements: (id: string | number) => `/lager/${id}/bewegungen`,
  warehouseInventory: (id: string | number) => `/lager/${id}/inventur`,
  warehouseStats: (id: string | number) => `/lager/${id}/statistiken`,
  
  // API-Endpunkte (V3)
  api: {
    warehouses: '/api/warehouse3/warehouses',
    warehouseDetail: (id: string | number) => `/api/warehouse3/warehouses/${id}`,
    warehouseStats: (id: string | number) => `/api/warehouse3/warehouses/${id}/stats`,
    warehouseBatches: (id: string | number) => `/api/warehouse3/warehouses/${id}/batches`,
    warehouseMovements: (id: string | number) => `/api/warehouse3/warehouses/${id}/movements`,
    overview: '/api/warehouse3/overview'
  }
} as const;

/**
 * Legacy Route Redirects - für Rückwärtskompatibilität
 */
export const legacyRoutes = {
  // Alt → Neu Mapping
  '/lagerbestand': warehouseRoutes.dashboard,
  '/lagerbestand/:id': (id: string | number) => warehouseRoutes.warehouseDetail(id),
} as const;

/**
 * Helper Functions für Route-Generierung
 */
export const buildWarehousePath = (id: string | number) => warehouseRoutes.warehouseDetail(id);
export const buildBatchesPath = (id: string | number) => warehouseRoutes.warehouseBatches(id);
export const buildMovementsPath = (id: string | number) => warehouseRoutes.warehouseMovements(id);
export const buildInventoryPath = (id: string | number) => warehouseRoutes.warehouseInventory(id);