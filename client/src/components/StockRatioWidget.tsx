/**
 * Stock Ratio Widget - Zeigt Füllstand-Verhältnisse zwischen aktuellem und maximalem Bestand
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  BarChart3, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle,
  RefreshCw,
  Package,
  Activity
} from 'lucide-react';

interface StockRatio {
  machineId: number;
  machineName: string;
  productVendonId: string;
  productName: string;
  selectionNumber: string;
  currentQuantity: number;
  maxQuantity: number;
  fillRatio: number;
  fillPercentage: number;
  status: 'full' | 'high' | 'medium' | 'low' | 'critical' | 'empty';
  lastFilled: string | null;
  lastSync: string | null;
}

interface MachineStockSummary {
  machineId: number;
  machineName: string;
  totalSlots: number;
  filledSlots: number;
  averageFillRatio: number;
  averageFillPercentage: number;
  lastRefill: string | null;
  stockRatios: StockRatio[];
}

interface StockRatiosResponse {
  success: boolean;
  data: MachineStockSummary[];
  summary: {
    totalMachines: number;
    totalSlots: number;
    averageFillPercentage: number;
    timestamp: string;
  };
}

const getStatusColor = (status: StockRatio['status']) => {
  switch (status) {
    case 'full': return 'bg-green-500';
    case 'high': return 'bg-blue-500';
    case 'medium': return 'bg-yellow-500';
    case 'low': return 'bg-orange-500';
    case 'critical': return 'bg-red-500';
    case 'empty': return 'bg-gray-400';
    default: return 'bg-gray-400';
  }
};

const getStatusLabel = (status: StockRatio['status']) => {
  switch (status) {
    case 'full': return 'Voll';
    case 'high': return 'Hoch';
    case 'medium': return 'Mittel';
    case 'low': return 'Niedrig';
    case 'critical': return 'Kritisch';
    case 'empty': return 'Leer';
    default: return 'Unbekannt';
  }
};

const getStatusIcon = (status: StockRatio['status']) => {
  switch (status) {
    case 'full':
    case 'high':
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    case 'medium':
      return <Activity className="h-4 w-4 text-yellow-600" />;
    case 'low':
    case 'critical':
      return <AlertTriangle className="h-4 w-4 text-red-600" />;
    case 'empty':
      return <Package className="h-4 w-4 text-gray-600" />;
    default:
      return <Package className="h-4 w-4 text-gray-600" />;
  }
};

export const StockRatioWidget: React.FC<{ className?: string }> = ({ className }) => {
  const { data, isLoading, error, refetch } = useQuery<StockRatiosResponse>({
    queryKey: ['/api/stock-ratios/all'],
    refetchInterval: 5 * 60 * 1000, // Aktualisiere alle 5 Minuten
  });

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Füllstand-Übersicht
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-red-600 mb-4">
              Fehler beim Laden der Füllstand-Daten
            </p>
            <Button onClick={() => refetch()} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Erneut versuchen
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 animate-pulse" />
            Füllstand-Übersicht
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-2 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.success || !data.data) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Füllstand-Übersicht
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center py-4 text-gray-500">
            Keine Füllstand-Daten verfügbar
          </p>
        </CardContent>
      </Card>
    );
  }

  const { data: machines, summary } = data;
  
  // Sortiere Maschinen nach durchschnittlichem Füllstand (kritische zuerst)
  const sortedMachines = [...machines].sort((a, b) => 
    a.averageFillPercentage - b.averageFillPercentage
  );

  // Zeige nur die ersten 10 Maschinen in der Widget-Ansicht
  const displayedMachines = sortedMachines.slice(0, 10);

  // Berechne Kategorien
  const categories = {
    critical: machines.filter(m => m.averageFillPercentage < 20).length,
    low: machines.filter(m => m.averageFillPercentage >= 20 && m.averageFillPercentage < 40).length,
    medium: machines.filter(m => m.averageFillPercentage >= 40 && m.averageFillPercentage < 80).length,
    high: machines.filter(m => m.averageFillPercentage >= 80).length
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Füllstand-Übersicht
          </div>
          <Button onClick={() => refetch()} variant="ghost" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* System-Übersicht */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {summary.totalMachines}
            </div>
            <div className="text-sm text-gray-600">Automaten</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {summary.averageFillPercentage}%
            </div>
            <div className="text-sm text-gray-600">Durchschnitt</div>
          </div>
        </div>

        {/* Status-Kategorien */}
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="text-center">
            <div className="text-lg font-bold text-red-600">{categories.critical}</div>
            <div className="text-gray-600">Kritisch</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-orange-600">{categories.low}</div>
            <div className="text-gray-600">Niedrig</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-yellow-600">{categories.medium}</div>
            <div className="text-gray-600">Mittel</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-green-600">{categories.high}</div>
            <div className="text-gray-600">Hoch</div>
          </div>
        </div>

        <Separator />

        {/* Maschinen-Details */}
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Kritische Automaten
          </h4>
          
          {displayedMachines.length === 0 ? (
            <p className="text-center py-4 text-gray-500">
              Alle Automaten sind optimal gefüllt
            </p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {displayedMachines.map((machine) => (
                <div 
                  key={machine.machineId} 
                  className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(
                        machine.averageFillPercentage >= 80 ? 'full' :
                        machine.averageFillPercentage >= 40 ? 'medium' :
                        machine.averageFillPercentage >= 20 ? 'low' : 'critical'
                      )}
                      <span className="font-medium text-sm truncate">
                        {machine.machineName}
                      </span>
                    </div>
                    <Progress 
                      value={machine.averageFillPercentage} 
                      className="mt-1 h-2"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2 ml-3">
                    <Badge
                      variant="secondary"
                      className={`text-xs ${
                        machine.averageFillPercentage >= 80 ? 'bg-green-100 text-green-800' :
                        machine.averageFillPercentage >= 40 ? 'bg-yellow-100 text-yellow-800' :
                        machine.averageFillPercentage >= 20 ? 'bg-orange-100 text-orange-800' :
                        'bg-red-100 text-red-800'
                      }`}
                    >
                      {machine.averageFillPercentage}%
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {machine.filledSlots}/{machine.totalSlots}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Zeitstempel */}
        <div className="text-xs text-gray-500 text-center">
          Letzte Aktualisierung: {new Date(summary.timestamp).toLocaleString('de-DE')}
        </div>
      </CardContent>
    </Card>
  );
};

export default StockRatioWidget;