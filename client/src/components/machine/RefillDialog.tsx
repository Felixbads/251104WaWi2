import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Minus, Package, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface Machine {
  id: number;
  vendonId: string;
  machineName: string;
}

interface Product {
  id: number;
  productName: string;
  sku?: string;
  price?: number;
}

interface RefillItem {
  productId: number;
  selectionNumber: string;
  quantity: number;
  productName?: string;
}

interface RefillDialogProps {
  machine: Machine;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RefillDialog({ machine, open, onOpenChange }: RefillDialogProps) {
  const [refillItems, setRefillItems] = useState<RefillItem[]>([]);
  const [notes, setNotes] = useState('');
  const [refillType, setRefillType] = useState<'planned' | 'unplanned'>('planned');

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Lade verfügbare Produkte
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['/api/products'],
    staleTime: 1000 * 60 * 5, // 5 Minuten
  });

  // Lade aktuellen Maschinenbestand
  const { data: machineStock = [] } = useQuery({
    queryKey: [`/api/machines/${machine.id}/stock`],
    enabled: open,
    staleTime: 1000 * 60 * 2, // 2 Minuten
  });

  const refillMutation = useMutation({
    mutationFn: async (data: {
      machineId: number;
      refillType: string;
      items: RefillItem[];
      notes: string;
    }) => {
      return apiRequest('/api/refills', data, 'POST');
    },
    onSuccess: () => {
      toast({
        title: "Auffüllung erfolgreich",
        description: "Der Automat wurde erfolgreich aufgefüllt.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/machines/${machine.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/machines/${machine.id}/stock`] });
      queryClient.invalidateQueries({ queryKey: ['/api/refills'] });
      onOpenChange(false);
      setRefillItems([]);
      setNotes('');
    },
    onError: (error) => {
      toast({
        title: "Fehler beim Auffüllen",
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
        variant: "destructive",
      });
    },
  });

  const addRefillItem = () => {
    setRefillItems(prev => [...prev, { 
      productId: 0, 
      selectionNumber: '', 
      quantity: 0 
    }]);
  };

  const removeRefillItem = (index: number) => {
    setRefillItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateRefillItem = (index: number, field: keyof RefillItem, value: any) => {
    setRefillItems(prev => prev.map((item, i) => {
      if (i === index) {
        const updatedItem = { ...item, [field]: value };
        
        // Wenn Product ID geändert wird, auch den Produktnamen aktualisieren
        if (field === 'productId') {
          const product = products.find(p => p.id === value);
          updatedItem.productName = product?.productName || '';
        }
        
        return updatedItem;
      }
      return item;
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (refillItems.length === 0) {
      toast({
        title: "Keine Artikel ausgewählt",
        description: "Bitte fügen Sie mindestens einen Artikel hinzu.",
        variant: "destructive",
      });
      return;
    }

    const invalidItems = refillItems.some(item => 
      !item.productId || !item.selectionNumber || item.quantity <= 0
    );

    if (invalidItems) {
      toast({
        title: "Ungültige Eingaben",
        description: "Bitte füllen Sie alle Felder korrekt aus.",
        variant: "destructive",
      });
      return;
    }

    refillMutation.mutate({
      machineId: machine.id,
      refillType,
      items: refillItems,
      notes,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Automat auffüllen - {machine.machineName}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="refillType">Auffüllungstyp</Label>
            <Select value={refillType} onValueChange={(value: 'planned' | 'unplanned') => setRefillType(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Typ wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">Geplant</SelectItem>
                <SelectItem value="unplanned">Ungeplant</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Auffüllungsartikel</Label>
              <Button type="button" variant="outline" size="sm" onClick={addRefillItem}>
                <Plus className="h-4 w-4 mr-1" />
                Artikel hinzufügen
              </Button>
            </div>

            {refillItems.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>Noch keine Artikel hinzugefügt</p>
                  <p className="text-sm">Klicken Sie auf "Artikel hinzufügen" um zu beginnen</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {refillItems.map((item, index) => (
                  <Card key={index}>
                    <CardContent className="pt-4">
                      <div className="grid grid-cols-12 gap-3 items-center">
                        <div className="col-span-4">
                          <Label className="text-xs">Produkt</Label>
                          <Select 
                            value={item.productId.toString()} 
                            onValueChange={(value) => updateRefillItem(index, 'productId', parseInt(value))}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Produkt wählen" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map(product => (
                                <SelectItem key={product.id} value={product.id.toString()}>
                                  {product.productName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="col-span-3">
                          <Label className="text-xs">Schacht</Label>
                          <Input
                            type="text"
                            placeholder="z.B. A1"
                            value={item.selectionNumber}
                            onChange={(e) => updateRefillItem(index, 'selectionNumber', e.target.value)}
                            className="h-8"
                          />
                        </div>

                        <div className="col-span-3">
                          <Label className="text-xs">Anzahl</Label>
                          <div className="flex items-center space-x-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => updateRefillItem(index, 'quantity', Math.max(0, item.quantity - 1))}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateRefillItem(index, 'quantity', parseInt(e.target.value) || 0)}
                              className="h-8 text-center"
                              min="0"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => updateRefillItem(index, 'quantity', item.quantity + 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        <div className="col-span-2 flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                            onClick={() => removeRefillItem(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notizen</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Zusätzliche Notizen zur Auffüllung..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={refillMutation.isPending}>
              {refillMutation.isPending ? 'Führe Auffüllung durch...' : 'Auffüllung durchführen'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}