/**
 * Füllstands-Analyse Seite
 * Zeigt detaillierte Verhältnisse zwischen aktuellem und maximalem Warenbestand
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { 
  BarChart3, 
  RefreshCw, 
  Download, 
  AlertTriangle, 
  TrendingDown,
  TrendingUp,
  Package,
  Search,
  Filter,
  Info,
  CheckCircle,
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

interface StockSummaryResponse {
  success: boolean;
  summary: {
    totalMachines: number;
    totalSlots: number;
    totalFilledSlots: number;
    systemFillPercentage: number;
    categories: {
      full: number;
      medium: number;
      low: number;
      critical: number;
    };
    criticalMachines: Array<{
      machineId: number;
      machineName: string;
      fillPercentage: number;
      emptySlots: number;
    }>;
    lastUpdated: string;
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

export default function FuellstandsAnalyse() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'critical' | 'low' | 'medium' | 'high'>('all');

  // Hole alle Stock-Verhältnisse
  const { data: stockData, isLoading: stockLoading, error: stockError } = useQuery<StockRatiosResponse>({
    queryKey: ['/api/stock-ratios/all'],
    refetchInterval: 5 * 60 * 1000,
  });

  // Hole kompakte Übersicht
  const { data: summaryData, isLoading: summaryLoading } = useQuery<StockSummaryResponse>({
    queryKey: ['/api/stock-ratios/summary'],
    refetchInterval: 5 * 60 * 1000,
  });

  // Mutation für manuelles Update der maximalen Kapazitäten
  const updateMaxQuantitiesMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/stock-ratios/update-max-quantities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Fehler beim Aktualisieren der maximalen Kapazitäten');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Aktualisierung erfolgreich",
        description: "Maximale Kapazitäten wurden erfolgreich aktualisiert",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/stock-ratios/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stock-ratios/summary'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Filtere Maschinen basierend auf Suchbegriff und Status
  const filteredMachines = React.useMemo(() => {
    if (!stockData?.data) return [];
    
    return stockData.data.filter(machine => {
      const matchesSearch = machine.machineName.toLowerCase().includes(searchTerm.toLowerCase());
      
      if (statusFilter === 'all') return matchesSearch;
      
      const categoryMatch = 
        (statusFilter === 'critical' && machine.averageFillPercentage < 20) ||
        (statusFilter === 'low' && machine.averageFillPercentage >= 20 && machine.averageFillPercentage < 40) ||
        (statusFilter === 'medium' && machine.averageFillPercentage >= 40 && machine.averageFillPercentage < 80) ||
        (statusFilter === 'high' && machine.averageFillPercentage >= 80);
      
      return matchesSearch && categoryMatch;
    });
  }, [stockData?.data, searchTerm, statusFilter]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/stock-ratios/all'] });
    queryClient.invalidateQueries({ queryKey: ['/api/stock-ratios/summary'] });
  };

  const handleUpdateMaxQuantities = () => {
    updateMaxQuantitiesMutation.mutate();
  };

  if (stockError) {
    return (
      <div className="container mx-auto py-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Fehler beim Laden der Füllstand-Daten. Bitte versuchen Sie es später erneut.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="h-8 w-8" />
            Füllstands-Analyse
          </h1>
          <p className="text-gray-600 mt-1">
            Verhältnisse zwischen aktuellem und maximalem Warenbestand
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button 
            onClick={handleUpdateMaxQuantities}
            disabled={updateMaxQuantitiesMutation.isPending}
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${updateMaxQuantitiesMutation.isPending ? 'animate-spin' : ''}`} />
            Max-Kapazitäten aktualisieren
          </Button>
          
          <Button onClick={handleRefresh} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Aktualisieren
          </Button>
        </div>
      </div>

      {/* System-Übersicht */}
      {summaryData?.success && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Automaten gesamt</p>
                  <p className="text-2xl font-bold">{summaryData.summary.totalMachines}</p>
                </div>
                <Package className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Durchschnittlicher Füllstand</p>
                  <p className="text-2xl font-bold text-green-600">{summaryData.summary.systemFillPercentage}%</p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Kritische Automaten</p>
                  <p className="text-2xl font-bold text-red-600">{summaryData.summary.categories.critical}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Gefüllte Slots</p>
                  <p className="text-2xl font-bold">{summaryData.summary.totalFilledSlots}/{summaryData.summary.totalSlots}</p>
                </div>
                <Activity className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter und Suche */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filter und Suche
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Automat suchen..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              {(['all', 'critical', 'low', 'medium', 'high'] as const).map((status) => (
                <Button
                  key={status}
                  variant={statusFilter === status ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter(status)}
                >
                  {status === 'all' ? 'Alle' :
                   status === 'critical' ? 'Kritisch' :
                   status === 'low' ? 'Niedrig' :
                   status === 'medium' ? 'Mittel' : 'Hoch'}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Maschinen-Details */}
      {stockLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-2 bg-gray-200 rounded"></div>
                  <div className="h-8 bg-gray-200 rounded w-full"></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredMachines.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">
                  {searchTerm || statusFilter !== 'all' 
                    ? 'Keine Automaten entsprechen den Filterkriterien' 
                    : 'Keine Füllstand-Daten verfügbar'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredMachines.map((machine) => (
              <Card key={machine.machineId}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      {getStatusIcon(
                        machine.averageFillPercentage >= 80 ? 'full' :
                        machine.averageFillPercentage >= 40 ? 'medium' :
                        machine.averageFillPercentage >= 20 ? 'low' : 'critical'
                      )}
                      {machine.machineName}
                    </CardTitle>
                    
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="secondary"
                        className={`${
                          machine.averageFillPercentage >= 80 ? 'bg-green-100 text-green-800' :
                          machine.averageFillPercentage >= 40 ? 'bg-yellow-100 text-yellow-800' :
                          machine.averageFillPercentage >= 20 ? 'bg-orange-100 text-orange-800' :
                          'bg-red-100 text-red-800'
                        }`}
                      >
                        {machine.averageFillPercentage}% Füllstand
                      </Badge>
                      
                      <span className="text-sm text-gray-500">
                        {machine.filledSlots}/{machine.totalSlots} Slots gefüllt
                      </span>
                    </div>
                  </div>
                  
                  <Progress value={machine.averageFillPercentage} className="mt-2" />
                </CardHeader>
                
                <CardContent>
                  <div className="space-y-3">
                    {machine.stockRatios.length === 0 ? (
                      <p className="text-gray-500 text-center py-4">
                        Keine Produktdaten verfügbar
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {machine.stockRatios.map((ratio, index) => (
                          <div
                            key={`${ratio.productVendonId}-${ratio.selectionNumber}-${index}`}
                            className="border rounded-lg p-3 bg-gray-50"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-sm truncate">
                                  {ratio.productName || 'Unbekanntes Produkt'}
                                </h4>
                                <p className="text-xs text-gray-500">
                                  Position: {ratio.selectionNumber}
                                </p>
                              </div>
                              
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  ratio.status === 'full' || ratio.status === 'high' ? 'border-green-500 text-green-700' :
                                  ratio.status === 'medium' ? 'border-yellow-500 text-yellow-700' :
                                  ratio.status === 'low' ? 'border-orange-500 text-orange-700' :
                                  'border-red-500 text-red-700'
                                }`}
                              >
                                {ratio.fillPercentage}%
                              </Badge>
                            </div>
                            
                            <div className="space-y-1">
                              <Progress value={ratio.fillPercentage} className="h-2" />
                              
                              <div className="flex justify-between text-xs text-gray-600">
                                <span>Aktuell: {ratio.currentQuantity}</span>
                                <span>Max: {ratio.maxQuantity || 'Unbekannt'}</span>
                              </div>
                              
                              {ratio.lastFilled && (
                                <p className="text-xs text-gray-500">
                                  Zuletzt gefüllt: {new Date(ratio.lastFilled).toLocaleDateString('de-DE')}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {machine.lastRefill && (
                    <div className="mt-4 pt-3 border-t">
                      <p className="text-sm text-gray-600">
                        Letzte Nachfüllung: {new Date(machine.lastRefill).toLocaleString('de-DE')}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Information */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-500 mt-0.5" />
            <div className="text-sm text-gray-600">
              <p className="font-medium mb-1">Hinweise zur Füllstands-Analyse:</p>
              <ul className="space-y-1 text-xs list-disc list-inside">
                <li>Maximale Kapazitäten werden automatisch beim Nachfüllen erkannt</li>
                <li>Verhältnisse werden alle 5 Minuten mit der Vendon-Synchronisation aktualisiert</li>
                <li>Kritische Füllstände (&lt; 20%) sollten prioritär nachgefüllt werden</li>
                <li>Die Daten stammen direkt aus dem Vendon-System und sind authentisch</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}