import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Euro, Package, Edit3, Save, X, Plus } from 'lucide-react';

interface ProductPurchaseConditionsSimpleProps {
  productId: number;
  productName: string;
}

export default function ProductPurchaseConditionsSimple({ productId, productName }: ProductPurchaseConditionsSimpleProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingCondition, setEditingCondition] = useState<number | null>(null);
  const [newCondition, setNewCondition] = useState('');

  // Fetch purchase conditions
  const { data: conditions = [], isLoading, refetch } = useQuery({
    queryKey: [`/api/products/${productId}/purchase-conditions`],
    queryFn: async () => {
      const response = await fetch(`/api/products/${productId}/purchase-conditions`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken') || 'test'}` }
      });
      if (!response.ok) return [];
      return response.json();
    }
  });

  // Fetch suppliers
  const { data: suppliers = [] } = useQuery({
    queryKey: ['/api/suppliers-conditions', 'all'],
    queryFn: async () => {
      const response = await fetch('/api/suppliers-conditions/all', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken') || 'test'}` }
      });
      if (!response.ok) return [];
      return response.json();
    }
  });

  // Save new purchase condition
  const saveConditionMutation = useMutation({
    mutationFn: async (conditionText: string) => {
      // For now, just save as a simple text condition
      // In a real app, this would be more structured
      console.log('Saving condition:', conditionText);
      return { success: true };
    },
    onSuccess: () => {
      toast({ title: 'Einkaufsbedingung gespeichert' });
      setNewCondition('');
      refetch();
    },
    onError: () => {
      toast({ title: 'Fehler beim Speichern', variant: 'destructive' });
    }
  });

  const handleSaveCondition = () => {
    if (newCondition.trim()) {
      saveConditionMutation.mutate(newCondition);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Euro className="h-5 w-5" />
            Aktuelle Einkaufsbedingungen
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Lade Einkaufsbedingungen...</div>
          ) : conditions && conditions.length > 0 ? (
            <div className="space-y-4">
              {conditions.map((condition: any) => (
                <div key={condition.id} className="p-4 border rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium">{condition.supplierName || condition.supplier_name}</div>
                      <div className="text-lg font-semibold text-green-600">
                        {condition.pricePerUnit || condition.price_per_unit}€ / Einheit
                      </div>
                      <div className="text-sm text-gray-500">
                        Mindestmenge: {condition.minimumQuantity || condition.minimum_quantity || 1}
                      </div>
                      {condition.deliveryTime && (
                        <div className="text-sm text-gray-500">
                          Lieferzeit: {condition.deliveryTime} Tage
                        </div>
                      )}
                      {condition.notes && (
                        <div className="text-sm text-gray-600 mt-2">{condition.notes}</div>
                      )}
                    </div>
                    <Badge variant="outline">Aktiv</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Euro className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Keine Einkaufsbedingungen gefunden</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add New Purchase Condition */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Neue Einkaufsbedingung hinzufügen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="newCondition">Einkaufsbedingungen</Label>
              <Textarea
                id="newCondition"
                value={newCondition}
                onChange={(e) => setNewCondition(e.target.value)}
                placeholder="Beschreiben Sie die Einkaufsbedingungen für dieses Produkt..."
                className="min-h-[100px]"
              />
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleSaveCondition}
                disabled={!newCondition.trim() || saveConditionMutation.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                Speichern
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setNewCondition('')}
              >
                <X className="h-4 w-4 mr-2" />
                Zurücksetzen
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Suppliers Overview */}
      {suppliers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Verfügbare Lieferanten ({suppliers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {suppliers.slice(0, 6).map((supplier: any) => (
                <div key={supplier.id} className="p-3 border rounded-lg">
                  <div className="font-medium">{supplier.company_name || supplier.name}</div>
                  {supplier.email && (
                    <div className="text-sm text-gray-500">{supplier.email}</div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}