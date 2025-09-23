import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  Package2, 
  AlertTriangle, 
  Clock, 
  TrendingUp, 
  ArrowUpRight,
  Activity,
  Warehouse,
  Users,
  BarChart3
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";

interface WarehouseOverview {
  warehouseId: number;
  warehouseName: string;
  totalProducts: number;
  criticalItems: number;
  expiringBatches: number;
  totalValue: number;
  lastActivity: string | null;
}

interface WarehouseStats {
  totalWarehouses: number;
  totalProducts: number;
  criticalItems: number;
  totalValue: number;
  expiringBatches: number;
}

export default function WarehouseV3Dashboard() {
  const [selectedWarehouse, setSelectedWarehouse] = useState<number | null>(null);

  // Warehouse-Übersicht laden
  const { data: warehouses, isLoading: loadingWarehouses } = useQuery<WarehouseOverview[]>({
    queryKey: ['/api/lager/overview'],
    enabled: true
  });

  // Gesamtstatistiken berechnen
  const stats: WarehouseStats = {
    totalWarehouses: Array.isArray(warehouses) ? warehouses.length : 0,
    totalProducts: Array.isArray(warehouses) ? warehouses.reduce((sum, w) => sum + w.totalProducts, 0) : 0,
    criticalItems: Array.isArray(warehouses) ? warehouses.reduce((sum, w) => sum + w.criticalItems, 0) : 0,
    totalValue: Array.isArray(warehouses) ? warehouses.reduce((sum, w) => sum + w.totalValue, 0) : 0,
    expiringBatches: Array.isArray(warehouses) ? warehouses.reduce((sum, w) => sum + w.expiringBatches, 0) : 0,
  };

  if (loadingWarehouses) {
    return (
      <div className="p-6 space-y-6" data-testid="warehouse-dashboard-loading">
        <div className="flex items-center gap-2">
          <Warehouse className="h-6 w-6" />
          <h1 className="text-3xl font-bold">Warehouse Management 3.0</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-gray-300 rounded mb-2"></div>
                <div className="h-8 bg-gray-300 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="warehouse-v3-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Warehouse className="h-6 w-6 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">Warehouse Management 3.0</h1>
        </div>
        <Badge variant="outline" className="text-green-600 border-green-600">
          Echtzeit-Updates aktiv
        </Badge>
      </div>

      {/* Gesamtstatistiken */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card data-testid="stat-warehouses">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Warehouse className="h-5 w-5 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Lager</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalWarehouses}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-products">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <Package2 className="h-5 w-5 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Produkte</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalProducts}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-critical">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Kritisch</p>
                <p className="text-2xl font-bold text-red-600">{stats.criticalItems}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-expiring">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Ablaufend</p>
                <p className="text-2xl font-bold text-orange-600">{stats.expiringBatches}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-value">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Lagerwert</p>
                <p className="text-2xl font-bold text-emerald-600">€{stats.totalValue.toFixed(0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Warehouse-Übersicht */}
      <Card data-testid="warehouses-overview">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Lager-Übersicht
          </CardTitle>
          <CardDescription>
            Detaillierte Ansicht aller Lager mit Echtzeitdaten
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.isArray(warehouses) ? warehouses.map((warehouse: WarehouseOverview) => (
              <Card 
                key={warehouse.warehouseId} 
                className="cursor-pointer hover:shadow-lg transition-shadow"
                data-testid={`warehouse-card-${warehouse.warehouseId}`}
                onClick={() => setSelectedWarehouse(warehouse.warehouseId)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{warehouse.warehouseName}</CardTitle>
                    <ArrowUpRight className="h-4 w-4 text-gray-400" />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {/* Produkte */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Produkte</span>
                      <Badge variant="secondary">{warehouse.totalProducts}</Badge>
                    </div>
                    
                    {/* Kritische Items */}
                    {warehouse.criticalItems > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-red-600">Kritisch</span>
                        <Badge variant="destructive">{warehouse.criticalItems}</Badge>
                      </div>
                    )}
                    
                    {/* Ablaufende Batches */}
                    {warehouse.expiringBatches > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-orange-600">Ablaufend</span>
                        <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-200">
                          {warehouse.expiringBatches}
                        </Badge>
                      </div>
                    )}
                    
                    {/* Lagerwert */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Wert</span>
                      <span className="font-semibold text-green-600">
                        €{warehouse.totalValue.toFixed(0)}
                      </span>
                    </div>
                    
                    <Separator />
                    
                    {/* Letzte Aktivität */}
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Letzte Aktivität</span>
                      <span>
                        {warehouse.lastActivity 
                          ? new Date(warehouse.lastActivity).toLocaleDateString() 
                          : 'Keine Daten'
                        }
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )) : (
              <div className="col-span-full text-center py-8 text-gray-500">
                Keine Lager verfügbar
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action-Bereiche */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="action-inventory">
          <CardHeader>
            <CardTitle className="text-lg">Inventur</CardTitle>
            <CardDescription>Bestandsaufnahme und Zählungen</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" data-testid="button-start-inventory">
              <Activity className="h-4 w-4 mr-2" />
              Inventur starten
            </Button>
          </CardContent>
        </Card>

        <Card data-testid="action-movements">
          <CardHeader>
            <CardTitle className="text-lg">Warenbewegungen</CardTitle>
            <CardDescription>Ein- und Ausgänge verwalten</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" data-testid="button-view-movements">
              <Package2 className="h-4 w-4 mr-2" />
              Bewegungen anzeigen
            </Button>
          </CardContent>
        </Card>

        <Card data-testid="action-reports">
          <CardHeader>
            <CardTitle className="text-lg">Berichte</CardTitle>
            <CardDescription>Auswertungen und Analytics</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" data-testid="button-generate-reports">
              <BarChart3 className="h-4 w-4 mr-2" />
              Berichte generieren
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}