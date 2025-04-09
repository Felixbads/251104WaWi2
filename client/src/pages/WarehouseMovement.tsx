import { useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MoveHorizontal, ArrowDown, ArrowRight } from "lucide-react";
import WarehouseTransfer from "@/components/inventory/WarehouseTransfer";
import WarehouseWithdrawal from "@/components/inventory/WarehouseWithdrawal";
import InternalMovement from "@/components/inventory/InternalMovement";

export default function WarehouseMovement() {
  const [activeTab, setActiveTab] = useState("transfer");

  return (
    <div className="max-w-7xl mx-auto">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Warenbewegung</h1>
          <p className="text-muted-foreground mt-2">
            Verwalten Sie die Bewegung von Produkten zwischen Lagern oder die Entnahme aus dem Lager.
          </p>
        </div>

        <Tabs
          defaultValue="transfer"
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-6"
        >
          <div className="flex justify-center">
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="transfer" className="flex items-center gap-2">
                <MoveHorizontal className="h-4 w-4" />
                <span>Transfer</span>
              </TabsTrigger>
              <TabsTrigger value="internal" className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4" />
                <span>Umlagerung</span>
              </TabsTrigger>
              <TabsTrigger value="withdrawal" className="flex items-center gap-2">
                <ArrowDown className="h-4 w-4" />
                <span>Entnahme</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="transfer" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Produkt-Transfer zwischen Lagern</CardTitle>
                <CardDescription>
                  Nutzen Sie dieses Formular, um Produkte von einem Lager in ein anderes zu übertragen.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <WarehouseTransfer />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="internal" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Interne Lagerbewegung</CardTitle>
                <CardDescription>
                  Loggen Sie die Umlagerung von Produkten innerhalb eines Lagers oder führen Sie Bestandskorrekturen durch.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <InternalMovement />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="withdrawal" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Warenentnahme aus dem Lager</CardTitle>
                <CardDescription>
                  Erfassen Sie Entnahmen von Produkten aus dem Lager.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <WarehouseWithdrawal />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}