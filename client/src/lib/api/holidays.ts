import { apiRequest } from "@/lib/queryClient";

// Holen aller Feiertage
export const getAllHolidays = async () => {
  const response = await apiRequest('/api/holidays');
  return response.json();
};

// Bevorstehende Feiertage für die nächsten X Tage abrufen
export const getUpcomingHolidays = async (days: number = 30, type?: string) => {
  const params = new URLSearchParams();
  if (days) params.append('days', days.toString());
  if (type) params.append('type', type);
  
  const response = await apiRequest(`/api/holidays/upcoming?${params.toString()}`);
  return response.json();
};

// Feiertage für ein bestimmtes Datum abrufen
export const getHolidaysForDate = async (date: string) => {
  const response = await apiRequest(`/api/holidays/by-date/${date}`);
  return response.json();
};

// Feiertage für einen Zeitraum abrufen
export const getHolidaysInRange = async (startDate: string, endDate: string) => {
  const params = new URLSearchParams();
  params.append('startDate', startDate);
  params.append('endDate', endDate);
  
  const response = await apiRequest(`/api/holidays?${params.toString()}`);
  return response.json();
};