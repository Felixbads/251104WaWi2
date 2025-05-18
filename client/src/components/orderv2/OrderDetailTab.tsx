import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Mail, Package, Activity, Send } from 'lucide-react';
import DocumentViewer from '@/components/documents/DocumentViewer';

interface Order {
  id: number;
  status: string;
  // Weitere Bestelleigenschaften...
}

interface OrderDetailTabProps {
  order: Order;
  activeTab?: string;
  onChangeTab?: (tab: string) => void;
}

const OrderDetailTab: React.FC<OrderDetailTabProps> = ({ 
  order, 
  activeTab = 'overview', 
  onChangeTab 
}) => {
  
  const handleTabChange = (value: string) => {
    if (onChangeTab) {
      onChangeTab(value);
    }
  };
  
  return (
    <Tabs 
      value={activeTab} 
      onValueChange={handleTabChange}
      className="w-full"
    >
      <TabsList className="grid grid-cols-4 mb-6">
        <TabsTrigger value="overview">
          <Mail className="mr-2 h-4 w-4" />
          Übersicht
        </TabsTrigger>
        <TabsTrigger value="positions">
          <Package className="mr-2 h-4 w-4" />
          Positionen
        </TabsTrigger>
        <TabsTrigger value="history">
          <Activity className="mr-2 h-4 w-4" />
          Verlauf
        </TabsTrigger>
        <TabsTrigger value="documents">
          <Mail className="mr-2 h-4 w-4" />
          Dokumente
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="overview">
        <Card>
          <CardHeader>
            <CardTitle>Bestellübersicht</CardTitle>
            <CardDescription>Allgemeine Informationen zu dieser Bestellung</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Hier werden allgemeine Informationen zur Bestellung angezeigt, wie z.B. Bestellnummer, 
              Lieferant, Bestelldatum, Lieferdatum, Status, etc.
            </p>
            <p className="mt-4">Die Übersichtsansicht wird bei Bedarf erweitert...</p>
          </CardContent>
        </Card>
      </TabsContent>
      
      <TabsContent value="positions">
        <Card>
          <CardHeader>
            <CardTitle>Bestellpositionen</CardTitle>
            <CardDescription>Einzelne Positionen dieser Bestellung</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Hier werden die einzelnen Positionen der Bestellung angezeigt, mit Produktdetails, 
              Mengen, Preisen, etc.
            </p>
            <p className="mt-4">Diese Ansicht wird in einem zukünftigen Update implementiert.</p>
          </CardContent>
        </Card>
      </TabsContent>
      
      <TabsContent value="history">
        <Card>
          <CardHeader>
            <CardTitle>Bestellverlauf</CardTitle>
            <CardDescription>Verlauf aller Änderungen und Aktionen für diese Bestellung</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Hier wird der vollständige Verlauf der Bestellung angezeigt, mit Zeitstempeln, 
              Benutzeraktionen, Statusänderungen, etc.
            </p>
            <p className="mt-4">Diese Ansicht wird in einem zukünftigen Update implementiert.</p>
          </CardContent>
        </Card>
      </TabsContent>
      
      <TabsContent value="documents">
        <DocumentViewer orderId={order.id} documentType="order" />
      </TabsContent>
    </Tabs>
  );
};

export default OrderDetailTab;