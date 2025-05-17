/**
 * Zentrale Definition aller Query-Keys für React Query
 * 
 * Diese Datei stellt sicher, dass überall in der Anwendung
 * konsistente Query-Keys verwendet werden, was eine präzise
 * Cache-Invalidierung ermöglicht.
 */

/**
 * Query-Keys für den Bestellprozess
 */
export const orderKeys = {
  // Basis-Key für alle Bestellungen
  all: ['orders'] as const,
  
  // Listen von Bestellungen
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (filters: any = {}) => [...orderKeys.lists(), { ...filters }] as const,
  
  // Dashboard-Daten
  dashboard: () => [...orderKeys.all, 'dashboard'] as const,
  open: () => [...orderKeys.dashboard(), 'open'] as const,
  
  // Details zu einzelnen Bestellungen
  details: () => [...orderKeys.all, 'detail'] as const,
  detail: (id: number) => [...orderKeys.details(), id] as const,
  
  // Bestellungen nach Lieferant
  bySupplier: (supplierId: number) => [...orderKeys.lists(), { supplierId }] as const,
  
  // E-Mail-Vorlagen
  emailTemplate: (orderId: number, templateType: string) => [...orderKeys.detail(orderId), 'email-template', templateType] as const,
  
  // Produkte in einer Bestellung
  products: (orderId: number) => [...orderKeys.detail(orderId), 'products'] as const
};

/**
 * Query-Keys für Lieferanten
 */
export const supplierKeys = {
  all: ['suppliers'] as const,
  lists: () => [...supplierKeys.all, 'list'] as const,
  list: (filters: any = {}) => [...supplierKeys.lists(), { ...filters }] as const,
  details: () => [...supplierKeys.all, 'detail'] as const,
  detail: (id: number) => [...supplierKeys.details(), id] as const,
  products: (id: number) => [...supplierKeys.detail(id), 'products'] as const
};

/**
 * Query-Keys für Produkte
 */
export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (filters: any = {}) => [...productKeys.lists(), { ...filters }] as const,
  details: () => [...productKeys.all, 'detail'] as const,
  detail: (id: number) => [...productKeys.details(), id] as const,
  bySupplier: (supplierId: number, warehouseId?: number) => {
    const filters: Record<string, number> = { supplierId };
    if (warehouseId) filters.warehouseId = warehouseId;
    return [...productKeys.lists(), filters] as const;
  }
};

/**
 * Query-Keys für Lager
 */
export const warehouseKeys = {
  all: ['warehouses'] as const,
  lists: () => [...warehouseKeys.all, 'list'] as const,
  list: (filters: any = {}) => [...warehouseKeys.lists(), { ...filters }] as const,
  details: () => [...warehouseKeys.all, 'detail'] as const,
  detail: (id: number) => [...warehouseKeys.details(), id] as const,
  inventory: (id: number) => [...warehouseKeys.detail(id), 'inventory'] as const
};