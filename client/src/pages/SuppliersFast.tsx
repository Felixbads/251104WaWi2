import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Search, Package, Truck, Building2, Plus, ChevronRight, ArrowUpDown } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface FastSupplier {
  id: number;
  name: string;
  currentProducts: number;
  openDeliveries: number;
}

export default function SuppliersFast() {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'deliveries' | 'products'>('name');
  const [_, setLocation] = useLocation();

  // Fast suppliers query - only essential data
  const { data: suppliersData, isLoading, error } = useQuery({
    queryKey: ['/api/suppliers-fast/fast-overview'],
    staleTime: 30000, // 30 seconds cache
  });

  const suppliers = (suppliersData as any)?.data || [];

  // Filter and sort suppliers
  const filteredSuppliers = useMemo(() => {
    let filtered = suppliers;
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((supplier: FastSupplier) =>
        supplier.name.toLowerCase().includes(query)
      );
    }
    
    // Apply sorting
    const sorted = [...filtered].sort((a: FastSupplier, b: FastSupplier) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'deliveries':
          return b.openDeliveries - a.openDeliveries; // Descending order (highest first)
        case 'products':
          return b.currentProducts - a.currentProducts; // Descending order (highest first)
        default:
          return 0;
      }
    });
    
    return sorted;
  }, [suppliers, searchQuery, sortBy]);

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
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Lieferanten</h1>
              <p className="text-sm text-gray-600 mt-1">
                {filteredSuppliers.length} {filteredSuppliers.length === 1 ? 'Lieferant' : 'Lieferanten'}
              </p>
            </div>
            <Button onClick={handleCreateNew} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Neu
            </Button>
          </div>

          {/* Search and Sort */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Lieferant suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-600">Sortieren:</span>
              <Select value={sortBy} onValueChange={(value: 'name' | 'deliveries' | 'products') => setSortBy(value)}>
                <SelectTrigger className="w-48 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Alphabetisch (A-Z)</SelectItem>
                  <SelectItem value="deliveries">Lieferungen (meiste zuerst)</SelectItem>
                  <SelectItem value="products">Produkte (meiste zuerst)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4">
        <div className="max-w-2xl mx-auto space-y-3">
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
            <Card className="p-8 text-center">
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
                className="cursor-pointer hover:shadow-md active:scale-[0.98] transition-all duration-150"
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
                    
                    <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}