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
import ProductInventoryViewSimple from '@/components/product/ProductInventoryViewSimple';
import ProductSalesView from '@/components/product/ProductSalesView';
import ProductAnalyticsView from '@/components/product/ProductAnalyticsView';
import ProductForecastView from '@/components/product/ProductForecastView';
import UnifiedPurchaseConditionsManager from '@/components/purchase-conditions/UnifiedPurchaseConditionsManager';
import { PurchaseConditionsDisplay } from '@/components/PurchaseConditionsDisplay';
import ProductProfitabilityAnalysis from '@/pages/ProductProfitabilityAnalysis';

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

  // Detaillierte Produktdaten mit Chargen und Bewegungen
  const { data: productDetail, isLoading: isDetailLoading } = useQuery({
    queryKey: [`/api/products/${id}/detail`],
    staleTime: 1000 * 30, // 30 Sekunden
    enabled: !!id, // Nur ausführen wenn ID vorhanden
  });

  // Mutation zum Aktualisieren des Produkts
  const updateProductMutation = useMutation({
    mutationFn: async (updatedProduct: Partial<Product>) => {
      return apiRequest(`/api/products/${id}`, updatedProduct, 'PUT');
    },
    // KEINE automatische Invalidierung hier - das macht saveField manuell
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
    queryKey: ['/api/categories/names'],
    staleTime: 1000 * 60 * 10, // 10 Minuten
  });

  // Lade verfügbare Gebindearten
  const { data: packageTypes = [] } = useQuery({
    queryKey: ['/api/package-types/names'],
    staleTime: 1000 * 60 * 10, // 10 Minuten
  });

  // Inline editing functions
  const startEdit = (field: string, currentValue: any) => {
    console.log('[PRODUCT-DETAIL] 🔧 Starting to edit field:', field, 'with value:', currentValue);
    console.log('[PRODUCT-DETAIL] 🔧 Current editingValues before:', editingValues);
    setEditingField(field);
    const newValues = { ...editingValues, [field]: currentValue };
    setEditingValues(newValues);
    console.log('[PRODUCT-DETAIL] 🔧 New editingValues:', newValues);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditingValues({});
  };

  const saveField = async (field: string) => {
    // ERWEITERTE DIAGNOSTIK: Alle editingValues-Inhalte anzeigen
    console.log('[DIAGNOSTIC] 🔍 ===== SAVE FIELD DIAGNOSTIC START =====');
    console.log('[DIAGNOSTIC] 🔍 Field requested:', field);
    console.log('[DIAGNOSTIC] 🔍 All editingValues keys:', Object.keys(editingValues));
    console.log('[DIAGNOSTIC] 🔍 All editingValues values:', Object.values(editingValues));
    console.log('[DIAGNOSTIC] 🔍 Complete editingValues object:', JSON.stringify(editingValues, null, 2));
    console.log('[DIAGNOSTIC] 🔍 Specific field value:', editingValues[field]);
    console.log('[DIAGNOSTIC] 🔍 Field value type:', typeof editingValues[field]);
    console.log('[DIAGNOSTIC] 🔍 Is field value undefined?', editingValues[field] === undefined);
    console.log('[DIAGNOSTIC] 🔍 Is field value null?', editingValues[field] === null);
    console.log('[DIAGNOSTIC] 🔍 Is field value empty string?', editingValues[field] === '');
    console.log('[DIAGNOSTIC] 🔍 ===== SAVE FIELD DIAGNOSTIC END =====');

    // Prüfung: Feld muss existieren und darf nicht undefined sein
    if (editingValues[field] === undefined || editingValues[field] === null) {
      console.log('[PRODUCT-DETAIL] 🚨 Field value is undefined/null, skipping save for:', field);
      console.log('[PRODUCT-DETAIL] 🚨 This suggests input handler is not working for field:', field);
      return;
    }
    
    console.log('[PRODUCT-DETAIL] 🔧 Saving field:', field, 'with value:', editingValues[field]);
    console.log('[PRODUCT-DETAIL] 🔧 Product ID:', id);
    console.log('[PRODUCT-DETAIL] 🔧 Full editingValues:', editingValues);
    
    try {
      // Vollständiges Mapping zwischen Frontend- und Backend-Feldnamen  
      // Alle Felder, die wirklich in der products Tabelle existieren
      const fieldMapping = {
        'packageTypeId': 'package_type_id',
        'shelfLifeDays': 'shelf_life_days', 
        'packageSize': 'package_size',
        'minOrderQuantity': 'min_order_quantity',
        'shortDescription': 'short_description', // ✅ EXISTIERT (Zeile 364)
        'nutritionalInfo': 'nutritional_info'    // ✅ EXISTIERT (Zeile 367)
        // 'purchaseConditions' existiert NICHT - das ist eine separate Tabelle!
      };
      
      const backendFieldName = fieldMapping[field] || field;
      const updateData = {
        [backendFieldName]: editingValues[field]
      };
      
      console.log('[PRODUCT-DETAIL] 🔧 Backend field name:', backendFieldName);
      console.log('[PRODUCT-DETAIL] 🔧 Final update data:', updateData);
      console.log('[PRODUCT-DETAIL] 🔧 About to call updateProductMutation...');
      console.log('[PRODUCT-DETAIL] 🔧 Mutation function will call apiRequest with:', {
        url: `/api/products/${id}`,
        data: updateData,
        method: 'PUT'
      });
      
      const result = await updateProductMutation.mutateAsync(updateData);
      console.log('[PRODUCT-DETAIL] 🔧 Mutation result:', result);
      
      // DIREKTE Query-Cache-Aktualisierung mit den neuen Daten aus der Mutation Response
      if (result && result.product) {
        queryClient.setQueryData([`/api/products/${id}`], result.product);
        console.log('[PRODUCT-DETAIL] ✅ Query cache directly updated with new product data:', result.product);
      }
      
      // UI-State zurücksetzen
      setEditingField(null);
      setEditingValues({});
      console.log('[PRODUCT-DETAIL] 🔧 UI state reset - field editing cleared');
      
      toast({
        title: "Gespeichert",
        description: "Änderung wurde erfolgreich gespeichert.",
      });
    } catch (error) {
      console.error('[PRODUCT-DETAIL] 🚨 Save error:', error);
      console.error('[PRODUCT-DETAIL] 🚨 Error details:', {
        message: error?.message,
        stack: error?.stack,
        response: error?.response
      });
      toast({
        title: "Fehler",
        description: "Fehler beim Speichern der Änderung.",
        variant: "destructive",
      });
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

  const deletePhoto = async (photoIndex: number) => {
    try {
      const response = await fetch(`/api/photos/product/${id}/${photoIndex}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error('Delete failed');

      const result = await response.json();
      
      // Update product photos in cache
      const updatedPhotos = result.remainingPhotos || [];
      await updateProductMutation.mutateAsync({
        photos: updatedPhotos,
        photoUrl: photoIndex === -1 ? (updatedPhotos[0] || null) : product?.photoUrl // Clear main photo if deleted
      });

      toast({
        title: "Foto gelöscht",
        description: "Das Foto wurde erfolgreich entfernt.",
      });
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Fehler",
        description: "Fehler beim Löschen des Fotos.",
        variant: "destructive",
      });
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
            <h1 className="text-3xl font-bold">
              {product.productName || product.product_name || `Produkt #${product.id}` || 'Produkt ohne Namen'}
            </h1>
            <p className="text-gray-600">
              {product.sku && `SKU: ${product.sku}`}
              {product.supplierSku && ` • Lieferanten-Nr.: ${product.supplierSku}`}
              {product.category && ` • ${product.category}`}
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
            <TabsTrigger value="profitability" className="flex items-center gap-1 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Wirtschaftlichkeit</span>
            </TabsTrigger>
            <TabsTrigger value="prognose" className="flex items-center gap-1 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Prognose</span>
            </TabsTrigger>
            <TabsTrigger value="batch-details" className="flex items-center gap-1 px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
              <Package2 className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Chargen & Bewegungen</span>
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
                            {Array.isArray(categories) ? categories.map((cat: string) => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            )) : []}
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
                        value={editingValues.shortDescription || product.short_description || ''}
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
                        {product.short_description || 'Keine Kurzbeschreibung vorhanden'}
                      </p>
                      <Button size="sm" variant="ghost" onClick={() => startEdit('shortDescription', product.short_description)}>
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
                  
                  {/* Gebindeart */}
                  <div>
                    <Label className="text-xs sm:text-sm text-gray-500">Gebindeart</Label>
                    {editingField === 'packageTypeId' ? (
                      <div className="flex gap-2 mt-1">
                        <Select
                          value={editingValues.packageTypeId?.toString() || product.packageTypeId?.toString() || ''}
                          onValueChange={(value) => setEditingValues({...editingValues, packageTypeId: parseInt(value)})}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Gebindeart auswählen" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">Karton</SelectItem>
                            <SelectItem value="2">Stiege</SelectItem>
                            <SelectItem value="3">Kasten</SelectItem>
                            <SelectItem value="4">Kiste</SelectItem>
                            <SelectItem value="5">Stück</SelectItem>
                            <SelectItem value="6">Pack</SelectItem>
                            <SelectItem value="7">Palette</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="flex flex-col gap-1">
                          <Button size="sm" onClick={() => saveField('packageTypeId')}>
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit}>
                            ✕
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm sm:text-base">
                          {product.package_type_name || 'Nicht angegeben'}
                        </p>
                        <Button size="sm" variant="ghost" onClick={() => startEdit('packageTypeId', product.packageTypeId)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  
                  {/* Gebindegröße */}
                  <div>
                    <Label className="text-xs sm:text-sm text-gray-500">Gebindegröße</Label>
                    {editingField === 'packageSize' ? (
                      <div className="flex gap-2 mt-1">
                        <Input
                          type="number"
                          step="0.01"
                          value={editingValues.packageSize || product.packageSize || ''}
                          onChange={(e) => setEditingValues({...editingValues, packageSize: e.target.value})}
                          placeholder="Gebindegröße eingeben..."
                          className="flex-1"
                        />
                        <div className="flex flex-col gap-1">
                          <Button size="sm" onClick={() => {
                            console.log('[SAVE-BUTTON] 🔘 packageSize button clicked');
                            console.log('[SAVE-BUTTON] 🔘 Current editingValues:', editingValues);
                            console.log('[SAVE-BUTTON] 🔘 packageSize value:', editingValues.packageSize);
                            saveField('packageSize');
                          }}>
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit}>
                            ✕
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm sm:text-base">
                          {product.package_size ? `${product.package_size}` : 'Nicht angegeben'}
                        </p>
                        <Button size="sm" variant="ghost" onClick={() => startEdit('packageSize', product.package_size)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  
                  {/* Haltbarkeit */}
                  <div>
                    <Label className="text-xs sm:text-sm text-gray-500">Haltbarkeit (Tage)</Label>
                    {editingField === 'shelfLifeDays' ? (
                      <div className="flex gap-2 mt-1">
                        <Input
                          type="number"
                          value={editingValues.shelfLifeDays || product.shelf_life_days || ''}
                          onChange={(e) => setEditingValues({...editingValues, shelfLifeDays: e.target.value})}
                          placeholder="Haltbarkeit in Tagen..."
                          className="flex-1"
                        />
                        <div className="flex flex-col gap-1">
                          <Button size="sm" onClick={() => saveField('shelfLifeDays')}>
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit}>
                            ✕
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm sm:text-base">
                          {product.shelf_life_days ? `${product.shelf_life_days} Tage` : 'Nicht angegeben'}
                        </p>
                        <Button size="sm" variant="ghost" onClick={() => startEdit('shelfLifeDays', product.shelf_life_days)}>
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
                  {/* Haltbarkeit in Tagen bereits im anderen Bereich vorhanden - REMOVE DUPLICATE */}
                </div>
                
                {/* Purchase Conditions Section - ENTFERNT: Separate Tabelle, nicht Teil der products Tabelle */}
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
                    <div className="aspect-square bg-gray-100 rounded border overflow-hidden relative group">
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
                      <button
                        onClick={() => deletePhoto(-1)} // -1 for main photo
                        className="absolute top-1 right-1 bg-red-500 text-white w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600"
                        title="Foto löschen"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  {/* Show additional photos from array */}
                  {product.photos && product.photos.filter(photo => photo !== product.photoUrl).map((photo, index) => (
                    <div key={index} className="aspect-square bg-gray-100 rounded border overflow-hidden relative group">
                      <img 
                        src={photo.startsWith('http') ? photo : photo}
                        alt={`${product.productName} - Foto ${index + 1}`}
                        className="w-full h-full object-cover hover:scale-105 transition-transform"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                      <button
                        onClick={() => deletePhoto(index)}
                        className="absolute top-1 right-1 bg-red-500 text-white w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600"
                        title="Foto löschen"
                      >
                        ✕
                      </button>
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
          <ProductInventoryViewSimple productId={parseInt(id!)} productName={product.productName} />
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
          <UnifiedPurchaseConditionsManager 
            mode="product"
            entityId={parseInt(id!)}
            entityName={product.productName || `Produkt #${product.id}`}
          />
        </TabsContent>

        {/* Profitability Analysis Tab */}
        <TabsContent value="profitability" className="space-y-6 mt-6">
          <ProductProfitabilityAnalysis productId={parseInt(id!)} />
        </TabsContent>

        {/* Forecast Tab */}
        <TabsContent value="prognose" className="space-y-6 mt-6">
          <ProductForecastView productId={parseInt(id!)} productName={product.productName} />
        </TabsContent>

        {/* Batch Details & Movements Tab */}
        <TabsContent value="batch-details" className="space-y-6 mt-6">
          {isDetailLoading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-pulse space-y-4 w-full">
                <div className="h-8 bg-gray-200 rounded w-1/3"></div>
                <div className="space-y-3">
                  <div className="h-4 bg-gray-200 rounded"></div>
                  <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                </div>
              </div>
            </div>
          ) : productDetail?.data ? (
            <div className="space-y-6">
              {/* Product Header Section */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-4 h-6 bg-green-500 rounded-sm"></div>
                      <div>
                        <h2 className="text-lg font-semibold">
                          {productDetail.data.header.productName}
                        </h2>
                        <p className="text-sm text-gray-600">
                          {productDetail.data.header.category} • {productDetail.data.header.totals.onHandWarehouse} • {productDetail.data.header.totals.inMachines} • 0
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500">
                        {productDetail.data.header.lastMovementAt ? 
                          new Date(productDetail.data.header.lastMovementAt).toLocaleDateString('de-DE') : 
                          'Kein Datum'
                        }
                      </span>
                      <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                        Auf Lager
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {/* Chargen Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Chargen</CardTitle>
                  <div className="text-sm text-gray-600">
                    <span 
                      className="text-blue-600 hover:text-blue-800 cursor-pointer"
                      data-testid="link-movements-history"
                    >
                      Detailansicht mit Bewegungshistorie
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  {productDetail.data.batches.length > 0 ? (
                    <div className="space-y-4">
                      {productDetail.data.batches.map((batch) => (
                        <div key={batch.batchId} className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Batch Nr.</span>
                            <span className="text-sm text-gray-500">MHD</span>
                            <span className="text-sm text-gray-500">Eingangsdatum</span>
                            <span className="text-sm text-gray-500">Menge</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span 
                              className="text-sm font-mono bg-gray-100 px-2 py-1 rounded"
                              data-testid={`batch-number-${batch.batchNumber}`}
                            >
                              {batch.batchNumber}
                            </span>
                            <span 
                              className={`text-sm ${
                                batch.expiryStatus === 'expired' ? 'text-red-600' :
                                batch.expiryStatus === 'warning' ? 'text-orange-600' :
                                batch.expiryStatus === 'attention' ? 'text-yellow-600' :
                                'text-gray-600'
                              }`}
                              data-testid={`batch-expiry-${batch.batchNumber}`}
                            >
                              {batch.expiryDate ? 
                                new Date(batch.expiryDate).toLocaleDateString('de-DE') : 
                                'Kein MHD'
                              }
                            </span>
                            <span className="text-sm text-gray-600">
                              {batch.receivedDate ? 
                                new Date(batch.receivedDate).toLocaleDateString('de-DE') : 
                                'Unbekannt'
                              }
                            </span>
                            <span className="text-sm font-medium" data-testid={`batch-quantity-${batch.batchNumber}`}>
                              {batch.qtyAvailable}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Keine Chargen verfügbar</p>
                  )}
                </CardContent>
              </Card>

              {/* Warenbewegungen Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Warenbewegungen</CardTitle>
                </CardHeader>
                <CardContent>
                  {productDetail.data.movements.data.length > 0 ? (
                    <div className="space-y-3">
                      {productDetail.data.movements.data.map((movement) => (
                        <div 
                          key={movement.id} 
                          className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0"
                          data-testid={`movement-${movement.id}`}
                        >
                          <div className="flex items-center space-x-3">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs text-white ${
                              movement.typeDisplay === 'Refill' ? 'bg-blue-500' :
                              movement.typeDisplay === 'Wareneingang' ? 'bg-green-500' :
                              movement.typeDisplay === 'Transfer' ? 'bg-orange-500' :
                              'bg-gray-500'
                            }`}>
                              {movement.typeDisplay === 'Refill' ? '↗' :
                               movement.typeDisplay === 'Wareneingang' ? '⬇' :
                               movement.typeDisplay === 'Transfer' ? '⇄' : '•'}
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-medium">{movement.typeDisplay}</span>
                                <span 
                                  className={`text-sm font-semibold ${
                                    movement.quantity < 0 ? 'text-red-600' : 'text-green-600'
                                  }`}
                                  data-testid={`movement-quantity-${movement.id}`}
                                >
                                  {movement.quantity < 0 ? '' : '+'}{movement.quantity} Stück
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 flex items-center space-x-2">
                                {movement.warehouseName && (
                                  <span>→ {movement.warehouseName}</span>
                                )}
                                {movement.machineName && (
                                  <span>| Befüller: {movement.userName || 'System'}</span>
                                )}
                                {movement.machineName && (
                                  <span>• Automat: {movement.machineName}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-gray-600">
                              {movement.performedAt ? 
                                new Date(movement.performedAt).toLocaleDateString('de-DE', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric'
                                }) : 
                                'Kein Datum'
                              }
                            </div>
                            <div className="text-xs text-gray-500">
                              {movement.performedAt ? 
                                new Date(movement.performedAt).toLocaleTimeString('de-DE', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                }) : 
                                ''
                              }
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      {/* More movements indicator */}
                      {productDetail.data.movements.pagination.total > productDetail.data.movements.data.length && (
                        <div className="text-center py-3 border-t">
                          <span className="text-sm text-gray-500">
                            ... und {productDetail.data.movements.pagination.total - productDetail.data.movements.data.length} weitere Bewegungen
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Keine Warenbewegungen verfügbar</p>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">Detaillierte Daten konnten nicht geladen werden</p>
            </div>
          )}
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