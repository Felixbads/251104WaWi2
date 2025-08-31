import React from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Package, 
  AlertTriangle, 
  Clock, 
  TrendingUp,
  CheckCircle,
  Calendar,
  ShoppingCart
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { de } from "date-fns/locale";

// Interfaces
interface ExpiryRiskAnalysis {
  productId: number;
  machineId: number;
  currentStock: number;
  daysUntilExpiry: number;
  avgDailySales: number;
  expiryRiskFactor: number;
  stockoutProbability: number;
  priorityScore: number;
  riskCategory: 'critical' | 'high' | 'medium' | 'low';
}

interface MHDDashboardStats {
  criticalRecommendations: number;
  pendingApprovals: number;
  weeklyQuantity: number;
  averageConfidence: number;
  topRiskProducts: Array<{
    productName: string;
    machineName: string;
    daysUntilExpiry: number;
    priorityScore: number;
  }>;
}

interface CriticalMHDResponse {
  success: boolean;
  data: ExpiryRiskAnalysis[];
  summary: {
    total: number;
    critical: number;
    high: number;
  };
}

interface DashboardStatsResponse {
  success: boolean;
  data: MHDDashboardStats;
}

// API Functions
const fetchCriticalMHDProducts = async (): Promise<CriticalMHDResponse> => {
  const response = await fetch('/api/mhd-recommendations/critical');
  if (!response.ok) {
    throw new Error('Failed to fetch critical MHD products');
  }
  return response.json();
};

const fetchMHDDashboardStats = async (): Promise<DashboardStatsResponse> => {
  const response = await fetch('/api/mhd-recommendations/dashboard-stats');
  if (!response.ok) {
    throw new Error('Failed to fetch MHD dashboard stats');
  }
  return response.json();
};

// Risk Category Colors
const getRiskCategoryColor = (category: string) => {
  switch (category) {
    case 'critical': return 'bg-red-100 text-red-800 border-red-200';
    case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'low': return 'bg-green-100 text-green-800 border-green-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

const formatRiskCategory = (category: string) => {
  switch (category) {
    case 'critical': return 'Kritisch';
    case 'high': return 'Hoch';
    case 'medium': return 'Mittel';
    case 'low': return 'Niedrig';
    default: return category;
  }
};

/**
 * Kritische MHD-Produkte Tile
 */
export function CriticalMHDTile() {
  const [, setLocation] = useLocation();
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/mhd-recommendations/critical'],
    queryFn: fetchCriticalMHDProducts,
    refetchInterval: 5 * 60 * 1000, // Alle 5 Minuten aktualisieren
  });

  if (isLoading) {
    return (
      <Card className="h-fit">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium">
            <AlertTriangle className="w-4 h-4 inline mr-2" />
            Kritische MHD-Produkte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">Lädt...</div>
          <p className="text-xs text-muted-foreground">
            Prüfe Verderbrisiko...
          </p>
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.success) {
    return (
      <Card className="h-fit">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium">
            <AlertTriangle className="w-4 h-4 inline mr-2" />
            Kritische MHD-Produkte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">Fehler</div>
          <p className="text-xs text-muted-foreground">
            Daten nicht verfügbar
          </p>
        </CardContent>
      </Card>
    );
  }

  const criticalCount = data.summary.critical;
  const highCount = data.summary.high;
  const totalAtRisk = criticalCount + highCount;

  return (
    <Card className="h-fit cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setLocation('/mhd-empfehlungen')}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium">
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          Kritische MHD-Produkte
        </CardTitle>
        <AlertTriangle className={`w-4 h-4 ${totalAtRisk > 0 ? 'text-red-500' : 'text-green-500'}`} />
      </CardHeader>
      <CardContent>
        <div className="flex items-center space-x-2">
          <div className="text-2xl font-bold text-red-600">{criticalCount}</div>
          {highCount > 0 && (
            <>
              <span className="text-muted-foreground">+</span>
              <div className="text-xl font-semibold text-orange-500">{highCount}</div>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {criticalCount} kritisch, {highCount} hoch
        </p>
        <div className="mt-3 space-y-1">
          {data.data.slice(0, 3).map((product, index) => (
            <div key={index} className="flex items-center justify-between text-xs">
              <span className="truncate max-w-[120px]">
                M{product.machineId}
              </span>
              <Badge 
                variant="outline" 
                className={`text-xs ${getRiskCategoryColor(product.riskCategory)}`}
              >
                {product.daysUntilExpiry}T
              </Badge>
            </div>
          ))}
          {data.data.length > 3 && (
            <div className="text-xs text-muted-foreground text-center pt-1">
              +{data.data.length - 3} weitere...
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * MHD-Empfehlungen Status Tile
 */
export function MHDRecommendationsStatusTile() {
  const [, setLocation] = useLocation();
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/mhd-recommendations/dashboard-stats'],
    queryFn: fetchMHDDashboardStats,
    refetchInterval: 10 * 60 * 1000, // Alle 10 Minuten aktualisieren
  });

  if (isLoading) {
    return (
      <Card className="h-fit">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium">
            <Package className="w-4 h-4 inline mr-2" />
            MHD-Empfehlungen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">Lädt...</div>
          <p className="text-xs text-muted-foreground">
            Prüfe Empfehlungen...
          </p>
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.success) {
    return (
      <Card className="h-fit">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium">
            <Package className="w-4 h-4 inline mr-2" />
            MHD-Empfehlungen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">Fehler</div>
          <p className="text-xs text-muted-foreground">
            Daten nicht verfügbar
          </p>
        </CardContent>
      </Card>
    );
  }

  const stats = data.data;
  const pendingApprovals = stats.pendingApprovals;
  const weeklyQuantity = stats.weeklyQuantity;

  return (
    <Card className="h-fit cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setLocation('/mhd-empfehlungen')}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium">
          <Package className="w-4 h-4 inline mr-2" />
          MHD-Empfehlungen
        </CardTitle>
        <Clock className={`w-4 h-4 ${pendingApprovals > 0 ? 'text-orange-500' : 'text-green-500'}`} />
      </CardHeader>
      <CardContent>
        <div className="flex items-center space-x-3">
          <div>
            <div className="text-2xl font-bold">{pendingApprovals}</div>
            <p className="text-xs text-muted-foreground">Genehmigungen</p>
          </div>
          <div className="border-l pl-3">
            <div className="text-lg font-semibold">{weeklyQuantity}</div>
            <p className="text-xs text-muted-foreground">Stück/Woche</p>
          </div>
        </div>
        
        {stats.topRiskProducts.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs font-medium mb-2">Top Risiko-Produkte:</p>
            <div className="space-y-1">
              {stats.topRiskProducts.slice(0, 2).map((product, index) => (
                <div key={index} className="flex items-center justify-between text-xs">
                  <span className="truncate max-w-[100px]" title={product.productName}>
                    {product.productName.substring(0, 15)}...
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {product.daysUntilExpiry}T
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="mt-3 pt-2 border-t">
          <div className="flex items-center justify-between text-xs">
            <span>Konfidenz:</span>
            <span className="font-medium">
              {Math.round(stats.averageConfidence * 100)}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Schnelle MHD-Aktionen Tile
 */
export function MHDQuickActionsTile() {
  const [, setLocation] = useLocation();

  const generateWeeklyRecommendations = async () => {
    try {
      const response = await fetch('/api/mhd-recommendations/batch-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          onlyCritical: true,
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        // Refresh relevant queries
        window.location.reload(); // Einfacher Refresh für jetzt
      }
    } catch (error) {
      console.error('Fehler beim Generieren der Empfehlungen:', error);
    }
  };

  return (
    <Card className="h-fit">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium">
          <TrendingUp className="w-4 h-4 inline mr-2" />
          MHD-Aktionen
        </CardTitle>
        <Calendar className="w-4 h-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full text-xs"
          onClick={() => setLocation('/mhd-empfehlungen')}
        >
          <Package className="w-3 h-3 mr-1" />
          Empfehlungen verwalten
        </Button>
        
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full text-xs"
          onClick={generateWeeklyRecommendations}
        >
          <CheckCircle className="w-3 h-3 mr-1" />
          Wöchentlich generieren
        </Button>
        
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full text-xs"
          onClick={() => setLocation('/bestellungen?mode=mhd')}
        >
          <ShoppingCart className="w-3 h-3 mr-1" />
          MHD-Bestellung erstellen
        </Button>
        
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground text-center">
            Aktuelle Woche: KW {format(new Date(), 'w', { locale: de })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}