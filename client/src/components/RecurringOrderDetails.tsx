import { useQuery } from "@tanstack/react-query";
import { format, parseISO, isValid } from "date-fns";
import { de } from "date-fns/locale";

// UI-Komponenten
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// Icons
import {
  Building,
  Package,
  Calendar,
  Clock,
  User,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

interface RecurringOrderDetailsProps {
  orderId: number;
  onClose: () => void;
}

interface RecurringOrderDetail {
  id: number;
  name: string;
  description?: string;
  supplierName: string;
  warehouseName: string;
  interval: string;
  intervalValue: number;
  weekday?: string;
  dayOfMonth?: number;
  startDate: string;
  endDate?: string;
  nextExecutionDate: string;
  isActive: boolean;
  priority: string;
  deliveryType: string;
  autoCreateInGoods: boolean;
  requiresApproval: boolean;
  totalExecutions: number;
  lastExecutionDate?: string;
  notes?: string;
  createdByName: string;
  createdAt: string;
  items: Array<{
    id: number;
    productName: string;
    quantity: number;
    unit: string;
    unitPrice?: number;
    notes?: string;
  }>;
  executions: Array<{
    id: number;
    scheduledDate: string;
    executedAt?: string;
    status: string;
    success: boolean;
    orderNumber?: string;
    totalAmount?: number;
    errorMessage?: string;
    itemCount: number;
  }>;
}

export default function RecurringOrderDetails({ orderId, onClose }: RecurringOrderDetailsProps) {
  // Detaillierte Daten abrufen
  const { data: orderDetails, isLoading, error } = useQuery({
    queryKey: ["/api/recurring-orders", orderId],
    queryFn: async () => {
      const response = await fetch(`/api/recurring-orders/${orderId}`);
      if (!response.ok) {
        throw new Error("Fehler beim Laden der Bestelldetails");
      }
      const result = await response.json();
      return result.data;
    },
    enabled: !!orderId
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-6 w-6 animate-spin mr-2" />
        Laden der Bestelldetails...
      </div>
    );
  }

  if (error || !orderDetails) {
    return (
      <div className="text-center py-8 text-red-600">
        Fehler beim Laden der Bestelldetails
      </div>
    );
  }

  const order: RecurringOrderDetail = orderDetails;

  // Status-Badge für Ausführungen
  const getExecutionStatusBadge = (execution: any) => {
    if (execution.success) {
      return <Badge variant="default" className="bg-green-100 text-green-700">Erfolgreich</Badge>;
    }
    if (execution.status === "failed") {
      return <Badge variant="destructive">Fehlgeschlagen</Badge>;
    }
    if (execution.status === "pending") {
      return <Badge variant="outline">Ausstehend</Badge>;
    }
    return <Badge variant="secondary">{execution.status}</Badge>;
  };

  // Intervall formatieren
  const formatInterval = () => {
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

  return (
    <div className="space-y-6">
      {/* Überschrift und Status */}
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-semibold">{order.name}</h3>
          {order.description && (
            <p className="text-sm text-gray-600">{order.description}</p>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {getPriorityBadge(order.priority)}
          <Badge variant={order.isActive ? "default" : "secondary"}>
            {order.isActive ? "Aktiv" : "Inaktiv"}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="items">Bestellpositionen</TabsTrigger>
          <TabsTrigger value="history">Ausführungshistorie</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Grundinformationen */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Grundinformationen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Building className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium">Lieferant:</span>
                    <span className="text-sm">{order.supplierName}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Package className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium">Lager:</span>
                    <span className="text-sm">{order.warehouseName}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium">Intervall:</span>
                    <span className="text-sm">{formatInterval()}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium">Startdatum:</span>
                    <span className="text-sm">
                      {isValid(parseISO(order.startDate))
                        ? format(parseISO(order.startDate), "dd.MM.yyyy", { locale: de })
                        : order.startDate
                      }
                    </span>
                  </div>
                  {order.endDate && (
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <span className="text-sm font-medium">Enddatum:</span>
                      <span className="text-sm">
                        {isValid(parseISO(order.endDate))
                          ? format(parseISO(order.endDate), "dd.MM.yyyy", { locale: de })
                          : order.endDate
                        }
                      </span>
                    </div>
                  )}
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium">Nächste Ausführung:</span>
                    <span className="text-sm font-medium text-blue-600">
                      {isValid(parseISO(order.nextExecutionDate))
                        ? format(parseISO(order.nextExecutionDate), "dd.MM.yyyy", { locale: de })
                        : order.nextExecutionDate
                      }
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Einstellungen */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Einstellungen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Lieferart:</span>
                    <Badge variant="outline">
                      {order.deliveryType === "delivery" ? "Lieferung" : "Abholung"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Automatisch in Wareneingang:</span>
                    {order.autoCreateInGoods ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Genehmigung erforderlich:</span>
                    {order.requiresApproval ? (
                      <CheckCircle2 className="h-4 w-4 text-orange-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Ausführungen gesamt:</span>
                    <span className="text-sm font-medium">{order.totalExecutions}</span>
                  </div>
                  {order.lastExecutionDate && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Letzte Ausführung:</span>
                      <span className="text-sm">
                        {isValid(parseISO(order.lastExecutionDate))
                          ? format(parseISO(order.lastExecutionDate), "dd.MM.yyyy", { locale: de })
                          : order.lastExecutionDate
                        }
                      </span>
                    </div>
                  )}
                  <div className="flex items-center space-x-2">
                    <User className="h-4 w-4 text-gray-400" />
                    <span className="text-sm">Erstellt von:</span>
                    <span className="text-sm">{order.createdByName}</span>
                  </div>
                </div>
              </div>

              {order.notes && (
                <>
                  <Separator className="my-3" />
                  <div>
                    <span className="text-sm font-medium">Notizen:</span>
                    <p className="text-sm text-gray-600 mt-1">{order.notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="items" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bestellpositionen</CardTitle>
            </CardHeader>
            <CardContent>
              {order.items.length === 0 ? (
                <div className="text-center py-4 text-gray-500">
                  Keine Bestellpositionen definiert
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produkt</TableHead>
                      <TableHead>Menge</TableHead>
                      <TableHead>Einheit</TableHead>
                      <TableHead>Einzelpreis</TableHead>
                      <TableHead>Gesamtpreis</TableHead>
                      <TableHead>Notizen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{item.unit}</TableCell>
                        <TableCell>
                          {item.unitPrice ? `€${item.unitPrice.toFixed(2)}` : "-"}
                        </TableCell>
                        <TableCell>
                          {item.unitPrice ? `€${(item.quantity * item.unitPrice).toFixed(2)}` : "-"}
                        </TableCell>
                        <TableCell>
                          {item.notes ? (
                            <span className="text-sm text-gray-600">{item.notes}</span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ausführungshistorie</CardTitle>
            </CardHeader>
            <CardContent>
              {order.executions.length === 0 ? (
                <div className="text-center py-4 text-gray-500">
                  Noch keine Ausführungen
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Geplant</TableHead>
                      <TableHead>Ausgeführt</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Bestellnummer</TableHead>
                      <TableHead>Positionen</TableHead>
                      <TableHead>Betrag</TableHead>
                      <TableHead>Fehlermeldung</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.executions.map((execution) => (
                      <TableRow key={execution.id}>
                        <TableCell>
                          {isValid(parseISO(execution.scheduledDate))
                            ? format(parseISO(execution.scheduledDate), "dd.MM.yyyy", { locale: de })
                            : execution.scheduledDate
                          }
                        </TableCell>
                        <TableCell>
                          {execution.executedAt ? (
                            isValid(parseISO(execution.executedAt))
                              ? format(parseISO(execution.executedAt), "dd.MM.yyyy HH:mm", { locale: de })
                              : execution.executedAt
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>{getExecutionStatusBadge(execution)}</TableCell>
                        <TableCell>
                          {execution.orderNumber ? (
                            <span className="font-mono text-sm">{execution.orderNumber}</span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>{execution.itemCount}</TableCell>
                        <TableCell>
                          {execution.totalAmount ? `€${execution.totalAmount.toFixed(2)}` : "-"}
                        </TableCell>
                        <TableCell>
                          {execution.errorMessage ? (
                            <span className="text-sm text-red-600">{execution.errorMessage}</span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}