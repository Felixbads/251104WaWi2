import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Calendar, Package, AlertTriangle, CheckCircle, Clock, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CreateRetroactiveCountDialog } from '@/components/retroactive-inventory/CreateRetroactiveCountDialog';
import { RetroactiveCountDetail } from '@/components/retroactive-inventory/RetroactiveCountDetail';

interface RetroactiveInventoryCount {
  id: number;
  countName: string;
  countDate: string;
  warehouseId: number;
  warehouseName: string;
  status: 'draft' | 'finalized' | 'processed' | 'cancelled';
  isProcessed: boolean;
  totalItemsCount: number;
  totalDiscrepancies: number;
  hasNegativeStock: boolean;
  createdBy: number;
  createdByName: string;
  createdAt: string;
}

const statusConfig = {
  draft: { label: 'Entwurf', color: 'bg-gray-100 text-gray-800', icon: Clock },
  finalized: { label: 'Finalisiert', color: 'bg-blue-100 text-blue-800', icon: CheckCircle },
  processed: { label: 'Verarbeitet', color: 'bg-green-100 text-green-800', icon: Calculator },
  cancelled: { label: 'Abgebrochen', color: 'bg-red-100 text-red-800', icon: AlertTriangle },
};

export default function RetroactiveInventory() {
  const [selectedCountId, setSelectedCountId] = useState<number | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Lade alle retroaktiven Inventuren
  const { data: counts = [], isLoading } = useQuery({
    queryKey: ['/api/retroactive-inventory/counts'],
    queryFn: () => fetch('/api/retroactive-inventory/counts').then(res => res.json()),
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
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    const Icon = config.icon;
    
    return (
      <Badge className={config.color}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  const getDaysAgo = (dateString: string) => {
    const countDate = new Date(dateString);
    const today = new Date();
    const diffTime = today.getTime() - countDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (selectedCountId) {
    return (
      <RetroactiveCountDetail 
        countId={selectedCountId} 
        onBack={() => setSelectedCountId(null)} 
      />
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Retroaktive Inventur</h1>
          <p className="text-gray-600 mt-1">
            Nachträgliche Inventurzählungen und automatische Bestandsanpassungen
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Neue Inventur
        </Button>
      </div>

      {/* Info-Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamt Inventuren</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verarbeitet</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {counts.filter((c: RetroactiveInventoryCount) => c.isProcessed).length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entwürfe</CardTitle>
            <Clock className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {counts.filter((c: RetroactiveInventoryCount) => c.status === 'draft').length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mit Konflikten</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {counts.filter((c: RetroactiveInventoryCount) => c.hasNegativeStock).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Inventur-Liste */}
      <Card>
        <CardHeader>
          <CardTitle>Retroaktive Inventuren</CardTitle>
          <CardDescription>
            Übersicht aller nachträglichen Inventurzählungen und deren Status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2">Lade Inventuren...</span>
            </div>
          ) : counts.length === 0 ? (
            <div className="text-center py-8">
              <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Keine Inventuren vorhanden</h3>
              <p className="text-gray-600 mb-4">
                Erstellen Sie Ihre erste retroaktive Inventur, um nachträglich Bestände zu korrigieren.
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Erste Inventur erstellen
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {counts.map((count: RetroactiveInventoryCount) => (
                <div 
                  key={count.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setSelectedCountId(count.id)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg">{count.countName}</h3>
                        {getStatusBadge(count.status)}
                        {count.hasNegativeStock && (
                          <Badge className="bg-red-100 text-red-800">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Konflikte
                          </Badge>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>Stichtag: {formatDate(count.countDate)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Package className="w-4 h-4" />
                          <span>Lager: {count.warehouseName}</span>
                        </div>
                        <div>
                          Artikel: {count.totalItemsCount}
                        </div>
                        <div>
                          Abweichungen: {count.totalDiscrepancies}
                        </div>
                      </div>
                      
                      <div className="mt-2 text-xs text-gray-500">
                        Erstellt am {formatDateTime(count.createdAt)} von {count.createdByName}
                        {count.countDate && (
                          <span className="ml-2">
                            • Stichtag vor {getDaysAgo(count.countDate)} Tagen
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <Button variant="outline" size="sm">
                        Details anzeigen
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <CreateRetroactiveCountDialog 
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/retroactive-inventory/counts'] });
          toast({
            title: "Inventur erstellt",
            description: "Die retroaktive Inventur wurde erfolgreich erstellt."
          });
        }}
      />
    </div>
  );
}