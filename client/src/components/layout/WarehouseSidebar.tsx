import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Building2, Package, BarChart2 } from 'lucide-react';
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
  
  // Debug-Informationen anzeigen
  console.log("WarehouseSidebar wird gerendert. Warehouses:", warehouses);

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
      {/* Überblicksseite für alle Lager */}
      <Link href="/lagerbestand">
        <div
          className={`flex items-center px-6 py-2 text-sm font-medium cursor-pointer ${
            isActive(`/lagerbestand`)
              ? "text-primary-600 bg-primary-50"
              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          }`}
        >
          <BarChart2 className="h-4 w-4 mr-3" />
          <span className="truncate">Lagerbestand Übersicht</span>
        </div>
      </Link>
      
      {/* Liste aller einzelnen Lager */}
      {activeWarehouses.map((warehouse: Warehouse) => (
        <Link key={warehouse.id} href={`/lagerbestand/${warehouse.id}`}>
          <div
            className={`flex items-center px-6 py-2 text-sm font-medium cursor-pointer ${
              isActive(`/lagerbestand/${warehouse.id}`)
                ? "text-primary-600 bg-primary-50"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <Building2 className="h-4 w-4 mr-3" />
            <span className="truncate">{warehouse.name}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}