import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useState, useMemo } from "react";
import { 
  RefreshCw, 
  Plus, 
  Edit, 
  Trash2, 
  Search,
  Filter,
  Download,
  Upload,
  RotateCcw,
  Star,
  Package,
  Settings,
  CheckCircle,
  AlertTriangle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

interface RefillTemplate {
  id: number;
  machineId: number;
  vendonId?: string;
  name: string;
  description?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: number;
  updatedBy?: number;
  products?: RefillTemplateProduct[];
  machineName?: string;
  machineLocation?: string;
  machineVendonId?: string;
}

interface RefillTemplateProduct {
  id: number;
  templateId: number;
  productId?: number;
  productName: string;
  quantity: number;
  minRefill?: number;
  maxCapacity?: number;
  position?: number;
}

interface Machine {
  id: number;
  machineName: string;
  vendonId: string;
  location?: string;
  status: string;
}

export default function RefillVorlagen() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMachine, setSelectedMachine] = useState<string>("all");
  const [selectedTemplate, setSelectedTemplate] = useState<RefillTemplate | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  // Fetch all machines first to get the list
  const { data: machines = [], isLoading: machinesLoading } = useQuery<Machine[]>({
    queryKey: ['/api/machines'],
    queryFn: async () => {
      const response = await fetch('/api/machines');
      if (!response.ok) {
        throw new Error('Failed to fetch machines');
      }
      return response.json();
    }
  });

  // Fetch refill templates for all machines
  const { data: allTemplates = [], isLoading: templatesLoading, refetch: refetchTemplates } = useQuery<RefillTemplate[]>({
    queryKey: ['/api/refill-templates/all'],
    queryFn: async () => {
      console.log('[REFILL-VORLAGEN] Fetching refill templates for all machines...');
      
      const allTemplates: RefillTemplate[] = [];
      
      // Fetch templates for each machine
      for (const machine of machines) {
        try {
          console.log(`[REFILL-VORLAGEN] Fetching templates for machine: ${machine.machineName} (ID: ${machine.id})`);
          
          const response = await fetch(`/api/machines/${machine.id}/refilltemplates`);
          if (response.ok) {
            const machineTemplates: RefillTemplate[] = await response.json();
            
            // Add machine info to each template
            const templatesWithMachineInfo = machineTemplates.map(template => ({
              ...template,
              machineName: machine.machineName,
              machineLocation: machine.location,
              machineVendonId: machine.vendonId
            }));
            
            allTemplates.push(...templatesWithMachineInfo);
            console.log(`[REFILL-VORLAGEN] Found ${machineTemplates.length} templates for ${machine.machineName}`);
          } else {
            console.warn(`[REFILL-VORLAGEN] Failed to fetch templates for machine ${machine.machineName}: ${response.status}`);
          }
        } catch (error) {
          console.error(`[REFILL-VORLAGEN] Error fetching templates for machine ${machine.machineName}:`, error);
        }
      }
      
      console.log(`[REFILL-VORLAGEN] Total templates found: ${allTemplates.length}`);
      return allTemplates;
    },
    enabled: machines.length > 0
  });

  // Filter templates based on search and machine selection
  const filteredTemplates = useMemo(() => {
    let filtered = allTemplates;
    
    // Filter by machine if selected
    if (selectedMachine !== "all") {
      filtered = filtered.filter(template => template.machineId.toString() === selectedMachine);
    }
    
    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(template => 
        template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (template.description && template.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        template.machineName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        template.machineLocation?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    return filtered;
  }, [allTemplates, selectedMachine, searchTerm]);

  // Find Pillnitz templates specifically
  const pillnitzTemplates = useMemo(() => {
    return allTemplates.filter(template => 
      template.machineName?.toLowerCase().includes('pillnitz') ||
      template.machineLocation?.toLowerCase().includes('pillnitz') ||
      template.name.toLowerCase().includes('pillnitz')
    );
  }, [allTemplates]);

  // Sync template to Vendon mutation
  const syncToVendonMutation = useMutation({
    mutationFn: async ({ machineId, templateId }: { machineId: number; templateId: number }) => {
      const response = await fetch(`/api/machines/${machineId}/refill-templates/${templateId}/sync-to-vendon`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Sync to Vendon failed');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Erfolgreich synchronisiert",
        description: "Refill-Vorlage wurde erfolgreich mit Vendon synchronisiert",
      });
      refetchTemplates();
    },
    onError: (error: Error) => {
      toast({
        title: "Synchronisation fehlgeschlagen",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Import from Vendon mutation
  const importFromVendonMutation = useMutation({
    mutationFn: async (machineId: number) => {
      const response = await fetch(`/api/machines/${machineId}/refill-templates/import-from-vendon`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Import from Vendon failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Import erfolgreich",
        description: `${data.imported} Refill-Vorlagen von Vendon importiert`,
      });
      refetchTemplates();
    },
    onError: (error: Error) => {
      toast({
        title: "Import fehlgeschlagen",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async ({ machineId, templateId }: { machineId: number; templateId: number }) => {
      const response = await fetch(`/api/machines/${machineId}/refilltemplates/${templateId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Delete failed');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Erfolgreich gelöscht",
        description: "Refill-Vorlage wurde erfolgreich gelöscht",
      });
      refetchTemplates();
    },
    onError: (error: Error) => {
      toast({
        title: "Löschen fehlgeschlagen",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleSyncToVendon = (template: RefillTemplate) => {
    syncToVendonMutation.mutate({ 
      machineId: template.machineId, 
      templateId: template.id 
    });
  };

  const handleImportFromVendon = (machineId: number) => {
    importFromVendonMutation.mutate(machineId);
  };

  const handleDeleteTemplate = (template: RefillTemplate) => {
    if (confirm(`Sind Sie sicher, dass Sie die Vorlage "${template.name}" löschen möchten?`)) {
      deleteTemplateMutation.mutate({ 
        machineId: template.machineId, 
        templateId: template.id 
      });
    }
  };

  const isLoading = machinesLoading || templatesLoading;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Refill-Vorlagen</h1>
            <p className="text-gray-600 mt-2">
              Verwalten Sie Auffüllungsvorlagen für alle Automaten
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => refetchTemplates()} 
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Aktualisieren
            </Button>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Neue Vorlage
            </Button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gesamt Vorlagen</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{allTemplates.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Automaten mit Vorlagen</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Set(allTemplates.map(t => t.machineId)).size}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Standard-Vorlagen</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {allTemplates.filter(t => t.isDefault).length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pillnitz Vorlagen</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {pillnitzTemplates.length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pillnitz Highlight Section */}
        {pillnitzTemplates.length > 0 && (
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="text-green-800 flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Pillnitz Refill-Vorlagen gefunden
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-green-700 mb-4">
                Es wurden {pillnitzTemplates.length} Refill-Vorlagen für Pillnitz gefunden:
              </p>
              <div className="space-y-2">
                {pillnitzTemplates.map(template => (
                  <div key={template.id} className="flex items-center justify-between bg-white p-3 rounded border">
                    <div>
                      <div className="font-medium text-green-800">{template.name}</div>
                      <div className="text-sm text-green-600">
                        {template.machineName} • {template.products?.length || 0} Produkte
                        {template.isDefault && <Badge className="ml-2 bg-green-100 text-green-800">Standard</Badge>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleSyncToVendon(template)}
                        disabled={syncToVendonMutation.isPending}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-4 items-center">
              <div className="flex-1">
                <Input
                  placeholder="Suche nach Vorlagenname, Automat oder Standort..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
              <Select value={selectedMachine} onValueChange={setSelectedMachine}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Automat auswählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Automaten</SelectItem>
                  {machines.map(machine => (
                    <SelectItem key={machine.id} value={machine.id.toString()}>
                      {machine.machineName} {machine.location && `(${machine.location})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                onClick={() => {
                  const machineId = selectedMachine === "all" ? machines[0]?.id : parseInt(selectedMachine);
                  if (machineId) handleImportFromVendon(machineId);
                }}
                disabled={importFromVendonMutation.isPending || selectedMachine === "all"}
              >
                <Download className="h-4 w-4 mr-2" />
                Von Vendon importieren
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Templates Table */}
        <Card>
          <CardHeader>
            <CardTitle>Refill-Vorlagen ({filteredTemplates.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="h-4 w-[250px]" />
                    <Skeleton className="h-4 w-[200px]" />
                    <Skeleton className="h-4 w-[100px]" />
                    <Skeleton className="h-4 w-[80px]" />
                  </div>
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Automat</TableHead>
                    <TableHead>Produkte</TableHead>
                    <TableHead>Standard</TableHead>
                    <TableHead>Erstellt</TableHead>
                    <TableHead>Vendon Sync</TableHead>
                    <TableHead>Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTemplates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                        {searchTerm || selectedMachine !== "all" 
                          ? "Keine Vorlagen entsprechen den Filterkriterien"
                          : "Keine Refill-Vorlagen gefunden"
                        }
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTemplates.map((template) => (
                      <TableRow key={`${template.machineId}-${template.id}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{template.name}</div>
                            {template.description && (
                              <div className="text-sm text-gray-500">{template.description}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{template.machineName}</div>
                            {template.machineLocation && (
                              <div className="text-sm text-gray-500">{template.machineLocation}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {template.products?.length || 0} Produkte
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {template.isDefault && (
                            <Badge className="bg-yellow-100 text-yellow-800">
                              <Star className="h-3 w-3 mr-1" />
                              Standard
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {format(parseISO(template.createdAt), "dd.MM.yyyy", { locale: de })}
                          </div>
                        </TableCell>
                        <TableCell>
                          {template.vendonId ? (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Synchronisiert
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Nicht synchronisiert
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedTemplate(template);
                                setShowEditDialog(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSyncToVendon(template)}
                              disabled={syncToVendonMutation.isPending}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeleteTemplate(template)}
                              disabled={deleteTemplateMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}