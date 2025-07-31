import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Euro } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface Product {
  id: number;
  productName: string;
  name: string;
  category: string;
  price: number;
  purchasePrice: number;
  units: string;
  packageSize: string;
  packagingUnit: string;
  packagingQuantity: number;
  depositPerUnit: number;
  minQuantity: number;
  shortDescription: string;
  status: string;
  // Business data properties
  profitMargin?: number;
  hasRealCosts?: boolean;
  profitPerUnit?: number;
  discountApplied?: boolean;
}

interface ProductOverviewTableProps {
  supplierId: number;
  supplierName?: string;
}

export default function ProductOverviewTable({ supplierId, supplierName }: ProductOverviewTableProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch products with business data for this supplier
  const { data: productsResponse, isLoading, error } = useQuery({
    queryKey: [`/api/suppliers/${supplierId}/products-with-business-data`],
    staleTime: 1000 * 60, // 1 minute
  });

  // Extract products from response (handle multiple possible formats)
  const products: Product[] = (() => {
    if (!productsResponse) return [];
    if (Array.isArray(productsResponse)) return productsResponse;
    if (productsResponse && typeof productsResponse === 'object') {
      if (Array.isArray((productsResponse as any).data)) return (productsResponse as any).data;
      if (Array.isArray((productsResponse as any).products)) return (productsResponse as any).products;
    }
    return [];
  })();

  // Filter products based on search term
  const filteredProducts = products.filter(product =>
    product.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2
    }).format(price);
  };

  const formatPackaging = (product: Product) => {
    if (product.packagingQuantity > 1) {
      return `${product.packagingQuantity} ${product.packagingUnit}`;
    }
    return product.packagingUnit || 'Stück';
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Produktübersicht wird geladen...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-red-600">Fehler beim Laden der Produkte</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Die Produktdaten konnten nicht geladen werden. Bitte versuchen Sie es erneut.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>Produktübersicht</span>
          {supplierName && (
            <Badge variant="outline">{supplierName}</Badge>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Produkte durchsuchen..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="text-sm text-muted-foreground">
            {filteredProducts.length} von {products.length} Produkten
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produkt</TableHead>
                <TableHead>Kategorie</TableHead>
                <TableHead className="text-right">Preis (netto)</TableHead>
                <TableHead className="text-right">Marge</TableHead>
                <TableHead className="text-right">Gewinn/Stk</TableHead>
                <TableHead className="text-right">Pfand</TableHead>
                <TableHead>Gebinde</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {searchTerm ? 'Keine Produkte gefunden' : 'Keine Produkte verfügbar'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium text-sm">
                          {product.productName || product.name || `Produkt ${product.id}`}
                        </div>
                        {product.shortDescription && (
                          <div className="text-xs text-muted-foreground">
                            {product.shortDescription}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {product.category || 'Ohne Kategorie'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {product.purchasePrice > 0 ? (
                        <div className="flex flex-col items-end">
                          <span className="font-medium">
                            {formatPrice(product.purchasePrice)}
                          </span>
                          {product.hasRealCosts && (
                            <span className="text-xs text-green-600">
                              ✓ Echte Kosten
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">–</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {product.hasRealCosts && typeof product.profitMargin === 'number' ? (
                        <div className="flex flex-col items-end">
                          <span className={`font-medium text-sm ${
                            product.profitMargin > 20 ? 'text-green-600' : 
                            product.profitMargin > 10 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {product.profitMargin.toFixed(1)}%
                          </span>
                          {product.discountApplied && (
                            <span className="text-xs text-blue-600">
                              🏷️ Rabatt
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">–</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {product.hasRealCosts && typeof product.profitPerUnit === 'number' && product.profitPerUnit > 0 ? (
                        <span className="font-medium text-sm text-green-600">
                          +{formatPrice(product.profitPerUnit)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">–</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {product.depositPerUnit > 0 ? (
                        <span className="text-sm">
                          {formatPrice(product.depositPerUnit)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">0</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {formatPackaging(product)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={product.status === 'active' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {product.status === 'active' ? 'Aktiv' : 'Inaktiv'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {filteredProducts.length > 0 && (
          <div className="mt-4 text-sm text-muted-foreground">
            <p>
              <strong>Hinweise:</strong> Preise sind Netto-Einkaufspreise. 
              Pfand ist steuerfrei. Gebinde zeigen die Verpackungseinheiten.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}