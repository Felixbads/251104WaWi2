import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2, Mail, Phone, MapPin, Building, Truck } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

type SupplierSelectorProps = {
  selectedSupplierId: number | null;
  onSelectSupplier: (id: number, name: string) => void;
};

interface SupplierType {
  id: number;
  name: string;
  description?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  website?: string;
  status?: string;
  type?: string;
  notes?: string;
  is_active?: boolean;
}

const SupplierSelector: React.FC<SupplierSelectorProps> = ({
  selectedSupplierId,
  onSelectSupplier
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Fetch suppliers
  const { data: suppliersResponse, isLoading, error } = useQuery<{ data: SupplierType[] }>({
    queryKey: ['/api/suppliers'],
    staleTime: 60000, // 1 minute
  });
  
  // Extract suppliers array from response
  const suppliers = suppliersResponse?.data || [];
  
  // Filter suppliers based on search query
  const filteredSuppliers = suppliers?.filter(supplier => 
    supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (supplier.contact_person && supplier.contact_person.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (supplier.city && supplier.city.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (supplier.description && supplier.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  
  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Lieferanten suchen..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>
      
      {isLoading ? (
        <div className="flex justify-center items-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2">Lieferanten werden geladen...</span>
        </div>
      ) : error ? (
        <div className="text-center text-destructive py-8">
          Fehler beim Laden der Lieferanten. Bitte versuchen Sie es später erneut.
        </div>
      ) : filteredSuppliers?.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          Keine Lieferanten gefunden. Bitte versuchen Sie eine andere Suche.
        </div>
      ) : (
        <ScrollArea className="h-[400px] pr-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSuppliers?.map(supplier => (
              <Card 
                key={supplier.id}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  selectedSupplierId === supplier.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => onSelectSupplier(supplier.id, supplier.name)}
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center">
                        <Truck className="h-5 w-5 mr-2 text-primary" />
                        <h3 className="font-medium text-lg truncate">{supplier.name}</h3>
                      </div>
                      
                      {supplier.description && (
                        <p className="text-sm mt-1 text-muted-foreground">{supplier.description}</p>
                      )}
                      
                      <div className="space-y-1 mt-2">
                        {(supplier.city || supplier.address) && (
                          <div className="flex items-center text-sm text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5 mr-2" />
                            <span className="truncate">
                              {supplier.address && `${supplier.address}, `}
                              {supplier.postal_code && `${supplier.postal_code} `}
                              {supplier.city}
                            </span>
                          </div>
                        )}
                        
                        {supplier.contact_person && (
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Building className="h-3.5 w-3.5 mr-2" />
                            <span>{supplier.contact_person}</span>
                          </div>
                        )}
                        
                        {supplier.phone && (
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Phone className="h-3.5 w-3.5 mr-2" />
                            <span>{supplier.phone}</span>
                          </div>
                        )}
                        
                        {supplier.email && (
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Mail className="h-3.5 w-3.5 mr-2" />
                            <span className="truncate">{supplier.email}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-1">
                      {supplier.status && (
                        <Badge variant={supplier.status === 'active' ? 'default' : 'secondary'}>
                          {supplier.status === 'active' ? 'Aktiv' : supplier.status}
                        </Badge>
                      )}
                      
                      {supplier.type && (
                        <Badge variant="outline">
                          {supplier.type}
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  {selectedSupplierId === supplier.id && (
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

export default SupplierSelector;