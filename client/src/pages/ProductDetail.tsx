import React, { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Edit, Package, Package2, Info, Image, BarChart3, TrendingUp, Truck, Leaf, Calculator, Save, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Product } from '@shared/schema';
import { ProductEditDialog } from '@/components/ProductEditDialog';
import { apiRequest } from '@/lib/queryClient';
import ProductInventoryView from '@/components/product/ProductInventoryView';
import ProductSalesView from '@/components/product/ProductSalesView';
import ProductAnalyticsView from '@/components/product/ProductAnalyticsView';
import ProductPurchaseConditionsView from '@/components/product/ProductPurchaseConditionsView';
import { PurchaseConditionsDisplay } from '@/components/PurchaseConditionsDisplay';

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  // State for inline editing
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<{[key: string]: any}>({});
  const [isUploading, setIsUploading] = useState(false);

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

  // Lade verfügbare Kategorien
  const { data: categories = [] } = useQuery({
    queryKey: ['/api/product-categories'],
    staleTime: 1000 * 60 * 10, // 10 Minuten
  });

  // Inline editing functions
  const startEdit = (field: string, currentValue: any) => {
    setEditingField(field);
    setEditingValues({ ...editingValues, [field]: currentValue });
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditingValues({});
  };

  const saveField = async (field: string) => {
    if (!editingValues[field] && editingValues[field] !== '') return;
    
    try {
      await updateProductMutation.mutateAsync({
        [field]: editingValues[field]
      });
      setEditingField(null);
      setEditingValues({});
    } catch (error) {
      console.error('Save error:', error);
    }
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('photos', files[i]);
      }
      formData.append('entityType', 'product');
      formData.append('entityId', id!);

      const response = await fetch('/api/photos/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      const result = await response.json();
      
      // Update product with new photos
      const newPhotos = result.photos || [];
      await updateProductMutation.mutateAsync({
        photos: [...(product?.photos || []), ...newPhotos],
        photoUrl: product?.photoUrl || newPhotos[0]
      });

      toast({
        title: "Fotos hochgeladen",
        description: `${newPhotos.length} Foto(s) erfolgreich hochgeladen.`,
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Fehler",
        description: "Fehler beim Hochladen der Fotos.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

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
            <TabsTrigger value="purchase-conditions" className="flex items-center gap-1 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
              <Calculator className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Einkaufsbedingungen</span>
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
                
                {/* Einkaufsbedingungen */}
                <PurchaseConditionsDisplay productId={product.id} supplierId={product.supplierId} />
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
                    <Label className="text-xs sm:text-sm text-gray-500">Kategorie</Label>
                    {editingField === 'category' ? (
                      <div className="flex gap-2 mt-1">
                        <Select
                          value={editingValues.category || product.category || ''}
                          onValueChange={(value) => setEditingValues({...editingValues, category: value})}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Kategorie wählen" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((cat: any) => (
                              <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" onClick={() => saveField('category')}>
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelEdit}>
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm sm:text-base">{product.category || 'k.A.'}</p>
                        <Button size="sm" variant="ghost" onClick={() => startEdit('category', product.category)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
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
                
                {/* Kurzbeschreibung */}
                <div className="pt-2 border-t">
                  <Label className="text-xs sm:text-sm text-gray-500">Kurzbeschreibung</Label>
                  {editingField === 'shortDescription' ? (
                    <div className="flex gap-2 mt-1">
                      <Textarea
                        value={editingValues.shortDescription || product.shortDescription || ''}
                        onChange={(e) => setEditingValues({...editingValues, shortDescription: e.target.value})}
                        placeholder="Kurzbeschreibung eingeben..."
                        className="flex-1"
                      />
                      <div className="flex flex-col gap-1">
                        <Button size="sm" onClick={() => saveField('shortDescription')}>
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelEdit}>
                          ✕
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <p className="font-medium text-sm sm:text-base whitespace-pre-line flex-1">
                        {product.shortDescription || 'Keine Kurzbeschreibung vorhanden'}
                      </p>
                      <Button size="sm" variant="ghost" onClick={() => startEdit('shortDescription', product.shortDescription)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
                
                {/* Detailbeschreibung */}
                <div className="pt-2 border-t">
                  <Label className="text-xs sm:text-sm text-gray-500">Detailbeschreibung</Label>
                  {editingField === 'description' ? (
                    <div className="flex gap-2 mt-1">
                      <Textarea
                        value={editingValues.description || product.description || ''}
                        onChange={(e) => setEditingValues({...editingValues, description: e.target.value})}
                        placeholder="Detailbeschreibung eingeben..."
                        className="flex-1 min-h-[100px]"
                      />
                      <div className="flex flex-col gap-1">
                        <Button size="sm" onClick={() => saveField('description')}>
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelEdit}>
                          ✕
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <p className="font-medium text-sm sm:text-base whitespace-pre-line flex-1">
                        {product.description || 'Keine Detailbeschreibung vorhanden'}
                      </p>
                      <Button size="sm" variant="ghost" onClick={() => startEdit('description', product.description)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
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
                  
                  {/* Gebindegröße */}
                  <div>
                    <Label className="text-xs sm:text-sm text-gray-500">Gebindegröße</Label>
                    {editingField === 'packageSize' ? (
                      <div className="flex gap-2 mt-1">
                        <Input
                          value={editingValues.packageSize || product.packageSize || ''}
                          onChange={(e) => setEditingValues({...editingValues, packageSize: e.target.value})}
                          placeholder="Gebindegröße eingeben..."
                          className="flex-1"
                        />
                        <Button size="sm" onClick={() => saveField('packageSize')}>
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelEdit}>
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm sm:text-base">{product.packageSize || 'k.A.'}</p>
                        <Button size="sm" variant="ghost" onClick={() => startEdit('packageSize', product.packageSize)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  
                  {product.costPrice && (
                    <div>
                      <span className="text-xs sm:text-sm text-gray-500">Nettopreis</span>
                      <p className="font-medium text-sm sm:text-base text-blue-600">{product.costPrice.toFixed(2)} €</p>
                    </div>
                  )}
                  
                  {/* Mindestbestellmenge */}
                  <div>
                    <Label className="text-xs sm:text-sm text-gray-500">Mindestbestellmenge</Label>
                    {editingField === 'minOrderQuantity' ? (
                      <div className="flex gap-2 mt-1">
                        <Input
                          type="number"
                          value={editingValues.minOrderQuantity || product.minOrderQuantity || ''}
                          onChange={(e) => setEditingValues({...editingValues, minOrderQuantity: parseInt(e.target.value)})}
                          placeholder="Mindestbestellmenge eingeben..."
                          className="flex-1"
                        />
                        <Button size="sm" onClick={() => saveField('minOrderQuantity')}>
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelEdit}>
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm sm:text-base">{product.minOrderQuantity || 'k.A.'}</p>
                        <Button size="sm" variant="ghost" onClick={() => startEdit('minOrderQuantity', product.minOrderQuantity)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  
                  {/* Haltbarkeit in Tagen */}
                  <div>
                    <Label className="text-xs sm:text-sm text-gray-500">Haltbarkeit in Tagen</Label>
                    {editingField === 'shelfLifeDays' ? (
                      <div className="flex gap-2 mt-1">
                        <Input
                          type="number"
                          value={editingValues.shelfLifeDays || product.shelfLifeDays || ''}
                          onChange={(e) => setEditingValues({...editingValues, shelfLifeDays: parseInt(e.target.value)})}
                          placeholder="Haltbarkeit in Tagen eingeben..."
                          className="flex-1"
                        />
                        <Button size="sm" onClick={() => saveField('shelfLifeDays')}>
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelEdit}>
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm sm:text-base">{product.shelfLifeDays || 'k.A.'}</p>
                        <Button size="sm" variant="ghost" onClick={() => startEdit('shelfLifeDays', product.shelfLifeDays)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Purchase Conditions Section */}
                <div className="pt-4 border-t">
                  <Label className="text-sm font-medium text-gray-700 mb-2">Einkaufsbedingungen</Label>
                  {editingField === 'purchaseConditions' ? (
                    <div className="flex gap-2 mt-1">
                      <Textarea
                        value={editingValues.purchaseConditions || 'Standard Lieferung, Nach Vereinbarung'}
                        onChange={(e) => setEditingValues({...editingValues, purchaseConditions: e.target.value})}
                        placeholder="Einkaufsbedingungen eingeben..."
                        className="flex-1"
                      />
                      <div className="flex flex-col gap-1">
                        <Button size="sm" onClick={() => saveField('purchaseConditions')}>
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelEdit}>
                          ✕
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm flex-1">
                        <div>
                          <span className="text-gray-500">Lieferzeit</span>
                          <p className="font-medium">Standard Lieferung</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Zahlungsbedingungen</span>
                          <p className="font-medium">Nach Vereinbarung</p>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => startEdit('purchaseConditions', 'Standard Lieferung, Nach Vereinbarung')}>
                        <Edit className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
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
              {/* Inhaltsstoffe */}
              <div>
                <Label className="text-xs sm:text-sm text-gray-500">Inhaltsstoffe</Label>
                {editingField === 'ingredients' ? (
                  <div className="flex gap-2 mt-1">
                    <Textarea
                      value={editingValues.ingredients || product.ingredients || ''}
                      onChange={(e) => setEditingValues({...editingValues, ingredients: e.target.value})}
                      placeholder="Inhaltsstoffe eingeben..."
                      className="flex-1"
                    />
                    <div className="flex flex-col gap-1">
                      <Button size="sm" onClick={() => saveField('ingredients')}>
                        <Save className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEdit}>
                        ✕
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <p className="font-medium text-sm sm:text-base flex-1">
                      {product.ingredients || 'Keine Inhaltsstoffe angegeben'}
                    </p>
                    <Button size="sm" variant="ghost" onClick={() => startEdit('ingredients', product.ingredients)}>
                      <Edit className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
              
              {/* Allergene */}
              <div>
                <Label className="text-xs sm:text-sm text-gray-500">Allergene</Label>
                {editingField === 'allergens' ? (
                  <div className="flex gap-2 mt-1">
                    <Textarea
                      value={editingValues.allergens || product.allergens || ''}
                      onChange={(e) => setEditingValues({...editingValues, allergens: e.target.value})}
                      placeholder="Allergene eingeben..."
                      className="flex-1"
                    />
                    <div className="flex flex-col gap-1">
                      <Button size="sm" onClick={() => saveField('allergens')}>
                        <Save className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEdit}>
                        ✕
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <p className="font-medium text-sm sm:text-base text-red-600 flex-1">
                      {product.allergens || 'Keine Allergene angegeben'}
                    </p>
                    <Button size="sm" variant="ghost" onClick={() => startEdit('allergens', product.allergens)}>
                      <Edit className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
              
              {/* Nährwerttabelle */}
              <div className="pt-4 border-t">
                <Label className="text-xs sm:text-sm text-gray-500">Nährwerttabelle</Label>
                {editingField === 'nutritionalInfo' ? (
                  <div className="flex gap-2 mt-1">
                    <Textarea
                      value={editingValues.nutritionalInfo || product.nutritionalInfo || ''}
                      onChange={(e) => setEditingValues({...editingValues, nutritionalInfo: e.target.value})}
                      placeholder="Nährwerttabelle eingeben..."
                      className="flex-1 min-h-[100px]"
                    />
                    <div className="flex flex-col gap-1">
                      <Button size="sm" onClick={() => saveField('nutritionalInfo')}>
                        <Save className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEdit}>
                        ✕
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      {product.nutritionalInfo ? (
                        <div className="mt-2 p-3 bg-gray-50 rounded border text-xs sm:text-sm">
                          <pre className="whitespace-pre-wrap font-mono">{product.nutritionalInfo}</pre>
                        </div>
                      ) : (
                        <p className="font-medium text-sm sm:text-base text-gray-500">Keine Nährwerttabelle vorhanden</p>
                      )}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => startEdit('nutritionalInfo', product.nutritionalInfo)}>
                      <Edit className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Photos Display */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-lg sm:text-xl">
                <div className="flex items-center">
                  <Image className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                  Produktfotos
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    onClick={() => document.getElementById('photo-upload')?.click()}
                    disabled={isUploading}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {isUploading ? 'Hochladen...' : 'Neue Fotos hochladen'}
                  </Button>
                  <input
                    id="photo-upload"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(product.photos && product.photos.length > 0) || product.photoUrl ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                  {/* Show photoUrl first (main photo) */}
                  {product.photoUrl && (
                    <div className="aspect-square bg-gray-100 rounded border overflow-hidden relative">
                      <img 
                        src={product.photoUrl.startsWith('http') ? product.photoUrl : product.photoUrl}
                        alt={`${product.productName} - Hauptfoto`}
                        className="w-full h-full object-cover hover:scale-105 transition-transform"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                      <div className="absolute top-1 left-1 bg-blue-500 text-white text-xs px-2 py-1 rounded">
                        Hauptfoto
                      </div>
                    </div>
                  )}
                  {/* Show additional photos from array */}
                  {product.photos && product.photos.filter(photo => photo !== product.photoUrl).map((photo, index) => (
                    <div key={index} className="aspect-square bg-gray-100 rounded border overflow-hidden">
                      <img 
                        src={photo.startsWith('http') ? photo : photo}
                        alt={`${product.productName} - Foto ${index + 1}`}
                        className="w-full h-full object-cover hover:scale-105 transition-transform"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Image className="h-8 w-8 sm:h-12 sm:w-12 mx-auto text-gray-400 mb-2" />
                  <p className="text-gray-500 text-sm sm:text-base mb-4">Keine Produktfotos vorhanden</p>
                  <Button 
                    variant="outline"
                    onClick={() => document.getElementById('photo-upload')?.click()}
                    disabled={isUploading}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Erste Fotos hochladen
                  </Button>
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

        {/* Purchase Conditions Tab */}
        <TabsContent value="purchase-conditions" className="space-y-6 mt-6">
          <ProductPurchaseConditionsView productId={parseInt(id!)} productName={product.productName} />
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