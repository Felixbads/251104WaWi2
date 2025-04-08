import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Building2, ChevronRight } from 'lucide-react';
import { Link } from 'wouter';

type Warehouse = {
  id: number;
  name: string;
  description?: string;
  status?: string;
};

export default function WarehouseSidebar() {
  const [location] = useLocation();
  
  // Lade alle Lager für das dynamische Menü
  const { data: warehouses = [], isLoading, error } = useQuery({
    queryKey: ['/api/warehouses'],
    staleTime: 1000 * 60 * 5, // 5 Minuten Cache
  });

  // Prüfe, ob ein Pfad aktiv ist
  const isActive = (path: string) => {
    return location === path;
  };

  if (isLoading) {
    return (
      <div className="py-2 px-6">
        <div className="animate-pulse h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
        <div className="animate-pulse h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
        <div className="animate-pulse h-4 bg-gray-200 rounded w-2/3"></div>
      </div>
    );
  }

  if (error || !Array.isArray(warehouses)) {
    return (
      <div className="py-2 px-6 text-sm text-red-500">
        Fehler beim Laden der Lager
      </div>
    );
  }

  // Filter aktive Lager
  const activeWarehouses = warehouses.filter((warehouse: Warehouse) => 
    warehouse.status !== 'inactive' && warehouse.status !== 'deleted'
  );

  if (activeWarehouses.length === 0) {
    return (
      <div className="py-2 px-6 text-sm text-gray-500">
        Keine Lager verfügbar
      </div>
    );
  }

  return (
    <div className="py-1">
      {activeWarehouses.map((warehouse: Warehouse) => (
        <Link key={warehouse.id} href={`/warehouse/${warehouse.id}`}>
          <div
            className={`flex items-center px-9 py-1.5 text-sm font-medium cursor-pointer ${
              isActive(`/warehouse/${warehouse.id}`)
                ? "text-primary-600 bg-primary-50"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <ChevronRight className="h-3 w-3 mr-2" />
            <span className="truncate">{warehouse.name}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}