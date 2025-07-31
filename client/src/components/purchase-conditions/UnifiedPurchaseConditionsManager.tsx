/**
 * EINHEITLICHES EINKAUFSBEDINGUNGEN-SYSTEM
 * Wird sowohl bei Lieferanten als auch bei Produkten verwendet
 * Alle bekannten Felder integriert für Inventur und Bestellungen
 */

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { 
  Euro, 
  Package, 
  Edit3, 
  Plus, 
  Trash2, 
  Calculator,
  Users,
  TrendingUp,
  Info,
  Save,
  X,
  Building,
  ShoppingCart,
  Truck,
  Calendar,
  AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

// Utility functions
const formatCurrency = (value: number | undefined | null) => {
  if (value === undefined || value === null || isNaN(value)) return '0,00 €';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR'
  }).format(value);
};

const formatDate = (dateString?: string) => {
  if (!dateString) return '-';
  return format(new Date(dateString), 'dd.MM.yyyy', { locale: de });
};

interface UnifiedPurchaseConditionsManagerProps {
  mode: 'product' | 'supplier';
  entityId: number;
  entityName: string;
  supplierId?: number; // Für Produktmodus - vorausgewählter Lieferant
  productId?: number;  // Für Lieferantenmodus - vorausgewähltes Produkt
}

interface PurchaseCondition {
  id: number;
  product_id: number;
  product_name?: string;
  supplier_id: number;
  supplier_name?: string;
  unit_price: number;
  gross_price: number;
  tax_rate: number;
  min_quantity: number;
  min_quantity_unit: 'individual' | 'package';
  packaging_unit: string;
  packaging_quantity: number;
  deposit_per_unit: number;
  valid_from: string | null;
  valid_to?: string | null;
  is_preferred: boolean;
  notes?: string;
  lead_time?: number;
  delivery_time?: string;
  discount_type?: string;
  discount_value?: number;
  discount_min_quantity?: number;
  discount_description?: string;
  discount_valid_from?: string;
  discount_valid_to?: string;
  created_at: string;
  updated_at: string;
  supplier_article_number?: string; // Neue Lieferanten-Artikelnummer
}

interface FormData {
  supplierId: number | null;
  productId: number | null;
  unitPrice: number;
  taxRate: number;
  minQuantity: number;
  minQuantityUnit: 'individual' | 'package';
  packagingUnit: string;
  packagingQuantity: number;
  depositPerUnit: number;
  validFrom: string;
  validTo: string;
  isPreferred: boolean;
  notes: string;
  leadTime: number;
  deliveryTime: string;
  supplierArticleNumber: string; // Neue Lieferanten-Artikelnummer
  discount_type: string;
  discount_value: number;
  discount_min_quantity: number;
  discount_description: string;
  discount_valid_from: string;
  discount_valid_to: string;
}

export default function UnifiedPurchaseConditionsManager({ 
  mode, 
  entityId, 
  entityName,
  supplierId,
  productId
}: UnifiedPurchaseConditionsManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCondition, setEditingCondition] = useState<PurchaseCondition | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(supplierId || null);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(productId || null);

  // Form data state
  const [formData, setFormData] = useState<FormData>({
    supplierId: supplierId || null,
    productId: productId || null,
    unitPrice: 0,
    taxRate: 7, // Standard MwSt für Lebensmittel
    minQuantity: 0,
    minQuantityUnit: 'individual',
    packagingUnit: '',
    packagingQuantity: 1,
    depositPerUnit: 0,
    validFrom: format(new Date(), 'yyyy-MM-dd'),
    validTo: '',
    isPreferred: false,
    notes: '',
    leadTime: 3,
    deliveryTime: '',
    supplierArticleNumber: '', // Neue Lieferanten-Artikelnummer
    discount_type: '',
    discount_value: 0,
    discount_min_quantity: 0,
    discount_description: '',
    discount_valid_from: '',
    discount_valid_to: ''
  });

  // API-Endpunkt basierend auf Modus
  const getConditionsEndpoint = () => {
    if (mode === 'product') {
      return `/api/products/${entityId}/purchase-conditions`;
    } else {
      return `/api/suppliers/${entityId}/purchase-conditions`;
    }
  };

  // Einkaufsbedingungen laden
  const { data: conditions = [], isLoading, refetch } = useQuery({
    queryKey: [getConditionsEndpoint()],
    queryFn: async () => {
      const response = await fetch(getConditionsEndpoint(), {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken') || 'test'}` }
      });
      if (!response.ok) throw new Error('Failed to fetch purchase conditions');
      return response.json();
    }
  });

  // Produktdaten laden für MwSt-Übertragung aus Vendon
  const { data: currentProduct } = useQuery({
    queryKey: [`/api/products/${entityId}`],
    queryFn: async () => {
      if (mode !== 'product') return null;
      const response = await fetch(`/api/products/${entityId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken') || 'test'}` }
      });
      if (!response.ok) throw new Error('Failed to fetch product data');
      return response.json();
    },
    enabled: mode === 'product'
  });

  // Lieferanten laden (für Produktmodus)
  const { data: suppliers = [] } = useQuery({
    queryKey: ['/api/suppliers/all-for-conditions'],
    queryFn: async () => {
      const response = await fetch('/api/suppliers/all-for-conditions', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken') || 'test'}` }
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: mode === 'product'
  });

  // Produkte laden (für Lieferantenmodus)
  const { data: products = [] } = useQuery({
    queryKey: [`/api/suppliers/${entityId}/available-products`],
    queryFn: async () => {
      const response = await fetch(`/api/suppliers/${entityId}/available-products`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken') || 'test'}` }
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: mode === 'supplier'
  });

  // Mutation für Erstellen/Aktualisieren
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<FormData> & { id?: number }) => {
      const method = data.id ? 'PUT' : 'POST';
      const url = data.id 
        ? `/api/purchase-conditions/${data.id}`
        : '/api/purchase-conditions';

      // Berechne Bruttopreis
      const grossPrice = data.unitPrice ? 
        data.unitPrice * (1 + (data.taxRate || 19) / 100) : 0;

      const payload = {
        productId: mode === 'product' ? entityId : data.productId,
        supplierId: mode === 'supplier' ? entityId : data.supplierId,
        unitPrice: data.unitPrice,
        taxRate: data.taxRate,
        grossPrice,
        minQuantity: data.minQuantity,
        minQuantityUnit: data.minQuantityUnit,
        packagingUnit: data.packagingUnit,
        packagingQuantity: data.packagingQuantity,
        depositPerUnit: data.depositPerUnit,
        validFrom: data.validFrom,
        validTo: data.validTo || undefined,
        isPreferred: data.isPreferred,
        leadTime: data.leadTime,
        deliveryTime: data.deliveryTime,
        notes: data.notes,
        supplierArticleNumber: data.supplierArticleNumber
      };

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken') || 'test'}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error('Failed to save condition');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [getConditionsEndpoint()] });
      setIsCreateDialogOpen(false);
      setEditingCondition(null);
      resetForm();
      toast({
        title: "Gespeichert",
        description: "Einkaufsbedingung wurde erfolgreich gespeichert.",
      });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Fehler beim Speichern der Einkaufsbedingung.",
        variant: "destructive",
      });
    }
  });

  // Mutation für Löschen
  const deleteMutation = useMutation({
    mutationFn: async (conditionId: number) => {
      const response = await fetch(`/api/purchase-conditions/${conditionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken') || 'test'}` }
      });
      if (!response.ok) throw new Error('Failed to delete condition');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [getConditionsEndpoint()] });
      toast({
        title: "Gelöscht",
        description: "Einkaufsbedingung wurde erfolgreich gelöscht.",
      });
    }
  });

  // Hilfsfunktionen
  const resetForm = () => {
    setFormData({
      supplierId: mode === 'supplier' ? entityId : null,
      productId: mode === 'product' ? entityId : null,
      unitPrice: 0,
      taxRate: 19,
      minQuantity: 0,
      minQuantityUnit: 'individual',
      packagingUnit: 'Stück',
      packagingQuantity: 1,
      depositPerUnit: 0,
      validFrom: format(new Date(), 'yyyy-MM-dd'),
      validTo: '',
      isPreferred: false,
      notes: '',
      leadTime: 3,
      deliveryTime: '',
      supplierArticleNumber: '', // Reset supplier article number
      discount_type: '',
      discount_value: 0,
      discount_min_quantity: 0,
      discount_description: '',
      discount_valid_from: '',
      discount_valid_to: ''
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { 
      style: 'currency', 
      currency: 'EUR' 
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Unbegrenzt';
    try {
      return format(new Date(dateString), 'dd.MM.yyyy', { locale: de });
    } catch {
      return 'Ungültiges Datum';
    }
  };

  const handleCreate = () => {
    if (mode === 'product' && !selectedSupplierId) {
      toast({
        title: "Lieferant auswählen",
        description: "Bitte wählen Sie zuerst einen Lieferanten aus.",
        variant: "destructive",
      });
      return;
    }
    if (mode === 'supplier' && !selectedProductId) {
      toast({
        title: "Produkt auswählen",
        description: "Bitte wählen Sie zuerst ein Produkt aus.",
        variant: "destructive",
      });
      return;
    }
    
    setEditingCondition(null);
    setFormData(prev => ({
      ...prev,
      supplierId: mode === 'supplier' ? entityId : selectedSupplierId,
      productId: mode === 'product' ? entityId : selectedProductId
    }));
    setIsCreateDialogOpen(true);
  };

  // Automatische MwSt-Übernahme aus Vendon-Produktdaten
  useEffect(() => {
    if (currentProduct && currentProduct.vat) {
      setFormData(prev => ({ ...prev, taxRate: currentProduct.vat }));
    }
  }, [currentProduct]);

  const handleEdit = (condition: PurchaseCondition) => {
    setEditingCondition(condition);
    setFormData({
      supplierId: condition.supplier_id,
      productId: condition.product_id,
      unitPrice: condition.unit_price,
      taxRate: condition.tax_rate,
      minQuantity: condition.min_quantity,
      minQuantityUnit: condition.min_quantity_unit,
      packagingUnit: condition.packaging_unit,
      packagingQuantity: condition.packaging_quantity,
      depositPerUnit: condition.deposit_per_unit,
      validFrom: condition.valid_from ? format(new Date(condition.valid_from), 'yyyy-MM-dd') : '',
      validTo: condition.valid_to ? format(new Date(condition.valid_to), 'yyyy-MM-dd') : '',
      isPreferred: condition.is_preferred,
      notes: condition.notes || '',
      leadTime: condition.lead_time || 3,
      deliveryTime: condition.delivery_time || '',
      supplierArticleNumber: condition.supplier_article_number || '',
      discount_type: condition.discount_type || '',
      discount_value: condition.discount_value || 0,
      discount_min_quantity: condition.discount_min_quantity || 0,
      discount_description: condition.discount_description || '',
      discount_valid_from: condition.discount_valid_from || '',
      discount_valid_to: condition.discount_valid_to || ''
    });
    setIsCreateDialogOpen(true);
  };

  const handleSave = () => {
    console.log('[PURCHASE-CONDITIONS] handleSave called');
    console.log('[PURCHASE-CONDITIONS] formData:', formData);
    console.log('[PURCHASE-CONDITIONS] editingCondition:', editingCondition);
    console.log('[PURCHASE-CONDITIONS] mode:', mode);
    console.log('[PURCHASE-CONDITIONS] entityId:', entityId);
    
    // Validation check
    if (!formData.unitPrice || formData.unitPrice <= 0) {
      toast({
        title: "Validierungsfehler",
        description: "Bitte geben Sie einen gültigen Nettopreis ein.",
        variant: "destructive",
      });
      return;
    }
    
    // Set default packaging unit if empty
    if (!formData.packagingUnit) {
      setFormData(prev => ({ ...prev, packagingUnit: 'Stück' }));
    }
    
    const dataToSave = {
      ...formData,
      id: editingCondition?.id
    };
    
    console.log('[PURCHASE-CONDITIONS] Sending data:', dataToSave);
    
    saveMutation.mutate(dataToSave);
  };

  const handleDelete = (conditionId: number) => {
    if (confirm('Möchten Sie diese Einkaufsbedingung wirklich löschen?')) {
      deleteMutation.mutate(conditionId);
    }
  };

  const handleCancel = () => {
    setIsCreateDialogOpen(false);
    setEditingCondition(null);
    resetForm();
  };

  // Statistiken berechnen
  const stats = {
    totalConditions: conditions.length,
    averagePrice: conditions.length > 0 ? 
      conditions.reduce((sum, c) => sum + (c.unit_price || c.unitPrice || 0), 0) / conditions.length : 0,
    bestPrice: conditions.length > 0 ? 
      Math.min(...conditions.map(c => c.unit_price || c.unitPrice || 0)) : 0,
    preferredConditions: conditions.filter(c => c.is_preferred || c.isPreferred).length
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistik-Karten */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center">
              <ShoppingCart className="h-5 w-5 text-blue-500 mr-2" />
              <div>
                <p className="text-sm text-gray-600">Bedingungen</p>
                <p className="text-2xl font-bold">{stats.totalConditions}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center">
              <Calculator className="h-5 w-5 text-green-500 mr-2" />
              <div>
                <p className="text-sm text-gray-600">Ø Preis</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.averagePrice)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center">
              <TrendingUp className="h-5 w-5 text-orange-500 mr-2" />
              <div>
                <p className="text-sm text-gray-600">Bester Preis</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.bestPrice)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center">
              <Package className="h-5 w-5 text-purple-500 mr-2" />
              <div>
                <p className="text-sm text-gray-600">Bevorzugt</p>
                <p className="text-2xl font-bold">{stats.preferredConditions}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hauptkarte */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center">
                <Euro className="h-5 w-5 mr-2" />
                Einkaufsbedingungen für {entityName}
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                {mode === 'product' ? 'Produktspezifische' : 'Lieferantenspezifische'} Bedingungen verwalten
              </p>
            </div>
            <div className="flex gap-2">
              {mode === 'product' && (
                <Select 
                  value={selectedSupplierId?.toString() || ""} 
                  onValueChange={(value) => setSelectedSupplierId(parseInt(value))}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Lieferant auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((supplier: any) => (
                      <SelectItem key={supplier.id} value={supplier.id.toString()}>
                        {supplier.companyName || supplier.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              
              {mode === 'supplier' && (
                <Select 
                  value={selectedProductId?.toString() || ""} 
                  onValueChange={(value) => setSelectedProductId(parseInt(value))}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Produkt auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product: any) => (
                      <SelectItem key={product.id} value={product.id.toString()}>
                        {product.productName || product.product_name || `Produkt-ID ${product.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              
              <Button onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Neue Bedingung
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {conditions.length === 0 ? (
            <div className="text-center py-8">
              <Info className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Keine Einkaufsbedingungen</h3>
              <p className="text-gray-600 mb-4">
                Für {mode === 'product' ? 'dieses Produkt' : 'diesen Lieferanten'} wurden noch keine Einkaufsbedingungen hinterlegt.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {mode === 'product' && <TableHead>Lieferant</TableHead>}
                  {mode === 'supplier' && <TableHead>Produkt</TableHead>}
                  <TableHead>Preis (netto)</TableHead>
                  <TableHead>Pfand</TableHead>
                  <TableHead>Mindestmenge</TableHead>
                  <TableHead>Gebinde</TableHead>
                  <TableHead>Rabatt</TableHead>
                  <TableHead>Gültig bis</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conditions.map((condition) => (
                  <TableRow key={condition.id}>
                    {mode === 'product' && (
                      <TableCell className="font-medium">
                        {condition.supplier_name}
                      </TableCell>
                    )}
                    {mode === 'supplier' && (
                      <TableCell className="font-medium">
                        {condition.product_name || condition.productName || `Produkt-ID ${condition.product_id}`}
                      </TableCell>
                    )}
                    <TableCell>
                      <div>
                        <div className="font-medium">{formatCurrency(condition.unit_price || condition.unitPrice)}</div>
                        <div className="text-xs text-gray-500">
                          Brutto: {formatCurrency(condition.gross_price || condition.grossPrice)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {(condition.deposit_per_unit || condition.depositPerUnit) > 0 ? formatCurrency(condition.deposit_per_unit || condition.depositPerUnit) : '-'}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{condition.min_quantity}</div>
                        <div className={`text-xs px-2 py-1 rounded ${condition.min_quantity_unit === 'package' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                          {condition.min_quantity_unit === 'package' ? 'Gebinde' : 'Einzelstück'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {condition.packaging_unit && condition.packaging_quantity ? 
                        `${condition.packaging_quantity} ${condition.packaging_unit}` : '-'}
                    </TableCell>
                    <TableCell>
                      {condition.discount_type ? (
                        <div className="text-xs">
                          <div>{condition.discount_type}</div>
                          <div className="text-gray-500">{condition.discount_value}%</div>
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      {formatDate(condition.valid_to)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {condition.is_preferred && (
                          <Badge variant="default">Bevorzugt</Badge>
                        )}
                        <Badge variant={new Date(condition.valid_to || '9999-12-31') > new Date() ? "outline" : "destructive"}>
                          {new Date(condition.valid_to || '9999-12-31') > new Date() ? 'Aktiv' : 'Abgelaufen'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEdit(condition)}
                        >
                          <Edit3 className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(condition.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Erstellen/Bearbeiten Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={handleCancel}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCondition ? 'Einkaufsbedingung bearbeiten' : 'Neue Einkaufsbedingung erstellen'}
            </DialogTitle>
            {mode === 'product' && (
              <div className="bg-blue-50 p-3 rounded-lg mt-2">
                <p className="text-sm font-medium text-blue-900">Produkt:</p>
                <p className="text-lg font-bold text-blue-800">{entityName}</p>
                {currentProduct && (
                  <p className="text-xs text-blue-600">MwSt.: {currentProduct.vat}% (aus Vendon-Daten)</p>
                )}
              </div>
            )}
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            {/* Grunddaten */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center">
                  <Building className="h-4 w-4 mr-2" />
                  Grunddaten
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="unitPrice">Preis (netto) €</Label>
                    <Input
                      id="unitPrice"
                      type="number"
                      step="0.01"
                      value={formData.unitPrice}
                      onChange={(e) => setFormData(prev => ({ ...prev, unitPrice: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="taxRate">MwSt. % {currentProduct && "(aus Vendon-Daten)"}</Label>
                    <Input
                      id="taxRate"
                      type="number"
                      value={formData.taxRate}
                      onChange={(e) => setFormData(prev => ({ ...prev, taxRate: parseFloat(e.target.value) || 19 }))}
                      disabled={!!currentProduct}
                      className={currentProduct ? "bg-gray-100" : ""}
                    />
                    {currentProduct && (
                      <p className="text-xs text-gray-500 mt-1">MwSt wird automatisch aus Vendon-Produktdaten übernommen</p>
                    )}
                  </div>
                </div>

                <div>
                  <Label htmlFor="depositPerUnit">Pfand pro Einheit € (steuerfrei)</Label>
                  <Input
                    id="depositPerUnit"
                    type="number"
                    step="0.01"
                    value={formData.depositPerUnit}
                    onChange={(e) => setFormData(prev => ({ ...prev, depositPerUnit: parseFloat(e.target.value) || 0 }))}
                  />
                  <p className="text-xs text-gray-500 mt-1">Pfandbeträge sind steuerbefreit</p>
                </div>

                <div>
                  <Label htmlFor="supplierArticleNumber">Lieferanten-Artikelnummer</Label>
                  <Input
                    id="supplierArticleNumber"
                    type="text"
                    value={formData.supplierArticleNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, supplierArticleNumber: e.target.value }))}
                    placeholder="Art.-Nr. des Lieferanten"
                  />
                </div>

                <div className="bg-gray-50 p-3 rounded">
                  <p className="text-sm font-medium">Bruttopreis: {formatCurrency(formData.unitPrice * (1 + formData.taxRate / 100))}</p>
                  {formData.depositPerUnit > 0 && (
                    <p className="text-xs text-gray-600">+ {formatCurrency(formData.depositPerUnit)} Pfand</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Mengen und Gebinde */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center">
                  <Package className="h-4 w-4 mr-2" />
                  Mengen & Gebinde
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="minQuantity">Mindestbestellmenge</Label>
                  <Input
                    id="minQuantity"
                    type="number"
                    value={formData.minQuantity}
                    onChange={(e) => setFormData(prev => ({ ...prev, minQuantity: parseInt(e.target.value) || 0 }))}
                  />
                </div>

                <div>
                  <Label>Mindestmenge bezieht sich auf</Label>
                  <div className="flex gap-2 mt-2">
                    <Button
                      type="button"
                      variant={formData.minQuantityUnit === 'individual' ? "default" : "outline"}
                      className={formData.minQuantityUnit === 'individual' ? "bg-green-500 hover:bg-green-600" : ""}
                      onClick={() => setFormData(prev => ({ ...prev, minQuantityUnit: 'individual' }))}
                    >
                      Einzelstück
                    </Button>
                    <Button
                      type="button"
                      variant={formData.minQuantityUnit === 'package' ? "default" : "outline"}
                      className={formData.minQuantityUnit === 'package' ? "bg-blue-500 hover:bg-blue-600" : ""}
                      onClick={() => setFormData(prev => ({ ...prev, minQuantityUnit: 'package' }))}
                    >
                      Gebinde
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="packagingQuantity">Gebindegröße</Label>
                    <Input
                      id="packagingQuantity"
                      type="number"
                      value={formData.packagingQuantity}
                      onChange={(e) => setFormData(prev => ({ ...prev, packagingQuantity: parseInt(e.target.value) || 1 }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="packagingUnit">Gebindeart</Label>
                    <Select 
                      value={formData.packagingUnit} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, packagingUnit: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Gebindeart wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Stück">Stück</SelectItem>
                        <SelectItem value="Karton">Karton</SelectItem>
                        <SelectItem value="Palette">Palette</SelectItem>
                        <SelectItem value="Kiste">Kiste</SelectItem>
                        <SelectItem value="Bund">Bund</SelectItem>
                        <SelectItem value="Pack">Pack</SelectItem>
                        <SelectItem value="Tray">Tray</SelectItem>
                        <SelectItem value="Liter">Liter</SelectItem>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="Box">Box</SelectItem>
                        <SelectItem value="Sack">Sack</SelectItem>
                        <SelectItem value="Fass">Fass</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Lieferkonditionen */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center">
                  <Truck className="h-4 w-4 mr-2" />
                  Lieferkonditionen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="leadTime">Lieferzeit (Tage)</Label>
                    <Input
                      id="leadTime"
                      type="number"
                      value={formData.leadTime}
                      onChange={(e) => setFormData(prev => ({ ...prev, leadTime: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="deliveryTime">Lieferrhythmus</Label>
                    <Input
                      id="deliveryTime"
                      value={formData.deliveryTime}
                      onChange={(e) => setFormData(prev => ({ ...prev, deliveryTime: e.target.value }))}
                      placeholder="wöchentlich, monatlich..."
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="supplierArticleNumber">Lieferantenartikelnummer</Label>
                  <Input
                    id="supplierArticleNumber"
                    value={formData.supplierArticleNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, supplierArticleNumber: e.target.value }))}
                    placeholder="Artikelnummer vom Lieferanten"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="isPreferred"
                    checked={formData.isPreferred}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isPreferred: checked }))}
                  />
                  <Label htmlFor="isPreferred">Bevorzugter Lieferant</Label>
                </div>
              </CardContent>
            </Card>

            {/* Gültigkeit */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center">
                  <Calendar className="h-4 w-4 mr-2" />
                  Gültigkeit
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="validFrom">Gültig ab</Label>
                    <Input
                      id="validFrom"
                      type="date"
                      value={formData.validFrom}
                      onChange={(e) => setFormData(prev => ({ ...prev, validFrom: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="validTo">Gültig bis</Label>
                    <Input
                      id="validTo"
                      type="date"
                      value={formData.validTo}
                      onChange={(e) => setFormData(prev => ({ ...prev, validTo: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="notes">Notizen</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Zusätzliche Informationen..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Aktions-Buttons */}
          <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={handleCancel}>
              <X className="h-4 w-4 mr-2" />
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              <Save className="h-4 w-4 mr-2" />
              {saveMutation.isPending ? 'Speichert...' : 'Speichern'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}