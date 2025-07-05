import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, 
  TrendingUp, 
  Calculator, 
  Euro, 
  Clock, 
  Package, 
  AlertTriangle,
  CheckCircle,
  Info,
  BarChart3
} from 'lucide-react';

interface ProductPurchaseConditionsViewProps {
  productId: number;
  productName: string;
}

interface SupplierCondition {
  id: number;
  supplierName: string;
  unitPrice: number;
  minQuantity: number;
  deliveryTime: string;
  paymentTerms: string;
  discountConditions: {
    id: number;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    minQuantity: number;
    description: string;
  }[];
  lastOrderDate?: string;
  avgOrderQuantity?: number;
  reliability: 'high' | 'medium' | 'low';
}

interface PriceHistoryPoint {
  date: string;
  price: number;
  supplierId: number;
  supplierName: string;
}

export default function ProductPurchaseConditionsView({ productId, productName }: ProductPurchaseConditionsViewProps) {
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);

  // Lade Einkaufsbedingungen für das Produkt
  const { data: conditions = [], isLoading: conditionsLoading } = useQuery<SupplierCondition[]>({
    queryKey: [`/api/products/${productId}/purchase-conditions`],
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });

  // Lade Preishistorie
  const { data: priceHistory = [], isLoading: historyLoading } = useQuery<PriceHistoryPoint[]>({
    queryKey: [`/api/products/${productId}/price-history`],
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });

  const isLoading = conditionsLoading || historyLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-32 bg-gray-100 rounded animate-pulse" />
        <div className="h-64 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const getReliabilityColor = (reliability: string) => {
    switch (reliability) {
      case 'high': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getReliabilityText = (reliability: string) => {
    switch (reliability) {
      case 'high': return 'Hoch';
      case 'medium': return 'Mittel';
      case 'low': return 'Niedrig';
      default: return 'Unbekannt';
    }
  };

  const bestPrice = conditions.length > 0 ? Math.min(...conditions.map(c => c.unitPrice)) : 0;

  return (
    <div className="space-y-6">
      {/* Header mit Zusammenfassung */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calculator className="h-5 w-5 mr-2" />
            Einkaufsbedingungen Übersicht
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-sm text-gray-500">Lieferanten verfügbar</p>
              <p className="text-2xl font-bold">{conditions.length}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-500">Bester Preis</p>
              <p className="text-2xl font-bold text-green-600">
                {bestPrice > 0 ? formatCurrency(bestPrice) : 'k.A.'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-500">Durchschn. Lieferzeit</p>
              <p className="text-2xl font-bold">
                {conditions.length > 0 ? '2-3 Tage' : 'k.A.'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-500">Rabatte verfügbar</p>
              <p className="text-2xl font-bold text-blue-600">
                {conditions.reduce((acc, c) => acc + c.discountConditions.length, 0)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="suppliers" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="suppliers" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Lieferantenvergleich
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Preishistorie
          </TabsTrigger>
          <TabsTrigger value="analysis" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Wirtschaftlichkeit
          </TabsTrigger>
        </TabsList>

        {/* Lieferantenvergleich Tab */}
        <TabsContent value="suppliers" className="space-y-4">
          {conditions.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Keine Einkaufsbedingungen gefunden
                </h3>
                <p className="text-gray-500">
                  Für dieses Produkt sind noch keine Einkaufsbedingungen hinterlegt.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {conditions.map((condition) => (
                <Card key={condition.id} className={`${condition.unitPrice === bestPrice ? 'ring-2 ring-green-500' : ''}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">
                        {condition.supplierName}
                        {condition.unitPrice === bestPrice && (
                          <Badge className="ml-2 bg-green-100 text-green-800">
                            Bester Preis
                          </Badge>
                        )}
                      </CardTitle>
                      <Badge className={getReliabilityColor(condition.reliability)}>
                        Zuverlässigkeit: {getReliabilityText(condition.reliability)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                      <div>
                        <span className="text-sm text-gray-500 flex items-center">
                          <Euro className="h-4 w-4 mr-1" />
                          Einkaufspreis
                        </span>
                        <p className="font-bold text-lg">{formatCurrency(condition.unitPrice)}</p>
                      </div>
                      <div>
                        <span className="text-sm text-gray-500 flex items-center">
                          <Package className="h-4 w-4 mr-1" />
                          Mindestmenge
                        </span>
                        <p className="font-medium">{condition.minQuantity} Stück</p>
                      </div>
                      <div>
                        <span className="text-sm text-gray-500 flex items-center">
                          <Clock className="h-4 w-4 mr-1" />
                          Lieferzeit
                        </span>
                        <p className="font-medium">{condition.deliveryTime}</p>
                      </div>
                      <div>
                        <span className="text-sm text-gray-500">
                          Zahlungsbedingungen
                        </span>
                        <p className="font-medium">{condition.paymentTerms}</p>
                      </div>
                    </div>

                    {/* Rabattkonditionen */}
                    {condition.discountConditions.length > 0 && (
                      <div className="border-t pt-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Rabattkonditionen</h4>
                        <div className="space-y-2">
                          {condition.discountConditions.map((discount) => (
                            <div key={discount.id} className="flex items-center justify-between p-2 bg-blue-50 rounded">
                              <div>
                                <span className="text-sm font-medium">
                                  {discount.discountType === 'percentage' 
                                    ? `${discount.discountValue}% Rabatt` 
                                    : `${formatCurrency(discount.discountValue)} Rabatt`}
                                </span>
                                <p className="text-xs text-gray-600">{discount.description}</p>
                              </div>
                              <Badge variant="outline">
                                ab {discount.minQuantity} Stück
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Bestellhistorie */}
                    {condition.lastOrderDate && (
                      <div className="border-t pt-4 mt-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Letzte Bestellung</span>
                            <p className="font-medium">{new Date(condition.lastOrderDate).toLocaleDateString('de-DE')}</p>
                          </div>
                          {condition.avgOrderQuantity && (
                            <div>
                              <span className="text-gray-500">Ø Bestellmenge</span>
                              <p className="font-medium">{condition.avgOrderQuantity} Stück</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Preishistorie Tab */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Preisentwicklung</CardTitle>
            </CardHeader>
            <CardContent>
              {priceHistory.length === 0 ? (
                <div className="text-center py-8">
                  <TrendingUp className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500">Keine Preishistorie verfügbar</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="h-64 bg-gray-100 rounded flex items-center justify-center">
                    <p className="text-gray-500">Preischart wird hier angezeigt</p>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium">Preisverlauf (letzte 12 Monate)</h4>
                    {priceHistory.slice(0, 10).map((point, index) => (
                      <div key={index} className="flex items-center justify-between p-2 border rounded">
                        <div>
                          <span className="font-medium">{point.supplierName}</span>
                          <p className="text-sm text-gray-500">{new Date(point.date).toLocaleDateString('de-DE')}</p>
                        </div>
                        <span className="font-bold">{formatCurrency(point.price)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Wirtschaftlichkeitsanalyse Tab */}
        <TabsContent value="analysis" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Wirtschaftlichkeitsanalyse</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-3">Kostenanalyse</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Durchschn. Einkaufspreis:</span>
                      <span className="font-medium">
                        {conditions.length > 0 
                          ? formatCurrency(conditions.reduce((acc, c) => acc + c.unitPrice, 0) / conditions.length)
                          : 'k.A.'
                        }
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Günstigster Preis:</span>
                      <span className="font-medium text-green-600">
                        {bestPrice > 0 ? formatCurrency(bestPrice) : 'k.A.'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Potentielle Ersparnis:</span>
                      <span className="font-medium text-blue-600">
                        {conditions.length > 1 
                          ? formatCurrency(Math.max(...conditions.map(c => c.unitPrice)) - bestPrice)
                          : 'k.A.'
                        }
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-3">Empfehlungen</h4>
                  <div className="space-y-2">
                    {conditions.length === 0 ? (
                      <div className="flex items-start space-x-2">
                        <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Keine Lieferanten konfiguriert</p>
                          <p className="text-xs text-gray-600">Konfigurieren Sie Lieferanten für bessere Einkaufsbedingungen</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start space-x-2">
                          <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium">Bester Anbieter: {conditions.find(c => c.unitPrice === bestPrice)?.supplierName}</p>
                            <p className="text-xs text-gray-600">Günstigster Preis bei guter Zuverlässigkeit</p>
                          </div>
                        </div>
                        
                        {conditions.some(c => c.discountConditions.length > 0) && (
                          <div className="flex items-start space-x-2">
                            <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium">Mengenrabatte verfügbar</p>
                              <p className="text-xs text-gray-600">Bei größeren Bestellmengen können Sie zusätzlich sparen</p>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}