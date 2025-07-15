import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle, Clock } from 'lucide-react';

interface ProductStockInfo {
  id: number;
  stockId: number;
  name: string;
  amount: number;
  amountMax: number;
  amountCritical: number;
  fillRatio: number;
  isCritical: boolean;
  selections: { selection: number; price: number }[];
}

interface MachineStockData {
  machineId: number;
  machineName: string;
  vendonId: number;
  products: ProductStockInfo[];
  totalFillLevel: number;
  criticalProducts: number;
  lastUpdate: string;
}

interface MachineStockDisplayProps {
  vendonId: number;
  machineName?: string;
}

export function MachineStockDisplay({ vendonId, machineName }: MachineStockDisplayProps) {
  const [stockData, setStockData] = useState<MachineStockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStockData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(`/api/machine-stock/${vendonId}`);
        const result = await response.json();
        
        if (result.success) {
          setStockData(result.data);
        } else {
          setError(result.error || 'Fehler beim Laden der Bestandsdaten');
        }
      } catch (err) {
        setError('Verbindungsfehler beim Laden der Bestandsdaten');
        console.error('Fehler beim Laden der Maschinendaten:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStockData();
  }, [vendonId]);

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Lade Bestandsdaten...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-6 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Fehler beim Laden
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-600">{error}</p>
          <p className="text-sm text-gray-500 mt-2">Vendon ID: {vendonId}</p>
        </CardContent>
      </Card>
    );
  }

  if (!stockData) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Keine Daten verfügbar</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">Keine Bestandsdaten für Maschine {vendonId} gefunden.</p>
        </CardContent>
      </Card>
    );
  }

  const fillPercentage = Math.round(stockData.totalFillLevel * 100);
  const criticalCount = stockData.criticalProducts;
  const totalProducts = stockData.products.length;

  // Kategorisiere Produkte nach Füllstand
  const fullProducts = stockData.products.filter(p => p.fillRatio >= 0.8).length;
  const mediumProducts = stockData.products.filter(p => p.fillRatio >= 0.4 && p.fillRatio < 0.8).length;
  const lowProducts = stockData.products.filter(p => p.fillRatio >= 0.2 && p.fillRatio < 0.4).length;
  const emptyProducts = stockData.products.filter(p => p.fillRatio < 0.2).length;

  return (
    <div className="space-y-4">
      {/* Hauptübersicht */}
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{stockData.machineName}</span>
            <Badge variant={criticalCount > 0 ? "destructive" : fillPercentage >= 80 ? "default" : "secondary"}>
              {fillPercentage}% gefüllt
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Gesamtfüllstand */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium">Gesamtfüllstand</span>
              <span className="text-sm text-gray-500">{fillPercentage}%</span>
            </div>
            <Progress value={fillPercentage} className="h-3" />
          </div>

          {/* Produktübersicht */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-lg font-bold text-green-600">{fullProducts}</div>
              <div className="text-xs text-gray-500">Voll (≥80%)</div>
            </div>
            <div>
              <div className="text-lg font-bold text-blue-600">{mediumProducts}</div>
              <div className="text-xs text-gray-500">Mittel (40-80%)</div>
            </div>
            <div>
              <div className="text-lg font-bold text-orange-600">{lowProducts}</div>
              <div className="text-xs text-gray-500">Niedrig (20-40%)</div>
            </div>
            <div>
              <div className="text-lg font-bold text-red-600">{emptyProducts}</div>
              <div className="text-xs text-gray-500">Leer (&lt;20%)</div>
            </div>
          </div>

          {/* Kritische Produkte Warnung */}
          {criticalCount > 0 && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <span className="text-red-700 font-medium">
                {criticalCount} Produkt{criticalCount !== 1 ? 'e' : ''} unter kritischem Bestand
              </span>
            </div>
          )}

          {/* Metadaten */}
          <div className="text-xs text-gray-500 border-t pt-3">
            <div className="flex justify-between">
              <span>Vendon ID: {stockData.vendonId}</span>
              <span>Produkte: {totalProducts}</span>
            </div>
            <div className="mt-1">
              Letzte Aktualisierung: {new Date(stockData.lastUpdate).toLocaleString('de-DE')}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detaillierte Produktliste (nur kritische Produkte anzeigen) */}
      {criticalCount > 0 && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Kritische Produkte ({criticalCount})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stockData.products
                .filter(product => product.isCritical)
                .map(product => (
                  <div key={product.id} className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-md">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{product.name}</div>
                      <div className="text-xs text-gray-500">
                        Auswahl {product.selections[0]?.selection} • €{product.selections[0]?.price?.toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-red-600">
                        {product.amount}/{product.amountMax}
                      </div>
                      <div className="text-xs text-gray-500">
                        Kritisch: ≤{product.amountCritical}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}