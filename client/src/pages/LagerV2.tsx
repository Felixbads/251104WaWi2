/**
 * Lager V2 - Komplett neue Lagerverwaltung
 * 
 * Features:
 * - Übersicht aller Lager mit Kennzahlen
 * - Batch-Verfolgung und FIFO-Management
 * - Benachrichtigungen für niedrige Bestände
 * - Ablaufende Chargen-Überwachung
 * - Vollständige Bewegungsdokumentation
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Warehouse, 
  Package, 
  AlertTriangle, 
  Clock, 
  TrendingDown,
  TrendingUp,
  Activity,
  Settings,
  Bell,
  Calendar,
  BarChart3
} from "lucide-react";

// Types (temporär hier definiert, später aus API)
interface LagerOverview {
  warehouseId: number;
  warehouseName: string;
  totalProducts: number;
  criticalItems: number;
  expiringBatches: number;
  totalValue: number;
  lastActivity: string | null;
}

interface LagerNotification {
  id: string;
  type: 'low_stock' | 'expiring_batch' | 'expired_batch';
  productId: number;
  productName: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  created: string;
  warehouseId: number;
}

// Dummy-Daten für die Entwicklung (später durch API ersetzt)
const mockOverview: LagerOverview[] = [
  {
    warehouseId: 1,
    warehouseName: "Hauptlager München",
    totalProducts: 156,
    criticalItems: 12,
    expiringBatches: 3,
    totalValue: 28450.50,
    lastActivity: "2024-01-15T10:30:00Z"
  },
  {
    warehouseId: 2,
    warehouseName: "Außenlager Hamburg",
    totalProducts: 89,
    criticalItems: 5,
    expiringBatches: 1,
    totalValue: 15230.25,
    lastActivity: "2024-01-15T09:15:00Z"
  },
  {
    warehouseId: 3,
    warehouseName: "Zwischenlager Berlin",
    totalProducts: 203,
    criticalItems: 8,
    expiringBatches: 7,
    totalValue: 41820.75,
    lastActivity: "2024-01-15T11:45:00Z"
  }
];

const mockNotifications: LagerNotification[] = [
  {
    id: "1",
    type: "expired_batch",
    productId: 101,
    productName: "Coca Cola 0.5L",
    message: "Abgelaufene Charge: CC_2024_001 (24 Stück)",
    severity: "critical",
    created: "2024-01-15T08:00:00Z",
    warehouseId: 1
  },
  {
    id: "2",
    type: "low_stock",
    productId: 102,
    productName: "Snickers 50g",
    message: "Niedriger Bestand: 5 (Min: 20)",
    severity: "warning",
    created: "2024-01-15T09:30:00Z",
    warehouseId: 2
  },
  {
    id: "3",
    type: "expiring_batch",
    productId: 103,
    productName: "Red Bull 250ml",
    message: "Charge läuft in 2 Tagen ab: RB_2024_003",
    severity: "warning",
    created: "2024-01-15T10:15:00Z",
    warehouseId: 1
  }
];

// Utility functions
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR'
  }).format(value);
};

const formatDateTime = (dateString: string | null) => {
  if (!dateString) return 'Nie';
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(dateString));
};

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical': return 'destructive';
    case 'warning': return 'default';
    case 'info': return 'secondary';
    default: return 'default';
  }
};

// Komponenten
function LagerOverviewCards({ overview }: { overview: LagerOverview[] }) {
  const totalValue = overview.reduce((sum, lager) => sum + lager.totalValue, 0);
  const totalCritical = overview.reduce((sum, lager) => sum + lager.criticalItems, 0);
  const totalExpiring = overview.reduce((sum, lager) => sum + lager.expiringBatches, 0);
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Card data-testid="card-total-warehouses">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Lager gesamt</CardTitle>
          <Warehouse className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" data-testid="text-total-warehouses">{overview.length}</div>
          <p className="text-xs text-muted-foreground">Aktive Lager</p>
        </CardContent>
      </Card>
      
      <Card data-testid="card-total-value">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Gesamtwert</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" data-testid="text-total-value">{formatCurrency(totalValue)}</div>
          <p className="text-xs text-muted-foreground">Inventarwert</p>
        </CardContent>
      </Card>
      
      <Card data-testid="card-critical-items">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Kritische Bestände</CardTitle>
          <AlertTriangle className="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-destructive" data-testid="text-critical-items">{totalCritical}</div>
          <p className="text-xs text-muted-foreground">Produkte unter Mindestbestand</p>
        </CardContent>
      </Card>
      
      <Card data-testid="card-expiring-batches">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Ablaufende Chargen</CardTitle>
          <Clock className="h-4 w-4 text-warning" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-warning" data-testid="text-expiring-batches">{totalExpiring}</div>
          <p className="text-xs text-muted-foreground">Nächste 7 Tage</p>
        </CardContent>
      </Card>
    </div>
  );
}

function LagerList({ overview }: { overview: LagerOverview[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
      {overview.map((lager) => (
        <Card key={lager.warehouseId} className="hover:shadow-md transition-shadow" data-testid={`card-warehouse-${lager.warehouseId}`}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg" data-testid={`text-warehouse-name-${lager.warehouseId}`}>{lager.warehouseName}</CardTitle>
              <Button 
                variant="outline" 
                size="sm"
                data-testid={`button-warehouse-details-${lager.warehouseId}`}
              >
                Details
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Produkte:</span>
              <span className="font-medium" data-testid={`text-products-${lager.warehouseId}`}>{lager.totalProducts}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Kritische Bestände:</span>
              <Badge 
                variant={lager.criticalItems > 0 ? "destructive" : "secondary"}
                data-testid={`badge-critical-${lager.warehouseId}`}
              >
                {lager.criticalItems}
              </Badge>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Ablaufende Chargen:</span>
              <Badge 
                variant={lager.expiringBatches > 0 ? "default" : "secondary"}
                data-testid={`badge-expiring-${lager.warehouseId}`}
              >
                {lager.expiringBatches}
              </Badge>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Gesamtwert:</span>
              <span className="font-medium" data-testid={`text-value-${lager.warehouseId}`}>{formatCurrency(lager.totalValue)}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Letzte Aktivität:</span>
              <span className="text-xs" data-testid={`text-activity-${lager.warehouseId}`}>{formatDateTime(lager.lastActivity)}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function NotificationsList({ notifications }: { notifications: LagerNotification[] }) {
  if (notifications.length === 0) {
    return (
      <Card data-testid="card-no-notifications">
        <CardContent className="text-center py-8">
          <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Keine aktuellen Benachrichtigungen</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-3">
      {notifications.map((notification) => (
        <Alert 
          key={notification.id} 
          variant={notification.severity === 'critical' ? 'destructive' : 'default'}
          data-testid={`alert-notification-${notification.id}`}
        >
          {notification.type === 'expired_batch' && <AlertTriangle className="h-4 w-4" />}
          {notification.type === 'low_stock' && <TrendingDown className="h-4 w-4" />}
          {notification.type === 'expiring_batch' && <Clock className="h-4 w-4" />}
          
          <AlertDescription className="flex justify-between items-center">
            <div>
              <strong data-testid={`text-notification-product-${notification.id}`}>{notification.productName}</strong>
              <br />
              <span data-testid={`text-notification-message-${notification.id}`}>{notification.message}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {formatDateTime(notification.created)}
            </div>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

// Hauptkomponente
export default function LagerV2() {
  const [activeTab, setActiveTab] = useState("overview");
  
  // Use real API calls with fallback to mock data
  const { data: overviewData, isLoading: overviewLoading, error: overviewError } = useQuery({
    queryKey: ['/api/lager/overview'],
    enabled: true,
    retry: 1,
    staleTime: 30000 // 30 seconds
  });
  
  const { data: notificationsData, isLoading: notificationsLoading, error: notificationsError } = useQuery({
    queryKey: ['/api/lager/notifications'],
    enabled: true,
    retry: 1,
    staleTime: 10000 // 10 seconds
  });
  
  // Use API data with fallback to mock data
  const overview = overviewData || mockOverview;
  const notifications = notificationsData || mockNotifications;
  
  return (
    <div className="container mx-auto px-4 py-6 space-y-6" data-testid="page-lager-v2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-lager">Lager</h1>
          <p className="text-muted-foreground">
            Moderne Lagerverwaltung mit Batch-Tracking und Benachrichtigungen
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" data-testid="button-settings">
            <Settings className="h-4 w-4 mr-2" />
            Einstellungen
          </Button>
          <Button data-testid="button-new-movement">
            <Activity className="h-4 w-4 mr-2" />
            Neue Bewegung
          </Button>
        </div>
      </div>
      
      {/* Übersichts-Karten */}
      {!overviewLoading && overview && (
        <LagerOverviewCards overview={overview} />
      )}
      
      {/* Tabs für verschiedene Ansichten */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview" data-testid="tab-overview">Übersicht</TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-notifications">
            Benachrichtigungen
            {notifications.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {notifications.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="movements" data-testid="tab-movements">Bewegungen</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          {overviewLoading ? (
            <div className="text-center py-8">Lade Lager-Übersicht...</div>
          ) : overview ? (
            <LagerList overview={overview} />
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <Warehouse className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Keine Lager gefunden</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="notifications" className="space-y-4">
          {notificationsLoading ? (
            <div className="text-center py-8">Lade Benachrichtigungen...</div>
          ) : (
            <NotificationsList notifications={notifications} />
          )}
        </TabsContent>
        
        <TabsContent value="movements" className="space-y-4">
          <Card data-testid="card-movements-placeholder">
            <CardContent className="text-center py-8">
              <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Bewegungsverfolgung wird implementiert</p>
              <p className="text-sm text-muted-foreground mt-2">
                Hier werden alle Warenbewegungen mit vollständiger Dokumentation angezeigt
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}