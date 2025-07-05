import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Calculator, 
  Euro, 
  Package, 
  Info,
  TrendingUp,
  Users
} from 'lucide-react';

interface ProductPurchaseConditionsViewProps {
  productId: number;
  productName: string;
}

interface PurchaseCondition {
  id: number;
  productId: number;
  supplierId: number;
  supplierName: string;
  pricePerUnit: number;
  minimumQuantity: number;
  discountPercentage?: number;
  validFrom: string;
  validTo?: string;
  notes?: string;
}

interface PriceHistoryPoint {
  date: string;
  price: number;
  supplier: string;
  minimumQuantity: number;
  discount: number;
  notes?: string;
}

export default function ProductPurchaseConditionsView({ productId, productName }: ProductPurchaseConditionsViewProps) {
  // Lade Einkaufsbedingungen für das Produkt
  const { data: conditions = [], isLoading: conditionsLoading } = useQuery<PurchaseCondition[]>({
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE');
  };

  const bestPrice = conditions.length > 0 ? Math.min(...conditions.map(c => c.pricePerUnit)) : 0;
  const avgPrice = conditions.length > 0 ? conditions.reduce((sum, c) => sum + c.pricePerUnit, 0) / conditions.length : 0;

  if (conditions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calculator className="h-5 w-5 mr-2" />
            Einkaufsbedingungen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Info className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Keine Einkaufsbedingungen verfügbar
            </h3>
            <p className="text-gray-500">
              Für dieses Produkt sind noch keine Einkaufsbedingungen hinterlegt.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

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
              <p className="text-2xl font-bold text-green-600">{formatCurrency(bestPrice)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-500">Durchschnittspreis</p>
              <p className="text-2xl font-bold">{formatCurrency(avgPrice)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-500">Preishistorie</p>
              <p className="text-2xl font-bold">{priceHistory.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lieferanten-Vergleich */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Users className="h-5 w-5 mr-2" />
            Lieferanten-Vergleich
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {conditions.map((condition) => (
              <div key={condition.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-lg">{condition.supplierName}</h3>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-600">
                      {formatCurrency(condition.pricePerUnit)}
                    </div>
                    <div className="text-sm text-gray-500">pro Einheit</div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div className="flex items-center">
                    <Package className="h-4 w-4 mr-2 text-gray-400" />
                    <div>
                      <div className="text-sm text-gray-500">Mindestmenge</div>
                      <div className="font-medium">{condition.minimumQuantity} Stück</div>
                    </div>
                  </div>
                  
                  {condition.discountPercentage && condition.discountPercentage > 0 && (
                    <div className="flex items-center">
                      <Euro className="h-4 w-4 mr-2 text-gray-400" />
                      <div>
                        <div className="text-sm text-gray-500">Rabatt</div>
                        <Badge variant="secondary">{condition.discountPercentage}%</Badge>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center">
                    <Info className="h-4 w-4 mr-2 text-gray-400" />
                    <div>
                      <div className="text-sm text-gray-500">Gültig ab</div>
                      <div className="font-medium">{formatDate(condition.validFrom)}</div>
                    </div>
                  </div>
                </div>
                
                {condition.notes && (
                  <div className="mt-3 p-3 bg-gray-50 rounded">
                    <div className="text-sm text-gray-600">{condition.notes}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Preishistorie */}
      {priceHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              Preishistorie
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {priceHistory.slice(0, 10).map((entry, index) => (
                <div key={index} className="flex justify-between items-center p-3 border rounded">
                  <div>
                    <div className="font-medium">{entry.supplier}</div>
                    <div className="text-sm text-gray-500">
                      {formatDate(entry.date)} • Mind. {entry.minimumQuantity} Stück
                      {entry.discount > 0 && ` • ${entry.discount}% Rabatt`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-lg">{formatCurrency(entry.price)}</div>
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