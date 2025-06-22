import React, { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit, Package, Info, Image, BarChart, ShoppingCart } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Product } from '@shared/schema';
import { ProductEditDialog } from '@/components/ProductEditDialog';
import { apiRequest } from '@/lib/queryClient';
import ProductInventoryView from '@/components/product/ProductInventoryView';
import ProductSalesView from '@/components/product/ProductSalesView';

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Produktdaten abfragen
  const { data: product, isLoading, error } = useQuery<Product>({
    queryKey: [`/api/products/${id}`],
    staleTime: 1000 * 60, // 1 Minute
  });

  // Mutation zum Aktualisieren des Produkts
  const updateProductMutation = useMutation({
    mutationFn: async (updatedProduct: Partial<Product>) => {
      return apiRequest(`/api/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updatedProduct),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/products/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      toast({
        title: "Produkt aktualisiert",
        description: "Das Produkt wurde erfolgreich aktualisiert.",
      });
    },
    onError: (error) => {
      console.error('Update error:', error);
      toast({
        title: "Fehler",
        description: "Fehler beim Aktualisieren des Produkts.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64 bg-gray-200 rounded"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="container py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Produkt nicht gefunden</h1>
          <p className="text-gray-600 mt-2">Das angeforderte Produkt konnte nicht geladen werden.</p>
          <Button onClick={() => navigate('/produkte')} className="mt-4">
            Zurück zur Produktliste
          </Button>
        </div>
      </div>
    );
  }

  const handleUpdateProduct = (updatedData: Partial<Product>) => {
    updateProductMutation.mutate(updatedData);
  };

  return (
    <div className="container py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/produkte')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{product.productName}</h1>
            <p className="text-gray-600">
              {product.sku && `SKU: ${product.sku}`}
              {product.supplierSku && ` • Lieferanten-Nr.: ${product.supplierSku}`}
            </p>
          </div>
        </div>
        <Button onClick={() => setIsEditDialogOpen(true)}>
          <Edit className="h-4 w-4 mr-2" />
          Bearbeiten
        </Button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <div className="w-full overflow-x-auto pb-2">
          <TabsList className="inline-flex w-auto min-w-full h-auto p-1">
            <TabsTrigger value="overview" className="flex items-center gap-1 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
              <Info className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Übersicht</span>
            </TabsTrigger>
            <TabsTrigger value="details" className="flex items-center gap-1 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
              <Package className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Details</span>
            </TabsTrigger>
            <TabsTrigger value="nutrition" className="flex items-center gap-1 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
              <span className="text-xs sm:text-sm">🥗</span>
              <span>Nährwerte</span>
            </TabsTrigger>
            <TabsTrigger value="photos" className="flex items-center gap-1 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
              <Image className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Fotos</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-1 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
              <BarChart className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Auswertung</span>
            </TabsTrigger>
            <TabsTrigger value="inventory" className="flex items-center gap-1 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
              <Package className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Lagerbestand</span>
            </TabsTrigger>
            <TabsTrigger value="sales" className="flex items-center gap-1 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
              <ShoppingCart className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Verkäufe</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Grundinformationen */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Package className="h-5 w-5 mr-2" />
                  Grundinformationen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-gray-500">Preis</span>
                    <p className="font-medium">
                      {product.price ? `${product.price.toFixed(2)} €` : 'k.A.'}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Kategorie</span>
                    <p className="font-medium">{product.category || 'k.A.'}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Status</span>
                    <Badge variant={product.status === 'active' ? 'default' : 'secondary'}>
                      {product.status || 'k.A.'}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Barcode</span>
                    <p className="font-medium">{product.barcode || 'k.A.'}</p>
                  </div>
                </div>

                {product.shortDescription && (
                  <div>
                    <span className="text-sm text-gray-500">Kurzbeschreibung</span>
                    <p className="font-medium whitespace-pre-line">{product.shortDescription}</p>
                  </div>
                )}

                {product.description && (
                  <div>
                    <span className="text-sm text-gray-500">Beschreibung</span>
                    <p className="font-medium whitespace-pre-line">{product.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Lieferanteninformationen */}
            <Card>
              <CardHeader>
                <CardTitle>Lieferanteninformationen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {product.supplierName && (
                  <div>
                    <span className="text-sm text-gray-500">Lieferant</span>
                    <p className="font-medium">{product.supplierName}</p>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  {product.packageSize && (
                    <div>
                      <span className="text-sm text-gray-500">Gebindegröße</span>
                      <p className="font-medium">{product.packageSize}</p>
                    </div>
                  )}
                  {product.minOrderQuantity && (
                    <div>
                      <span className="text-sm text-gray-500">Mindestbestellmenge</span>
                      <p className="font-medium">{product.minOrderQuantity}</p>
                    </div>
                  )}
                </div>

                {product.shelfLifeDays && (
                  <div>
                    <span className="text-sm text-gray-500">Haltbarkeit</span>
                    <p className="font-medium">{product.shelfLifeDays} Tage</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Inhaltsstoffe und Allergene */}
          {(product.ingredients || product.allergens) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Info className="h-5 w-5 mr-2" />
                  Inhaltsstoffe und Allergene
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {product.ingredients && (
                  <div>
                    <span className="text-sm text-gray-500">Inhaltsstoffe</span>
                    <p className="font-medium whitespace-pre-line">{product.ingredients}</p>
                  </div>
                )}
                {product.allergens && (
                  <div>
                    <span className="text-sm text-gray-500">Allergene</span>
                    <p className="font-medium whitespace-pre-line">{product.allergens}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="details" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Detaillierte Produktinformationen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Object.entries({
                  'Vendon ID': product.vendonId,
                  'Artikel': product.article,
                  'Einheiten': product.units,
                  'MwSt.': product.vat ? `${product.vat}%` : null,
                  'Pfandpreis': product.depositPrice ? `${product.depositPrice.toFixed(2)} €` : null,
                  'Einkaufspreis': product.costPrice ? `${product.costPrice.toFixed(2)} €` : null,
                  'Kritisch': product.critical ? 'Ja' : 'Nein',
                  'Bio': product.isOrganic ? 'Ja' : 'Nein',
                  'Vegan': product.isVegan ? 'Ja' : 'Nein',
                  'Vegetarisch': product.isVegetarian ? 'Ja' : 'Nein',
                  'Lokal': product.isLocal ? 'Ja' : 'Nein',
                  'Nachhaltigkeitsscore': product.sustainabilityScore ? `${product.sustainabilityScore}/100` : null,
                }).filter(([_, value]) => value !== null && value !== undefined).map(([key, value]) => (
                  <div key={key}>
                    <span className="text-sm text-gray-500">{key}</span>
                    <p className="font-medium">{value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="nutrition" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Nährwertangaben</CardTitle>
            </CardHeader>
            <CardContent>
              {product.nutritionalInfo ? (
                <div className="whitespace-pre-line">{product.nutritionalInfo}</div>
              ) : (
                <p className="text-gray-500">Keine Nährwertangaben verfügbar</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="photos" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Image className="h-5 w-5 mr-2" />
                Produktfotos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {product.photos && product.photos.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {product.photos.map((photo, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={photo}
                        alt={`${product.productName} Foto ${index + 1}`}
                        className="w-full h-48 object-cover rounded border"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">Keine Fotos verfügbar</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <BarChart className="h-5 w-5 mr-2" />
                Produktauswertung
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium text-sm text-gray-600 mb-1">Verkäufe (7 Tage)</h4>
                  <p className="text-2xl font-bold">Loading...</p>
                  <p className="text-xs text-gray-500">Wird geladen</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium text-sm text-gray-600 mb-1">Umsatz (7 Tage)</h4>
                  <p className="text-2xl font-bold">Loading...</p>
                  <p className="text-xs text-gray-500">Wird geladen</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium text-sm text-gray-600 mb-1">Beliebtheit</h4>
                  <p className="text-2xl font-bold">Loading...</p>
                  <p className="text-xs text-gray-500">Wird geladen</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inventory Tab */}
        <TabsContent value="inventory" className="space-y-6 mt-6">
          <ProductInventoryView productId={parseInt(id!)} productName={product.productName} />
        </TabsContent>

        {/* Sales Tab */}
        <TabsContent value="sales" className="space-y-6 mt-6">
          <ProductSalesView productId={parseInt(id!)} productName={product.productName} />
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      {product && (
        <ProductEditDialog
          product={product}
          isOpen={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onSave={handleUpdateProduct}
        />
      )}
    </div>
  );
}