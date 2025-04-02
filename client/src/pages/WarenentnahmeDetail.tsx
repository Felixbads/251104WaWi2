import React, { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clipboard,
  PackageOpen,
  Trash2,
  X,
  RefreshCw,
  Download,
  FileText
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/api';
import {
  getProductDisposal,
  updateProductDisposalStatus,
  ProductDisposal,
  ProductDisposalItem
} from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import PageHeader from '@/components/layout/PageHeader';
import { TooltipProvider } from '@/components/ui/tooltip';

export default function WarenentnahmeDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("details");
  const { toast } = useToast();

  // API-Anfragen
  const {
    data: disposal,
    isLoading: isLoadingDisposal,
    isError: isErrorDisposal,
    error: disposalError,
    refetch: refetchDisposal
  } = useQuery({
    queryKey: ['/api/product-disposals', id],
    queryFn: () => id ? getProductDisposal(Number(id)) : Promise.reject('ID ist erforderlich'),
    enabled: !!id,
  });

  // Status-Änderung
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number, status: string }) => 
      updateProductDisposalStatus(id, status),
    onSuccess: () => {
      toast({
        title: "Status aktualisiert",
        description: "Der Status der Warenentnahme wurde erfolgreich aktualisiert.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/product-disposals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/product-disposals', id] });
    },
    onError: (error: any) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Aktualisieren des Status: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  // Status-Änderungen
  const handleCompleteDisposal = () => {
    if (!disposal) return;
    updateStatusMutation.mutate({ id: disposal.id, status: 'completed' });
  };

  const handleCancelDisposal = () => {
    if (!disposal) return;
    updateStatusMutation.mutate({ id: disposal.id, status: 'cancelled' });
  };

  // Function to handle refresh
  const handleRefresh = () => {
    refetchDisposal();
  };
  
  // Function to export data
  const handleExport = () => {
    toast({
      title: "Info",
      description: "Export-Funktion wird implementiert."
    });
  };
  
  // Function to generate report
  const handleGenerateReport = () => {
    toast({
      title: "Info",
      description: "Bericht-Funktion wird implementiert."
    });
  };

  // Lade-/Fehlerzustand
  if (isLoadingDisposal) {
    return (
      <div className="container space-y-6">
        <PageHeader
          showRefresh={true}
          additionalButtons={
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setLocation('/warenentnahme')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          }
          onRefresh={handleRefresh}
        />
        
        <div className="mb-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2 mt-2" />
        </div>
        
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2 mt-2" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isErrorDisposal) {
    return (
      <div className="container space-y-6">
        <PageHeader
          additionalButtons={
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setLocation('/warenentnahme')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          }
        />
        
        <Card>
          <CardContent className="p-8">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-medium mb-2">Warenentnahme konnte nicht geladen werden</h2>
              <p className="text-gray-500 mb-4">
                {disposalError instanceof Error ? disposalError.message : "Ein unbekannter Fehler ist aufgetreten."}
              </p>
              <Button onClick={() => setLocation('/warenentnahme')}>
                Zurück zur Übersicht
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!disposal) {
    return (
      <div className="container space-y-6">
        <PageHeader
          additionalButtons={
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setLocation('/warenentnahme')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          }
        />
        
        <Card>
          <CardContent className="p-8">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
              <h2 className="text-xl font-medium mb-2">Warenentnahme nicht gefunden</h2>
              <p className="text-gray-500 mb-4">
                Die angeforderte Warenentnahme konnte nicht gefunden werden.
              </p>
              <Button onClick={() => setLocation('/warenentnahme')}>
                Zurück zur Übersicht
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Status Badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800">Ausstehend</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-green-100 text-green-800">Abgeschlossen</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-red-100 text-red-800">Storniert</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Gesamtmenge berechnen
  const totalQuantity = disposal.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="container space-y-6">
      <PageHeader
        showRefresh={true}
        showDownload={true}
        additionalButtons={
          <TooltipProvider>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setLocation('/warenentnahme')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={handleGenerateReport}>
                <FileText className="h-4 w-4 mr-2" />
                Bericht
              </Button>
              {disposal.status === 'pending' && (
                <>
                  <Button
                    variant="outline"
                    onClick={handleCancelDisposal}
                    disabled={updateStatusMutation.isPending}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Stornieren
                  </Button>
                  <Button 
                    onClick={handleCompleteDisposal}
                    disabled={updateStatusMutation.isPending}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Abschließen
                  </Button>
                </>
              )}
            </div>
          </TooltipProvider>
        }
        onRefresh={handleRefresh}
        onDownload={handleExport}
      />
      
      <div>
        <h1 className="text-2xl font-bold">Warenentnahme #{disposal.id}</h1>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>{getStatusBadge(disposal.status)}</span>
          <span className="text-sm">vom {formatDateTime(disposal.createdAt)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Linke Spalte - Basisinfo */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-lg">Basisinformationen</CardTitle>
                  <CardDescription>Details zur Warenentnahme</CardDescription>
                </div>
                {getStatusBadge(disposal.status)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Warenentnahme ID</p>
                  <p>{disposal.id}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Erstellungsdatum</p>
                  <p>{formatDateTime(disposal.createdAt)}</p>
                </div>
                {disposal.completedAt && (
                  <div>
                    <p className="text-sm font-medium text-gray-500">Abschlussdatum</p>
                    <p>{formatDateTime(disposal.completedAt)}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-gray-500">Lager</p>
                  <p>{disposal.warehouseName}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Grund</p>
                  <p>{disposal.reason || "Nicht angegeben"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Angelegt von</p>
                  <p>{disposal.createdByName || "System"}</p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex-col items-start gap-3">
              <Separator className="my-2" />
              <div className="space-y-2 w-full">
                <div className="flex justify-between">
                  <span className="text-gray-500">Gesamtmenge:</span>
                  <span className="font-medium">{totalQuantity} Stk.</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Anzahl unterschiedlicher Produkte:</span>
                  <span className="font-medium">{disposal.items.length}</span>
                </div>
              </div>
              
              {/* Aktionsbuttons */}
              {disposal.status === 'pending' && (
                <div className="flex flex-col w-full gap-2 mt-4">
                  <Button 
                    onClick={handleCompleteDisposal}
                    disabled={updateStatusMutation.isPending}
                    className="gap-1"
                  >
                    <Check className="h-4 w-4" />
                    Warenentnahme abschließen
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleCancelDisposal}
                    disabled={updateStatusMutation.isPending}
                    className="gap-1"
                  >
                    <X className="h-4 w-4" />
                    Stornieren
                  </Button>
                </div>
              )}
            </CardFooter>
          </Card>
        </div>

        {/* Rechte Spalte - Produktdetails */}
        <div className="lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-1">
              <TabsTrigger value="details">Produktdetails</TabsTrigger>
            </TabsList>
            
            {/* Produktdetails Tab */}
            <TabsContent value="details" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Entnommene Produkte</CardTitle>
                  <CardDescription>Überlagerte oder beschädigte Produkte, die aus dem Lager entnommen wurden</CardDescription>
                </CardHeader>
                <CardContent>
                  {disposal.items.length === 0 ? (
                    <div className="text-center py-8">
                      <PackageOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Keine Produktdetails verfügbar</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produkt</TableHead>
                          <TableHead>Menge</TableHead>
                          <TableHead>Grund</TableHead>
                          <TableHead>Lagerbestand</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {disposal.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.productName}</TableCell>
                            <TableCell>{item.quantity} Stk.</TableCell>
                            <TableCell>{item.reason || disposal.reason || '-'}</TableCell>
                            <TableCell>
                              {item.previousStock !== null && item.currentStock !== null ? (
                                <div className="flex flex-col text-xs">
                                  <span>Vorher: {item.previousStock} Stk.</span>
                                  <span>Nachher: {item.currentStock} Stk.</span>
                                </div>
                              ) : (
                                <span className="text-gray-500">Keine Daten</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
                <CardFooter className="border-t pt-4">
                  <div className="text-xs text-gray-500">
                    {disposal.description ? disposal.description : 
                     `Warenentnahme ${disposal.id} vom ${formatDateTime(disposal.createdAt, 'date')}`}
                  </div>
                </CardFooter>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}