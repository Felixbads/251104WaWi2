import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { format, parseISO, isValid } from "date-fns";
import { de } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

// UI-Komponenten
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// Icons
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Play,
  Pause,
  MoreVertical,
  CalendarCheck,
  RefreshCw,
  Eye,
  Settings,
  Clock,
  User,
  Building,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import RecurringOrderForm from "./RecurringOrderForm";
import RecurringOrderDetails from "./RecurringOrderDetails";

interface RecurringOrder {
  id: number;
  name: string;
  description?: string;
  supplierId: number;
  supplierName: string;
  warehouseId: number;
  warehouseName: string;
  interval: string;
  intervalValue: number;
  weekday?: string;
  dayOfMonth?: number;
  startDate: string;
  endDate?: string;
  nextExecutionDate: string;
  isActive: boolean;
  isAutoGenerate: boolean;
  category?: string;
  priority: string;
  deliveryType: string;
  autoCreateInGoods: boolean;
  requiresApproval: boolean;
  totalExecutions: number;
  lastExecutionDate?: string;
  notes?: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

interface RecurringOrdersStats {
  total: number;
  active: number;
  inactive: number;
}

export default function RecurringOrdersTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<RecurringOrder | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const { toast } = useToast();

  // Wiederkehrende Bestellungen abrufen
  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ["/api/recurring-orders"],
    queryFn: async () => {
      const response = await fetch("/api/recurring-orders");
      if (!response.ok) {
        throw new Error("Fehler beim Laden der wiederkehrenden Bestellungen");
      }
      const result = await response.json();
      return result.data || [];
    }
  });

  // Dashboard-Statistiken abrufen
  const { data: dashboardStats } = useQuery({
    queryKey: ["/api/recurring-orders/dashboard/stats"],
    queryFn: async () => {
      const response = await fetch("/api/recurring-orders/dashboard/stats");
      if (!response.ok) {
        throw new Error("Fehler beim Laden der Dashboard-Statistiken");
      }
      const result = await response.json();
      return result.data;
    }
  });

  // Wiederkehrende Bestellung löschen
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/recurring-orders/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Fehler beim Löschen der wiederkehrenden Bestellung");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-orders/dashboard/stats"] });
      toast({
        title: "Erfolg",
        description: "Wiederkehrende Bestellung wurde gelöscht",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Fehler beim Löschen der wiederkehrenden Bestellung",
      });
    },
  });

  // Wiederkehrende Bestellung aktivieren/deaktivieren
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const response = await fetch(`/api/recurring-orders/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive }),
      });
      if (!response.ok) {
        throw new Error("Fehler beim Aktualisieren der wiederkehrenden Bestellung");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-orders/dashboard/stats"] });
    },
  });

  // Manuelle Ausführung
  const executeMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/recurring-orders/${id}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scheduledDate: new Date().toISOString().split('T')[0]
        }),
      });
      if (!response.ok) {
        throw new Error("Fehler bei der manuellen Ausführung");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-orders"] });
      toast({
        title: "Erfolg",
        description: `Bestellung erfolgreich erstellt: ${data.data.orderNumber}`,
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Fehler bei der manuellen Ausführung",
      });
    },
  });

  // Filter für Suchbegriff
  const filteredOrders = orders.filter((order: RecurringOrder) =>
    order.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.warehouseName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Status-Badge für Wiederkehrende Bestellungen
  const getStatusBadge = (order: RecurringOrder) => {
    if (!order.isActive) {
      return <Badge variant="secondary">Inaktiv</Badge>;
    }
    if (order.requiresApproval) {
      return <Badge variant="outline">Genehmigung erforderlich</Badge>;
    }
    return <Badge variant="default">Aktiv</Badge>;
  };

  // Prioritäts-Badge
  const getPriorityBadge = (priority: string) => {
    const colors = {
      low: "bg-gray-100 text-gray-700",
      normal: "bg-blue-100 text-blue-700",
      high: "bg-orange-100 text-orange-700",
      urgent: "bg-red-100 text-red-700",
    };
    return (
      <Badge className={colors[priority as keyof typeof colors] || colors.normal}>
        {priority === "low" ? "Niedrig" : 
         priority === "normal" ? "Normal" : 
         priority === "high" ? "Hoch" : "Dringend"}
      </Badge>
    );
  };

  // Intervall-Text formatieren
  const formatInterval = (order: RecurringOrder) => {
    const { interval, intervalValue, weekday, dayOfMonth } = order;
    
    switch (interval) {
      case "weekly":
        const weekdays = {
          monday: "Montag", tuesday: "Dienstag", wednesday: "Mittwoch",
          thursday: "Donnerstag", friday: "Freitag", saturday: "Samstag", sunday: "Sonntag"
        };
        return `Wöchentlich (${weekdays[weekday as keyof typeof weekdays] || weekday})`;
      case "biweekly":
        return "Alle 2 Wochen";
      case "triweekly":
        return "Alle 3 Wochen";
      case "monthly":
        return `Monatlich (${dayOfMonth}. Tag)`;
      default:
        return interval;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-6 w-6 animate-spin mr-2" />
        Laden der wiederkehrenden Bestellungen...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-600">
        Fehler beim Laden der wiederkehrenden Bestellungen
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header und Statistiken */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Gesamt</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats?.statistics?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Aktiv</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{dashboardStats?.statistics?.active || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Inaktiv</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-500">{dashboardStats?.statistics?.inactive || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Nächste Woche</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {dashboardStats?.upcomingExecutions?.length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Such- und Aktionsbereich */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>Wiederkehrende Bestellungen</CardTitle>
              <CardDescription>
                Verwalten Sie automatische Bestellungen mit konfigurierbaren Intervallen
              </CardDescription>
            </div>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Neue wiederkehrende Bestellung
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Neue wiederkehrende Bestellung erstellen</DialogTitle>
                  <DialogDescription>
                    Erstellen Sie eine neue automatische Bestellung mit konfigurierbaren Intervallen
                  </DialogDescription>
                </DialogHeader>
                <RecurringOrderForm 
                  onSuccess={() => {
                    setShowCreateDialog(false);
                    queryClient.invalidateQueries({ queryKey: ["/api/recurring-orders"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/recurring-orders/dashboard/stats"] });
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* Suchfeld */}
          <div className="flex items-center space-x-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Nach Name, Lieferant oder Lager suchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Tabelle der wiederkehrenden Bestellungen */}
          {filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchTerm ? "Keine wiederkehrenden Bestellungen gefunden" : "Noch keine wiederkehrenden Bestellungen erstellt"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Lieferant</TableHead>
                  <TableHead>Lager</TableHead>
                  <TableHead>Intervall</TableHead>
                  <TableHead>Nächste Ausführung</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priorität</TableHead>
                  <TableHead>Ausführungen</TableHead>
                  <TableHead>Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order: RecurringOrder) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{order.name}</div>
                        {order.description && (
                          <div className="text-sm text-gray-500">{order.description}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Building className="h-4 w-4 text-gray-400" />
                        <span>{order.supplierName}</span>
                      </div>
                    </TableCell>
                    <TableCell>{order.warehouseName}</TableCell>
                    <TableCell>{formatInterval(order)}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <span>
                          {isValid(parseISO(order.nextExecutionDate))
                            ? format(parseISO(order.nextExecutionDate), "dd.MM.yyyy", { locale: de })
                            : order.nextExecutionDate
                          }
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(order)}</TableCell>
                    <TableCell>{getPriorityBadge(order.priority)}</TableCell>
                    <TableCell>
                      <div className="text-center">
                        {order.totalExecutions}
                        {order.lastExecutionDate && (
                          <div className="text-xs text-gray-500">
                            Zuletzt: {format(parseISO(order.lastExecutionDate), "dd.MM", { locale: de })}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedOrder(order);
                              setShowDetailsDialog(true);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Details anzeigen
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedOrder(order);
                              setShowEditDialog(true);
                            }}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Bearbeiten
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => executeMutation.mutate(order.id)}
                            disabled={!order.isActive || executeMutation.isPending}
                          >
                            <Play className="h-4 w-4 mr-2" />
                            Jetzt ausführen
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => toggleActiveMutation.mutate({ 
                              id: order.id, 
                              isActive: !order.isActive 
                            })}
                            disabled={toggleActiveMutation.isPending}
                          >
                            {order.isActive ? (
                              <>
                                <Pause className="h-4 w-4 mr-2" />
                                Deaktivieren
                              </>
                            ) : (
                              <>
                                <Play className="h-4 w-4 mr-2" />
                                Aktivieren
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => deleteMutation.mutate(order.id)}
                            disabled={deleteMutation.isPending}
                            className="text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Löschen
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Details: {selectedOrder?.name}
            </DialogTitle>
            <DialogDescription>
              Vollständige Informationen und Ausführungshistorie
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <RecurringOrderDetails 
              orderId={selectedOrder.id}
              onClose={() => setShowDetailsDialog(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Wiederkehrende Bestellung bearbeiten</DialogTitle>
            <DialogDescription>
              Ändern Sie die Einstellungen der wiederkehrenden Bestellung
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <RecurringOrderForm 
              initialData={selectedOrder}
              onSuccess={() => {
                setShowEditDialog(false);
                setSelectedOrder(null);
                queryClient.invalidateQueries({ queryKey: ["/api/recurring-orders"] });
                queryClient.invalidateQueries({ queryKey: ["/api/recurring-orders/dashboard/stats"] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}