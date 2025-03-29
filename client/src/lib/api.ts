// API client for making requests to the server
import { apiRequest } from "./queryClient";

// Sync related API calls
export async function getSyncStatus() {
  const res = await apiRequest("GET", "/api/sync/status");
  return res.json();
}

export async function triggerSync(type: 'machines' | 'transactions' | 'events' | 'refills' | 'all', options?: {
  startDate?: string;
  endDate?: string;
  batchSize?: number;
}) {
  const res = await apiRequest("POST", `/api/sync/${type}`, options);
  return res.json();
}

export async function getSyncLogs(limit: number = 25) {
  const res = await apiRequest("GET", `/api/sync/logs?limit=${limit}`);
  return res.json();
}

// Transaction related API calls
export async function getTransactions(limit: number = 25) {
  const res = await apiRequest("GET", `/api/transactions?limit=${limit}`);
  return res.json();
}

export async function getTransactionsByDateRange(startDate: string, endDate: string, limit: number = 25) {
  const res = await apiRequest(
    "GET", 
    `/api/transactions/byDateRange?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&limit=${limit}`
  );
  return res.json();
}

// Machine related API calls
export async function getMachines(limit: number = 25) {
  const res = await apiRequest("GET", `/api/machines?limit=${limit}`);
  return res.json();
}

export async function getMachine(id: number) {
  const res = await apiRequest("GET", `/api/machines/${id}`);
  return res.json();
}

export async function getMachineTransactions(id: number, limit: number = 25) {
  const res = await apiRequest("GET", `/api/machines/${id}/transactions?limit=${limit}`);
  return res.json();
}

// Event related API calls
export async function getEvents(limit: number = 25) {
  const res = await apiRequest("GET", `/api/events?limit=${limit}`);
  return res.json();
}

// Helper to format date to YYYY-MM-DD
export function formatDateForApi(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Helper to format date to readable format: DD.MM.YYYY HH:MM
export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return `${date.toLocaleDateString('de-DE')} ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
}

// Helper to format duration in seconds to readable format
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(0)}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}
