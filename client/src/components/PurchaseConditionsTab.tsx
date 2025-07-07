import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { PurchaseCondition, InsertPurchaseCondition } from '@shared/schema';

interface PurchaseConditionsTabProps {
  supplierId: number;
  supplierName: string;
}

interface ProductOption {
  id: number;
  productName: string;
  sku?: string;
}

export function PurchaseConditionsTab({ supplierId, supplierName }: PurchaseConditionsTabProps) {
  const [editingCondition, setEditingCondition] = useState<number | null>(null);
  const [newCondition, setNewCondition] = useState<Partial<InsertPurchaseCondition> | null>(null);
  const [formData, setFormData] = useState<Partial<InsertPurchaseCondition>>({});
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch purchase conditions for this supplier
  const { data: purchaseConditions = [], isLoading } = useQuery({
    queryKey: ['purchase-conditions', 'supplier', supplierId],
    queryFn: () => fetch(`/api/suppliers/${supplierId}/purchase-conditions`).then(res => res.json())
  });

  // Fetch available products for new conditions
  const { data: availableProducts = [] } = useQuery({
    queryKey: ['suppliers', supplierId, 'available-products'],
    queryFn: () => fetch(`/api/suppliers/${supplierId}/available-products`).then(res => res.json())
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: InsertPurchaseCondition) =>
      fetch('/api/purchase-conditions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-conditions'] });
      setNewCondition(null);
      setFormData({});
      toast({
        title: "Erfolgreich",
        description: "Einkaufsbedingung wurde erstellt"
      });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Einkaufsbedingung konnte nicht erstellt werden",
        variant: "destructive"
      });
    }
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertPurchaseCondition> }) =>
      fetch(`/api/suppliers/purchase-conditions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-conditions'] });
      setEditingCondition(null);
      setFormData({});
      toast({
        title: "Erfolgreich",
        description: "Einkaufsbedingung wurde aktualisiert"
      });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Einkaufsbedingung konnte nicht aktualisiert werden",
        variant: "destructive"
      });
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/purchase-conditions/${id}`, { method: 'DELETE' }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-conditions'] });
      toast({
        title: "Erfolgreich",
        description: "Einkaufsbedingung wurde gelöscht"
      });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Einkaufsbedingung konnte nicht gelöscht werden",
        variant: "destructive"
      });
    }
  });

  const handleStartEdit = (condition: PurchaseCondition) => {
    setEditingCondition(condition.id);
    setFormData({
      productId: condition.productId,
      supplierId: condition.supplierId,
      unitPrice: condition.unitPrice,
      taxRate: condition.taxRate || 19,
      grossPrice: condition.grossPrice,
      minQuantity: condition.minQuantity || 0,
      packagingUnit: condition.packagingUnit || '',
      packagingQuantity: condition.packagingQuantity || 1,
      deliveryTime: condition.deliveryTime || '',
      isPreferred: condition.isPreferred || false,
      notes: condition.notes || '',
      leadTime: condition.leadTime || null
    });
  };

  const handleSaveEdit = () => {
    if (!editingCondition) return;
    updateMutation.mutate({ id: editingCondition, data: formData });
  };

  const handleStartNew = () => {
    setNewCondition({
      supplierId,
      taxRate: 19,
      minQuantity: 0,
      packagingQuantity: 1,
      isPreferred: false
    });
    setFormData({
      supplierId,
      taxRate: 19,
      minQuantity: 0,
      packagingQuantity: 1,
      isPreferred: false
    });
  };

  const handleSaveNew = () => {
    if (!formData.productId || !formData.unitPrice) {
      toast({
        title: "Validierungsfehler",
        description: "Produkt und Einkaufspreis sind erforderlich",
        variant: "destructive"
      });
      return;
    }

    createMutation.mutate(formData as InsertPurchaseCondition);
  };

  const handleCancelEdit = () => {
    setEditingCondition(null);
    setNewCondition(null);
    setFormData({});
  };

  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-calculate gross price when unit price or tax rate changes
      if (field === 'unitPrice' || field === 'taxRate') {
        const unitPrice = field === 'unitPrice' ? value : prev.unitPrice;
        const taxRate = field === 'taxRate' ? value : prev.taxRate;
        
        if (unitPrice && taxRate) {
          updated.grossPrice = Number((unitPrice * (1 + taxRate / 100)).toFixed(2));
        }
      }
      
      return updated;
    });
  };

  const getProductName = (productId: number) => {
    if (!Array.isArray(availableProducts)) {
      return `Produkt ID: ${productId}`;
    }
    const product = availableProducts.find((p: ProductOption) => p.id === productId);
    return product?.productName || `Produkt ID: ${productId}`;
  };

  if (isLoading) {
    return <div className="p-4">Lade Einkaufsbedingungen...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Einkaufsbedingungen</h3>
          <p className="text-sm text-gray-600">
            Verwalte Preise und Bedingungen für Produkte von {supplierName}
          </p>
        </div>
        <Button onClick={handleStartNew} disabled={!!newCondition || !!editingCondition}>
          <Plus className="h-4 w-4 mr-2" />
          Neue Bedingung
        </Button>
      </div>

      {/* New Condition Form */}
      {newCondition && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-lg">Neue Einkaufsbedingung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Produkt *</Label>
                <Select 
                  value={formData.productId?.toString() || ""} 
                  onValueChange={(value) => handleFieldChange('productId', parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Produkt auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProducts && availableProducts.length > 0 ? availableProducts.map((product: ProductOption) => (
                      <SelectItem key={product.id} value={product.id.toString()}>
                        {product.productName}
                      </SelectItem>
                    )) : (
                      <SelectItem value="none" disabled>Keine Produkte verfügbar</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Einkaufspreis (netto) * €</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.unitPrice || ''}
                  onChange={(e) => handleFieldChange('unitPrice', parseFloat(e.target.value) || 0)}
                />
              </div>

              <div>
                <Label>MwSt.-Satz %</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.taxRate || 19}
                  onChange={(e) => handleFieldChange('taxRate', parseFloat(e.target.value) || 19)}
                />
              </div>

              <div>
                <Label>Bruttopreis €</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.grossPrice || ''}
                  readOnly
                  className="bg-gray-100"
                />
              </div>

              <div>
                <Label>Mindestmenge</Label>
                <Input
                  type="number"
                  value={formData.minQuantity || 0}
                  onChange={(e) => handleFieldChange('minQuantity', parseInt(e.target.value) || 0)}
                />
              </div>

              <div>
                <Label>Verpackungseinheit</Label>
                <Input
                  value={formData.packagingUnit || ''}
                  onChange={(e) => handleFieldChange('packagingUnit', e.target.value)}
                  placeholder="z.B. Karton mit 6 Flaschen"
                />
              </div>

              <div>
                <Label>Anzahl pro Verpackung</Label>
                <Input
                  type="number"
                  value={formData.packagingQuantity || 1}
                  onChange={(e) => handleFieldChange('packagingQuantity', parseInt(e.target.value) || 1)}
                />
              </div>

              <div>
                <Label>Lieferzeit</Label>
                <Input
                  value={formData.deliveryTime || ''}
                  onChange={(e) => handleFieldChange('deliveryTime', e.target.value)}
                  placeholder="z.B. 2-3 Tage"
                />
              </div>
            </div>

            <div>
              <Label>Notizen</Label>
              <Textarea
                value={formData.notes || ''}
                onChange={(e) => handleFieldChange('notes', e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                checked={formData.isPreferred || false}
                onCheckedChange={(checked) => handleFieldChange('isPreferred', checked)}
              />
              <Label>Bevorzugter Lieferant für dieses Produkt</Label>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={handleCancelEdit}>
                <X className="h-4 w-4 mr-2" />
                Abbrechen
              </Button>
              <Button onClick={handleSaveNew} disabled={createMutation.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {createMutation.isPending ? 'Speichere...' : 'Speichern'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Conditions */}
      <div className="grid grid-cols-1 gap-4">
        {purchaseConditions.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-gray-500">
                Noch keine Einkaufsbedingungen für {supplierName} definiert.
              </p>
              <Button onClick={handleStartNew} className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Erste Bedingung erstellen
              </Button>
            </CardContent>
          </Card>
        ) : (
          purchaseConditions.map((condition: PurchaseCondition) => (
            <Card key={condition.id} className={editingCondition === condition.id ? 'border-blue-200 bg-blue-50' : ''}>
              <CardContent className="p-4">
                {editingCondition === condition.id ? (
                  // Edit Form
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="font-semibold">{getProductName(condition.productId)}</h4>
                      <div className="flex space-x-2">
                        <Button size="sm" onClick={handleSaveEdit} disabled={updateMutation.isPending}>
                          <Save className="h-4 w-4 mr-1" />
                          {updateMutation.isPending ? 'Speichere...' : 'Speichern'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                          <X className="h-4 w-4 mr-1" />
                          Abbrechen
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label>Einkaufspreis (netto) €</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.unitPrice || ''}
                          onChange={(e) => handleFieldChange('unitPrice', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div>
                        <Label>MwSt.-Satz %</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.taxRate || 19}
                          onChange={(e) => handleFieldChange('taxRate', parseFloat(e.target.value) || 19)}
                        />
                      </div>
                      <div>
                        <Label>Bruttopreis €</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.grossPrice || ''}
                          readOnly
                          className="bg-gray-100"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Mindestmenge</Label>
                        <Input
                          type="number"
                          value={formData.minQuantity || 0}
                          onChange={(e) => handleFieldChange('minQuantity', parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div>
                        <Label>Verpackungseinheit</Label>
                        <Input
                          value={formData.packagingUnit || ''}
                          onChange={(e) => handleFieldChange('packagingUnit', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={formData.isPreferred || false}
                        onCheckedChange={(checked) => handleFieldChange('isPreferred', checked)}
                      />
                      <Label>Bevorzugter Lieferant</Label>
                    </div>
                  </div>
                ) : (
                  // Display Mode
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold text-lg">{getProductName(condition.productId)}</h4>
                        {condition.isPreferred && (
                          <Badge variant="secondary" className="mt-1">Bevorzugter Lieferant</Badge>
                        )}
                      </div>
                      <div className="flex space-x-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleStartEdit(condition)}
                          disabled={!!editingCondition || !!newCondition}
                        >
                          <Edit2 className="h-4 w-4 mr-1" />
                          Bearbeiten
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={() => deleteMutation.mutate(condition.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Löschen
                        </Button>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <Label className="text-xs text-gray-500">Einkaufspreis (netto)</Label>
                        <p className="font-semibold">{condition.unitPrice?.toFixed(2)} €</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">MwSt.-Satz</Label>
                        <p>{condition.taxRate}%</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Bruttopreis</Label>
                        <p className="font-semibold">{condition.grossPrice?.toFixed(2)} €</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Mindestmenge</Label>
                        <p>{condition.minQuantity || 0}</p>
                      </div>
                    </div>

                    {(condition.packagingUnit || condition.deliveryTime) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        {condition.packagingUnit && (
                          <div>
                            <Label className="text-xs text-gray-500">Verpackungseinheit</Label>
                            <p>{condition.packagingUnit}</p>
                          </div>
                        )}
                        {condition.deliveryTime && (
                          <div>
                            <Label className="text-xs text-gray-500">Lieferzeit</Label>
                            <p>{condition.deliveryTime}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {condition.notes && (
                      <div>
                        <Label className="text-xs text-gray-500">Notizen</Label>
                        <p className="text-sm">{condition.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}