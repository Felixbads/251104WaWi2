import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  ArrowDown,
  Package,
  Clock,
  TrendingDown
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTopRemovedProducts, type TopRemovedProduct } from "@/lib/api";

export default function TopRemovedProductsTile() {
  const { data: topRemovedProducts, isLoading, error } = useQuery({
    queryKey: ['/removed-products/top', 7],
    queryFn: () => getTopRemovedProducts(7),
  });

  if (error) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ArrowDown className="h-5 w-5 text-red-500" />
            Häufigste Entnahmen
          </CardTitle>
          <CardDescription>Letzte 7 Tage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center text-red-600 text-sm">
            Fehler beim Laden der Daten
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingDown className="h-5 w-5 text-red-500" />
          Häufigste Entnahmen
        </CardTitle>
        <CardDescription>
          Abgelaufene/beschädigte Produkte der letzten 7 Tage
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              <span className="text-sm text-muted-foreground">Lade Daten...</span>
            </div>
          </div>
        ) : !topRemovedProducts?.length ? (
          <div className="text-center py-4">
            <Package className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Keine Entnahmen in den letzten 7 Tagen
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Zusammenfassung */}
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-red-600">
                {topRemovedProducts.reduce((sum, product) => sum + Number(product.totalRemoved), 0)}
              </div>
              <div className="text-xs text-muted-foreground">
                Gesamt entfernte Produkte
              </div>
            </div>

            {/* Top Produkte Liste */}
            <div className="space-y-2">
              {topRemovedProducts.slice(0, 5).map((product, index) => (
                <div 
                  key={product.productName} 
                  className="flex items-center justify-between p-2 rounded border bg-background/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={index === 0 ? "destructive" : "secondary"} 
                        className="text-xs px-1.5 py-0.5"
                      >
                        #{index + 1}
                      </Badge>
                      <div className="truncate text-sm font-medium" title={product.productName}>
                        {product.productName.length > 25 
                          ? product.productName.substring(0, 25) + '...' 
                          : product.productName}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ArrowDown className="h-3 w-3" />
                        {product.removalsCount}x entfernt
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(product.lastRemoved), 'dd.MM.', { locale: de })}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-red-600">
                      {product.totalRemoved}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Stück
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Zusätzliche Statistik */}
            {topRemovedProducts.length > 5 && (
              <div className="text-center pt-2 border-t">
                <span className="text-xs text-muted-foreground">
                  +{topRemovedProducts.length - 5} weitere Produkte mit Entnahmen
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}