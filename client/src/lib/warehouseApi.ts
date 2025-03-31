// Lager-API
// Diese Datei enthält Funktionen für den Zugriff auf Lager-Daten über die API

// Typen für Lager
export interface Warehouse {
  id: string;
  name: string;
  description?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Ruft alle Lager ab
 * @returns Eine Liste aller Lager
 */
export async function getAllWarehouses(): Promise<any[]> {
  try {
    const response = await fetch('/api/warehouses');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Fehler beim Abrufen der Lager:', error);
    return [];
  }
}

/**
 * Ruft ein bestimmtes Lager anhand seiner ID ab
 * @param id ID des Lagers
 * @returns Details des Lagers
 */
export async function getWarehouseById(id: string): Promise<any> {
  try {
    const response = await fetch(`/api/warehouses/${id}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Fehler beim Abrufen des Lagers ${id}:`, error);
    throw error;
  }
}

/**
 * Erstellt ein neues Lager
 * @param data Lagerdaten
 * @returns Das erstellte Lager
 */
export async function createWarehouse(data: Omit<Warehouse, 'id' | 'createdAt' | 'updatedAt'>): Promise<any> {
  try {
    const response = await fetch('/api/warehouses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Fehler beim Erstellen des Lagers:', error);
    throw error;
  }
}

/**
 * Aktualisiert ein bestehendes Lager
 * @param id ID des Lagers
 * @param data Zu aktualisierende Lagerdaten
 * @returns Das aktualisierte Lager
 */
export async function updateWarehouse(id: string, data: Partial<Omit<Warehouse, 'id' | 'createdAt' | 'updatedAt'>>): Promise<any> {
  try {
    const response = await fetch(`/api/warehouses/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Fehler beim Aktualisieren des Lagers ${id}:`, error);
    throw error;
  }
}

/**
 * Löscht ein Lager
 * @param id ID des Lagers
 * @returns Erfolg oder Misserfolg des Löschvorgangs
 */
export async function deleteWarehouse(id: string): Promise<any> {
  try {
    const response = await fetch(`/api/warehouses/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Fehler beim Löschen des Lagers ${id}:`, error);
    throw error;
  }
}