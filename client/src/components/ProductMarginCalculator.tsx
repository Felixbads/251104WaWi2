import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calculator, TrendingUp, Euro } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface ProductMarginData {
  productId: number;
  productName: string;
  sellingPriceGross: number; // Verkaufspreis brutto (inkl. MwSt & Pfand)
  depositAmount: number; // Pfandbetrag
  sellingPriceGrossMinusDeposit: number; // Verkaufspreis brutto abzgl. Pfand
  sellingPriceNet: number; // Verkaufspreis netto (ohne MwSt, ohne Pfand)
  purchasePriceGross: number; // Einkaufspreis brutto (inkl. MwSt, ohne Pfand)
  purchasePriceNet: number; // Einkaufspreis netto (ohne MwSt)
  contributionMargin: number; // Deckungsbeitrag (Netto-Verkaufspreis – Netto-Einkaufspreis)
  contributionMarginPercent: number; // Deckungsbeitrag in % (Marge)
}

interface ProductMarginCalculatorProps {
  productId: number;
}

export default function ProductMarginCalculator({ productId }: ProductMarginCalculatorProps) {
  const { data: marginData, isLoading, error } = useQuery<ProductMarginData>({
    queryKey: [`/api/products/${productId}/margin-calculation`],
    enabled: !!productId,
  });

  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Marge-Kalkulation
          </CardTitle>
          <CardDescription>Lade Margen-Berechnung...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error || !marginData) {
    return (
      <Card className="mb-6 border-orange-200 bg-orange-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-800">
            <Calculator className="h-5 w-5" />
            Marge-Kalkulation
          </CardTitle>
          <CardDescription className="text-orange-600">
            Für eine vollständige Margen-Analyse sind Einkaufspreise erforderlich.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const formatCurrency = (amount: number) => `€${amount.toFixed(2)}`;
  const formatPercent = (percent: number) => `${percent.toFixed(1)}%`;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-blue-600" />
          Marge-Kalkulation
        </CardTitle>
        <CardDescription>
          Schritt-für-Schritt Margen-Berechnung für {marginData.productName}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          
          {/* Schritt 1: Verkaufspreis brutto */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">1. Verkaufspreis brutto</span>
              <Euro className="h-4 w-4 text-gray-500" />
            </div>
            <div className="text-lg font-bold text-gray-900">
              {formatCurrency(marginData.sellingPriceGross)}
            </div>
            <p className="text-xs text-gray-500 mt-1">inkl. MwSt & Pfand</p>
          </div>

          {/* Schritt 2: Pfandbetrag */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-600">2. Pfandbetrag</span>
              <Badge variant="outline" className="text-xs">Pfand</Badge>
            </div>
            <div className="text-lg font-bold text-blue-900">
              {formatCurrency(marginData.depositAmount)}
            </div>
            <p className="text-xs text-blue-500 mt-1">sofern enthalten</p>
          </div>

          {/* Schritt 3: Verkaufspreis abzgl. Pfand */}
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-green-600">3. Verkaufspreis o. Pfand</span>
            </div>
            <div className="text-lg font-bold text-green-900">
              {formatCurrency(marginData.sellingPriceGrossMinusDeposit)}
            </div>
            <p className="text-xs text-green-500 mt-1">brutto abzgl. Pfand</p>
          </div>

          {/* Schritt 4: Verkaufspreis netto */}
          <div className="p-4 bg-emerald-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-emerald-600">4. Verkaufspreis netto</span>
            </div>
            <div className="text-lg font-bold text-emerald-900">
              {formatCurrency(marginData.sellingPriceNet)}
            </div>
            <p className="text-xs text-emerald-500 mt-1">
              Formel: {formatCurrency(marginData.sellingPriceGrossMinusDeposit)} ÷ 1,19
            </p>
          </div>

          {/* Schritt 5: Einkaufspreis brutto */}
          <div className="p-4 bg-orange-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-orange-600">5. Einkaufspreis brutto</span>
            </div>
            <div className="text-lg font-bold text-orange-900">
              {formatCurrency(marginData.purchasePriceGross)}
            </div>
            <p className="text-xs text-orange-500 mt-1">inkl. MwSt, ohne Pfand</p>
          </div>

          {/* Schritt 6: Einkaufspreis netto */}
          <div className="p-4 bg-red-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-red-600">6. Einkaufspreis netto</span>
            </div>
            <div className="text-lg font-bold text-red-900">
              {formatCurrency(marginData.purchasePriceNet)}
            </div>
            <p className="text-xs text-red-500 mt-1">
              Formel: {formatCurrency(marginData.purchasePriceGross)} ÷ 1,19
            </p>
          </div>

          {/* Schritt 7: Deckungsbeitrag */}
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-purple-600">7. Deckungsbeitrag</span>
              <TrendingUp className="h-4 w-4 text-purple-500" />
            </div>
            <div className="text-lg font-bold text-purple-900">
              {formatCurrency(marginData.contributionMargin)}
            </div>
            <p className="text-xs text-purple-500 mt-1">
              {formatCurrency(marginData.sellingPriceNet)} - {formatCurrency(marginData.purchasePriceNet)}
            </p>
          </div>

          {/* Schritt 8: Deckungsbeitrag in % */}
          <div className="p-4 bg-indigo-50 rounded-lg md:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-indigo-600">8. Deckungsbeitrag in % (Marge)</span>
              <Badge 
                variant={marginData.contributionMarginPercent >= 30 ? "default" : 
                        marginData.contributionMarginPercent >= 15 ? "secondary" : "destructive"}
                className="text-sm"
              >
                {formatPercent(marginData.contributionMarginPercent)}
              </Badge>
            </div>
            <div className="text-2xl font-bold text-indigo-900">
              {formatPercent(marginData.contributionMarginPercent)}
            </div>
            <p className="text-xs text-indigo-500 mt-1">
              Formel: ({formatCurrency(marginData.contributionMargin)} ÷ {formatCurrency(marginData.sellingPriceNet)}) × 100
            </p>
            
            {/* Marge-Bewertung */}
            <div className="mt-3 p-2 rounded bg-white/50">
              <p className="text-sm font-medium">
                {marginData.contributionMarginPercent >= 30 ? "🟢 Sehr gute Marge" :
                 marginData.contributionMarginPercent >= 15 ? "🟡 Akzeptable Marge" :
                 marginData.contributionMarginPercent >= 0 ? "🔴 Niedrige Marge" : "❌ Verlust"}
              </p>
            </div>
          </div>

        </div>
      </CardContent>
    </Card>
  );
}