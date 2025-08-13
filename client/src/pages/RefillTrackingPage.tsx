import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Package, ArrowRight, AlertTriangle, CheckCircle, Calendar, User, Box } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface RefillItem {
  productId: number;
  productName: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  warehouseStock: number;
}

interface RefillHistory {
  id: number;
  machineId: number;
  machineName: string;
  warehouseId: number;
  warehouseName: string;
  performedBy: string;
  performedAt: string;
  items: RefillHistoryItem[];
}

interface RefillHistoryItem {
  productName: string;
  quantity: number;
  batchNumber: string;
  expiryDate: string;
  stockBefore: number;
  stockAfter: number;
}

export default function RefillTrackingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [selectedMachine, setSelectedMachine] = useState<string>('');
  const [refillItems, setRefillItems] = useState<RefillItem[]>([]);
  const [activeTab, setActiveTab] = useState('new-refill');

  // Load warehouses
  const { data: warehousesResponse, isLoading: isLoadingWarehouses } = useQuery({
    queryKey: ['/api/warehouses'],
    staleTime: 5 * 60 * 1000,
  });
  const warehouses = warehousesResponse?.data || [];

  // Load machines
  const { data: machines = [], isLoading: isLoadingMachines } = useQuery({
    queryKey: ['/api/machines'],
    staleTime: 5 * 60 * 1000,
  });

  // Load warehouse inventory with batch info when warehouse is selected
  const { data: warehouseInventory = [], isLoading: isLoadingInventory } = useQuery({
    queryKey: ['/api/warehouse-inventory-batches', selectedWarehouse],
    enabled: !!selectedWarehouse,
  });

  // Load refill history
  const { data: refillHistory = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ['/api/refill-history'],
  });

  // Mutation for performing refill
  const performRefillMutation = useMutation({
    mutationFn: async (data: {
      warehouseId: number;
      machineId: number;
      items: RefillItem[];
    }) => {
      return await apiRequest('/api/warehouse-refills', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/warehouse-inventory-batches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/refill-history'] });
      queryClient.invalidateQueries({ queryKey: ['/api/machine-stock'] });
      
      toast({
        title: "Refill erfolgreich",
        description: "Die Waren wurden erfolgreich vom Lager zum Automaten transferiert.",
      });
      
      // Reset form
      setRefillItems([]);
      setSelectedMachine('');
      setActiveTab('history');
    },
    onError: (error: any) => {
      toast({
        title: "Fehler beim Refill",
        description: error.message || "Es ist ein Fehler aufgetreten.",
        variant: "destructive",
      });
    },
  });

  const handleAddItem = (item: any) => {
    const existingIndex = refillItems.findIndex(
      ri => ri.productId === item.productId && ri.batchNumber === item.batchNumber
    );

    if (existingIndex >= 0) {
      // Update quantity if item already exists
      const updated = [...refillItems];
      updated[existingIndex].quantity += 1;
      setRefillItems(updated);
    } else {
      // Add new item
      setRefillItems([...refillItems, {
        productId: item.productId,
        productName: item.productName,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        quantity: 1,
        warehouseStock: item.quantity,
      }]);
    }
  };

  const handleUpdateQuantity = (index: number, quantity: number) => {
    const updated = [...refillItems];
    updated[index].quantity = quantity;
    setRefillItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    setRefillItems(refillItems.filter((_, i) => i !== index));
  };

  const handlePerformRefill = () => {
    if (!selectedWarehouse || !selectedMachine || refillItems.length === 0) {
      toast({
        title: "Unvollständige Eingabe",
        description: "Bitte wählen Sie Lager, Automat und mindestens einen Artikel aus.",
        variant: "destructive",
      });
      return;
    }

    performRefillMutation.mutate({
      warehouseId: parseInt(selectedWarehouse),
      machineId: parseInt(selectedMachine),
      items: refillItems,
    });
  };

  const isExpired = (expiryDate: string) => {
    return new Date(expiryDate) < new Date();
  };

  const isExpiringSoon = (expiryDate: string) => {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return new Date(expiryDate) < thirtyDaysFromNow;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Refill-Tracking</h1>
          <p className="text-muted-foreground">
            Verwalten Sie Warenentnahmen vom Lager zum Automaten mit Chargen- und MHD-Tracking
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="new-refill">Neuer Refill</TabsTrigger>
          <TabsTrigger value="history">Verlauf</TabsTrigger>
          <TabsTrigger value="warnings">MHD-Warnungen</TabsTrigger>
        </TabsList>

        <TabsContent value="new-refill" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Source and Destination Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Quelle & Ziel</CardTitle>
                <CardDescription>Wählen Sie Lager und Zielautomat</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Lager (Quelle)</Label>
                  <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                    <SelectTrigger>
                      <SelectValue placeholder="Lager auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((warehouse: any) => (
                        <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                          <div className="flex items-center">
                            <Box className="h-4 w-4 mr-2" />
                            {warehouse.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Automat (Ziel)</Label>
                  <Select value={selectedMachine} onValueChange={setSelectedMachine}>
                    <SelectTrigger>
                      <SelectValue placeholder="Automat auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {machines.map((machine: any) => (
                        <SelectItem key={machine.id} value={machine.id.toString()}>
                          {machine.machineName} ({machine.locationName})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Selected Items for Refill */}
            <Card>
              <CardHeader>
                <CardTitle>Ausgewählte Artikel</CardTitle>
                <CardDescription>
                  {refillItems.length} Artikel für Refill ausgewählt
                </CardDescription>
              </CardHeader>
              <CardContent>
                {refillItems.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    Keine Artikel ausgewählt
                  </p>
                ) : (
                  <div className="space-y-2">
                    {refillItems.map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex-1">
                          <p className="font-medium">{item.productName}</p>
                          <div className="flex gap-4 text-sm text-muted-foreground">
                            <span>Charge: {item.batchNumber}</span>
                            <span>MHD: {format(new Date(item.expiryDate), 'dd.MM.yyyy')}</span>
                            {isExpired(item.expiryDate) && (
                              <Badge variant="destructive">Abgelaufen!</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => handleUpdateQuantity(index, parseInt(e.target.value) || 0)}
                            className="w-20"
                            min="1"
                            max={item.warehouseStock}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveItem(index)}
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Available Inventory */}
          {selectedWarehouse && (
            <Card>
              <CardHeader>
                <CardTitle>Verfügbare Artikel im Lager</CardTitle>
                <CardDescription>
                  Wählen Sie Artikel mit Chargen für den Refill aus
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingInventory ? (
                  <p>Lade Lagerbestand...</p>
                ) : warehouseInventory.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    Keine Artikel im Lager verfügbar
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Artikel</TableHead>
                        <TableHead>Charge</TableHead>
                        <TableHead>MHD</TableHead>
                        <TableHead>Verfügbar</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {warehouseInventory.map((item: any) => (
                        <TableRow key={`${item.productId}-${item.batchNumber}`}>
                          <TableCell>{item.productName}</TableCell>
                          <TableCell>{item.batchNumber}</TableCell>
                          <TableCell>
                            {format(new Date(item.expiryDate), 'dd.MM.yyyy')}
                          </TableCell>
                          <TableCell>{item.quantity} Stück</TableCell>
                          <TableCell>
                            {isExpired(item.expiryDate) ? (
                              <Badge variant="destructive">Abgelaufen</Badge>
                            ) : isExpiringSoon(item.expiryDate) ? (
                              <Badge variant="outline" className="border-yellow-500">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Läuft bald ab
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-green-500">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                OK
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAddItem(item)}
                              disabled={item.quantity === 0 || isExpired(item.expiryDate)}
                            >
                              Hinzufügen
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          {/* Perform Refill Button */}
          {refillItems.length > 0 && (
            <div className="flex justify-end">
              <Button
                onClick={handlePerformRefill}
                disabled={performRefillMutation.isPending}
                size="lg"
              >
                <Package className="h-5 w-5 mr-2" />
                Refill durchführen
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Refill-Verlauf</CardTitle>
              <CardDescription>
                Übersicht aller durchgeführten Refills mit Details
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingHistory ? (
                <p>Lade Verlauf...</p>
              ) : refillHistory.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  Noch keine Refills durchgeführt
                </p>
              ) : (
                <div className="space-y-4">
                  {refillHistory.map((refill: RefillHistory) => (
                    <Card key={refill.id}>
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-lg">
                              {refill.warehouseName} → {refill.machineName}
                            </CardTitle>
                            <CardDescription>
                              <div className="flex items-center gap-4 mt-2">
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {refill.performedBy}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(refill.performedAt), 'dd.MM.yyyy HH:mm', { locale: de })}
                                </span>
                              </div>
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {refill.items.map((item, index) => (
                            <div key={index} className="flex justify-between items-center p-2 bg-muted rounded">
                              <div>
                                <p className="font-medium">{item.productName}</p>
                                <p className="text-sm text-muted-foreground">
                                  Charge: {item.batchNumber} | MHD: {format(new Date(item.expiryDate), 'dd.MM.yyyy')}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-medium">{item.quantity} Stück entnommen</p>
                                <p className="text-sm text-muted-foreground">
                                  Bestand: {item.stockBefore} → {item.stockAfter}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="warnings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>MHD-Warnungen</CardTitle>
              <CardDescription>
                Übersicht über abgelaufene oder bald ablaufende Produkte
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert className="mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Wichtiger Hinweis</AlertTitle>
                <AlertDescription>
                  Abgelaufene Produkte werden automatisch bei Refill-Vorgängen blockiert und protokolliert.
                </AlertDescription>
              </Alert>
              
              {isLoadingInventory ? (
                <p>Lade MHD-Informationen...</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lager</TableHead>
                      <TableHead>Artikel</TableHead>
                      <TableHead>Charge</TableHead>
                      <TableHead>MHD</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Menge</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {warehouses.flatMap((warehouse: any) => 
                      warehouseInventory
                        .filter((item: any) => 
                          item.warehouseId === warehouse.id && 
                          (isExpired(item.expiryDate) || isExpiringSoon(item.expiryDate))
                        )
                        .map((item: any) => (
                          <TableRow key={`${item.warehouseId}-${item.productId}-${item.batchNumber}`}>
                            <TableCell>{warehouse.name}</TableCell>
                            <TableCell>{item.productName}</TableCell>
                            <TableCell>{item.batchNumber}</TableCell>
                            <TableCell>
                              {format(new Date(item.expiryDate), 'dd.MM.yyyy')}
                            </TableCell>
                            <TableCell>
                              {isExpired(item.expiryDate) ? (
                                <Badge variant="destructive">Abgelaufen</Badge>
                              ) : (
                                <Badge variant="outline" className="border-yellow-500">
                                  Läuft bald ab
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>{item.quantity} Stück</TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}