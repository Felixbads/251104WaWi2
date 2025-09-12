/**
 * Enhanced TypeScript interfaces for Email Daily Reports
 * Matches the backend DailyReportData structure with new sections
 */

// Order delivery tracking interfaces
export interface OrderDelivery {
  bestellnummer: string;
  lieferant: string;
  bestelldatum: string;
  erwartetes_lieferdatum?: string;
  tatsächliches_lieferdatum?: string;
  status: string;
  produkte: string[];
  gesamtwert: number;
  verspätung_tage?: number;
}

// Machine status alert interfaces
export interface MachineStatusAlert {
  automat: string;
  automat_id: string;
  alert_typ: 'hoher_geldbestand' | 'wenig_münzen' | 'technische_anomalie' | 'performance_abweichung';
  meldung: string;
  schweregrad: 'niedrig' | 'mittel' | 'hoch' | 'kritisch';
  wert?: number;
  grenzwert?: number;
  einheit?: string;
  dauer?: string;
}

// MHD items interface
export interface MHDItem {
  lager?: string;
  automat?: string;
  produkt: string;
  anzahl: number;
  mhd: string;
}

// Weather data interface
export interface WeatherData {
  standort: string;
  heute: {
    wetter: string;
    temperatur: string;
    regenwahrscheinlichkeit: string;
    prognostizierter_umsatz: Array<{
      automat: string;
      wert: number;
    }>;
  };
  wettervorschau: Array<{
    tag: string;
    wetter: string;
    temperatur: string;
    bemerkung: string;
  }>;
  ferien: Array<{
    bundesland: string;
    status: string;
    resttage: number;
  }>;
  auswirkung: string;
}

// Enhanced Daily report data structure
export interface EnhancedDailyReportData {
  template: string;
  date: string;
  betreff: string;
  sections: {
    // Verkäufe Section
    verkäufe: {
      anzahl_verkäufe: number;
      umsatzsumme: number;
      top_produkte: Array<{
        name: string;
        stückzahl: number;
        umsatz: number;
      }>;
    };
    // Bestände & Logistik Section
    bestände_logistik: {
      niedriger_lagerbestand: Array<{
        produkt: string;
        bestand: number;
        schwellenwert: number;
      }>;
      nachzubestellende_artikel: Array<{
        produkt: string;
        priorität: string;
        abverkaufsgeschwindigkeit: string;
        empfohlene_menge: number;
      }>;
      nahendes_mhd: {
        lager: {
          "<5": MHDItem[];
          "<14": MHDItem[];
          "<31": MHDItem[];
        };
        automaten: MHDItem[];
      };
    };
    // ENHANCED: Bestellungen & Lieferungen Section
    erweiterte_bestellungen: {
      heute_erwartet: OrderDelivery[];
      diese_woche: OrderDelivery[];
      verspätet: OrderDelivery[];
      nicht_geliefert: OrderDelivery[];
      zusammenfassung: {
        total_ausstehend: number;
        total_wert_ausstehend: number;
        kritische_verspätungen: number;
      };
    };
    // ENHANCED: Automaten-Status & Anomalien Section  
    automaten_status: {
      hoher_geldbestand: MachineStatusAlert[];
      münzgeld_warnungen: MachineStatusAlert[];
      technische_anomalien: MachineStatusAlert[];
      performance_abweichungen: MachineStatusAlert[];
      zusammenfassung: {
        total_alerts: number;
        kritische_alerts: number;
        betroffene_automaten: number;
      };
    };
    // Wetter, Ferien & Umsatzprognose
    wetter_ferien_umsatz?: WeatherData;
    // Legacy open orders (if enabled)
    offene_wareneingänge?: Array<{
      lieferant: string;
      bestelldatum: string;
      produkte: string[];
    }>;
    // Agent Analysis
    agent_analyse?: {
      besondere_auffälligkeiten: string[];
      trends: string[];
      empfehlungen: string[];
    };
    // Additional hints
    hinweise: string[];
  };
}

// Email template interface for enhanced templates
export interface EnhancedEmailTemplate {
  id?: number;
  name: string;
  description?: string;
  subjectTemplate: string;
  contentTemplate: string;
  isDefault: boolean;
  supportsEnhancedSections?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Preview data interface that extends the current PreviewData
export interface EnhancedPreviewData {
  // Legacy fields for backwards compatibility
  mhdAlerts: Array<{
    productName: string;
    expiryDate: string;
    daysUntilExpiry: number;
    quantity: number;
    location: string;
  }>;
  stockAlerts: Array<{
    productName: string;
    currentStock: number;
    minimumStock: number;
    location: string;
  }>;
  pendingOrders: Array<{
    orderNumber: string;
    supplierName: string;
    expectedDelivery: string;
    totalAmount: number;
  }>;
  recentDeliveries: Array<{
    orderNumber: string;
    supplierName: string;
    deliveredDate: string;
    products: string[];
  }>;
  performanceMetrics: {
    totalRevenue: number;
    topPerformingMachine: string;
    lowPerformingMachines: string[];
    averageDailySales: number;
  };
  
  // Enhanced sections
  erweiterte_bestellungen?: {
    heute_erwartet: OrderDelivery[];
    diese_woche: OrderDelivery[];
    verspätet: OrderDelivery[];
    nicht_geliefert: OrderDelivery[];
    zusammenfassung: {
      total_ausstehend: number;
      total_wert_ausstehend: number;
      kritische_verspätungen: number;
    };
  };
  
  automaten_status?: {
    hoher_geldbestand: MachineStatusAlert[];
    münzgeld_warnungen: MachineStatusAlert[];
    technische_anomalien: MachineStatusAlert[];
    performance_abweichungen: MachineStatusAlert[];
    zusammenfassung: {
      total_alerts: number;
      kritische_alerts: number;
      betroffene_automaten: number;
    };
  };

  // Full enhanced report data (when available)
  enhancedReport?: EnhancedDailyReportData;
}

// Utility types for status handling
export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'delayed' | 'cancelled';
export type AlertSeverity = 'niedrig' | 'mittel' | 'hoch' | 'kritisch';
export type AlertType = 'hoher_geldbestand' | 'wenig_münzen' | 'technische_anomalie' | 'performance_abweichung';

// German language utility functions
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount);
};

export const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

export const formatDateTime = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const getSeverityColor = (severity: AlertSeverity): string => {
  switch (severity) {
    case 'niedrig': return 'text-blue-600 bg-blue-50';
    case 'mittel': return 'text-yellow-600 bg-yellow-50';
    case 'hoch': return 'text-orange-600 bg-orange-50';
    case 'kritisch': return 'text-red-600 bg-red-50';
    default: return 'text-gray-600 bg-gray-50';
  }
};

export const getStatusColor = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'delivered': return 'text-green-600 bg-green-50';
    case 'pending': return 'text-yellow-600 bg-yellow-50';
    case 'sent': return 'text-blue-600 bg-blue-50';
    case 'delayed': return 'text-red-600 bg-red-50';
    case 'cancelled': return 'text-gray-600 bg-gray-50';
    default: return 'text-gray-600 bg-gray-50';
  }
};