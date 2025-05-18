import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

// UI-Komponenten
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// API-Funktionen und Typen
import { getOrders } from "@/lib/api";
import { Order } from "@shared/schema";

/**
 * Hilfsfunktion zur sicheren Datumsformatierung
 */
const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return "-";
  
  try {
    // Einfache Formatierung ohne date-fns, um Kompatibilitätsprobleme zu vermeiden
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "-";
    
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch (error) {
    console.error("Fehler beim Formatieren des Datums:", dateString, error);
    return "-";
  }
};

/**
 * Hilfsfunktion zur Formatierung von Währungsbeträgen
 */
const formatCurrency = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined) return "-";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2
  }).format(amount);
};

/**
 * Status-Badge-Komponente
 */
const StatusBadge = ({ status }: { status: string }) => {
  const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    draft: { label: "Entwurf", variant: "outline" },
    open: { label: "Offen", variant: "outline" },
    ordered: { label: "Bestellt", variant: "default" },
    shipped: { label: "Versandt", variant: "secondary" },
    partial: { label: "Teilgeliefert", variant: "secondary" },
    delivered: { label: "Geliefert", variant: "default" },
    completed: { label: "Abgeschlossen", variant: "default" },
    cancelled: { label: "Storniert", variant: "destructive" },
    sent: { label: "Gesendet", variant: "default" },
  };

  const statusInfo = statusMap[status?.toLowerCase()] || { label: status || "Unbekannt", variant: "outline" };

  return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
};

// Interface für die Bestellungsantwort-Struktur
interface OrdersResponse {
  data: Array<{
    id: number;
    orderNumber: string;
    supplierId?: number | null;
    supplierName?: string | null;
    status: string;
    orderDate?: string | null;
    expectedDeliveryDate?: string | null;
    totalAmount?: number | null;
    [key: string]: any; // Für andere mögliche Felder
  }>;
  meta?: {
    totalCount: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
  };
}

/**
 * Haupt-Komponente für die Bestellungen-Seite
 */
export default function OrdersNew() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Daten abrufen
  const { data: ordersResponse, isLoading, error } = useQuery<OrdersResponse>({
    queryKey: ['/api/orders'],
    queryFn: () => getOrders(),
  });

  // Fehlerbehandlung
  if (error) {
    console.error("Fehler beim Laden der Bestellungen:", error);
  }

  // Funktion zum Navigieren zur richtigen Detailseite basierend auf Status
  const handleOrderClick = (order: OrdersResponse['data'][0]) => {
    try {
      const status = order.status?.toLowerCase();
      
      if (status === 'draft') {
        // Bei Entwürfen zur Bearbeitung navigieren
        navigate(`/bestellung/overview/${order.id}`);
      } else {
        // Bei anderen Status direkt zum Receipt navigieren
        navigate(`/bestellung/receipt/${order.id}`);
      }
    } catch (error) {
      console.error("Fehler bei der Navigation:", error);
      toast({
        title: "Fehler",
        description: "Die Bestellung konnte nicht geöffnet werden.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Bestellungen</CardTitle>
          <Button onClick={() => navigate("/bestellungen/neu-v2")}>
            Neue Bestellung
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Bestellungen werden geladen...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">
              Fehler beim Laden der Bestellungen. Bitte versuchen Sie es später erneut.
            </div>
          ) : ordersResponse?.data && ordersResponse.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bestellnummer</TableHead>
                  <TableHead>Lieferant</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Lieferdatum</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Betrag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordersResponse.data.map((order) => (
                  <TableRow 
                    key={order.id}
                    className="cursor-pointer hover:bg-muted"
                    onClick={() => handleOrderClick(order)}
                  >
                    <TableCell className="font-medium">{order.orderNumber}</TableCell>
                    <TableCell>{order.supplierName || "-"}</TableCell>
                    <TableCell>{formatDate(order.orderDate)}</TableCell>
                    <TableCell>{formatDate(order.expectedDeliveryDate)}</TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell>{formatCurrency(order.totalAmount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Keine Bestellungen gefunden.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}