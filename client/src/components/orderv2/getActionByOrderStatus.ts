/**
 * Diese Funktion bestimmt die passende Aktion basierend auf dem Status einer Bestellung.
 * Sie ist ein zentraler Bestandteil des intelligenten Routings für das Bestellsystem.
 * 
 * @param status - Der aktuelle Status der Bestellung
 * @returns Die passende Aktion für die Status-basierte Navigation
 */
export function getActionByOrderStatus(status: string): 'edit' | 'view' | 'receipt' | 'email' {
  switch (status) {
    case 'draft':
      // Bei Entwürfen zur Email-Versandseite navigieren
      return 'email';
      
    case 'sent':
    case 'partially_received':
      // Bei gesendeten Bestellungen zum Wareneingang navigieren
      return 'receipt';
      
    case 'completed':
    case 'cancelled':
    case 'rejected':
      // Bei abgeschlossenen Bestellungen nur die Details anzeigen
      return 'view';
      
    default:
      // Standard-Aktion für alle anderen Status: Bearbeiten
      return 'edit';
  }
}