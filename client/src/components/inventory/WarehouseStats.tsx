import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CircleDollarSign, Package, AlertCircle, Truck } from 'lucide-react';

interface WarehouseStatsProps {
  warehouseId: number;
}

// Definiere einen Typen für die erwartete Antwort von der API
interface WarehouseStats {
  productCount: number;
  criticalItemCount: number;
  machineCount: number;
  inventoryValue: number;
}

const WarehouseStats: React.FC<WarehouseStatsProps> = ({ warehouseId }) => {
  const { data: stats, isLoading, error } = useQuery<WarehouseStats>({
    queryKey: [`/api/warehouse-stats/${warehouseId}/stats`],
    refetchInterval: 60000, // Aktualisiere alle 60 Sekunden
  });

  // Debug-Ausgabe der empfangenen Daten
  console.log("Received warehouse stats:", stats);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 my-4 animate-pulse">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="h-32"></Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="my-4 bg-red-50 dark:bg-red-900/20">
        <CardHeader>
          <CardTitle className="text-red-600 dark:text-red-400">Fehler</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Die Statistikdaten konnten nicht geladen werden.</p>
        </CardContent>
      </Card>
    );
  }

  // Fallback für den Fall, dass stats undefined ist
  const defaultStats: WarehouseStats = {
    productCount: 0,
    criticalItemCount: 0,
    machineCount: 0,
    inventoryValue: 0
  };

  const { productCount, criticalItemCount, machineCount, inventoryValue } = stats || defaultStats;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 my-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Produkte</CardTitle>
          <Package className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{productCount || 0}</div>
          <p className="text-xs text-muted-foreground">
            Unterschiedliche Produkte im Lager
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Kritischer Bestand</CardTitle>
          <AlertCircle className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{criticalItemCount || 0}</div>
          <p className="text-xs text-muted-foreground">
            Produkte mit kritischem Bestand
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Zugewiesene Automaten</CardTitle>
          <Truck className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{machineCount || 0}</div>
          <p className="text-xs text-muted-foreground">
            Verbundene Automaten und Verkaufsstellen
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Lagerbestandswert</CardTitle>
          <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {new Intl.NumberFormat('de-DE', {
              style: 'currency',
              currency: 'EUR'
            }).format(inventoryValue || 0)}
          </div>
          <p className="text-xs text-muted-foreground">
            Gesamtwert aller Produkte
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default WarehouseStats;