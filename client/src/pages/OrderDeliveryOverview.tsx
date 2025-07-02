import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Truck, Package, Clock, User, MapPin } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface SupplierSchedule {
  id: number;
  name: string;
  orderFrequency: string | null;
  orderWeekday: string | null;
  deliveryFrequency: string | null;
  deliveryWeekday: string | null;
  deliveryMethod: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
}

const weekdayMap: Record<string, string> = {
  monday: "Montag",
  tuesday: "Dienstag", 
  wednesday: "Mittwoch",
  thursday: "Donnerstag",
  friday: "Freitag",
  saturday: "Samstag",
  sunday: "Sonntag"
};

const frequencyMap: Record<string, string> = {
  weekly: "Wöchentlich",
  biweekly: "Zweiwöchentlich",
  on_demand: "Bei Bedarf"
};

const deliveryMethodMap: Record<string, string> = {
  delivery: "Lieferung",
  pickup: "Abholung"
};

export default function OrderDeliveryOverview() {
  const [activeTab, setActiveTab] = useState("scheduled");

  const { data: suppliers, isLoading } = useQuery<SupplierSchedule[]>({
    queryKey: ['/api/suppliers-schedules'],
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const scheduledSuppliers = suppliers?.filter(s => 
    s.orderFrequency && s.orderFrequency !== 'on_demand' || 
    s.deliveryFrequency && s.deliveryFrequency !== 'on_demand'
  ) || [];

  const onDemandSuppliers = suppliers?.filter(s => 
    s.orderFrequency === 'on_demand' || s.deliveryFrequency === 'on_demand'
  ) || [];

  const noScheduleSuppliers = suppliers?.filter(s => 
    !s.orderFrequency && !s.deliveryFrequency
  ) || [];

  const SupplierCard = ({ supplier }: { supplier: SupplierSchedule }) => (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <User className="h-5 w-5 text-blue-600" />
          {supplier.name}
        </CardTitle>
        {supplier.contactPerson && (
          <CardDescription className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            {supplier.contactPerson}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Bestellungsturnus */}
        {supplier.orderFrequency && (
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-green-600" />
            <div className="flex-1">
              <div className="text-sm font-medium">Bestellungsturnus</div>
              <div className="text-sm text-gray-600">
                {frequencyMap[supplier.orderFrequency] || supplier.orderFrequency}
                {supplier.orderWeekday && supplier.orderFrequency !== 'on_demand' && (
                  <span className="ml-1">
                    ({weekdayMap[supplier.orderWeekday] || supplier.orderWeekday})
                  </span>
                )}
              </div>
            </div>
            <Badge variant={supplier.orderFrequency === 'on_demand' ? 'secondary' : 'default'}>
              {supplier.orderFrequency === 'weekly' ? 'W' : supplier.orderFrequency === 'biweekly' ? '2W' : 'BD'}
            </Badge>
          </div>
        )}

        {/* Lieferungsturnus */}
        {supplier.deliveryFrequency && (
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-blue-600" />
            <div className="flex-1">
              <div className="text-sm font-medium">
                {deliveryMethodMap[supplier.deliveryMethod || 'delivery'] || 'Lieferung'}
              </div>
              <div className="text-sm text-gray-600">
                {frequencyMap[supplier.deliveryFrequency] || supplier.deliveryFrequency}
                {supplier.deliveryWeekday && supplier.deliveryFrequency !== 'on_demand' && (
                  <span className="ml-1">
                    ({weekdayMap[supplier.deliveryWeekday] || supplier.deliveryWeekday})
                  </span>
                )}
              </div>
            </div>
            <Badge variant={supplier.deliveryFrequency === 'on_demand' ? 'secondary' : 'default'}>
              {supplier.deliveryFrequency === 'weekly' ? 'W' : supplier.deliveryFrequency === 'biweekly' ? '2W' : 'BD'}
            </Badge>
          </div>
        )}

        {/* Kontakt */}
        {(supplier.phone || supplier.email) && (
          <div className="pt-2 border-t">
            <div className="text-xs text-gray-500 space-y-1">
              {supplier.phone && <div>📞 {supplier.phone}</div>}
              {supplier.email && <div>✉️ {supplier.email}</div>}
            </div>
          </div>
        )}

        {/* Aktionen */}
        <div className="pt-2 flex gap-2">
          <Button size="sm" variant="outline" className="flex-1">
            Bestellung erstellen
          </Button>
          <Button size="sm" variant="ghost">
            <Clock className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bestellungen & Lieferungen</h1>
          <p className="text-gray-600">Übersicht über regelmäßige Bestellungen und Liefertermine</p>
        </div>
        <div className="flex gap-2">
          <Button>
            <Calendar className="h-4 w-4 mr-2" />
            Kalender anzeigen
          </Button>
          <Button variant="outline">
            <Package className="h-4 w-4 mr-2" />
            Neue Bestellung
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="scheduled" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Geplant ({scheduledSuppliers.length})
          </TabsTrigger>
          <TabsTrigger value="on_demand" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Bei Bedarf ({onDemandSuppliers.length})
          </TabsTrigger>
          <TabsTrigger value="no_schedule" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Kein Turnus ({noScheduleSuppliers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scheduled" className="mt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {scheduledSuppliers.length > 0 ? (
              scheduledSuppliers.map((supplier) => (
                <SupplierCard key={supplier.id} supplier={supplier} />
              ))
            ) : (
              <div className="col-span-full text-center py-8 text-gray-500">
                <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>Keine geplanten Bestellungen oder Lieferungen</p>
                <p className="text-sm">Lieferanten-Turnus in den Lieferanten-Einstellungen konfigurieren</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="on_demand" className="mt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {onDemandSuppliers.length > 0 ? (
              onDemandSuppliers.map((supplier) => (
                <SupplierCard key={supplier.id} supplier={supplier} />
              ))
            ) : (
              <div className="col-span-full text-center py-8 text-gray-500">
                <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>Keine Bedarfsbestellungen konfiguriert</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="no_schedule" className="mt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {noScheduleSuppliers.length > 0 ? (
              noScheduleSuppliers.map((supplier) => (
                <SupplierCard key={supplier.id} supplier={supplier} />
              ))
            ) : (
              <div className="col-span-full text-center py-8 text-gray-500">
                <User className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>Alle Lieferanten haben einen konfigurierten Turnus</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}