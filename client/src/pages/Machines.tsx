import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { getMachines, formatDateTime } from "@/lib/api";
import { Search, RefreshCcw, Settings, AlertCircle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Machines() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");

  // Query to get machines
  const { data: machines, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/machines'],
    queryFn: () => getMachines(),
  });

  // Function to determine the status badge color
  const getStatusBadgeColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "active":
      case "online":
        return <Badge variant="success" className="bg-green-500">
          <CheckCircle className="h-3 w-3 mr-1" /> Aktiv
        </Badge>;
      case "inactive":
      case "offline":
        return <Badge variant="destructive">
          <AlertCircle className="h-3 w-3 mr-1" /> Inaktiv
        </Badge>;
      case "maintenance":
        return <Badge variant="secondary" className="bg-yellow-500 text-white">
          <Settings className="h-3 w-3 mr-1" /> Wartung
        </Badge>;
      default:
        return <Badge variant="outline">Unbekannt</Badge>;
    }
  };

  // Handle machine settings click
  const handleMachineSettings = (machineId: number) => {
    toast({
      title: "Maschineneinstellungen",
      description: `Einstellungen für Maschine #${machineId} wurden geöffnet.`,
    });
  };

  // Filter machines based on search query
  const filteredMachines = machines?.filter(machine => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      machine.machineName?.toLowerCase().includes(query) ||
      machine.machineType?.toLowerCase().includes(query) ||
      machine.model?.toLowerCase().includes(query) ||
      machine.serialNumber?.toLowerCase().includes(query) ||
      machine.status?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Maschinen</CardTitle>
          <CardDescription>
            Alle registrierten Maschinen im Vendon-System
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
            {/* Search Field */}
            <div className="relative flex-grow max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <Input
                className="pl-10"
                placeholder="Nach Maschinen suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Refresh Button */}
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCcw className="h-4 w-4 mr-2" />
              Aktualisieren
            </Button>
          </div>

          {/* Machines Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, index) => (
                <Card key={index} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-6 w-1/4" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-8 w-8 rounded-full" />
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : error ? (
              <div className="col-span-full">
                <Card className="bg-red-50 border-red-200">
                  <CardContent className="p-4">
                    <div className="flex items-center text-red-600">
                      <AlertCircle className="h-5 w-5 mr-2" />
                      <p>Fehler beim Laden der Maschinen: {error instanceof Error ? error.message : "Unbekannter Fehler"}</p>
                    </div>
                    <Button variant="outline" className="mt-3" onClick={() => refetch()}>
                      Erneut versuchen
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : filteredMachines && filteredMachines.length > 0 ? (
              filteredMachines.map((machine) => (
                <Card key={machine.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="text-lg font-medium text-gray-900 truncate">
                        {machine.machineName || "Unbenannte Maschine"}
                      </h3>
                      {getStatusBadgeColor(machine.status || "")}
                    </div>
                    <div className="space-y-1 text-sm text-gray-600">
                      <p><span className="font-medium">Typ:</span> {machine.machineType || "N/A"}</p>
                      <p><span className="font-medium">Modell:</span> {machine.model || "N/A"}</p>
                      <p><span className="font-medium">Seriennummer:</span> {machine.serialNumber || "N/A"}</p>
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
                      <span className="text-xs text-gray-500">
                        Letzte Synchronisierung: {machine.lastSync ? formatDateTime(machine.lastSync) : "Nie"}
                      </span>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleMachineSettings(machine.id)}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="col-span-full">
                <Card className="bg-gray-50">
                  <CardContent className="p-6 text-center">
                    <p className="text-gray-500">Keine Maschinen gefunden</p>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
