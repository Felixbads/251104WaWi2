import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Search, Edit, Trash2, Package, Calendar, MapPin, FileText, Filter, X } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface ProductBatch {
  id: number;
  batchNumber: string;
  productId: number;
  warehouseId: number;
  initialQuantity: number;
  currentQuantity: number;
  expiryDate: string | null;
  manufacturingDate: string | null;
  notes: string | null;
  locationInWarehouse: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  productName: string | null;
  warehouseName: string | null;
}

interface GroupedBatch {
  productName: string;
  totalQuantity: number;
  batchCount: number;
  productIdCount: number;
  batches: ProductBatch[];
}

function BatchManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State management
  const [selectedBatch, setSelectedBatch] = useState<ProductBatch | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showGrouped, setShowGrouped] = useState(true);
  const [showExpiringSoon, setShowExpiringSoon] = useState(false);
  
  // Edit form state
  const [editForm, setEditForm] = useState({
    currentQuantity: 0,
    expiryDate: '',
    notes: '',
    locationInWarehouse: '',
    status: 'active'
  });

  // Load warehouses
  const { data: warehouses = [] } = useQuery({
    queryKey: ['/api/warehouses'],
  });

  // Load all batches or warehouse-specific batches
  const { data: allBatches = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/product-batches', selectedWarehouse ? { warehouseId: selectedWarehouse } : {}],
    enabled: true,
  });

  // Load grouped batches when a warehouse is selected
  const { data: groupedBatches = [] } = useQuery({
    queryKey: ['/api/product-batches/warehouse', selectedWarehouse, { groupByName: true }],
    enabled: !!selectedWarehouse && showGrouped,
  });

  // Load expiring soon batches
  const { data: expiringSoonBatches = [] } = useQuery({
    queryKey: ['/api/product-batches', { expiringSoon: true }],
    enabled: showExpiringSoon,
  });

  // Update batch mutation
  const updateBatchMutation = useMutation({
    mutationFn: async (data: { id: number; updates: any }) => {
      return apiRequest(`/api/product-batches/${data.id}`, {
        method: 'PUT',
        data: data.updates,
      });
    },
    onSuccess: () => {
      toast({
        title: "Erfolg",
        description: "Batch wurde erfolgreich aktualisiert.",
      });
      setIsEditDialogOpen(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/product-batches'] });
    },
    onError: (error: any) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Aktualisieren: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Delete batch mutation
  const deleteBatchMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/product-batches/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      toast({
        title: "Erfolg",
        description: "Batch wurde erfolgreich gelöscht.",
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/product-batches'] });
    },
    onError: (error: any) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Löschen: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Filter batches based on search and status
  const filteredBatches = useMemo(() => {
    let batches = allBatches;
    
    if (showExpiringSoon) {
      batches = expiringSoonBatches;
    }
    
    if (searchTerm) {
      batches = batches.filter((batch: ProductBatch) =>
        batch.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        batch.batchNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        batch.warehouseName?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (statusFilter) {
      batches = batches.filter((batch: ProductBatch) => batch.status === statusFilter);
    }
    
    return batches;
  }, [allBatches, expiringSoonBatches, searchTerm, statusFilter, showExpiringSoon]);

  // Handle edit form submission
  const handleUpdateBatch = () => {
    if (!selectedBatch) return;
    
    const updates = {
      ...editForm,
      currentQuantity: parseInt(editForm.currentQuantity.toString()),
      expiryDate: editForm.expiryDate || null,
    };
    
    updateBatchMutation.mutate({ id: selectedBatch.id, updates });
  };

  // Handle edit dialog open
  const openEditDialog = (batch: ProductBatch) => {
    setSelectedBatch(batch);
    setEditForm({
      currentQuantity: batch.currentQuantity,
      expiryDate: batch.expiryDate ? format(new Date(batch.expiryDate), 'yyyy-MM-dd') : '',
      notes: batch.notes || '',
      locationInWarehouse: batch.locationInWarehouse || '',
      status: batch.status || 'active'
    });
    setIsEditDialogOpen(true);
  };

  // Format date helper
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Kein Datum';
    return format(new Date(dateString), 'dd.MM.yyyy', { locale: de });
  };

  // Get status badge variant
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'expired': return 'destructive';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  // Check if batch is expiring soon (within 14 days)
  const isExpiringSoon = (expiryDate: string | null) => {
    if (!expiryDate) return false;
    const expiry = new Date(expiryDate);
    const now = new Date();
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 14 && diffDays >= 0;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chargenverwaltung</h1>
          <p className="text-muted-foreground">
            Verwalten Sie Produktchargen - Bearbeiten, Löschen und Überwachen von Lagerbeständen
          </p>
        </div>
      </div>

      {/* Filters and Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filter und Ansichtsoptionen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="warehouse-select">Lager auswählen</Label>
              <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Lager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Alle Lager</SelectItem>
                  {warehouses.map((warehouse: any) => (
                    <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="search">Suchen</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Produktname, Chargennummer..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="status-filter">Status Filter</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Alle Status</SelectItem>
                  <SelectItem value="active">Aktiv</SelectItem>
                  <SelectItem value="expired">Abgelaufen</SelectItem>
                  <SelectItem value="low">Niedrig</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Ansichtsoptionen</Label>
              <div className="flex flex-col gap-2">
                <Button
                  variant={showGrouped ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowGrouped(!showGrouped)}
                  disabled={!selectedWarehouse}
                >
                  Nach Produktname gruppieren
                </Button>
                <Button
                  variant={showExpiringSoon ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowExpiringSoon(!showExpiringSoon)}
                >
                  Bald ablaufende Chargen
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grouped View */}
      {showGrouped && selectedWarehouse && groupedBatches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Gruppierte Ansicht - Nach Produktname</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {groupedBatches.map((group: GroupedBatch, index: number) => (
                <Card key={index} className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold text-lg">{group.productName}</h3>
                      <div className="flex gap-4 text-sm text-muted-foreground">
                        <span>Gesamtmenge: {group.totalQuantity}</span>
                        <span>Chargen: {group.batchCount}</span>
                        {group.productIdCount > 1 && (
                          <Badge variant="destructive">
                            {group.productIdCount} Duplikate!
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {group.batches.map((batch) => (
                      <Card key={batch.id} className="p-3">
                        <div className="flex justify-between items-start mb-2">
                          <div className="text-sm">
                            <div className="font-medium">{batch.batchNumber}</div>
                            <div className="text-muted-foreground">
                              Menge: {batch.currentQuantity}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(batch)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Charge löschen</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Möchten Sie die Charge "{batch.batchNumber}" wirklich löschen?
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteBatchMutation.mutate(batch.id)}
                                  >
                                    Löschen
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <div>MHD: {formatDate(batch.expiryDate)}</div>
                          {batch.locationInWarehouse && (
                            <div>Ort: {batch.locationInWarehouse}</div>
                          )}
                          <Badge variant={getStatusBadgeVariant(batch.status)} className="text-xs">
                            {batch.status}
                          </Badge>
                          {isExpiringSoon(batch.expiryDate) && (
                            <Badge variant="destructive" className="text-xs">
                              Läuft bald ab!
                            </Badge>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Regular Table View */}
      {(!showGrouped || !selectedWarehouse) && (
        <Card>
          <CardHeader>
            <CardTitle>
              {showExpiringSoon ? 'Bald ablaufende Chargen' : 'Alle Chargen'}
              {filteredBatches.length > 0 && ` (${filteredBatches.length})`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Laden...</div>
            ) : filteredBatches.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Keine Chargen gefunden
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Chargennummer</TableHead>
                    <TableHead>Produkt</TableHead>
                    <TableHead>Lager</TableHead>
                    <TableHead>Menge</TableHead>
                    <TableHead>MHD</TableHead>
                    <TableHead>Ort</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBatches.map((batch: ProductBatch) => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-medium">{batch.batchNumber}</TableCell>
                      <TableCell>{batch.productName || 'Unbekannt'}</TableCell>
                      <TableCell>{batch.warehouseName || 'Unbekannt'}</TableCell>
                      <TableCell>{batch.currentQuantity}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {formatDate(batch.expiryDate)}
                          {isExpiringSoon(batch.expiryDate) && (
                            <Badge variant="destructive" className="text-xs">
                              Bald!
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{batch.locationInWarehouse || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(batch.status)}>
                          {batch.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(batch)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Charge löschen</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Möchten Sie die Charge "{batch.batchNumber}" wirklich löschen?
                                  Diese Aktion kann nicht rückgängig gemacht werden.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteBatchMutation.mutate(batch.id)}
                                  className="bg-destructive text-destructive-foreground"
                                >
                                  Löschen
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Charge bearbeiten</DialogTitle>
          </DialogHeader>
          {selectedBatch && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Charge: {selectedBatch.batchNumber} | Produkt: {selectedBatch.productName}
              </div>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="quantity">Aktuelle Menge</Label>
                  <Input
                    id="quantity"
                    type="number"
                    value={editForm.currentQuantity}
                    onChange={(e) => setEditForm(prev => ({ ...prev, currentQuantity: parseInt(e.target.value) || 0 }))}
                  />
                </div>

                <div>
                  <Label htmlFor="expiry">Ablaufdatum</Label>
                  <Input
                    id="expiry"
                    type="date"
                    value={editForm.expiryDate}
                    onChange={(e) => setEditForm(prev => ({ ...prev, expiryDate: e.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="location">Lagerort</Label>
                  <Input
                    id="location"
                    value={editForm.locationInWarehouse}
                    onChange={(e) => setEditForm(prev => ({ ...prev, locationInWarehouse: e.target.value }))}
                    placeholder="z.B. Regal A-3"
                  />
                </div>

                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select value={editForm.status} onValueChange={(value) => setEditForm(prev => ({ ...prev, status: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Aktiv</SelectItem>
                      <SelectItem value="expired">Abgelaufen</SelectItem>
                      <SelectItem value="low">Niedrig</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="notes">Notizen</Label>
                  <Textarea
                    id="notes"
                    value={editForm.notes}
                    onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Zusätzliche Notizen..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Abbrechen
                </Button>
                <Button onClick={handleUpdateBatch} disabled={updateBatchMutation.isPending}>
                  {updateBatchMutation.isPending ? 'Speichern...' : 'Speichern'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default BatchManagement;