import React from 'react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, AlertTriangle, Calendar, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ExpiredProductsListProps = {
  warehouseId?: number;
};

/**
 * ExpiredProductsList Komponente
 * 
 * Diese Komponente zeigt abgelaufene Produktchargen und deren Ausbuchungsdetails an.
 * Aktuell ist die Datenbank noch nicht für diese Funktion konfiguriert.
 */
export default function ExpiredProductsList({ warehouseId }: ExpiredProductsListProps) {
  // Zeige Informationskarte an, da die Tabellen noch nicht in der Datenbank existieren
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Calendar className="h-5 w-5 mr-2 text-muted-foreground" />
          Abgelaufene Produkte
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Alert className="mb-6" variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Datenbankschema-Update erforderlich</AlertTitle>
          <AlertDescription>
            <p className="mb-2">
              Die Tabellen für die Verfolgung von abgelaufenen Produkten wurden noch nicht in der Datenbank angelegt.
              Um diese Funktion zu aktivieren, muss zuerst ein Datenbankschema-Update durchgeführt werden.
            </p>
            <p>
              Nach dem Update werden hier automatisch alle Produkte angezeigt, die abgelaufen sind und aus dem
              Lagerbestand ausgebucht wurden. Die Ausbuchung erfolgt automatisch, sobald ein Produkt sein
              Mindesthaltbarkeitsdatum erreicht.
            </p>
          </AlertDescription>
        </Alert>
        
        <div className="rounded-md border p-4 text-center">
          <h3 className="font-medium mb-3">Diese Ansicht zeigt abgelaufene Produkte an</h3>
          <div className="text-sm text-muted-foreground space-y-2 mb-4">
            <p>Nach der Aktivierung werden hier folgende Informationen angezeigt:</p>
            <ul className="list-disc pl-6 text-left">
              <li>Produkte mit abgelaufenen Mindesthaltbarkeitsdaten</li>
              <li>Details zu jeder ausgebuchten Charge</li>
              <li>Ursprüngliche Mengen vor der Ausbuchung</li>
              <li>Datum und Uhrzeit der automatischen Ausbuchung</li>
              <li>Sortierung nach Datum (neueste zuerst)</li>
            </ul>
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button variant="outline" onClick={() => window.location.reload()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Aktualisieren
        </Button>
      </CardFooter>
    </Card>
  );
}