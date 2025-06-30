import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Euro, Package, Truck, Calendar } from "lucide-react";

interface PurchaseCondition {
  id: number;
  productId: number;
  supplierId: number;
  supplierName: string;
  netPrice: number;
  grossPrice: number;
  vatRate: number;
  packagingQuantity: number;
  packagingUnit: string;
  minOrderQuantity: number;
  deliveryTime: number;
  paymentTerms: string;
  isActive: boolean;
  validFrom: string;
  validUntil?: string;
  notes?: string;
}

interface PurchaseConditionsDisplayProps {
  productId: number;
  supplierId?: number | null;
}

export function PurchaseConditionsDisplay({ productId, supplierId }: PurchaseConditionsDisplayProps) {
  const { data: conditions, isLoading } = useQuery<PurchaseCondition[]>({
    queryKey: [`/api/purchase-conditions/product/${productId}`],
    enabled: !!productId && !!supplierId,
    staleTime: 1000 * 60 * 5 // 5 Minuten
  });

  if (!supplierId || isLoading) {
    return null;
  }

  if (!conditions || conditions.length === 0) {
    return (
      <div className="pt-3 border-t">
        <span className="text-xs sm:text-sm text-gray-500">Einkaufsbedingungen</span>
        <p className="text-sm text-gray-400 italic">Keine Einkaufsbedingungen hinterlegt</p>
      </div>
    );
  }

  const activeCondition = conditions.find(c => c.isActive) || conditions[0];

  return (
    <div className="pt-3 border-t">
      <div className="flex items-center gap-2 mb-3">
        <Euro className="h-4 w-4 text-blue-600" />
        <span className="text-xs sm:text-sm font-medium text-gray-700">Einkaufsbedingungen</span>
        <Badge variant="outline" className="text-xs">
          {activeCondition.supplierName}
        </Badge>
      </div>
      
      <div className="bg-blue-50 rounded-lg p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-gray-600">Nettopreis</span>
            <p className="font-semibold text-blue-700">
              {activeCondition.netPrice.toFixed(2)} €
            </p>
          </div>
          <div>
            <span className="text-gray-600">Bruttopreis</span>
            <p className="font-semibold">
              {activeCondition.grossPrice.toFixed(2)} €
            </p>
          </div>
        </div>
        
        <Separator className="my-2" />
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Package className="h-3 w-3 text-gray-500" />
            <span className="text-gray-600">
              Gebinde: {activeCondition.packagingQuantity} {activeCondition.packagingUnit}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Truck className="h-3 w-3 text-gray-500" />
            <span className="text-gray-600">
              Min. Bestellmenge: {activeCondition.minOrderQuantity}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-3 w-3 text-gray-500" />
            <span className="text-gray-600">
              Lieferzeit: {activeCondition.deliveryTime} Tage
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Euro className="h-3 w-3 text-gray-500" />
            <span className="text-gray-600">
              Zahlungsziel: {activeCondition.paymentTerms}
            </span>
          </div>
        </div>
        
        {activeCondition.notes && (
          <>
            <Separator className="my-2" />
            <div className="text-xs">
              <span className="text-gray-600">Bemerkungen:</span>
              <p className="text-gray-700 mt-1 whitespace-pre-line">
                {activeCondition.notes}
              </p>
            </div>
          </>
        )}
        
        <div className="text-xs text-gray-500 pt-1 border-t">
          Gültig ab: {new Date(activeCondition.validFrom).toLocaleDateString('de-DE')}
          {activeCondition.validUntil && 
            ` bis ${new Date(activeCondition.validUntil).toLocaleDateString('de-DE')}`
          }
        </div>
      </div>
    </div>
  );
}