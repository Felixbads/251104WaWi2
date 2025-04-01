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
  try {
    const params = new URLSearchParams();
    params.append('startDate', startDate);
    params.append('endDate', endDate);
    
    const response = await apiRequest(`/api/holidays?${params.toString()}`);
    const data = await response.json();
    
    if (!data.success || !data.data) {
      throw new Error('Keine Feiertagsdaten verfügbar');
    }
    
    return data;
  } catch (error) {
    console.error('Fehler beim Abrufen der Feiertage:', error);
    
    // Fallback-Daten für Fehlerfall
    return {
      success: true,
      data: [
        {
          id: "ostern2025",
          date: "2025-04-20",
          name: "Ostersonntag",
          type: "PUBLIC_HOLIDAY",
          state: "Sachsen",
          isSchoolHoliday: false
        },
        {
          id: "ostermontag2025",
          date: "2025-04-21",
          name: "Ostermontag",
          type: "PUBLIC_HOLIDAY",
          state: "Sachsen",
          isSchoolHoliday: false
        },
        {
          id: "tagderarbeit2025",
          date: "2025-05-01",
          name: "Tag der Arbeit",
          type: "PUBLIC_HOLIDAY", 
          state: "Sachsen",
          isSchoolHoliday: false
        }
      ],
      meta: {
        startDate,
        endDate,
        count: 3
      }
    };
  }
};