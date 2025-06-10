import { apiRequest } from "@/lib/queryClient";

// Holen aller Feiertage
export const getAllHolidays = async () => {
  const response = await apiRequest('/api/holidays', null, 'GET');
  return response.json();
};

// Bevorstehende Feiertage für die nächsten X Tage abrufen
export const getUpcomingHolidays = async (days: number = 30, type?: string) => {
  const params = new URLSearchParams();
  if (days) params.append('days', days.toString());
  if (type) params.append('type', type);
  
  const response = await apiRequest(`/api/holidays/upcoming?${params.toString()}`, null, 'GET');
  return response.json();
};

// Feiertage für ein bestimmtes Datum abrufen
export const getHolidaysForDate = async (date: string) => {
  const response = await apiRequest(`/api/holidays/by-date/${date}`, null, 'GET');
  return response.json();
};

// Feiertage für einen Zeitraum abrufen
export const getHolidaysInRange = async (startDate: string, endDate: string) => {
  const params = new URLSearchParams();
  params.append('startDate', startDate);
  params.append('endDate', endDate);
  
  const response = await apiRequest(`/api/holidays?${params.toString()}`, null, 'GET');
  
  // Check if response is HTML (error page) instead of JSON
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    console.error('API-Antwort (Rohtext):', text);
    throw new Error(`Server returned ${contentType || 'unknown content type'} instead of JSON`);
  }
  
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Fehler beim Abrufen der Feiertage');
  }
  
  return data;
};