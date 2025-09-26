import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle, Clock, Calendar, Package2 } from 'lucide-react';

interface BatchInfo {
  batchId: number;
  batchNumber: string;
  quantity: number;
  expiryDate: string;
  daysUntilExpiry: number;
}

interface ProductStockInfo {
  id: number;
  stockId: number;
  name: string;
  productName: string;
  amount: number;
  currentQuantity: number;
  amountMax: number;
  maxQuantity: number;
  amountCritical: number;
  fillRatio: number;
  isCritical: boolean;
  selections: { selection: number; price: number }[];
  status: 'critical' | 'warning' | 'good';
  // 🔥 NEUE MHD-FIFO FELDER (wie in deutscher Spezifikation)
  batches: BatchInfo[];
  earliestMhd: string | null;
  totalBatches: number;
  mhdStatus: 'ok' | 'warning' | 'expired' | 'critical';
}

interface MachineStockData {
  machineId: string; // 🔧 Fixed: Changed from number to string (was vendonId assignment)
  machineName: string;
  vendonId: string; // 🔧 Fixed: Changed from number to string to match schema
  products: ProductStockInfo[];
  totalFillLevel: number;
  criticalProducts: number;
  lastUpdate: string;
}

interface MachineStockDisplayProps {
  vendonId: string; // 🔧 Fixed: Changed from number to string to match schema
  machineName?: string;
}

// 🔥 MHD-HILFSFUNKTIONEN (wie in deutscher Spezifikation)
const getMhdStatusColor = (mhdStatus: string, daysUntilExpiry?: number) => {
  if (mhdStatus === 'expired' || (daysUntilExpiry !== undefined && daysUntilExpiry < 0)) {
    return 'text-red-700 bg-red-100 border-red-300';
  }
  if (mhdStatus === 'critical' || (daysUntilExpiry !== undefined && daysUntilExpiry <= 3)) {
    return 'text-red-600 bg-red-50 border-red-200';
  }
  if (mhdStatus === 'warning' || (daysUntilExpiry !== undefined && daysUntilExpiry <= 7)) {
    return 'text-orange-600 bg-orange-50 border-orange-200';
  }
  return 'text-green-600 bg-green-50 border-green-200';
};

const getMhdStatusBadge = (mhdStatus: string, daysUntilExpiry?: number) => {
  if (mhdStatus === 'expired' || (daysUntilExpiry !== undefined && daysUntilExpiry < 0)) {
    return { variant: 'destructive' as const, text: 'ABGELAUFEN' };
  }
  if (mhdStatus === 'critical' || (daysUntilExpiry !== undefined && daysUntilExpiry <= 3)) {
    return { variant: 'destructive' as const, text: `${daysUntilExpiry}T KRITISCH` };
  }
  if (mhdStatus === 'warning' || (daysUntilExpiry !== undefined && daysUntilExpiry <= 7)) {
    return { variant: 'secondary' as const, text: `${daysUntilExpiry}T WARNUNG` };
  }
  return { variant: 'default' as const, text: daysUntilExpiry ? `${daysUntilExpiry}T OK` : 'OK' };
};

const formatMhdDate = (dateStr: string | null) => {
  if (!dateStr) return 'Unbekannt';
  try {
    return new Date(dateStr).toLocaleDateString('de-DE');
  } catch {
    return 'Ungültig';
  }
};

export function MachineStockDisplay({ vendonId, machineName }: MachineStockDisplayProps) {
  const [stockData, setStockData] = useState<MachineStockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMhdDetails, setShowMhdDetails] = useState(false);

  useEffect(() => {
    const fetchStockData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // 🔥 ENHANCED API CALL: Use machines stock endpoint with MHD-FIFO data
        const response = await fetch(`/api/machines/${vendonId}/stock`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const stockProducts = await response.json();
        
        // Transform data to match expected format with MHD support
        const transformedData: MachineStockData = {
          machineId: vendonId,
          machineName: machineName || `Maschine ${vendonId}`,
          vendonId: vendonId,
          products: stockProducts.map((product: any, index: number) => ({
            id: product.id || index + 1,
            stockId: product.vendonId || product.id || index + 1,
            name: product.productName || product.name || 'Unbekanntes Produkt',
            productName: product.productName || product.name || 'Unbekanntes Produkt',
            amount: product.currentQuantity || 0,
            currentQuantity: product.currentQuantity || 0,
            amountMax: product.maxQuantity || 10,
            maxQuantity: product.maxQuantity || 10,
            amountCritical: 2,
            fillRatio: (product.currentQuantity || 0) / (product.maxQuantity || 10),
            isCritical: product.status === 'critical' || (product.currentQuantity || 0) <= 2,
            selections: [{ selection: 1, price: 0 }],
            status: product.status || 'good',
            // MHD-FIFO Daten aus Backend
            batches: product.batches || [],
            earliestMhd: product.earliestMhd,
            totalBatches: product.totalBatches || 0,
            mhdStatus: product.mhdStatus || 'ok'
          })),
          totalFillLevel: 0,
          criticalProducts: 0,
          lastUpdate: new Date().toISOString()
        };
        
        // Calculate totals
        transformedData.totalFillLevel = transformedData.products.reduce((acc, p) => acc + p.fillRatio, 0) / transformedData.products.length;
        transformedData.criticalProducts = transformedData.products.filter(p => p.isCritical).length;
        
        setStockData(transformedData);
        console.log(`[MHD-FIFO] ✅ Loaded ${transformedData.products.length} products with enhanced MHD data`);
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

          {/* 🔥 MHD-ÜBERSICHT (wie in deutscher Spezifikation) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">MHD-Status Übersicht</span>
              <button 
                onClick={() => setShowMhdDetails(!showMhdDetails)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                {showMhdDetails ? 'Weniger anzeigen' : 'Details anzeigen'}
              </button>
            </div>
            
            {/* MHD Kategorien */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-xs">
              {(() => {
                const mhdCounts = {
                  expired: stockData.products.filter(p => p.mhdStatus === 'expired').length,
                  critical: stockData.products.filter(p => p.mhdStatus === 'critical').length,
                  warning: stockData.products.filter(p => p.mhdStatus === 'warning').length,
                  ok: stockData.products.filter(p => p.mhdStatus === 'ok').length
                };
                
                return [
                  { label: 'Abgelaufen', count: mhdCounts.expired, color: 'text-red-700 bg-red-100' },
                  { label: 'Kritisch', count: mhdCounts.critical, color: 'text-red-600 bg-red-50' },
                  { label: 'Warnung', count: mhdCounts.warning, color: 'text-orange-600 bg-orange-50' },
                  { label: 'OK', count: mhdCounts.ok, color: 'text-green-600 bg-green-50' }
                ].map(({ label, count, color }) => (
                  <div key={label} className={`p-2 rounded border ${color}`}>
                    <div className="font-bold text-sm">{count}</div>
                    <div>{label}</div>
                  </div>
                ));
              })()}
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

      {/* 🔥 ERWEITERTE MHD-FIFO PRODUKTLISTE (wie in deutscher Spezifikation) */}
      {showMhdDetails && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package2 className="h-5 w-5" />
              MHD-FIFO Produktdetails ({stockData.products.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stockData.products.map(product => {
                const earliestBatch = product.batches?.[0];
                const daysUntilExpiry = earliestBatch ? 
                  Math.ceil((new Date(earliestBatch.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                
                const mhdBadge = getMhdStatusBadge(product.mhdStatus, daysUntilExpiry);
                const colorClass = getMhdStatusColor(product.mhdStatus, daysUntilExpiry);

                return (
                  <div key={product.id} className={`p-4 rounded-md border ${colorClass}`}>
                    {/* Header mit Produktname und MHD Status */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex-1">
                        <div className="font-semibold text-base">{product.productName}</div>
                        <div className="text-sm text-gray-600">
                          Bestand: {product.currentQuantity}/{product.maxQuantity} • 
                          {product.fillRatio > 0 ? ` ${Math.round(product.fillRatio * 100)}% gefüllt` : ' Leer'}
                        </div>
                      </div>
                      <Badge variant={mhdBadge.variant} className="ml-2">
                        {mhdBadge.text}
                      </Badge>
                    </div>

                    {/* MHD und FIFO Informationen */}
                    {product.earliestMhd && (
                      <div className="flex items-center gap-4 mb-3 text-sm">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>Frühestes MHD: {formatMhdDate(product.earliestMhd)}</span>
                        </div>
                        {daysUntilExpiry !== null && (
                          <div className="text-sm">
                            ({daysUntilExpiry >= 0 ? `${daysUntilExpiry} Tage` : `${Math.abs(daysUntilExpiry)} Tage überfällig`})
                          </div>
                        )}
                      </div>
                    )}

                    {/* Batch-Details (FIFO-Information) */}
                    {product.batches && product.batches.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">FIFO-Batches ({product.totalBatches}):</div>
                        <div className="grid gap-2">
                          {product.batches.slice(0, 3).map((batch, index) => (
                            <div key={batch.batchId} className="flex items-center justify-between p-2 bg-white bg-opacity-50 rounded text-sm">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  #{index + 1}
                                </Badge>
                                <span className="font-mono text-xs">{batch.batchNumber}</span>
                              </div>
                              <div className="text-right">
                                <div className="text-xs">{batch.quantity} Stk.</div>
                                <div className="text-xs text-gray-500">
                                  MHD: {formatMhdDate(batch.expiryDate)}
                                </div>
                              </div>
                            </div>
                          ))}
                          {product.batches.length > 3 && (
                            <div className="text-xs text-gray-500 text-center">
                              +{product.batches.length - 3} weitere Batches
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Status-Indikatoren */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-current border-opacity-20">
                      <div className="flex items-center gap-2 text-xs">
                        {product.status === 'critical' && <AlertTriangle className="h-3 w-3 text-red-600" />}
                        {product.status === 'warning' && <Clock className="h-3 w-3 text-orange-500" />}
                        {product.status === 'good' && <CheckCircle className="h-3 w-3 text-green-600" />}
                        <span className="capitalize">{product.status} Status</span>
                      </div>
                      {product.vendonId && (
                        <div className="text-xs text-gray-500">
                          ID: {product.vendonId}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Kritische Produkte - Kompakte Ansicht wenn Details nicht angezeigt */}
      {!showMhdDetails && criticalCount > 0 && (
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
                .filter(product => product.isCritical || product.mhdStatus === 'expired' || product.mhdStatus === 'critical')
                .map(product => {
                  const daysUntilExpiry = product.batches?.[0] ? 
                    Math.ceil((new Date(product.batches[0].expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                  const mhdBadge = getMhdStatusBadge(product.mhdStatus, daysUntilExpiry);

                  return (
                    <div key={product.id} className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-md">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{product.productName}</div>
                        <div className="text-xs text-gray-500">
                          {product.earliestMhd ? `MHD: ${formatMhdDate(product.earliestMhd)}` : 'Kein MHD verfügbar'}
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1">
                        <div className="font-bold text-red-600">
                          {product.currentQuantity}/{product.maxQuantity}
                        </div>
                        <Badge variant={mhdBadge.variant} className="text-xs">
                          {mhdBadge.text}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}