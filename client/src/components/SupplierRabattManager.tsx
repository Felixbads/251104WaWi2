import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Trash2, Edit, Plus, Calculator } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SupplierRabattManagerProps {
  supplierId: number;
  supplierName?: string;
}

interface RabattBedingung {
  id?: number;
  supplierId: number;
  discountType: 'order_value' | 'volume_discount' | 'cash_discount' | 'quantity_scale';
  description?: string;
  discountPercentage?: number;
  discountAmount?: number;
  thresholdQuantity?: number;
  thresholdAmount?: number;
  maxQuantity?: number;
  maxAmount?: number;
  paymentTermsDays?: number;
  skontoPercentage?: number;
  validFrom?: string;
  validTo?: string;
  isActive: boolean;
  priority: number;
  canCombineWithOtherDiscounts: boolean;
  minimumOrderQuantity?: number;
  applicableProductCategories?: string;
  excludedProductIds?: string;
}

const discountTypeLabels = {
  order_value: 'Bestellwertrabatt',
  volume_discount: 'Mengenrabatt',
  cash_discount: 'Skonto',
  quantity_scale: 'Staffelpreise'
};

export default function SupplierRabattManager({ supplierId, supplierName }: SupplierRabattManagerProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingRabatt, setEditingRabatt] = useState<RabattBedingung | null>(null);
  const [formData, setFormData] = useState<Partial<RabattBedingung>>({
    supplierId,
    discountType: 'order_value',
    isActive: true,
    priority: 1,
    canCombineWithOtherDiscounts: false
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Laden der Rabattbedingungen
  const { data: rabattBedingungen = [], isLoading } = useQuery({
    queryKey: ['/api/supplier-discounts', supplierId],
    queryFn: async () => {
      const response = await fetch(`/api/supplier-discounts/${supplierId}`);
      if (!response.ok) throw new Error('Fehler beim Laden der Rabattbedingungen');
      return response.json();
    }
  });

  // Erstellen einer neuen Rabattbedingung
  const createMutation = useMutation({
    mutationFn: async (data: Partial<RabattBedingung>) => {
      const response = await fetch('/api/supplier-discounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Fehler beim Erstellen der Rabattbedingung');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supplier-discounts', supplierId] });
      setIsCreateDialogOpen(false);
      setFormData({
        supplierId,
        discountType: 'order_value',
        isActive: true,
        priority: 1,
        canCombineWithOtherDiscounts: false
      });
      toast({
        title: "Erfolg",
        description: "Rabattbedingung wurde erfolgreich erstellt"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Aktualisieren einer Rabattbedingung
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<RabattBedingung> }) => {
      const response = await fetch(`/api/supplier-discounts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Fehler beim Aktualisieren der Rabattbedingung');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supplier-discounts', supplierId] });
      setEditingRabatt(null);
      toast({
        title: "Erfolg",
        description: "Rabattbedingung wurde erfolgreich aktualisiert"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Löschen einer Rabattbedingung
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/supplier-discounts/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Fehler beim Löschen der Rabattbedingung');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supplier-discounts', supplierId] });
      toast({
        title: "Erfolg",
        description: "Rabattbedingung wurde erfolgreich gelöscht"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleSubmit = () => {
    if (!formData.discountType) {
      toast({
        title: "Validierungsfehler",
        description: "Rabatttyp ist erforderlich",
        variant: "destructive"
      });
      return;
    }

    if (editingRabatt) {
      updateMutation.mutate({ id: editingRabatt.id!, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (rabatt: RabattBedingung) => {
    setEditingRabatt(rabatt);
    setFormData(rabatt);
  };

  const formatCurrency = (value?: number) => {
    if (!value) return '-';
    return new Intl.NumberFormat('de-DE', { 
      style: 'currency', 
      currency: 'EUR' 
    }).format(value);
  };

  if (isLoading) {
    return <div className="p-4">Lade Rabattbedingungen...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Rabattbedingungen</h3>
          <p className="text-sm text-gray-600">
            Skonto und Rabatte für {supplierName}
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Neue Rabattbedingung
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Neue Rabattbedingung</DialogTitle>
            </DialogHeader>
            <RabattForm
              formData={formData}
              setFormData={setFormData}
              onSubmit={handleSubmit}
              isLoading={createMutation.isPending}
              onCancel={() => setIsCreateDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Rabattbedingungen Liste */}
      <div className="space-y-4">
        {rabattBedingungen.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-gray-500">Keine Rabattbedingungen konfiguriert</p>
            </CardContent>
          </Card>
        ) : (
          rabattBedingungen.map((rabatt: RabattBedingung) => (
            <Card key={rabatt.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">
                      {discountTypeLabels[rabatt.discountType]}
                    </CardTitle>
                    <CardDescription>
                      {rabatt.description || 'Keine Beschreibung'}
                    </CardDescription>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={rabatt.isActive ? "default" : "secondary"}>
                      {rabatt.isActive ? "Aktiv" : "Inaktiv"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(rabatt)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteMutation.mutate(rabatt.id!)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  {rabatt.thresholdAmount && (
                    <div>
                      <Label className="text-xs text-gray-500">Ab Bestellwert</Label>
                      <p className="font-medium">{formatCurrency(rabatt.thresholdAmount)}</p>
                    </div>
                  )}
                  {rabatt.thresholdQuantity && (
                    <div>
                      <Label className="text-xs text-gray-500">Ab Menge</Label>
                      <p className="font-medium">{rabatt.thresholdQuantity} Stück</p>
                    </div>
                  )}
                  {rabatt.discountPercentage && (
                    <div>
                      <Label className="text-xs text-gray-500">Rabatt</Label>
                      <p className="font-medium text-green-600">{rabatt.discountPercentage}%</p>
                    </div>
                  )}
                  {rabatt.skontoPercentage && (
                    <div>
                      <Label className="text-xs text-gray-500">Skonto</Label>
                      <p className="font-medium text-blue-600">{rabatt.skontoPercentage}%</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Edit Dialog */}
      {editingRabatt && (
        <Dialog open={!!editingRabatt} onOpenChange={() => setEditingRabatt(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Rabattbedingung bearbeiten</DialogTitle>
            </DialogHeader>
            <RabattForm
              formData={formData}
              setFormData={setFormData}
              onSubmit={handleSubmit}
              isLoading={updateMutation.isPending}
              onCancel={() => setEditingRabatt(null)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// Separater Form-Component
interface RabattFormProps {
  formData: Partial<RabattBedingung>;
  setFormData: (data: Partial<RabattBedingung> | ((prev: Partial<RabattBedingung>) => Partial<RabattBedingung>)) => void;
  onSubmit: () => void;
  isLoading: boolean;
  onCancel: () => void;
}

function RabattForm({ formData, setFormData, onSubmit, isLoading, onCancel }: RabattFormProps) {
  return (
    <div className="space-y-4">
      {/* Rabatttyp */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="discountType">Rabatttyp</Label>
          <Select
            value={formData.discountType}
            onValueChange={(value) => setFormData(prev => ({ ...prev, discountType: value as any }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Rabatttyp wählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="order_value">Bestellwertrabatt</SelectItem>
              <SelectItem value="volume_discount">Mengenrabatt</SelectItem>
              <SelectItem value="cash_discount">Skonto</SelectItem>
              <SelectItem value="quantity_scale">Staffelpreise</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="priority">Priorität</Label>
          <Input
            id="priority"
            type="number"
            value={formData.priority || 1}
            onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 1 }))}
            min="1"
          />
        </div>
      </div>

      {/* Beschreibung */}
      <div>
        <Label htmlFor="description">Beschreibung</Label>
        <Textarea
          id="description"
          value={formData.description || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="z.B. Mengenrabatt ab 350€ Bestellwert"
        />
      </div>

      {/* Schwellenwerte */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="thresholdAmount">Ab Bestellwert (€)</Label>
          <Input
            id="thresholdAmount"
            type="number"
            step="0.01"
            value={formData.thresholdAmount || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, thresholdAmount: parseFloat(e.target.value) || undefined }))}
            placeholder="350.00"
          />
        </div>
        <div>
          <Label htmlFor="thresholdQuantity">Ab Menge (Stück)</Label>
          <Input
            id="thresholdQuantity"
            type="number"
            value={formData.thresholdQuantity || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, thresholdQuantity: parseInt(e.target.value) || undefined }))}
            placeholder="100"
          />
        </div>
      </div>

      {/* Rabatt */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="discountPercentage">Rabatt (%)</Label>
          <Input
            id="discountPercentage"
            type="number"
            step="0.1"
            value={formData.discountPercentage || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, discountPercentage: parseFloat(e.target.value) || undefined }))}
            placeholder="8.0"
          />
        </div>
        <div>
          <Label htmlFor="skontoPercentage">Skonto (%)</Label>
          <Input
            id="skontoPercentage"
            type="number"
            step="0.1"
            value={formData.skontoPercentage || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, skontoPercentage: parseFloat(e.target.value) || undefined }))}
            placeholder="2.0"
          />
        </div>
      </div>

      {/* Zahlungsziel für Skonto */}
      {formData.skontoPercentage && (
        <div>
          <Label htmlFor="paymentTermsDays">Zahlungsziel für Skonto (Tage)</Label>
          <Input
            id="paymentTermsDays"
            type="number"
            value={formData.paymentTermsDays || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, paymentTermsDays: parseInt(e.target.value) || undefined }))}
            placeholder="14"
          />
        </div>
      )}

      {/* Switches */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <Switch
            id="isActive"
            checked={formData.isActive}
            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
          />
          <Label htmlFor="isActive">Aktiv</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id="canCombine"
            checked={formData.canCombineWithOtherDiscounts}
            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, canCombineWithOtherDiscounts: checked }))}
          />
          <Label htmlFor="canCombine">Mit anderen Rabatten kombinierbar</Label>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex justify-end space-x-2 pt-4">
        <Button variant="outline" onClick={onCancel} disabled={isLoading}>
          Abbrechen
        </Button>
        <Button onClick={onSubmit} disabled={isLoading}>
          {isLoading ? "Speichere..." : "Speichern"}
        </Button>
      </div>
    </div>
  );
}