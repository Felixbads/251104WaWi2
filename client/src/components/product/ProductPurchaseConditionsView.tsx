import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { 
  Calculator, 
  Euro, 
  Package, 
  Info,
  TrendingUp,
  Users,
  Edit3,
  Trash2,
  Plus,
  Save,
  X
} from 'lucide-react';

interface ProductPurchaseConditionsViewProps {
  productId: number;
  productName: string;
}

interface PurchaseCondition {
  id: number;
  productId: number;
  supplierId: number;
  supplierName: string;
  pricePerUnit: number;
  minimumQuantity: number;
  discountPercentage?: number;
  validFrom: string;
  validTo?: string;
  notes?: string;
}

interface PriceHistoryPoint {
  date: string;
  price: number;
  supplier: string;
  minimumQuantity: number;
  discount: number;
  notes?: string;
}

interface Supplier {
  id: number;
  companyName: string;
}

interface EditConditionForm {
  pricePerUnit: number;
  minimumQuantity: number;
  discountPercentage: number;
  validFrom: string;
  validTo: string;
  notes: string;
}

interface NewConditionForm extends EditConditionForm {
  supplierId: number;
}

export default function ProductPurchaseConditionsView({ productId, productName }: ProductPurchaseConditionsViewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State für Edit-Modi
  const [editingCondition, setEditingCondition] = useState<number | null>(null);
  const [showNewConditionDialog, setShowNewConditionDialog] = useState(false);
  const [editForm, setEditForm] = useState<EditConditionForm>({
    pricePerUnit: 0,
    minimumQuantity: 1,
    discountPercentage: 0,
    validFrom: new Date().toISOString().split('T')[0],
    validTo: '',
    notes: ''
  });
  const [newConditionForm, setNewConditionForm] = useState<NewConditionForm>({
    supplierId: 0,
    pricePerUnit: 0,
    minimumQuantity: 1,
    discountPercentage: 0,
    validFrom: new Date().toISOString().split('T')[0],
    validTo: '',
    notes: ''
  });

  // Lade Einkaufsbedingungen für das Produkt
  const { data: conditions = [], isLoading: conditionsLoading } = useQuery<PurchaseCondition[]>({
    queryKey: [`/api/products/${productId}/purchase-conditions`],
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });

  // Lade Preishistorie
  const { data: priceHistory = [], isLoading: historyLoading } = useQuery<PriceHistoryPoint[]>({
    queryKey: [`/api/products/${productId}/price-history`],
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });

  // Lade verfügbare Lieferanten
  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['/api/suppliers'],
    staleTime: 1000 * 60 * 10, // 10 Minuten
  });

  // API-Mutationen für CRUD-Operationen
  const updateConditionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<EditConditionForm> }) => {
      const response = await fetch(`/api/purchase-conditions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price_per_unit: data.pricePerUnit,
          minimum_quantity: data.minimumQuantity,
          discount_percentage: data.discountPercentage,
          valid_from: data.validFrom,
          valid_to: data.validTo || null,
          notes: data.notes || null
        })
      });
      if (!response.ok) throw new Error('Fehler beim Aktualisieren der Einkaufsbedingung');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/purchase-conditions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/price-history`] });
      setEditingCondition(null);
      toast({ title: "Erfolgreich", description: "Einkaufsbedingung wurde aktualisiert." });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Einkaufsbedingung konnte nicht aktualisiert werden.", variant: "destructive" });
    }
  });

  const createConditionMutation = useMutation({
    mutationFn: async (data: NewConditionForm) => {
      const response = await fetch('/api/purchase-conditions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: productId,
          supplier_id: data.supplierId,
          price_per_unit: data.pricePerUnit,
          minimum_quantity: data.minimumQuantity,
          discount_percentage: data.discountPercentage,
          valid_from: data.validFrom,
          valid_to: data.validTo || null,
          notes: data.notes || null
        })
      });
      if (!response.ok) throw new Error('Fehler beim Erstellen der Einkaufsbedingung');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/purchase-conditions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/price-history`] });
      setShowNewConditionDialog(false);
      setNewConditionForm({
        supplierId: 0,
        pricePerUnit: 0,
        minimumQuantity: 1,
        discountPercentage: 0,
        validFrom: new Date().toISOString().split('T')[0],
        validTo: '',
        notes: ''
      });
      toast({ title: "Erfolgreich", description: "Neue Einkaufsbedingung wurde erstellt." });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Einkaufsbedingung konnte nicht erstellt werden.", variant: "destructive" });
    }
  });

  const deleteConditionMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/purchase-conditions/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Fehler beim Löschen der Einkaufsbedingung');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/purchase-conditions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/price-history`] });
      toast({ title: "Erfolgreich", description: "Einkaufsbedingung wurde gelöscht." });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Einkaufsbedingung konnte nicht gelöscht werden.", variant: "destructive" });
    }
  });

  // Handler-Funktionen
  const handleEditCondition = (condition: PurchaseCondition) => {
    setEditForm({
      pricePerUnit: condition.pricePerUnit,
      minimumQuantity: condition.minimumQuantity,
      discountPercentage: condition.discountPercentage || 0,
      validFrom: condition.validFrom.split('T')[0],
      validTo: condition.validTo ? condition.validTo.split('T')[0] : '',
      notes: condition.notes || ''
    });
    setEditingCondition(condition.id);
  };

  const handleSaveEdit = () => {
    if (editingCondition) {
      updateConditionMutation.mutate({ id: editingCondition, data: editForm });
    }
  };

  const handleCancelEdit = () => {
    setEditingCondition(null);
    setEditForm({
      pricePerUnit: 0,
      minimumQuantity: 1,
      discountPercentage: 0,
      validFrom: new Date().toISOString().split('T')[0],
      validTo: '',
      notes: ''
    });
  };

  const handleDeleteCondition = (id: number) => {
    if (confirm('Sind Sie sicher, dass Sie diese Einkaufsbedingung löschen möchten?')) {
      deleteConditionMutation.mutate(id);
    }
  };

  const handleCreateCondition = () => {
    if (newConditionForm.supplierId && newConditionForm.pricePerUnit > 0) {
      createConditionMutation.mutate(newConditionForm);
    }
  };

  const isLoading = conditionsLoading || historyLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Lade Einkaufsbedingungen...</span>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE');
  };

  const bestPrice = conditions.length > 0 ? Math.min(...conditions.map(c => c.pricePerUnit)) : 0;
  const avgPrice = conditions.length > 0 ? conditions.reduce((sum, c) => sum + c.pricePerUnit, 0) / conditions.length : 0;

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Calculator className="h-6 w-6" />
          Einkaufsbedingungen für {productName}
        </h2>
        <Dialog open={showNewConditionDialog} onOpenChange={setShowNewConditionDialog}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Neue Bedingung
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Neue Einkaufsbedingung erstellen</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="newSupplier">Lieferant</Label>
                <Select
                  value={newConditionForm.supplierId.toString()}
                  onValueChange={(value) => setNewConditionForm({...newConditionForm, supplierId: parseInt(value)})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Lieferant auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(supplier => (
                      <SelectItem key={supplier.id} value={supplier.id.toString()}>
                        {supplier.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="newPrice">Preis pro Einheit (€)</Label>
                <Input
                  id="newPrice"
                  type="number"
                  step="0.01"
                  value={newConditionForm.pricePerUnit}
                  onChange={(e) => setNewConditionForm({...newConditionForm, pricePerUnit: parseFloat(e.target.value) || 0})}
                />
              </div>
              <div>
                <Label htmlFor="newMinQty">Mindestmenge</Label>
                <Input
                  id="newMinQty"
                  type="number"
                  value={newConditionForm.minimumQuantity}
                  onChange={(e) => setNewConditionForm({...newConditionForm, minimumQuantity: parseInt(e.target.value) || 1})}
                />
              </div>
              <div>
                <Label htmlFor="newDiscount">Rabatt (%)</Label>
                <Input
                  id="newDiscount"
                  type="number"
                  step="0.1"
                  value={newConditionForm.discountPercentage}
                  onChange={(e) => setNewConditionForm({...newConditionForm, discountPercentage: parseFloat(e.target.value) || 0})}
                />
              </div>
              <div>
                <Label htmlFor="newValidFrom">Gültig ab</Label>
                <Input
                  id="newValidFrom"
                  type="date"
                  value={newConditionForm.validFrom}
                  onChange={(e) => setNewConditionForm({...newConditionForm, validFrom: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="newValidTo">Gültig bis (optional)</Label>
                <Input
                  id="newValidTo"
                  type="date"
                  value={newConditionForm.validTo}
                  onChange={(e) => setNewConditionForm({...newConditionForm, validTo: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="newNotes">Notizen (optional)</Label>
                <Textarea
                  id="newNotes"
                  value={newConditionForm.notes}
                  onChange={(e) => setNewConditionForm({...newConditionForm, notes: e.target.value})}
                  placeholder="Zusätzliche Notizen..."
                />
              </div>
              <div className="flex gap-2 pt-4">
                <Button 
                  onClick={handleCreateCondition}
                  disabled={createConditionMutation.isPending || !newConditionForm.supplierId || newConditionForm.pricePerUnit <= 0}
                  className="flex-1"
                >
                  {createConditionMutation.isPending ? 'Erstelle...' : 'Erstellen'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowNewConditionDialog(false)}
                  className="flex-1"
                >
                  Abbrechen
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Zusammenfassung */}
      {conditions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              Übersicht
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-sm text-gray-500">Lieferanten verfügbar</p>
                <p className="text-2xl font-bold">{conditions.length}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500">Bester Preis</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(bestPrice)}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500">Durchschnittspreis</p>
                <p className="text-2xl font-bold">{formatCurrency(avgPrice)}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500">Preishistorie</p>
                <p className="text-2xl font-bold">{priceHistory.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Aktuelle Einkaufsbedingungen */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Aktuelle Konditionen ({conditions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {conditions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Info className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Noch keine Einkaufsbedingungen für dieses Produkt angelegt.</p>
              <p className="text-sm mt-2">Klicken Sie auf "Neue Bedingung" um zu beginnen.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-3 font-medium">Lieferant</th>
                    <th className="text-left p-3 font-medium">Preis/Einheit</th>
                    <th className="text-left p-3 font-medium">Mindestmenge</th>
                    <th className="text-left p-3 font-medium">Rabatt</th>
                    <th className="text-left p-3 font-medium">Gültig von</th>
                    <th className="text-left p-3 font-medium">Gültig bis</th>
                    <th className="text-left p-3 font-medium">Notizen</th>
                    <th className="text-left p-3 font-medium">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {conditions.map((condition) => (
                    <tr key={condition.id} className="border-b hover:bg-gray-50">
                      <td className="p-3">
                        <span className="font-medium">{condition.supplierName}</span>
                      </td>
                      <td className="p-3">
                        {editingCondition === condition.id ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={editForm.pricePerUnit}
                            onChange={(e) => setEditForm({...editForm, pricePerUnit: parseFloat(e.target.value) || 0})}
                            className="w-24"
                          />
                        ) : (
                          <div className="flex items-center gap-1">
                            <Euro className="h-4 w-4" />
                            <span className="font-medium">{(condition.pricePerUnit || 0).toFixed(2)}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        {editingCondition === condition.id ? (
                          <Input
                            type="number"
                            value={editForm.minimumQuantity}
                            onChange={(e) => setEditForm({...editForm, minimumQuantity: parseInt(e.target.value) || 1})}
                            className="w-20"
                          />
                        ) : (
                          <div className="flex items-center gap-1">
                            <Package className="h-4 w-4" />
                            <span>{condition.minimumQuantity}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        {editingCondition === condition.id ? (
                          <Input
                            type="number"
                            step="0.1"
                            value={editForm.discountPercentage}
                            onChange={(e) => setEditForm({...editForm, discountPercentage: parseFloat(e.target.value) || 0})}
                            className="w-20"
                          />
                        ) : (
                          condition.discountPercentage ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-800">
                              {condition.discountPercentage}%
                            </Badge>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )
                        )}
                      </td>
                      <td className="p-3">
                        {editingCondition === condition.id ? (
                          <Input
                            type="date"
                            value={editForm.validFrom}
                            onChange={(e) => setEditForm({...editForm, validFrom: e.target.value})}
                            className="w-32"
                          />
                        ) : (
                          <span className="text-sm text-gray-600">
                            {new Date(condition.validFrom).toLocaleDateString('de-DE')}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {editingCondition === condition.id ? (
                          <Input
                            type="date"
                            value={editForm.validTo}
                            onChange={(e) => setEditForm({...editForm, validTo: e.target.value})}
                            className="w-32"
                          />
                        ) : (
                          <span className="text-sm text-gray-600">
                            {condition.validTo 
                              ? new Date(condition.validTo).toLocaleDateString('de-DE')
                              : <span className="text-green-600">Unbegrenzt</span>
                            }
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {editingCondition === condition.id ? (
                          <Textarea
                            value={editForm.notes}
                            onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                            className="w-32 h-20"
                            placeholder="Notizen..."
                          />
                        ) : (
                          <span className="text-sm text-gray-600 max-w-xs truncate block">
                            {condition.notes || '-'}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {editingCondition === condition.id ? (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              onClick={handleSaveEdit}
                              disabled={updateConditionMutation.isPending}
                              className="h-8 w-8 p-0"
                            >
                              <Save className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancelEdit}
                              className="h-8 w-8 p-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditCondition(condition)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeleteCondition(condition.id)}
                              disabled={deleteConditionMutation.isPending}
                              className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preishistorie */}
      {priceHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Preishistorie
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {priceHistory.slice(0, 10).map((entry, index) => (
                <div key={index} className="flex justify-between items-center p-3 border rounded">
                  <div>
                    <div className="font-medium">{entry.supplier}</div>
                    <div className="text-sm text-gray-500">
                      {formatDate(entry.date)} • Mind. {entry.minimumQuantity} Stück
                      {entry.discount > 0 && ` • ${entry.discount}% Rabatt`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-lg">{formatCurrency(entry.price)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}