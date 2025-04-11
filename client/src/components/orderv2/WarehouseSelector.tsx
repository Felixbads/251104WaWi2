import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Warehouse, Building2, Search, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

type WarehouseSelectorProps = {
  selectedWarehouseId: number | null;
  onSelectWarehouse: (id: number, name: string) => void;
};

interface WarehouseType {
  id: number;
  name: string;
  description?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  status?: string;
  notes?: string;
}

const WarehouseSelector: React.FC<WarehouseSelectorProps> = ({
  selectedWarehouseId,
  onSelectWarehouse
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Fetch warehouses
  const { data: warehouses, isLoading, error } = useQuery<WarehouseType[]>({
    queryKey: ['/api/warehouses'],
    staleTime: 60000, // 1 minute
  });
  
  // Filter warehouses based on search query
  const filteredWarehouses = warehouses?.filter(warehouse => 
    warehouse.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (warehouse.city && warehouse.city.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (warehouse.description && warehouse.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  
  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Lager suchen..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>
      
      {isLoading ? (
        <div className="flex justify-center items-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2">Lager werden geladen...</span>
        </div>
      ) : error ? (
        <div className="text-center text-destructive py-8">
          Fehler beim Laden der Lager. Bitte versuchen Sie es später erneut.
        </div>
      ) : filteredWarehouses?.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          Keine Lager gefunden. Bitte versuchen Sie eine andere Suche.
        </div>
      ) : (
        <ScrollArea className="h-[400px] pr-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredWarehouses?.map(warehouse => (
              <Card 
                key={warehouse.id}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  selectedWarehouseId === warehouse.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => onSelectWarehouse(warehouse.id, warehouse.name)}
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center">
                        <Building2 className="h-5 w-5 mr-2 text-primary" />
                        <h3 className="font-medium text-lg truncate">{warehouse.name}</h3>
                      </div>
                      
                      {(warehouse.city || warehouse.address) && (
                        <div className="text-sm text-muted-foreground mt-1">
                          {warehouse.address && `${warehouse.address}, `}
                          {warehouse.postalCode && `${warehouse.postalCode} `}
                          {warehouse.city}
                        </div>
                      )}
                      
                      {warehouse.description && (
                        <p className="text-sm mt-2 line-clamp-2">{warehouse.description}</p>
                      )}
                    </div>
                    
                    {warehouse.status && (
                      <Badge variant={warehouse.status === 'active' ? 'default' : 'secondary'}>
                        {warehouse.status === 'active' ? 'Aktiv' : warehouse.status}
                      </Badge>
                    )}
                  </div>
                  
                  {selectedWarehouseId === warehouse.id && (
                    <div className="mt-4">
                      <Badge variant="outline" className="bg-primary/10">
                        Ausgewählt
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default WarehouseSelector;