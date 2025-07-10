import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { PurchaseConditionForm } from '@/components/PurchaseConditionForm';
import { 
  Euro, 
  Package, 
  Edit3, 
  Plus, 
  Trash2, 
  Calculator,
  Users,
  TrendingUp,
  Info
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface ProductPurchaseConditionsComprehensiveProps {
  productId: number;
  productName: string;
}

interface PurchaseCondition {
  id: number;
  productId: number;
  supplierId: number;
  supplierName: string;
  unitPrice: number;
  taxRate: number;
  minQuantity: number;
  minQuantityUnit: string;
  packagingUnit: string;
  packagingQuantity: number;
  depositPerUnit: number;
  validFrom: string;
  validTo?: string;
  isPreferred: boolean;
  notes?: string;
  leadTime?: number;
  deliveryTime?: string;
  grossPrice?: number;
}

interface Supplier {
  id: number;
  companyName: string;
  company_name: string;
}

export default function ProductPurchaseConditionsComprehensive({ 
  productId, 
  productName 
}: ProductPurchaseConditionsComprehensiveProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingConditionId, setEditingConditionId] = useState<number | null>(null);
  const [editingCondition, setEditingCondition] = useState<PurchaseCondition | null>(null);

  // Fetch purchase conditions for this product
  const { data: conditions = [], isLoading, refetch } = useQuery({
    queryKey: [`/api/products/${productId}/purchase-conditions`],
    queryFn: async () => {
      const response = await fetch(`/api/products/${productId}/purchase-conditions`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken') || 'test'}` }
      });
      if (!response.ok) throw new Error('Failed to fetch purchase conditions');
      return response.json();
    }
  });

  // Fetch suppliers for new conditions
  const { data: suppliers = [] } = useQuery({
    queryKey: ['/api/suppliers-conditions', 'all'],
    queryFn: async () => {
      const response = await fetch('/api/suppliers-conditions/all', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken') || 'test'}` }
      });
      if (!response.ok) throw new Error('Failed to fetch suppliers');
      return response.json();
    }
  });

  // Delete mutation
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
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/purchase-conditions`] });
      toast({
        title: "Gelöscht",
        description: "Einkaufsbedingung wurde erfolgreich gelöscht.",
      });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Fehler beim Löschen der Einkaufsbedingung.",
        variant: "destructive",
      });
    }
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { 
      style: 'currency', 
      currency: 'EUR' 
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Kein Datum';
    try {
      return format(new Date(dateString), 'dd.MM.yyyy', { locale: de });
    } catch {
      return 'Ungültiges Datum';
    }
  };

  const handleEdit = (condition: PurchaseCondition) => {
    setEditingConditionId(condition.id);
    setEditingCondition(condition);
  };

  const handleCreate = () => {
    if (!selectedSupplierId) {
      toast({
        title: "Lieferant auswählen",
        description: "Bitte wählen Sie zuerst einen Lieferanten aus.",
        variant: "destructive",
      });
      return;
    }
    setEditingConditionId(null);
    setEditingCondition(null);
    setIsCreateDialogOpen(true);
  };

  const handleSuccess = () => {
    setIsCreateDialogOpen(false);
    setEditingConditionId(null);
    setEditingCondition(null);
    refetch();
  };

  const handleCancel = () => {
    setIsCreateDialogOpen(false);
    setEditingConditionId(null);
    setEditingCondition(null);
  };

  const handleDelete = (conditionId: number) => {
    if (confirm('Möchten Sie diese Einkaufsbedingung wirklich löschen?')) {
      deleteMutation.mutate(conditionId);
    }
  };

  // Statistics
  const stats = {
    totalSuppliers: new Set(conditions.map(c => c.supplierId)).size,
    averagePrice: conditions.length > 0 ? 
      conditions.reduce((sum, c) => sum + c.unitPrice, 0) / conditions.length : 0,
    bestPrice: conditions.length > 0 ? 
      Math.min(...conditions.map(c => c.unitPrice)) : 0,
    preferredSupplier: conditions.find(c => c.isPreferred)?.supplierName || 'Keiner'
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
      {/* Übersicht */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center">
              <Users className="h-5 w-5 text-blue-500 mr-2" />
              <div>
                <p className="text-sm text-gray-600">Lieferanten</p>
                <p className="text-2xl font-bold">{stats.totalSuppliers}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center">
              <Calculator className="h-5 w-5 text-green-500 mr-2" />
              <div>
                <p className="text-sm text-gray-600">Durchschnittspreis</p>
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
                <p className="text-sm text-gray-600">Bevorzugter Lieferant</p>
                <p className="text-sm font-bold truncate">{stats.preferredSupplier}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Header und Aktionen */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center">
                <Euro className="h-5 w-5 mr-2" />
                Einkaufsbedingungen für {productName}
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                {conditions.length} {conditions.length === 1 ? 'Bedingung' : 'Bedingungen'} vorhanden
              </p>
            </div>
            <div className="flex gap-2">
              <Select value={selectedSupplierId?.toString() || ""} onValueChange={(value) => setSelectedSupplierId(parseInt(value))}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Lieferant auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier: Supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id.toString()}>
                      {supplier.companyName || supplier.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleCreate} disabled={!selectedSupplierId}>
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
                Für dieses Produkt wurden noch keine Einkaufsbedingungen hinterlegt.
              </p>
              <p className="text-sm text-gray-500">
                Wählen Sie einen Lieferanten aus und erstellen Sie die erste Bedingung.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lieferant</TableHead>
                  <TableHead>Preis (netto)</TableHead>
                  <TableHead>Pfand</TableHead>
                  <TableHead>Mindestmenge</TableHead>
                  <TableHead>Gebinde</TableHead>
                  <TableHead>Gültig bis</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conditions.map((condition) => (
                  <TableRow key={condition.id}>
                    <TableCell className="font-medium">
                      {condition.supplierName}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{formatCurrency(condition.unitPrice)}</div>
                        {condition.grossPrice && (
                          <div className="text-xs text-gray-500">
                            Brutto: {formatCurrency(condition.grossPrice)}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {condition.depositPerUnit > 0 ? formatCurrency(condition.depositPerUnit) : '-'}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div>{condition.minQuantity}</div>
                        <div className="text-xs text-gray-500">
                          {condition.minQuantityUnit === 'package' ? 'Gebinde' : 'Einzelstück'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {condition.packagingUnit && condition.packagingQuantity ? 
                        `${condition.packagingQuantity} ${condition.packagingUnit}` : '-'}
                    </TableCell>
                    <TableCell>
                      {condition.validTo ? formatDate(condition.validTo) : 'Unbegrenzt'}
                    </TableCell>
                    <TableCell>
                      {condition.isPreferred ? (
                        <Badge variant="default">Bevorzugt</Badge>
                      ) : (
                        <Badge variant="outline">Standard</Badge>
                      )}
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

      {/* Dialoge für Erstellen und Bearbeiten */}
      <Dialog open={isCreateDialogOpen || editingConditionId !== null} onOpenChange={handleCancel}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {editingConditionId ? 'Einkaufsbedingung bearbeiten' : 'Neue Einkaufsbedingung erstellen'}
            </DialogTitle>
          </DialogHeader>
          
          {(isCreateDialogOpen || editingConditionId) && (
            <PurchaseConditionForm
              productId={productId}
              supplierId={editingConditionId ? editingCondition?.supplierId! : selectedSupplierId!}
              existingCondition={editingCondition}
              onSuccess={handleSuccess}
              onCancel={handleCancel}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}