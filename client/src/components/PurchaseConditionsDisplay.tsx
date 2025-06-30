import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Package, Euro, Clock, FileText } from 'lucide-react';

interface PurchaseCondition {
  id: number;
  productId: number;
  supplierId: number;
  supplierName: string;
  unitPrice: number;
  grossPrice: number;
  taxRate: number;
  packagingQuantity: number;
  packagingUnit: string;
  minQuantity: number;
  deliveryTime: string;
  isPreferred: boolean;
  validFrom: string;
  validTo?: string;
  notes?: string;
}

interface PurchaseConditionsDisplayProps {
  productId: number;
  supplierId?: number | null;
}

export function PurchaseConditionsDisplay({ productId, supplierId }: PurchaseConditionsDisplayProps) {
  const { data: conditions, isLoading, error } = useQuery<PurchaseCondition[]>({
    queryKey: [`/api/products/${productId}/purchase-conditions`],
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });

  if (isLoading) {
    return (
      <div className="mt-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Einkaufsbedingungen</h4>
        <div className="animate-pulse bg-gray-200 h-20 rounded"></div>
      </div>
    );
  }

  if (error || !conditions || conditions.length === 0) {
    return (
      <div className="mt-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Einkaufsbedingungen</h4>
        <p className="text-sm text-gray-500">Keine Einkaufsbedingungen verfügbar</p>
      </div>
    );
  }

  // Filter nach Lieferant wenn angegeben
  const filteredConditions = supplierId 
    ? conditions.filter(c => c.supplierId === supplierId)
    : conditions;

  // Zeige alle Bedingungen (entferne isActive Filter da das Feld isPreferred heißt)
  const displayConditions = filteredConditions;

  if (displayConditions.length === 0) {
    return (
      <div className="mt-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Einkaufsbedingungen</h4>
        <p className="text-sm text-gray-500">Keine Einkaufsbedingungen verfügbar</p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
        <FileText className="h-4 w-4 mr-2" />
        Einkaufsbedingungen
      </h4>
      
      <div className="space-y-3">
        {displayConditions.map((condition) => (
          <Card key={condition.id} className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h5 className="font-medium text-sm">{condition.supplierName}</h5>
                  {condition.validUntil && (
                    <p className="text-xs text-gray-500">
                      Gültig bis: {new Date(condition.validUntil).toLocaleDateString('de-DE')}
                    </p>
                  )}
                </div>
                <Badge variant="secondary" className="text-xs">
                  Aktiv
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div className="flex items-center">
                    <Euro className="h-3 w-3 mr-1 text-gray-400" />
                    <span className="text-gray-600">Nettopreis:</span>
                    <span className="ml-1 font-medium">
                      {condition.netPrice.toFixed(2)} €
                    </span>
                  </div>
                  
                  <div className="flex items-center">
                    <span className="text-gray-600">Bruttopreis:</span>
                    <span className="ml-1 font-medium">
                      {condition.grossPrice.toFixed(2)} €
                    </span>
                  </div>

                  <div className="flex items-center">
                    <Package className="h-3 w-3 mr-1 text-gray-400" />
                    <span className="text-gray-600">Verpackung:</span>
                    <span className="ml-1 font-medium">
                      {condition.packagingQuantity} {condition.packagingUnit}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center">
                    <span className="text-gray-600">Mindestmenge:</span>
                    <span className="ml-1 font-medium">
                      {condition.minOrderQuantity}
                    </span>
                  </div>

                  <div className="flex items-center">
                    <Clock className="h-3 w-3 mr-1 text-gray-400" />
                    <span className="text-gray-600">Lieferzeit:</span>
                    <span className="ml-1 font-medium">
                      {condition.deliveryTime} Tage
                    </span>
                  </div>

                  <div className="flex items-center">
                    <span className="text-gray-600">MwSt:</span>
                    <span className="ml-1 font-medium">
                      {condition.vatRate}%
                    </span>
                  </div>
                </div>
              </div>

              {condition.paymentTerms && (
                <>
                  <Separator className="my-3" />
                  <div className="text-sm">
                    <span className="text-gray-600">Zahlungsbedingungen:</span>
                    <p className="mt-1 text-gray-800">{condition.paymentTerms}</p>
                  </div>
                </>
              )}

              {condition.notes && (
                <>
                  <Separator className="my-3" />
                  <div className="text-sm">
                    <span className="text-gray-600">Bemerkungen:</span>
                    <p className="mt-1 text-gray-800">{condition.notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}