import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, BarChart3, RefreshCw, Search } from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import { MachineStockDisplay } from '@/components/MachineStockDisplay';

interface Machine {
  id: number;
  vendonId: string;
  machineName: string;
  locationName?: string;
}

export default function Fuellstaende() {
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Lade alle Maschinen
  const { data: machines = [], isLoading: machinesLoading } = useQuery({
    queryKey: ['/api/machines'],
    select: (data) => data?.filter((machine: Machine) => machine.vendonId && machine.vendonId !== '0')
  });

  // Filtere Maschinen basierend auf Suchterm
  const filteredMachines = machines.filter((machine: Machine) => 
    machine.machineName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    machine.vendonId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (machine.locationName && machine.locationName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Vorausgewählte Test-Maschinen (bekannt funktionierende)
  const testMachines = [
    { vendonId: '380053', name: 'Berggishübel (Test-Maschine)' },
    { vendonId: '391263', name: 'Pötzscha' },
    { vendonId: '323959', name: 'Bad Schandau' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Maschinenbestände"
        description="Echte Füllstand-Daten direkt von der Vendon API"
        icon={<BarChart3 className="h-6 w-6" />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Maschinenauswahl */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Maschine auswählen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Schnell-Test Buttons */}
              <div>
                <div className="text-sm font-medium mb-2">Test-Maschinen (bekannt funktionierende):</div>
                <div className="space-y-2">
                  {testMachines.map((testMachine) => (
                    <Button
                      key={testMachine.vendonId}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => setSelectedMachine({
                        id: parseInt(testMachine.vendonId),
                        vendonId: testMachine.vendonId,
                        machineName: testMachine.name
                      })}
                    >
                      {testMachine.name}
                      <Badge variant="secondary" className="ml-auto">
                        {testMachine.vendonId}
                      </Badge>
                    </Button>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="text-sm font-medium mb-2">Alle Maschinen durchsuchen:</div>
                
                {/* Suchfeld */}
                <Input
                  placeholder="Nach Name oder Vendon ID suchen..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="mb-3"
                />

                {/* Maschinenliste */}
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {machinesLoading ? (
                    <div className="text-center py-4 text-gray-500">
                      <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-2" />
                      Lade Maschinen...
                    </div>
                  ) : filteredMachines.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">
                      {searchTerm ? 'Keine Maschinen gefunden' : 'Keine Maschinen verfügbar'}
                    </div>
                  ) : (
                    filteredMachines.map((machine: Machine) => (
                      <Button
                        key={machine.id}
                        variant={selectedMachine?.id === machine.id ? "default" : "ghost"}
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => setSelectedMachine(machine)}
                      >
                        <div className="flex-1 text-left">
                          <div className="font-medium">{machine.machineName}</div>
                          {machine.locationName && (
                            <div className="text-xs text-gray-500">{machine.locationName}</div>
                          )}
                        </div>
                        <Badge variant="outline" className="ml-2">
                          {machine.vendonId}
                        </Badge>
                      </Button>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bestandsanzeige */}
        <div className="lg:col-span-2">
          {selectedMachine ? (
            <MachineStockDisplay
              vendonId={parseInt(selectedMachine.vendonId)}
              machineName={selectedMachine.machineName}
            />
          ) : (
            <Card className="h-64 flex items-center justify-center">
              <CardContent className="text-center space-y-3">
                <BarChart3 className="h-12 w-12 text-gray-400 mx-auto" />
                <div>
                  <div className="text-lg font-medium text-gray-900">
                    Maschine auswählen
                  </div>
                  <div className="text-sm text-gray-500">
                    Wählen Sie eine Maschine aus, um echte Füllstand-Daten anzuzeigen
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  Die Daten werden direkt von der Vendon API abgerufen
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Info-Hinweis */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <BarChart3 className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="space-y-1">
              <div className="text-sm font-medium text-blue-900">
                Echte Vendon API-Integration
              </div>
              <div className="text-sm text-blue-700">
                Diese Seite zeigt echte Bestandsdaten direkt von der Vendon Cloud API. 
                Die Daten enthalten aktuelle Füllstände (amount), maximale Kapazitäten (amount_max) 
                und kritische Bestände (amount_critical) für alle Produktplätze in der Maschine.
              </div>
              <div className="text-xs text-blue-600 mt-2">
                API-Endpunkt: /machine/{'{vendonId}'}/products
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}