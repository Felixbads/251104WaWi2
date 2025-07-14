/**
 * WIEDERKEHRENDE BESTELLUNGEN SEITE
 * 
 * Hauptseite für die Verwaltung wiederkehrender Bestellungen
 * mit vollständiger Integration der Scheduler- und Automatisierungsfunktionen
 */

import React from 'react';
import { InventoryCartProvider } from '@/components/inventory/InventoryCartContext';
import RecurringOrdersTab from '@/components/RecurringOrdersTab';

export default function RecurringOrdersPage() {
  return (
    <InventoryCartProvider>
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">
            Wiederkehrende Bestellungen
          </h1>
          <p className="text-gray-600 mt-2">
            Verwalten Sie automatische Bestellungen und Wareneingänge mit intelligenter Prognose-Integration
          </p>
        </div>
        
        <RecurringOrdersTab />
      </div>
    </InventoryCartProvider>
  );
}