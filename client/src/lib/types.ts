// Type definitions for API responses

export interface SyncStatusItem {
  status: 'completed' | 'running' | 'error' | string;
  lastSync: string;
  count: number;
  latest?: string;
}

export interface SyncStatus {
  machines: SyncStatusItem;
  transactions: SyncStatusItem;
  events: SyncStatusItem;
  refills: SyncStatusItem;
}

export interface SyncLog {
  id: number;
  syncType: string;
  startDate: string | null;
  endDate: string | null;
  itemsFound: number;
  itemsSaved: number;
  itemsUpdated: number;
  duplicates: number;
  errors: number;
  errorMessage: string | null;
  syncStatus: string;
  durationSeconds: number;
  createdAt: string;
  additionalData: any | null;
}

export interface Transaction {
  id: number;
  vendonId: string | null;
  machineId: number;
  locationId: number | null;
  productId: number | null;
  transactionType: string | null;
  paymentMethod: string | null;
  amount: number | null;
  currency: string | null;
  priceVat: number | null;
  priceWoVat: number | null;
  vat: number | null;
  quantity: number | null;
  stockId: string | null;
  selection: string | null;
  discountAmount: number | null;
  discountCode: string | null;
  note: string | null;
  transactionDt: string | null;
  registeredDt: string | null;
  createdAt: string;
  metadata: any | null;
  transactionData: any | null;
}

export interface Machine {
  id: number;
  vendonId: string;
  machineName: string;
  machineType: string | null;
  serialNumber: string | null;
  locationId: number | null;
  locationName: string | null;
  status: string | null;
  lastActivity: string | null;
  createdAt: string;
  updatedAt: string | null;
  metadata: any | null;
}

export interface Event {
  id: number;
  vendonId: string | null;
  machineId: number | null;
  eventType: string;
  eventSubtype: string | null;
  eventSeverity: string | null;
  message: string | null;
  eventData: any | null;
  eventDt: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolution: string | null;
}

export interface Refill {
  id: number;
  vendonId: string;
  machineId: number;
  operatorId: string | null;
  operatorName: string | null;
  startDt: string | null;
  endDt: string | null;
  status: string | null;
  createdAt: string;
  metadata: any | null;
}

export interface RefillDetail {
  id: number;
  refillId: number;
  productId: number | null;
  quantity: number | null;
  stockId: string | null;
  selectionId: string | null;
  createdAt: string;
}

export interface Product {
  id: number;
  vendonId: string;
  productName: string;
  productType: string | null;
  category: string | null;
  price: number | null;
  currency: string | null;
  createdAt: string;
  updatedAt: string | null;
  metadata: any | null;
}

export interface Location {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  createdAt: string;
  updatedAt: string | null;
}