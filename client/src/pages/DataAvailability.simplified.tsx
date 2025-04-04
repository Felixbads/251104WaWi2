import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

// Sehr vereinfachte Version ohne externe Abhängigkeiten
export default function DataAvailability() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Datenverfügbarkeit</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Datenverfügbarkeit</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Dies ist eine vereinfachte Version der Datenverfügbarkeitsseite.</p>
          <p>Hier werden später die Informationen zur Datenverfügbarkeit angezeigt.</p>
        </CardContent>
      </Card>
    </div>
  );
}