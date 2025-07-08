import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Search, Package, Truck, Building2, Plus, ChevronRight, Shield, QrCode, Clock, MessageSquare } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface FastSupplier {
  id: number;
  name: string;
  currentProducts: number;
  openDeliveries: number;
}

interface SupplierPortalData {
  activePins: any[];
  feedback: any[];
  portalUrl: string | null;
  lastAccess: string | null;
  totalAccess: number;
}

// Portal Analytics Component
function SupplierPortalAnalytics({ supplierId, supplierName }: { supplierId: number; supplierName: string }) {
  const [isGeneratingPin, setIsGeneratingPin] = useState(false);

  const { data: portalData, isLoading, refetch } = useQuery<{ success: boolean; data: SupplierPortalData }>({
    queryKey: [`/api/supplier-portal/admin/analytics/${supplierId}`],
    enabled: !!supplierId,
  });

  const handleGeneratePin = async () => {
    try {
      setIsGeneratingPin(true);
      const response = await fetch(`/api/supplier-portal/admin/generate-pin/${supplierId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber: `MANUAL-${Date.now()}` })
      });

      if (response.ok) {
        refetch();
      }
    } catch (error) {
      console.error('Error generating PIN:', error);
    } finally {
      setIsGeneratingPin(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  const data = portalData?.data;

  return (
    <div className="space-y-4">
      {/* Portal Access Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5" />
            Portal-Zugang
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data?.portalUrl ? (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Portal-Link:</div>
              <div className="bg-blue-50 p-3 rounded border flex items-center justify-between">
                <code className="text-sm text-blue-700 break-all">{data.portalUrl}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(data.portalUrl!, '_blank')}
                >
                  Öffnen
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Kein aktiver Portal-Zugang</p>
            </div>
          )}

          <Button
            onClick={handleGeneratePin}
            disabled={isGeneratingPin}
            className="w-full"
          >
            <QrCode className="h-4 w-4 mr-2" />
            {isGeneratingPin ? 'Generiere...' : 'Neuen PIN generieren'}
          </Button>
        </CardContent>
      </Card>

      {/* PIN Information */}
      {data?.activePins && data.activePins.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <QrCode className="h-5 w-5" />
              Aktive PINs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.activePins.map((pin: any) => (
                <div key={pin.id} className="border rounded p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="font-mono text-lg font-bold text-green-600">
                      PIN: {pin.pin_code}
                    </div>
                    <Badge variant="outline">
                      {new Date(pin.valid_until).toLocaleDateString('de-DE')}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Zugriffe: {pin.access_count || 0} • 
                    Erstellt: {new Date(pin.created_at).toLocaleDateString('de-DE')}
                  </div>
                  {pin.last_access_at && (
                    <div className="text-sm text-blue-600">
                      Letzter Zugriff: {new Date(pin.last_access_at).toLocaleString('de-DE')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Access Statistics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5" />
            Zugriffs-Statistiken
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{data?.totalAccess || 0}</div>
              <div className="text-sm text-muted-foreground">Gesamt-Zugriffe</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {data?.lastAccess ? new Date(data.lastAccess).toLocaleDateString('de-DE') : '---'}
              </div>
              <div className="text-sm text-muted-foreground">Letzter Zugriff</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feedback Overview */}
      {data?.feedback && data.feedback.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5" />
              Rückmeldungen ({data.feedback.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {data.feedback.map((feedback: any) => (
                <div key={feedback.id} className="border rounded p-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{feedback.feedback_type}</div>
                      <div className="text-sm text-muted-foreground">
                        {feedback.entity_type} • {feedback.field_name}
                      </div>
                    </div>
                    <Badge variant={
                      feedback.status === 'completed' ? 'default' : 
                      feedback.status === 'in_progress' ? 'secondary' : 'outline'
                    }>
                      {feedback.status || 'pending'}
                    </Badge>
                  </div>
                  {feedback.comment && (
                    <div className="text-sm bg-gray-50 p-2 rounded">
                      "{feedback.comment}"
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {new Date(feedback.created_at).toLocaleString('de-DE')}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function SuppliersFast() {
  const [searchQuery, setSearchQuery] = useState('');
  const [_, setLocation] = useLocation();

  // Fast suppliers query - only essential data
  const { data: suppliersData, isLoading, error } = useQuery({
    queryKey: ['/api/suppliers-fast/fast-overview'],
    staleTime: 30000, // 30 seconds cache
  });

  const suppliers = (suppliersData as any)?.data || [];

  // Filter suppliers based on search
  const filteredSuppliers = useMemo(() => {
    if (!searchQuery.trim()) return suppliers;
    
    const query = searchQuery.toLowerCase();
    return suppliers.filter((supplier: FastSupplier) =>
      supplier.name.toLowerCase().includes(query)
    );
  }, [suppliers, searchQuery]);

  const handleSupplierClick = (supplierId: number) => {
    setLocation(`/lieferanten/${supplierId}`);
  };

  const handleCreateNew = () => {
    setLocation('/lieferanten/new');
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6">
        <div className="max-w-lg mx-auto">
          <Card className="p-6 text-center">
            <div className="text-red-500 mb-2">
              <Building2 className="h-8 w-8 mx-auto" />
            </div>
            <h3 className="font-medium mb-2">Fehler beim Laden</h3>
            <p className="text-sm text-muted-foreground">
              Die Lieferanten konnten nicht geladen werden.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Lieferanten</h1>
              <p className="text-sm text-gray-600 mt-1">
                Verwalten Sie Ihre Lieferanten und Portal-Zugänge
              </p>
            </div>
            <Button onClick={handleCreateNew} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Neu
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4">
        <div className="max-w-6xl mx-auto">
          <Tabs defaultValue="suppliers" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="suppliers" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Lieferanten-Übersicht
              </TabsTrigger>
              <TabsTrigger value="portal" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Portal-Zugang
              </TabsTrigger>
            </TabsList>

            <TabsContent value="suppliers" className="space-y-4">
              {/* Search */}
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Lieferant suchen..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-10"
                />
              </div>

              <div className="text-sm text-muted-foreground mb-4">
                {filteredSuppliers.length} {filteredSuppliers.length === 1 ? 'Lieferant' : 'Lieferanten'}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {isLoading ? (
                  // Loading skeleton
                  Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i} className="animate-pulse">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                            <div className="flex gap-4">
                              <div className="h-3 bg-gray-200 rounded w-16"></div>
                              <div className="h-3 bg-gray-200 rounded w-16"></div>
                            </div>
                          </div>
                          <div className="h-5 w-5 bg-gray-200 rounded"></div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : filteredSuppliers.length === 0 ? (
                  // Empty state
                  <Card className="p-8 text-center col-span-full">
                    <Building2 className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                    <h3 className="font-medium text-gray-900 mb-2">
                      {searchQuery ? 'Keine Lieferanten gefunden' : 'Keine Lieferanten vorhanden'}
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                      {searchQuery 
                        ? 'Versuchen Sie andere Suchbegriffe.'
                        : 'Erstellen Sie Ihren ersten Lieferanten.'
                      }
                    </p>
                    {!searchQuery && (
                      <Button onClick={handleCreateNew}>
                        <Plus className="h-4 w-4 mr-2" />
                        Ersten Lieferanten erstellen
                      </Button>
                    )}
                  </Card>
                ) : (
                  // Suppliers list
                  filteredSuppliers.map((supplier: FastSupplier) => (
                    <Card
                      key={supplier.id}
                      className="cursor-pointer hover:shadow-md transition-all duration-150"
                      onClick={() => handleSupplierClick(supplier.id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-gray-900 truncate mb-2">
                              {supplier.name}
                            </h3>
                            
                            <div className="flex items-center gap-4 text-sm">
                              {/* Products */}
                              <div className="flex items-center gap-1 text-gray-600">
                                <Package className="h-3.5 w-3.5" />
                                <span>{supplier.currentProducts}</span>
                                <span className="text-xs">Produkte</span>
                              </div>
                              
                              {/* Deliveries */}
                              <div className="flex items-center gap-1">
                                <Truck className="h-3.5 w-3.5" />
                                <span>{supplier.openDeliveries}</span>
                                <span className="text-xs">Lieferungen</span>
                                {supplier.openDeliveries > 0 && (
                                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                                    {supplier.openDeliveries}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                  }}
                                >
                                  <Shield className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                                <DialogHeader>
                                  <DialogTitle className="flex items-center gap-2">
                                    <Shield className="h-5 w-5" />
                                    Portal-Zugang: {supplier.name}
                                  </DialogTitle>
                                </DialogHeader>
                                <SupplierPortalAnalytics 
                                  supplierId={supplier.id} 
                                  supplierName={supplier.name} 
                                />
                              </DialogContent>
                            </Dialog>
                            <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="portal" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {suppliers.map((supplier: FastSupplier) => (
                  <Card key={supplier.id} className="h-fit">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        {supplier.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <SupplierPortalAnalytics 
                        supplierId={supplier.id} 
                        supplierName={supplier.name} 
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}