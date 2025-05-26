import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, AlertCircle, RefreshCw, Plus } from "lucide-react";
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface Order {
  id: number;
  order_number: string;
  status: string;
  created_at: string;
  supplier_name?: string;
  location_name?: string;
  total_amount?: number;
  expected_delivery_date?: string;
}

interface SimpleOrdersOverviewProps {
  onSelectOrder: (orderId: number) => void;
  onCreateNew?: () => void;
}

const SimpleOrdersOverview: React.FC<SimpleOrdersOverviewProps> = ({ 
  onSelectOrder, 
  onCreateNew 
}) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log("Lade Bestellungen...");
      
      const authToken = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
      
      const response = await fetch('/api/orders-direct', {
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("=== DEBUGGING API RESPONSE ===");
      console.log("Response status:", response.status);
      console.log("Response headers:", Object.fromEntries(response.headers.entries()));
      console.log("Raw data type:", typeof data);
      console.log("Raw data:", data);
      console.log("Is array:", Array.isArray(data));
      console.log("Data length:", data?.length);
      
      if (Array.isArray(data)) {
        console.log("✅ Setze", data.length, "Bestellungen");
        console.log("Erste Bestellung:", data[0]);
        setOrders(data);
        console.log("✅ Orders state aktualisiert");
      } else {
        console.error("❌ API-Antwort ist kein Array:", typeof data);
        console.error("❌ Vollständige Antwort:", data);
        setError("API-Antwort hat falsches Format: " + typeof data);
      }
    } catch (err) {
      console.error("Fehler beim Laden der Bestellungen:", err);
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      'draft': { label: 'Entwurf', color: 'bg-yellow-100 text-yellow-800' },
      'sent': { label: 'Versendet', color: 'bg-blue-100 text-blue-800' },
      'received': { label: 'Erhalten', color: 'bg-green-100 text-green-800' },
      'completed': { label: 'Abgeschlossen', color: 'bg-gray-100 text-gray-800' }
    };
    
    const statusInfo = statusMap[status] || { label: status, color: 'bg-gray-100 text-gray-800' };
    
    return (
      <Badge className={statusInfo.color}>
        {statusInfo.label}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd.MM.yyyy', { locale: de });
    } catch {
      return 'Unbekannt';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin mr-2" />
          <span>Bestellungen werden geladen...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Fehler beim Laden</h3>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button onClick={loadOrders} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Erneut versuchen
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Bestellungen</h1>
        {onCreateNew && (
          <Button onClick={onCreateNew}>
            <Plus className="h-4 w-4 mr-2" />
            Neue Bestellung
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {orders.length} Bestellungen gefunden
        </p>
        <Button onClick={loadOrders} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Aktualisieren
        </Button>
      </div>

      {orders.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <Package className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Keine Bestellungen</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Es wurden noch keine Bestellungen erstellt.
              </p>
              {onCreateNew && (
                <Button onClick={onCreateNew}>
                  <Plus className="h-4 w-4 mr-2" />
                  Erste Bestellung erstellen
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {orders.map((order) => (
            <Card 
              key={order.id} 
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => onSelectOrder(order.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">
                      {order.order_number || `Bestellung #${order.id}`}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Erstellt am {formatDate(order.created_at)}
                    </p>
                  </div>
                  {getStatusBadge(order.status)}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                  <div>
                    <span className="font-medium">Lieferant:</span>
                    <br />
                    {order.supplier_name || 'Unbekannt'}
                  </div>
                  <div>
                    <span className="font-medium">Lager:</span>
                    <br />
                    {order.location_name || 'Unbekannt'}
                  </div>
                  <div>
                    <span className="font-medium">Betrag:</span>
                    <br />
                    {order.total_amount !== null && order.total_amount !== undefined 
                      ? `${Number(order.total_amount).toFixed(2)} €` 
                      : 'Nicht berechnet'}
                  </div>
                </div>
                {order.expected_delivery_date && (
                  <div className="mt-2 text-sm">
                    <span className="font-medium">Liefertermin:</span> {formatDate(order.expected_delivery_date)}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default SimpleOrdersOverview;