import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Save, Search, Package, Edit2, Check, X } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

// Vereinfachte Product-Interface für diese Komponente
interface EditableProduct {
  id: number;
  vendonId?: string;
  productName: string;
  description?: string;
  category?: string;
  price?: number;
  vat?: number;
  status?: string;
  sku?: string;
  barcode?: string;
  supplierId?: number;
  supplier?: string;
  supplierSku?: string;
  isEditing?: boolean;
  hasChanges?: boolean;
}

// Kategorien für Dropdown
const PRODUCT_CATEGORIES = [
  'Getränke',
  'Snacks',
  'Süßwaren',
  'Kaffeespezialitäten',
  'Heißgetränke',
  'Kaltgetränke',
  'Energie-Drinks',
  'Gesunde Snacks',
  'Belegte Brötchen',
  'Süßspeisen',
  'Sonstige'
];

// Status-Optionen
const PRODUCT_STATUS = [
  { value: 'active', label: 'Aktiv' },
  { value: 'inactive', label: 'Inaktiv' },
  { value: 'discontinued', label: 'Ausgelaufen' },
  { value: 'pending', label: 'Ausstehend' }
];

export default function ProductDataEntry() {
  const [searchTerm, setSearchTerm] = useState("");
  const [editableProducts, setEditableProducts] = useState<EditableProduct[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Produkte laden
  const { data: products = [], isLoading, refetch } = useQuery<EditableProduct[]>({
    queryKey: ['/api/products', { limit: 1000 }],
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });

  // Lieferanten laden für Dropdown
  const { data: suppliers = [] } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ['/api/suppliers'],
    staleTime: 1000 * 60 * 10, // 10 Minuten
  });

  // Produkt aktualisieren
  const updateProductMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: Partial<EditableProduct> }) => {
      return apiRequest(`/api/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: 'Erfolg',
        description: 'Produkt wurde aktualisiert',
        variant: 'default',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
    },
    onError: (error) => {
      toast({
        title: 'Fehler',
        description: 'Produkt konnte nicht aktualisiert werden',
        variant: 'destructive',
      });
      console.error('Update error:', error);
    }
  });

  // Mehrere Produkte gleichzeitig aktualisieren
  const updateMultipleProductsMutation = useMutation({
    mutationFn: async (updates: { id: number, data: Partial<EditableProduct> }[]) => {
      const promises = updates.map(({ id, data }) => 
        apiRequest(`/api/products/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        })
      );
      return Promise.all(promises);
    },
    onSuccess: (_, variables) => {
      toast({
        title: 'Erfolg',
        description: `${variables.length} Produkte wurden aktualisiert`,
        variant: 'default',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      setHasUnsavedChanges(false);
    },
    onError: (error) => {
      toast({
        title: 'Fehler',
        description: 'Nicht alle Produkte konnten aktualisiert werden',
        variant: 'destructive',
      });
      console.error('Bulk update error:', error);
    }
  });

  // Initialisiere bearbeitbare Produkte
  useEffect(() => {
    if (products.length > 0) {
      setEditableProducts(products.map(product => ({
        ...product,
        isEditing: false,
        hasChanges: false
      })));
    }
  }, [products]);

  // Gefilterte Produkte
  const filteredProducts = editableProducts.filter(product =>
    product.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Einzelnes Feld aktualisieren
  const updateProductField = (id: number, field: keyof EditableProduct, value: any) => {
    setEditableProducts(prev => prev.map(product => {
      if (product.id === id) {
        const updated = { ...product, [field]: value, hasChanges: true };
        return updated;
      }
      return product;
    }));
    setHasUnsavedChanges(true);
  };

  // Bearbeitungsmodus umschalten
  const toggleEditMode = (id: number) => {
    setEditableProducts(prev => prev.map(product => ({
      ...product,
      isEditing: product.id === id ? !product.isEditing : product.isEditing
    })));
  };

  // Einzelnes Produkt speichern
  const saveProduct = (product: EditableProduct) => {
    if (!product.hasChanges) return;

    const { isEditing, hasChanges, ...productData } = product;
    updateProductMutation.mutate({ 
      id: product.id, 
      data: productData 
    });

    // Update local state
    setEditableProducts(prev => prev.map(p => 
      p.id === product.id 
        ? { ...p, hasChanges: false, isEditing: false }
        : p
    ));
  };

  // Alle Änderungen speichern
  const saveAllChanges = () => {
    const changedProducts = editableProducts.filter(p => p.hasChanges);
    if (changedProducts.length === 0) {
      toast({
        title: 'Keine Änderungen',
        description: 'Es gibt keine ungespeicherten Änderungen',
        variant: 'default',
      });
      return;
    }

    const updates = changedProducts.map(product => {
      const { isEditing, hasChanges, ...productData } = product;
      return { id: product.id, data: productData };
    });

    updateMultipleProductsMutation.mutate(updates);

    // Reset local state
    setEditableProducts(prev => prev.map(p => ({
      ...p,
      hasChanges: false,
      isEditing: false
    })));
  };

  // Änderungen verwerfen
  const discardChanges = () => {
    setEditableProducts(products.map(product => ({
      ...product,
      isEditing: false,
      hasChanges: false
    })));
    setHasUnsavedChanges(false);
    toast({
      title: 'Änderungen verworfen',
      description: 'Alle ungespeicherten Änderungen wurden zurückgesetzt',
      variant: 'default',
    });
  };

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Lade Produkte...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <h1 className="text-3xl font-bold">Produktdaten bearbeiten</h1>
          <p className="text-muted-foreground">
            Bearbeiten Sie Produktinformationen direkt in der Tabelle
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {hasUnsavedChanges && (
            <>
              <Button
                variant="outline"
                onClick={discardChanges}
              >
                <X className="h-4 w-4 mr-2" />
                Verwerfen
              </Button>
              <Button
                onClick={saveAllChanges}
                disabled={updateMultipleProductsMutation.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                Alle speichern
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Suchfeld und Statistiken */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Produkte durchsuchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
              <div className="flex items-center">
                <Package className="h-4 w-4 mr-1" />
                {filteredProducts.length} Produkte
              </div>
              {hasUnsavedChanges && (
                <Badge variant="secondary">
                  {editableProducts.filter(p => p.hasChanges).length} ungespeicherte Änderungen
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Produkttabelle */}
      <Card>
        <CardHeader>
          <CardTitle>Produktübersicht</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Aktion</th>
                  <th className="text-left p-3 font-medium">Produktname</th>
                  <th className="text-left p-3 font-medium">SKU</th>
                  <th className="text-left p-3 font-medium">Kategorie</th>
                  <th className="text-left p-3 font-medium">Preis (€)</th>
                  <th className="text-left p-3 font-medium">Beschreibung</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Lieferant</th>
                  <th className="text-left p-3 font-medium">Lieferanten-SKU</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr 
                    key={product.id} 
                    className={`border-b hover:bg-muted/50 ${product.hasChanges ? 'bg-yellow-50' : ''}`}
                  >
                    {/* Aktions-Spalte */}
                    <td className="p-3">
                      <div className="flex items-center space-x-1">
                        <Button
                          size="sm"
                          variant={product.isEditing ? "default" : "outline"}
                          onClick={() => toggleEditMode(product.id)}
                        >
                          {product.isEditing ? <Check className="h-3 w-3" /> : <Edit2 className="h-3 w-3" />}
                        </Button>
                        {product.hasChanges && (
                          <Button
                            size="sm"
                            onClick={() => saveProduct(product)}
                            disabled={updateProductMutation.isPending}
                          >
                            <Save className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </td>

                    {/* Produktname */}
                    <td className="p-3">
                      {product.isEditing ? (
                        <Input
                          value={product.productName || ''}
                          onChange={(e) => updateProductField(product.id, 'productName', e.target.value)}
                          className="min-w-[200px]"
                          placeholder="Produktname"
                        />
                      ) : (
                        <span className="font-medium">{product.productName}</span>
                      )}
                    </td>

                    {/* SKU */}
                    <td className="p-3">
                      {product.isEditing ? (
                        <Input
                          value={product.sku || ''}
                          onChange={(e) => updateProductField(product.id, 'sku', e.target.value)}
                          className="min-w-[100px]"
                          placeholder="SKU"
                        />
                      ) : (
                        <span className="text-muted-foreground">{product.sku}</span>
                      )}
                    </td>

                    {/* Kategorie */}
                    <td className="p-3">
                      {product.isEditing ? (
                        <Select
                          value={product.category || ''}
                          onValueChange={(value) => updateProductField(product.id, 'category', value)}
                        >
                          <SelectTrigger className="min-w-[150px]">
                            <SelectValue placeholder="Kategorie wählen" />
                          </SelectTrigger>
                          <SelectContent>
                            {PRODUCT_CATEGORIES.map((category) => (
                              <SelectItem key={category} value={category}>
                                {category}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="secondary">{product.category || 'Keine Kategorie'}</Badge>
                      )}
                    </td>

                    {/* Preis */}
                    <td className="p-3">
                      {product.isEditing ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={product.price || ''}
                          onChange={(e) => updateProductField(product.id, 'price', parseFloat(e.target.value) || null)}
                          className="min-w-[100px]"
                          placeholder="0.00"
                        />
                      ) : (
                        <span>{product.price ? `${product.price.toFixed(2)} €` : '-'}</span>
                      )}
                    </td>

                    {/* Beschreibung */}
                    <td className="p-3">
                      {product.isEditing ? (
                        <Textarea
                          value={product.description || ''}
                          onChange={(e) => updateProductField(product.id, 'description', e.target.value)}
                          className="min-w-[200px] min-h-[60px]"
                          placeholder="Produktbeschreibung"
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {product.description ? 
                            (product.description.length > 50 ? 
                              `${product.description.substring(0, 50)}...` : 
                              product.description
                            ) : '-'
                          }
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="p-3">
                      {product.isEditing ? (
                        <Select
                          value={product.status || ''}
                          onValueChange={(value) => updateProductField(product.id, 'status', value)}
                        >
                          <SelectTrigger className="min-w-[120px]">
                            <SelectValue placeholder="Status wählen" />
                          </SelectTrigger>
                          <SelectContent>
                            {PRODUCT_STATUS.map((status) => (
                              <SelectItem key={status.value} value={status.value}>
                                {status.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={product.status === 'active' ? 'default' : 'secondary'}>
                          {PRODUCT_STATUS.find(s => s.value === product.status)?.label || product.status}
                        </Badge>
                      )}
                    </td>

                    {/* Lieferant */}
                    <td className="p-3">
                      {product.isEditing ? (
                        <Select
                          value={product.supplierId?.toString() || ''}
                          onValueChange={(value) => {
                            const supplier = suppliers.find(s => s.id.toString() === value);
                            updateProductField(product.id, 'supplierId', parseInt(value) || null);
                            updateProductField(product.id, 'supplier', supplier?.name || null);
                          }}
                        >
                          <SelectTrigger className="min-w-[150px]">
                            <SelectValue placeholder="Lieferant wählen" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Kein Lieferant</SelectItem>
                            {suppliers.map((supplier: any) => (
                              <SelectItem key={supplier.id} value={supplier.id.toString()}>
                                {supplier.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm">{product.supplier || '-'}</span>
                      )}
                    </td>

                    {/* Lieferanten-SKU */}
                    <td className="p-3">
                      {product.isEditing ? (
                        <Input
                          value={(product as any).supplierSku || ''}
                          onChange={(e) => updateProductField(product.id, 'sku', e.target.value)}
                          className="min-w-[120px]"
                          placeholder="Lieferanten-SKU"
                        />
                      ) : (
                        <span className="text-muted-foreground">{product.supplierSku || '-'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredProducts.length === 0 && (
            <div className="text-center py-8">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Keine Produkte gefunden</h3>
              <p className="text-muted-foreground">
                {searchTerm ? 'Keine Produkte entsprechen Ihrer Suche' : 'Keine Produkte verfügbar'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}