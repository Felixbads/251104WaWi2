import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Warehouse {
  id: number;
  name: string;
  location?: string;
  description?: string;
  status?: string;
}

export default function InventurCreationPage() {
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  // Lager-Daten abfragen
  const { data: warehouses = [], isLoading } = useQuery<Warehouse[]>({
    queryKey: ['/api/warehouses'],
    staleTime: 60 * 1000, // 1 Minute Cache
  });

  // Inventur erstellen
  const createInventurMutation = useMutation({
    mutationFn: async (warehouseId: number) => {
      const response = await fetch('/api/inventory-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouseId }),
      });
      
      if (!response.ok) {
        throw new Error('Fehler beim Erstellen der Inventur');
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Inventur erstellt",
        description: `Inventur für ${data.warehouseName} wurde erstellt.`,
      });
      // Cache invalidieren vor der Navigation
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-counts'] });
      navigate(`/inventur-detail/${data.id}`);
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Die Inventur konnte nicht erstellt werden.",
        variant: "destructive",
      });
    },
  });

  // Aktive Lager filtern
  const activeWarehouses = warehouses.filter(warehouse => 
    warehouse.status === undefined || warehouse.status === 'active'
  );

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Neue Inventur erstellen</h1>
        <Button 
          variant="outline" 
          onClick={() => navigate('/inventur')}
        >
          Zurück zur Übersicht
        </Button>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Lager auswählen</CardTitle>
          <CardDescription>
            Wählen Sie das Lager aus, für das Sie eine Inventur erstellen möchten.
            Nach der Erstellung werden automatisch alle Produkte des Lagers zur Inventur hinzugefügt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="warehouse">Lager</Label>
                <Select 
                  onValueChange={(value) => setSelectedWarehouseId(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Lager auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeWarehouses.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                        {warehouse.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedWarehouseId !== null && (
                <div className="mt-4 p-4 bg-muted rounded-md">
                  <h3 className="font-medium mb-2">Ausgewähltes Lager:</h3>
                  {warehouses.find(w => w.id === selectedWarehouseId)?.name}
                  
                  {warehouses.find(w => w.id === selectedWarehouseId)?.description && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {warehouses.find(w => w.id === selectedWarehouseId)?.description}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button 
            variant="outline" 
            onClick={() => navigate('/inventur')}
          >
            Abbrechen
          </Button>
          <Button 
            onClick={() => selectedWarehouseId && createInventurMutation.mutate(selectedWarehouseId)}
            disabled={!selectedWarehouseId || createInventurMutation.isPending}
          >
            {createInventurMutation.isPending ? "Wird erstellt..." : "Inventur erstellen"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}