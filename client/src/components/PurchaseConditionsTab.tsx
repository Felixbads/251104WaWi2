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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import SupplierRabattManager from './SupplierRabattManager';
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
      queryClient.invalidateQueries({ queryKey: ['purchase-conditions', 'supplier', supplierId] });
      setNewCondition(null);
      setFormData({});
      toast({ title: "Erfolg", description: "Einkaufsbedingung erfolgreich erstellt" });
    },
    onError: (error: Error) => {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    }
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertPurchaseCondition> }) =>
      fetch(`/api/purchase-conditions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-conditions', 'supplier', supplierId] });
      setEditingCondition(null);
      setFormData({});
      toast({ title: "Erfolg", description: "Einkaufsbedingung erfolgreich aktualisiert" });
    },
    onError: (error: Error) => {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/purchase-conditions/${id}`, { method: 'DELETE' }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-conditions', 'supplier', supplierId] });
      toast({ title: "Erfolg", description: "Einkaufsbedingung erfolgreich gelöscht" });
    },
    onError: (error: Error) => {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    }
  });

  // Handlers
  const handleStartNew = () => {
    setNewCondition({
      supplierId,
      unitPrice: 0,
      taxRate: 19,
      grossPrice: 0,
      minQuantity: 0,
      packagingQuantity: 1,
      isPreferred: false,
      leadTime: 0
    });
    setFormData({
      supplierId,
      unitPrice: 0,
      taxRate: 19,
      grossPrice: 0,
      minQuantity: 0,
      packagingQuantity: 1,
      isPreferred: false,
      leadTime: 0
    });
  };

  const handleCancelNew = () => {
    setNewCondition(null);
    setFormData({});
  };

  const handleFieldChange = (field: keyof InsertPurchaseCondition, value: any) => {
    const newFormData = { ...formData, [field]: value };
    
    // Auto-calculate gross price when unit price or tax rate changes
    if (field === 'unitPrice' || field === 'taxRate') {
      const unitPrice = field === 'unitPrice' ? value : (newFormData.unitPrice || 0);
      const taxRate = field === 'taxRate' ? value : (newFormData.taxRate || 19);
      newFormData.grossPrice = unitPrice * (1 + taxRate / 100);
    }
    
    setFormData(newFormData);
  };

  const handleSaveNew = () => {
    if (!formData.productId) {
      toast({ title: "Fehler", description: "Bitte ein Produkt auswählen", variant: "destructive" });
      return;
    }
    createMutation.mutate(formData as InsertPurchaseCondition);
  };

  const handleEdit = (condition: PurchaseCondition) => {
    setEditingCondition(condition.id);
    setFormData(condition);
  };

  const handleSaveEdit = () => {
    if (editingCondition) {
      updateMutation.mutate({ id: editingCondition, data: formData });
    }
  };

  const handleCancelEdit = () => {
    setEditingCondition(null);
    setFormData({});
  };

  const getProductName = (productId: number) => {
    const product = availableProducts.find((p: ProductOption) => p.id === productId);
    return product?.productName || `Produkt ID: ${productId}`;
  };

  if (isLoading) {
    return <div className="p-4">Lade Einkaufsbedingungen...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Einkaufsbedingungen</h3>
        <p className="text-sm text-gray-600">
          Preise, Konditionen und Rabatte für {supplierName}
        </p>
      </div>

      {/* Tabs für Einkaufsbedingungen und Rabatte */}
      <Tabs defaultValue="conditions" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="conditions">Einkaufsbedingungen</TabsTrigger>
          <TabsTrigger value="discounts">Rabatte & Skonto</TabsTrigger>
        </TabsList>

        <TabsContent value="conditions" className="space-y-6">
          {/* Add Button */}
          <div className="flex justify-end">
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
                      value={formData.productId?.toString() || ''}
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
                    <Label>Gebindeart</Label>
                    <Select
                      value={formData.packagingType || ''}
                      onValueChange={(value) => handleFieldChange('packagingType', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Gebindeart auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="karton">Karton</SelectItem>
                        <SelectItem value="kiste">Kiste</SelectItem>
                        <SelectItem value="palette">Palette</SelectItem>
                        <SelectItem value="sack">Sack</SelectItem>
                        <SelectItem value="einzelstueck">Einzelstück</SelectItem>
                        <SelectItem value="bund">Bund</SelectItem>
                        <SelectItem value="pack">Pack</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Gebindemenge</Label>
                    <Input
                      type="number"
                      value={formData.packagingQuantity || 1}
                      onChange={(e) => handleFieldChange('packagingQuantity', parseInt(e.target.value) || 1)}
                      placeholder="z.B. 6, 12, 24"
                    />
                  </div>

                  <div>
                    <Label>Lieferzeit (Tage)</Label>
                    <Input
                      type="number"
                      value={formData.leadTime || 0}
                      onChange={(e) => handleFieldChange('leadTime', parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div>
                  <Label>Gültig bis</Label>
                  <Input
                    type="date"
                    value={formData.validTo || ''}
                    onChange={(e) => handleFieldChange('validTo', e.target.value || null)}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="is-preferred"
                    checked={formData.isPreferred || false}
                    onCheckedChange={(checked) => handleFieldChange('isPreferred', checked)}
                  />
                  <Label htmlFor="is-preferred">Bevorzugter Lieferant</Label>
                </div>

                <div>
                  <Label>Notizen</Label>
                  <Textarea
                    value={formData.notes || ''}
                    onChange={(e) => handleFieldChange('notes', e.target.value)}
                    placeholder="Zusätzliche Bemerkungen..."
                    rows={3}
                  />
                </div>

                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={handleCancelNew}>
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
                            <Label>Gebindeart</Label>
                            <Select
                              value={formData.packagingType || ''}
                              onValueChange={(value) => handleFieldChange('packagingType', value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Gebindeart" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="karton">Karton</SelectItem>
                                <SelectItem value="kiste">Kiste</SelectItem>
                                <SelectItem value="palette">Palette</SelectItem>
                                <SelectItem value="sack">Sack</SelectItem>
                                <SelectItem value="einzelstueck">Einzelstück</SelectItem>
                                <SelectItem value="bund">Bund</SelectItem>
                                <SelectItem value="pack">Pack</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Gebindemenge</Label>
                            <Input
                              type="number"
                              value={formData.packagingQuantity || 1}
                              onChange={(e) => handleFieldChange('packagingQuantity', parseInt(e.target.value) || 1)}
                              placeholder="z.B. 6, 12, 24"
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
                        </div>
                      </div>
                    ) : (
                      // Display Mode
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h4 className="font-semibold text-lg">{getProductName(condition.productId)}</h4>
                            {condition.isPreferred && <Badge className="mt-1">Bevorzugter Lieferant</Badge>}
                          </div>
                          <div className="flex space-x-2">
                            <Button size="sm" variant="outline" onClick={() => handleEdit(condition)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive" 
                              onClick={() => deleteMutation.mutate(condition.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <Label className="text-xs text-gray-500">Einkaufspreis (netto)</Label>
                            <p className="font-medium">{condition.unitPrice?.toFixed(2)}€</p>
                          </div>
                          <div>
                            <Label className="text-xs text-gray-500">Bruttopreis</Label>
                            <p className="font-medium">{condition.grossPrice?.toFixed(2)}€</p>
                          </div>
                          <div>
                            <Label className="text-xs text-gray-500">Mindestmenge</Label>
                            <p>{condition.minQuantity || 0}</p>
                          </div>
                        </div>

                        {(condition.packagingUnit || condition.deliveryTime) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mt-4">
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
                          <div className="mt-4">
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
        </TabsContent>

        <TabsContent value="discounts" className="space-y-6">
          <SupplierRabattManager supplierId={supplierId} supplierName={supplierName} />
        </TabsContent>
      </Tabs>
    </div>
  );
}