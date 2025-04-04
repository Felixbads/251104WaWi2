import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';

// Sehr vereinfachte Version ohne externe Abhängigkeiten
export default function ForecastEvaluation() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Auswertung</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Prognoseauswertung</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Dies ist eine vereinfachte Version der Auswertungsseite.</p>
          <p>Hier werden später die Prognosen und Statistiken angezeigt.</p>
          <div className="mt-4">
            <Button>Aktualisieren</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}