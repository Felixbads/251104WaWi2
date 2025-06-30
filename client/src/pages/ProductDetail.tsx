import React, { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit, Package, Package2, Info, Image, BarChart3, TrendingUp, Truck, Leaf } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Product } from '@shared/schema';
import { ProductEditDialog } from '@/components/ProductEditDialog';
import { apiRequest } from '@/lib/queryClient';
import ProductInventoryView from '@/components/product/ProductInventoryView';
import ProductSalesView from '@/components/product/ProductSalesView';
import ProductAnalyticsView from '@/components/product/ProductAnalyticsView';

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

      <Tabs defaultValue="details" className="w-full">
        <div className="w-full overflow-x-auto pb-2">
          <TabsList className="inline-flex w-auto min-w-full h-auto p-1">
            <TabsTrigger value="details" className="flex items-center gap-1 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
              <Package className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Details</span>
            </TabsTrigger>
            <TabsTrigger value="inventory" className="flex items-center gap-1 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
              <Package2 className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Lagerbestand</span>
            </TabsTrigger>
            <TabsTrigger value="sales" className="flex items-center gap-1 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Verkäufe</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-1 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
              <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Analyse</span>
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

        <TabsContent value="details" className="space-y-4 sm:space-y-6 mt-4 sm:mt-6">
          {/* Mobile-first responsive grid layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            
            {/* Basic Product Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg sm:text-xl">
                  <Package className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                  Produktinformationen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <span className="text-xs sm:text-sm text-gray-500">Vendon-ID</span>
                    <p className="font-medium text-sm sm:text-base">{product.vendonId}</p>
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm text-gray-500">Produktname</span>
                    <p className="font-medium text-sm sm:text-base">{product.productName}</p>
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm text-gray-500">Kategorie</span>
                    <p className="font-medium text-sm sm:text-base">{product.category || 'k.A.'}</p>
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm text-gray-500">Artikel</span>
                    <p className="font-medium text-sm sm:text-base">{product.article || 'k.A.'}</p>
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm text-gray-500">MwSt.</span>
                    <p className="font-medium text-sm sm:text-base">{product.vat ? `${product.vat}%` : 'k.A.'}</p>
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm text-gray-500">Verkaufspreis</span>
                    <p className="font-medium text-lg text-green-600">{product.price ? `${product.price.toFixed(2)} €` : 'k.A.'}</p>
                  </div>
                </div>
                
                {product.shortDescription && (
                  <div className="pt-2 border-t">
                    <span className="text-xs sm:text-sm text-gray-500">Kurzbeschreibung</span>
                    <p className="font-medium text-sm sm:text-base whitespace-pre-line">{product.shortDescription}</p>
                  </div>
                )}
                
                {product.description && (
                  <div className="pt-2 border-t">
                    <span className="text-xs sm:text-sm text-gray-500">Detailbeschreibung</span>
                    <p className="font-medium text-sm sm:text-base whitespace-pre-line">{product.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Supplier Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg sm:text-xl">
                  <Truck className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                  Lieferanteninformationen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {product.supplierName && (
                    <div className="sm:col-span-2">
                      <span className="text-xs sm:text-sm text-gray-500">Lieferant</span>
                      <p className="font-medium text-sm sm:text-base">{product.supplierName}</p>
                    </div>
                  )}
                  
                  {product.packageSize && (
                    <div>
                      <span className="text-xs sm:text-sm text-gray-500">Gebindegröße</span>
                      <p className="font-medium text-sm sm:text-base">{product.packageSize}</p>
                    </div>
                  )}
                  
                  {product.costPrice && (
                    <div>
                      <span className="text-xs sm:text-sm text-gray-500">Nettopreis</span>
                      <p className="font-medium text-sm sm:text-base text-blue-600">{product.costPrice.toFixed(2)} €</p>
                    </div>
                  )}
                  
                  {product.minOrderQuantity && (
                    <div>
                      <span className="text-xs sm:text-sm text-gray-500">Mindestbestellmenge</span>
                      <p className="font-medium text-sm sm:text-base">{product.minOrderQuantity}</p>
                    </div>
                  )}
                  
                  {product.shelfLifeDays && (
                    <div>
                      <span className="text-xs sm:text-sm text-gray-500">Haltbarkeit (Tage)</span>
                      <p className="font-medium text-sm sm:text-base">{product.shelfLifeDays}</p>
                    </div>
                  )}
                </div>
                
                {/* Purchase Conditions Section */}
                <div className="pt-4 border-t">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Einkaufsbedingungen</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                    <div>
                      <span className="text-gray-500">Lieferzeit</span>
                      <p className="font-medium">Standard Lieferung</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Zahlungsbedingungen</span>
                      <p className="font-medium">Nach Vereinbarung</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Ingredients & Nutrition - Full width */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-lg sm:text-xl">
                <Leaf className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                Inhaltsstoffe & Eigenschaften
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {product.ingredients && (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <span className="text-xs sm:text-sm text-gray-500">Inhaltsstoffe</span>
                    <p className="font-medium text-sm sm:text-base">{product.ingredients}</p>
                  </div>
                )}
                
                {product.allergens && (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <span className="text-xs sm:text-sm text-gray-500">Allergene</span>
                    <p className="font-medium text-sm sm:text-base text-red-600">{product.allergens}</p>
                  </div>
                )}
              </div>
              
              {product.nutritionalInfo && (
                <div className="pt-4 border-t">
                  <span className="text-xs sm:text-sm text-gray-500">Nährwerttabelle</span>
                  <div className="mt-2 p-3 bg-gray-50 rounded border text-xs sm:text-sm">
                    <pre className="whitespace-pre-wrap font-mono">{product.nutritionalInfo}</pre>
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t">
                {Object.entries({
                  'Bio': product.isOrganic ? 'Ja' : 'Nein',
                  'Vegan': product.isVegan ? 'Ja' : 'Nein',
                  'Vegetarisch': product.isVegetarian ? 'Ja' : 'Nein',
                  'Lokal': product.isLocal ? 'Ja' : 'Nein',
                }).map(([key, value]) => (
                  <div key={key} className="text-center">
                    <span className="text-xs text-gray-500 block">{key}</span>
                    <Badge variant={value === 'Ja' ? 'default' : 'secondary'} className="text-xs">
                      {value}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Photos Display */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-lg sm:text-xl">
                <Image className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                Produktfotos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(product.photos && product.photos.length > 0) || product.photoUrl ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                  {/* Show photos from array */}
                  {product.photos && product.photos.map((photo, index) => (
                    <div key={index} className="aspect-square bg-gray-100 rounded border overflow-hidden">
                      <img 
                        src={photo.startsWith('http') ? photo : `/uploads/photos/${photo.replace(/^\/+/, '')}`}
                        alt={`${product.productName} - Foto ${index + 1}`}
                        className="w-full h-full object-cover hover:scale-105 transition-transform"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    </div>
                  ))}
                  {/* Show photoUrl if different from photos array */}
                  {product.photoUrl && (!product.photos || !product.photos.includes(product.photoUrl)) && (
                    <div className="aspect-square bg-gray-100 rounded border overflow-hidden">
                      <img 
                        src={product.photoUrl.startsWith('http') ? product.photoUrl : `/uploads/photos/${product.photoUrl.replace(/^\/+/, '')}`}
                        alt={`${product.productName} - Hauptfoto`}
                        className="w-full h-full object-cover hover:scale-105 transition-transform"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Image className="h-8 w-8 sm:h-12 sm:w-12 mx-auto text-gray-400 mb-2" />
                  <p className="text-gray-500 text-sm sm:text-base">Keine Produktfotos vorhanden</p>
                </div>
              )}
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

        {/* Analytics Tab with Charts */}
        <TabsContent value="analytics" className="space-y-6 mt-6">
          <ProductAnalyticsView productId={parseInt(id!)} productName={product.productName} />
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