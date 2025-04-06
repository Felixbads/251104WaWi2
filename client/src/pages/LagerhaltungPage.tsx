import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

// Lucide Icons
import { 
  Package, Truck, ClipboardCheck, ArrowLeftRight, 
  PackageOpen, CircleAlert, Layers 
} from 'lucide-react';

// UI-Komponenten
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Eigene Komponenten für die verschiedenen Funktionen
import WarehouseInventory from '@/components/inventory/WarehouseInventory';
import InventoryBatches from '@/components/inventory/batch/InventoryBatches';
import InventoryMovements from '@/components/inventory/InventoryMovements';
import InventoryCounts from '@/components/inventory/InventoryCounts';
import WarehouseList from '@/components/inventory/WarehouseList';

export default function LagerhaltungPage() {
  const [activeTab, setActiveTab] = useState<string>('uebersicht');
  const { toast } = useToast();

  // Interface für Statistik-Antwort
  interface InventoryStats {
    totalItems: number;
    activeBatches: number;
    expiringBatches: number;
    expiredBatches: number;
    criticalStock: number;
    openCounts: number;
    totalAlerts: number;
  }
  
  // Interface für Alert-Antwort
  interface InventoryAlert {
    id: string;
    type: 'critical' | 'warning' | 'info';
    title: string;
    message: string;
    warehouseName: string;
    warehouseId: number;
    productId: number;
    itemId?: number;
    batchId?: number;
    expiryDate?: string;
  }

  // Statistiken für die Übersichtsseite
  const { 
    data: stats = {} as InventoryStats, 
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats
  } = useQuery<InventoryStats>({
    queryKey: ['/api/inventory/stats'],
    staleTime: 1000 * 60, // 1 Minute
  });

  // Lade aktuelle Warnungen und Benachrichtigungen
  const {
    data: alerts = [] as InventoryAlert[],
    isLoading: alertsLoading
  } = useQuery<InventoryAlert[]>({
    queryKey: ['/api/inventory/alerts'],
    staleTime: 1000 * 30, // 30 Sekunden
  });

  // Statistik-Kacheln rendern
  const renderStats = () => {
    if (statsLoading) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      );
    }

    if (statsError) {
      return (
        <div className="rounded-md bg-destructive/15 p-4 text-center">
          <CircleAlert className="h-6 w-6 mx-auto mb-2 text-destructive" />
          <h3 className="font-medium text-destructive">Fehler beim Laden der Statistiken</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Statistiken konnten nicht geladen werden.
          </p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Package className="h-5 w-5 mr-2 text-primary" />
              Lagerbestände
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.totalItems || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Produkte in allen Lagern
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Layers className="h-5 w-5 mr-2 text-amber-500" />
              Aktive Chargen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.activeBatches || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Chargen mit verbleibender Menge
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <ClipboardCheck className="h-5 w-5 mr-2 text-blue-500" />
              Offene Inventuren
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.openCounts || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Laufende Inventurprozesse
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <CircleAlert className="h-5 w-5 mr-2 text-destructive" />
              Warnungen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.totalAlerts || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Kritische Bestände & MHD-Ablauf
            </p>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Warnungen und Benachrichtigungen rendern
  const renderAlerts = () => {
    if (alertsLoading) {
      return (
        <div className="space-y-2 mt-4">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      );
    }

    if (!alerts || alerts.length === 0) {
      return (
        <div className="rounded-md bg-muted/50 p-8 text-center mt-4">
          <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <h3 className="text-lg font-medium">Keine Warnungen vorhanden</h3>
          <p className="text-muted-foreground mt-1">
            Alle Lagerbestände und Chargen sind derzeit im optimalen Bereich.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-2 mt-4">
        {alerts.map((alert: InventoryAlert) => (
          <Card key={alert.id} className={
            alert.type === 'critical' 
              ? 'border-destructive/50 bg-destructive/5' 
              : alert.type === 'warning' 
                ? 'border-amber-500/50 bg-amber-50'
                : 'border-blue-500/50 bg-blue-50'
          }>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                {alert.type === 'critical' && (
                  <CircleAlert className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                )}
                {alert.type === 'warning' && (
                  <CircleAlert className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                )}
                {alert.type === 'info' && (
                  <CircleAlert className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className="font-medium">{alert.title}</h4>
                  <p className="text-sm text-muted-foreground">{alert.message}</p>
                  {alert.warehouseName && (
                    <div className="text-xs mt-1">Lager: {alert.warehouseName}</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <h1 className="text-2xl font-bold mb-6">Lagerhaltung</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="uebersicht">
            <Package className="h-4 w-4 mr-2" />
            Übersicht
          </TabsTrigger>
          <TabsTrigger value="bestaende">
            <Layers className="h-4 w-4 mr-2" />
            Bestände
          </TabsTrigger>
          <TabsTrigger value="chargen">
            <PackageOpen className="h-4 w-4 mr-2" />
            Chargen
          </TabsTrigger>
          <TabsTrigger value="bewegungen">
            <ArrowLeftRight className="h-4 w-4 mr-2" />
            Bewegungen
          </TabsTrigger>
          <TabsTrigger value="inventur">
            <ClipboardCheck className="h-4 w-4 mr-2" />
            Inventur
          </TabsTrigger>
        </TabsList>

        {/* Übersicht - Zusammenfassung und Warnungen */}
        <TabsContent value="uebersicht" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Lagerübersicht</CardTitle>
              <CardDescription>
                Zusammenfassung der Lagerbestände und aktuelle Warnungen
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {renderStats()}
              
              <h3 className="text-lg font-semibold mt-8 mb-4">Aktuelle Warnungen und Hinweise</h3>
              {renderAlerts()}
              
              <h3 className="text-lg font-semibold mt-8 mb-4">Lager</h3>
              <WarehouseList />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bestände - Anzeige aller Produkte mit Bestand */}
        <TabsContent value="bestaende" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Lagerbestände</CardTitle>
              <CardDescription>
                Übersicht aller Produkte in den Lagern mit aktuellen Beständen
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WarehouseInventory 
                warehouseId={0} // 0 bedeutet alle Lager anzeigen
                inventory={[]} 
                isLoading={false} 
                error={null} 
                onRefresh={() => {
                  // Hier den Cache invalidieren für automatischen Refresh
                  toast({
                    title: "Lagerabgleich gestartet",
                    description: "Die Lagerbestände werden aktualisiert...",
                  });
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Chargen - Anzeige und Verwaltung von MHD-bezogenen Chargen */}
        <TabsContent value="chargen" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Chargen- und MHD-Verwaltung</CardTitle>
              <CardDescription>
                Verwaltung aller Produktchargen mit Mindesthaltbarkeitsdaten
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InventoryBatches />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bewegungen - Anzeige und Erfassung von Warenbewegungen */}
        <TabsContent value="bewegungen" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Warenbewegungen</CardTitle>
              <CardDescription>
                Wareneingänge, Entnahmen, Umlagerungen und Bestandskorrekturen
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InventoryMovements />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inventur - Inventurprozess mit Zählung und Abgleich */}
        <TabsContent value="inventur" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Inventur</CardTitle>
              <CardDescription>
                Planung, Durchführung und Abschluss von Inventuren
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InventoryCounts />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}