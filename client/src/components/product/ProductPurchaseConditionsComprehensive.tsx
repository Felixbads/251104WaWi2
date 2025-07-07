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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { 
  Euro, 
  Package, 
  Edit3, 
  Save, 
  X, 
  Plus, 
  Trash2, 
  Calendar, 
  TrendingUp, 
  Info,
  ShoppingCart,
  Clock,
  Users,
  Calculator
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { apiRequest } from '@/lib/queryClient';

interface ProductPurchaseConditionsComprehensiveProps {
  productId: number;
  productName: string;
}

interface PurchaseCondition {
  id: number;
  product_id: number;
  supplier_id: number;
  supplier_name: string;
  unit_price: number;
  tax_rate: number;
  gross_price: number;
  min_quantity: number;
  packaging_unit?: string;
  packaging_quantity?: number;
  delivery_time?: string;
  valid_from?: string;
  valid_to?: string;
  is_preferred: boolean;
  notes?: string;
  lead_time?: number;
  created_at?: string;
  updated_at?: string;
}

interface Supplier {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  payment_terms?: string;
  delivery_terms?: string;
  minimum_order_value?: number;
}

interface NewPurchaseCondition {
  supplierId: number;
  unitPrice: number;
  taxRate: number;
  minQuantity: number;
  packagingUnit: string;
  packagingQuantity: number;
  deliveryTime: string;
  validFrom: string;
  validTo: string;
  isPreferred: boolean;
  notes: string;
  leadTime: number;
}

export default function ProductPurchaseConditionsComprehensive({ 
  productId, 
  productName 
}: ProductPurchaseConditionsComprehensiveProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isCreateSupplierDialogOpen, setIsCreateSupplierDialogOpen] = useState(false);
  const [editingCondition, setEditingCondition] = useState<number | null>(null);
  const [newCondition, setNewCondition] = useState<Partial<NewPurchaseCondition>>({
    taxRate: 19,
    minQuantity: 1,
    packagingQuantity: 1,
    isPreferred: false,
    leadTime: 3
  });
  const [newSupplier, setNewSupplier] = useState({
    company_name: '',
    contact_person: '',
    email: '',
    phone: '',
    street: '',
    postal_code: '',
    city: '',
    country: 'Deutschland'
  });

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
    queryKey: ['/api/suppliers-simple'],
    queryFn: async () => {
      const response = await fetch('/api/suppliers-simple', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken') || 'test'}` }
      });
      if (!response.ok) throw new Error('Failed to fetch suppliers');
      return response.json();
    }
  });

  // Create new purchase condition
  const createConditionMutation = useMutation({
    mutationFn: async (conditionData: Partial<NewPurchaseCondition>) => {
      const grossPrice = conditionData.unitPrice && conditionData.taxRate
        ? conditionData.unitPrice * (1 + (conditionData.taxRate / 100))
        : conditionData.unitPrice;

      const payload = {
        supplier_id: conditionData.supplierId,
        unit_price: conditionData.unitPrice,
        tax_rate: conditionData.taxRate,
        gross_price: grossPrice,
        min_quantity: conditionData.minQuantity,
        packaging_unit: conditionData.packagingUnit,
        packaging_quantity: conditionData.packagingQuantity,
        delivery_time: conditionData.deliveryTime,
        valid_from: conditionData.validFrom,
        valid_to: conditionData.validTo || null,
        is_preferred: conditionData.isPreferred,
        notes: conditionData.notes,
        lead_time: conditionData.leadTime
      };

      return apiRequest(`/api/products/${productId}/purchase-conditions`, payload, 'POST');
    },
    onSuccess: () => {
      toast({ title: 'Einkaufsbedingung erfolgreich erstellt' });
      setIsAddDialogOpen(false);
      setNewCondition({
        taxRate: 19,
        minQuantity: 1,
        packagingQuantity: 1,
        isPreferred: false,
        leadTime: 3
      });
      refetch();
    },
    onError: (error) => {
      console.error('Error creating purchase condition:', error);
      toast({ 
        title: 'Fehler beim Erstellen der Einkaufsbedingung', 
        variant: 'destructive' 
      });
    }
  });

  // Delete purchase condition
  const deleteConditionMutation = useMutation({
    mutationFn: async (conditionId: number) => {
      return apiRequest(`/api/products/${productId}/purchase-conditions/${conditionId}`, {}, 'DELETE');
    },
    onSuccess: () => {
      toast({ title: 'Einkaufsbedingung gelöscht' });
      refetch();
    },
    onError: (error) => {
      console.error('Error deleting purchase condition:', error);
      toast({ 
        title: 'Fehler beim Löschen der Einkaufsbedingung', 
        variant: 'destructive' 
      });
    }
  });

  // Create new supplier
  const createSupplierMutation = useMutation({
    mutationFn: async (supplier: any) => {
      return apiRequest('/api/suppliers', supplier, 'POST');
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/suppliers-simple'] });
      setIsCreateSupplierDialogOpen(false);
      setNewSupplier({
        company_name: '',
        contact_person: '',
        email: '',
        phone: '',
        street: '',
        postal_code: '',
        city: '',
        country: 'Deutschland'
      });
      // Auto-select the newly created supplier
      setNewCondition({...newCondition, supplierId: data.id});
      toast({
        title: "Lieferant erstellt",
        description: "Der Lieferant wurde erfolgreich hinzugefügt und ausgewählt."
      });
    },
    onError: (error) => {
      console.error('Error creating supplier:', error);
      toast({
        title: "Fehler beim Erstellen des Lieferanten",
        variant: "destructive"
      });
    }
  });

  const handleCreateCondition = () => {
    if (!newCondition.supplierId || !newCondition.unitPrice) {
      toast({ 
        title: 'Pflichtfelder ausfüllen', 
        description: 'Bitte Lieferant und Preis angeben',
        variant: 'destructive' 
      });
      return;
    }
    createConditionMutation.mutate(newCondition);
  };

  const handleDeleteCondition = (conditionId: number) => {
    if (confirm('Sind Sie sicher, dass Sie diese Einkaufsbedingung löschen möchten?')) {
      deleteConditionMutation.mutate(conditionId);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd.MM.yyyy', { locale: de });
    } catch {
      return '-';
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2
    }).format(price);
  };

  const getStatusBadge = (condition: PurchaseCondition) => {
    const now = new Date();
    const validFrom = condition.valid_from ? new Date(condition.valid_from) : null;
    const validTo = condition.valid_to ? new Date(condition.valid_to) : null;

    if (validFrom && validFrom > now) {
      return <Badge variant="outline">Zukünftig</Badge>;
    }
    if (validTo && validTo < now) {
      return <Badge variant="destructive">Abgelaufen</Badge>;
    }
    if (condition.is_preferred) {
      return <Badge variant="default">Bevorzugt</Badge>;
    }
    return <Badge variant="secondary">Aktiv</Badge>;
  };

  const getBestPrice = () => {
    if (!conditions || conditions.length === 0) return null;
    return Math.min(...conditions.map((c: PurchaseCondition) => c.unit_price));
  };

  const getWorstPrice = () => {
    if (!conditions || conditions.length === 0) return null;
    return Math.max(...conditions.map((c: PurchaseCondition) => c.unit_price));
  };

  const getAveragePrice = () => {
    if (!conditions || conditions.length === 0) return null;
    const sum = conditions.reduce((acc: number, c: PurchaseCondition) => acc + c.unit_price, 0);
    return sum / conditions.length;
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-sm text-gray-600">Lieferanten</p>
                <p className="text-xl font-semibold">{conditions.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-sm text-gray-600">Bester Preis</p>
                <p className="text-xl font-semibold text-green-600">
                  {getBestPrice() ? formatPrice(getBestPrice()!) : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Calculator className="h-4 w-4 text-orange-500" />
              <div>
                <p className="text-sm text-gray-600">Durchschnitt</p>
                <p className="text-xl font-semibold">
                  {getAveragePrice() ? formatPrice(getAveragePrice()!) : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4 text-red-500 rotate-180" />
              <div>
                <p className="text-sm text-gray-600">Höchster Preis</p>
                <p className="text-xl font-semibold text-red-600">
                  {getWorstPrice() ? formatPrice(getWorstPrice()!) : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Purchase Conditions Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Euro className="h-5 w-5" />
              Einkaufsbedingungen für {productName}
            </CardTitle>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Neue Bedingung
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Neue Einkaufsbedingung hinzufügen</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="supplier">Lieferant</Label>
                    <div className="flex gap-2">
                      <Select
                        value={newCondition.supplierId?.toString() || ''}
                        onValueChange={(value) => setNewCondition({...newCondition, supplierId: parseInt(value)})}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Lieferant wählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {suppliers.map((supplier: Supplier) => (
                            <SelectItem key={supplier.id} value={supplier.id.toString()}>
                              {supplier.company_name || supplier.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setIsCreateSupplierDialogOpen(true)}
                        className="px-3"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="unitPrice">Preis pro Einheit (Netto)</Label>
                    <Input
                      id="unitPrice"
                      type="number"
                      step="0.01"
                      value={newCondition.unitPrice || ''}
                      onChange={(e) => setNewCondition({...newCondition, unitPrice: parseFloat(e.target.value)})}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="taxRate">Steuersatz (%)</Label>
                    <Input
                      id="taxRate"
                      type="number"
                      step="0.01"
                      value={newCondition.taxRate || ''}
                      onChange={(e) => setNewCondition({...newCondition, taxRate: parseFloat(e.target.value)})}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="minQuantity">Mindestmenge</Label>
                    <Input
                      id="minQuantity"
                      type="number"
                      value={newCondition.minQuantity || ''}
                      onChange={(e) => setNewCondition({...newCondition, minQuantity: parseInt(e.target.value)})}
                    />
                  </div>
                  

                  
                  <div className="space-y-2">
                    <Label htmlFor="deliveryTime">Lieferzeit</Label>
                    <Input
                      id="deliveryTime"
                      placeholder="z.B. 2-3 Tage"
                      value={newCondition.deliveryTime || ''}
                      onChange={(e) => setNewCondition({...newCondition, deliveryTime: e.target.value})}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="leadTime">Vorlaufzeit (Tage)</Label>
                    <Input
                      id="leadTime"
                      type="number"
                      value={newCondition.leadTime || ''}
                      onChange={(e) => setNewCondition({...newCondition, leadTime: parseInt(e.target.value)})}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="validFrom">Gültig ab</Label>
                    <Input
                      id="validFrom"
                      type="date"
                      value={newCondition.validFrom || ''}
                      onChange={(e) => setNewCondition({...newCondition, validFrom: e.target.value})}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="validTo">Gültig bis</Label>
                    <Input
                      id="validTo"
                      type="date"
                      value={newCondition.validTo || ''}
                      onChange={(e) => setNewCondition({...newCondition, validTo: e.target.value})}
                    />
                  </div>
                  
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="notes">Notizen</Label>
                    <Textarea
                      id="notes"
                      placeholder="Zusätzliche Informationen..."
                      value={newCondition.notes || ''}
                      onChange={(e) => setNewCondition({...newCondition, notes: e.target.value})}
                    />
                  </div>
                  
                  <div className="col-span-2 flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="isPreferred"
                      checked={newCondition.isPreferred || false}
                      onChange={(e) => setNewCondition({...newCondition, isPreferred: e.target.checked})}
                    />
                    <Label htmlFor="isPreferred">Als bevorzugten Lieferant markieren</Label>
                  </div>
                </div>
                
                <div className="flex justify-end space-x-2 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setIsAddDialogOpen(false)}
                  >
                    Abbrechen
                  </Button>
                  <Button
                    onClick={handleCreateCondition}
                    disabled={createConditionMutation.isPending}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Speichern
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            
            {/* Supplier Creation Dialog */}
            <Dialog open={isCreateSupplierDialogOpen} onOpenChange={setIsCreateSupplierDialogOpen}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Neuen Lieferant erstellen</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Firmenname *</Label>
                    <Input
                      id="companyName"
                      value={newSupplier.company_name}
                      onChange={(e) => setNewSupplier({...newSupplier, company_name: e.target.value})}
                      placeholder="z.B. Muster GmbH"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="contactPerson">Ansprechpartner</Label>
                    <Input
                      id="contactPerson"
                      value={newSupplier.contact_person}
                      onChange={(e) => setNewSupplier({...newSupplier, contact_person: e.target.value})}
                      placeholder="z.B. Max Mustermann"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email">E-Mail</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newSupplier.email}
                      onChange={(e) => setNewSupplier({...newSupplier, email: e.target.value})}
                      placeholder="info@beispiel.de"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefon</Label>
                    <Input
                      id="phone"
                      value={newSupplier.phone}
                      onChange={(e) => setNewSupplier({...newSupplier, phone: e.target.value})}
                      placeholder="0351 123456"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="street">Straße</Label>
                    <Input
                      id="street"
                      value={newSupplier.street}
                      onChange={(e) => setNewSupplier({...newSupplier, street: e.target.value})}
                      placeholder="Musterstraße 123"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label htmlFor="postalCode">PLZ</Label>
                      <Input
                        id="postalCode"
                        value={newSupplier.postal_code}
                        onChange={(e) => setNewSupplier({...newSupplier, postal_code: e.target.value})}
                        placeholder="01067"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city">Ort</Label>
                      <Input
                        id="city"
                        value={newSupplier.city}
                        onChange={(e) => setNewSupplier({...newSupplier, city: e.target.value})}
                        placeholder="Dresden"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-end space-x-2 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setIsCreateSupplierDialogOpen(false)}
                  >
                    Abbrechen
                  </Button>
                  <Button
                    onClick={() => createSupplierMutation.mutate(newSupplier)}
                    disabled={createSupplierMutation.isPending || !newSupplier.company_name}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Speichern
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-2 text-gray-600">Lade Einkaufsbedingungen...</p>
            </div>
          ) : conditions.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lieferant</TableHead>
                    <TableHead>Preis (Netto)</TableHead>
                    <TableHead>Preis (Brutto)</TableHead>
                    <TableHead>MwSt</TableHead>
                    <TableHead>Mindestmenge</TableHead>
                    <TableHead>Verpackung</TableHead>
                    <TableHead>Lieferzeit</TableHead>
                    <TableHead>Gültig ab</TableHead>
                    <TableHead>Gültig bis</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conditions.map((condition: PurchaseCondition) => (
                    <TableRow key={condition.id}>
                      <TableCell className="font-medium">
                        {condition.supplier_name}
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold text-green-600">
                          {formatPrice(condition.unit_price)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold">
                          {formatPrice(condition.gross_price || condition.unit_price * (1 + (condition.tax_rate / 100)))}
                        </span>
                      </TableCell>
                      <TableCell>{condition.tax_rate}%</TableCell>
                      <TableCell>{condition.min_quantity}</TableCell>
                      <TableCell>
                        {condition.packaging_unit && condition.packaging_quantity 
                          ? `${condition.packaging_quantity} ${condition.packaging_unit}` 
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-gray-400" />
                          {condition.delivery_time || '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-gray-400" />
                          {formatDate(condition.valid_from)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-gray-400" />
                          {formatDate(condition.valid_to)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(condition)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingCondition(condition.id)}
                          >
                            <Edit3 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteCondition(condition.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <ShoppingCart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Keine Einkaufsbedingungen vorhanden
              </h3>
              <p className="text-gray-600 mb-4">
                Erstellen Sie die erste Einkaufsbedingung für dieses Produkt.
              </p>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Erste Bedingung hinzufügen
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}