import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Package, 
  Plus, 
  Calculator, 
  AlertTriangle, 
  CheckCircle, 
  Edit3,
  Trash2,
  Save
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AddCountItemDialog } from './AddCountItemDialog';

interface RetroactiveCountDetailProps {
  countId: number;
  onBack: () => void;
}

interface CountDetails {
  count: {
    id: number;
    countName: string;
    countDate: string;
    warehouseId: number;
    warehouseName: string;
    status: string;
    isProcessed: boolean;
    description?: string;
    reasonForRetroactiveCount?: string;
    notes?: string;
    totalItemsCount: number;
    totalDiscrepancies: number;
    hasNegativeStock: boolean;
    createdByName: string;
    createdAt: string;
  };
  items: Array<{
    id: number;
    productId: number;
    productName: string;
    productSku?: string;
    countedQuantity: number;
    systemQuantity?: number;
    discrepancy?: number;
    discrepancyPercentage?: number;
    unitCost?: number;
    totalDiscrepancyValue?: number;
    isValidated: boolean;
    hasConflict: boolean;
    requiresAttention: boolean;
    notes?: string;
    countingRemarks?: string;
  }>;
  adjustments: Array<any>;
}

export function RetroactiveCountDetail({ countId, onBack }: RetroactiveCountDetailProps) {
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Lade Count-Details
  const { data: countDetails, isLoading } = useQuery<CountDetails>({
    queryKey: [`/api/retroactive-inventory/counts/${countId}`],
    queryFn: () => fetch(`/api/retroactive-inventory/counts/${countId}`).then(res => res.json()),
  });

  // Mutation zum Verarbeiten der Inventur
  const processCountMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/retroactive-inventory/counts/${countId}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Fehler bei der Verarbeitung');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Inventur verarbeitet',
        description: `${data.adjustmentsCount} Anpassungen berechnet. ${data.discrepanciesCount} Abweichungen gefunden.`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/retroactive-inventory/counts/${countId}`] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: string) => {
    const configs = {
      draft: { label: 'Entwurf', className: 'bg-gray-100 text-gray-800' },
      finalized: { label: 'Finalisiert', className: 'bg-blue-100 text-blue-800' },
      processed: { label: 'Verarbeitet', className: 'bg-green-100 text-green-800' },
      cancelled: { label: 'Abgebrochen', className: 'bg-red-100 text-red-800' },
    };
    
    const config = configs[status as keyof typeof configs] || configs.draft;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-32 bg-gray-200 rounded" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!countDetails) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-red-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Inventur nicht gefunden</h3>
        <p className="text-gray-600 mb-4">Die angeforderte Inventur konnte nicht geladen werden.</p>
        <Button onClick={onBack} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück zur Übersicht
        </Button>
      </div>
    );
  }

  const { count, items, adjustments } = countDetails;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button onClick={onBack} variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Zurück
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{count.countName}</h1>
            <p className="text-gray-600 mt-1">
              Retroaktive Inventur vom {formatDate(count.countDate)} • {count.warehouseName}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {getStatusBadge(count.status)}
          {count.hasNegativeStock && (
            <Badge className="bg-red-100 text-red-800">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Konflikte
            </Badge>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Artikel gezählt</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{items.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Abweichungen</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {items.filter(item => item.discrepancy !== 0).length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Konflikte</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {items.filter(item => item.hasConflict).length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              {count.isProcessed ? 'Verarbeitet' : 'Noch nicht verarbeitet'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Count Details */}
      <Card>
        <CardHeader>
          <CardTitle>Details der Inventur</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {count.description && (
            <div>
              <label className="text-sm font-medium text-gray-700">Beschreibung</label>
              <p className="text-gray-900">{count.description}</p>
            </div>
          )}
          
          {count.reasonForRetroactiveCount && (
            <div>
              <label className="text-sm font-medium text-gray-700">Grund für nachträgliche Inventur</label>
              <p className="text-gray-900">{count.reasonForRetroactiveCount}</p>
            </div>
          )}
          
          {count.notes && (
            <div>
              <label className="text-sm font-medium text-gray-700">Notizen</label>
              <p className="text-gray-900">{count.notes}</p>
            </div>
          )}
          
          <div className="text-xs text-gray-500">
            Erstellt am {formatDateTime(count.createdAt)} von {count.createdByName}
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Gezählte Artikel</CardTitle>
              <CardDescription>
                Übersicht aller gezählten Produkte und deren Abweichungen
              </CardDescription>
            </div>
            {count.status === 'draft' && (
              <div className="flex gap-2">
                <Button 
                  onClick={() => setShowAddItemDialog(true)}
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Artikel hinzufügen
                </Button>
                {items.length > 0 && !count.isProcessed && (
                  <Button 
                    onClick={() => processCountMutation.mutate()}
                    disabled={processCountMutation.isPending}
                    className="flex items-center gap-2"
                  >
                    {processCountMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Verarbeite...
                      </>
                    ) : (
                      <>
                        <Calculator className="w-4 h-4" />
                        Anpassungen berechnen
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-8">
              <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Keine Artikel gezählt</h3>
              <p className="text-gray-600 mb-4">
                Fügen Sie Artikel zur Inventur hinzu, um mit der Zählung zu beginnen.
              </p>
              <Button onClick={() => setShowAddItemDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Ersten Artikel hinzufügen
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produkt</TableHead>
                  <TableHead className="text-right">Gezählt</TableHead>
                  <TableHead className="text-right">System</TableHead>
                  <TableHead className="text-right">Abweichung</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Notizen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{item.productName}</div>
                        {item.productSku && (
                          <div className="text-sm text-gray-500">SKU: {item.productSku}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {item.countedQuantity}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.systemQuantity ?? '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.discrepancy !== undefined ? (
                        <span className={item.discrepancy === 0 ? 'text-green-600' : 
                                       item.discrepancy > 0 ? 'text-blue-600' : 'text-red-600'}>
                          {item.discrepancy > 0 ? '+' : ''}{item.discrepancy}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.discrepancyPercentage !== undefined ? (
                        <span className={item.discrepancyPercentage === 0 ? 'text-green-600' : 
                                       item.discrepancyPercentage > 0 ? 'text-blue-600' : 'text-red-600'}>
                          {item.discrepancyPercentage > 0 ? '+' : ''}{item.discrepancyPercentage.toFixed(1)}%
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex gap-1 justify-center">
                        {item.isValidated && (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3" />
                          </Badge>
                        )}
                        {item.hasConflict && (
                          <Badge className="bg-red-100 text-red-800">
                            <AlertTriangle className="w-3 h-3" />
                          </Badge>
                        )}
                        {item.requiresAttention && (
                          <Badge className="bg-yellow-100 text-yellow-800">
                            <AlertTriangle className="w-3 h-3" />
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {item.notes && <div>{item.notes}</div>}
                        {item.countingRemarks && (
                          <div className="text-gray-500">{item.countingRemarks}</div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Adjustments (wenn verarbeitet) */}
      {count.isProcessed && adjustments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Berechnete Anpassungen</CardTitle>
            <CardDescription>
              Automatisch berechnete Bestandsanpassungen basierend auf der retroaktiven Inventur
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-gray-600 mb-4">
              {adjustments.length} Anpassungen berechnet. 
              {adjustments.filter(adj => adj.wouldCauseNegativeStock).length > 0 && (
                <span className="text-red-600 ml-2">
                  Warnung: {adjustments.filter(adj => adj.wouldCauseNegativeStock).length} Anpassungen würden zu negativen Beständen führen.
                </span>
              )}
            </div>
            
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produkt</TableHead>
                  <TableHead className="text-right">Anpassung</TableHead>
                  <TableHead className="text-right">Neuer Bestand</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Konfidenz</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.slice(0, 10).map((adj, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      Produkt ID: {adj.productId}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={adj.finalAdjustment === 0 ? 'text-green-600' : 
                                     adj.finalAdjustment > 0 ? 'text-blue-600' : 'text-red-600'}>
                        {adj.finalAdjustment > 0 ? '+' : ''}{adj.finalAdjustment}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {adj.newCalculatedQuantity}
                    </TableCell>
                    <TableCell className="text-center">
                      {adj.wouldCauseNegativeStock ? (
                        <Badge className="bg-red-100 text-red-800">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Konflikt
                        </Badge>
                      ) : (
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          OK
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {(adj.confidenceLevel * 100).toFixed(0)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            {adjustments.length > 10 && (
              <div className="mt-4 text-center text-sm text-gray-500">
                ... und {adjustments.length - 10} weitere Anpassungen
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add Item Dialog */}
      <AddCountItemDialog
        open={showAddItemDialog}
        onOpenChange={setShowAddItemDialog}
        countId={countId}
        warehouseId={count.warehouseId}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: [`/api/retroactive-inventory/counts/${countId}`] });
          toast({
            title: "Artikel hinzugefügt",
            description: "Der Artikel wurde erfolgreich zur Inventur hinzugefügt."
          });
        }}
      />
    </div>
  );
}