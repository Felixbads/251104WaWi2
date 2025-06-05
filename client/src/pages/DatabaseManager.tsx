import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Download, Upload, Database, Shield, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const DATABASE_TABLES = [
  { value: 'all', label: 'Alle Tabellen (Vollbackup)', description: 'Kompettes Backup aller Daten' },
  { value: 'products', label: 'Produkte', description: 'Produktkatalog und Stammdaten' },
  { value: 'transactions', label: 'Transaktionen', description: 'Verkaufsdaten und Umsätze' },
  { value: 'users', label: 'Benutzer', description: 'Benutzerkonten und Profile' },
  { value: 'suppliers', label: 'Lieferanten', description: 'Lieferantenstammdaten' },
  { value: 'warehouses', label: 'Lager', description: 'Lagerstandorte und Bestände' },
  { value: 'machines', label: 'Automaten', description: 'Verkaufsautomaten und Konfiguration' },
  { value: 'orders', label: 'Bestellungen', description: 'Bestellhistorie und -status' },
  { value: 'inventory', label: 'Lagerbestände', description: 'Aktuelle Bestandsdaten' },
  { value: 'sync_logs', label: 'Sync-Protokolle', description: 'Synchronisierungshistorie' }
];

const BACKUP_FORMATS = [
  { value: 'sql', label: 'SQL-Dump (.sql)', description: 'Standard PostgreSQL Format' },
  { value: 'json', label: 'JSON Export (.json)', description: 'Strukturierte Datenexport' },
  { value: 'csv', label: 'CSV Export (.csv)', description: 'Tabellenkalkulation-kompatibel' }
];

export default function DatabaseManager() {
  const [selectedTable, setSelectedTable] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('sql');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [restoreScript, setRestoreScript] = useState('');
  const { toast } = useToast();

  const handleDownload = async () => {
    if (!selectedTable) {
      toast({
        title: "Fehler",
        description: "Bitte wählen Sie eine Tabelle aus",
        variant: "destructive"
      });
      return;
    }

    setIsDownloading(true);
    try {
      const response = await fetch('/api/database/backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          table: selectedTable,
          format: selectedFormat
        })
      });

      if (!response.ok) {
        throw new Error('Backup fehlgeschlagen');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
      const extension = selectedFormat === 'sql' ? 'sql' : selectedFormat;
      a.download = `backup_${selectedTable}_${timestamp}.${extension}`;
      
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Backup erfolgreich",
        description: `Datenbank-Backup wurde heruntergeladen`
      });
    } catch (error) {
      toast({
        title: "Fehler beim Backup",
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: "destructive"
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreScript.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie SQL-Code zur Wiederherstellung ein",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);
    try {
      const response = await fetch('/api/database/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sqlScript: restoreScript
        })
      });

      if (!response.ok) {
        throw new Error('Wiederherstellung fehlgeschlagen');
      }

      const result = await response.json();
      
      toast({
        title: "Wiederherstellung erfolgreich",
        description: `${result.affectedRows || 0} Datensätze wiederhergestellt`
      });
      
      setRestoreScript('');
    } catch (error) {
      toast({
        title: "Fehler bei der Wiederherstellung",
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center space-x-2">
        <Database className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Datenbank-Manager</h1>
        <Badge variant="secondary">PostgreSQL</Badge>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Backup Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Download className="h-5 w-5" />
              <span>Datenbank Backup</span>
            </CardTitle>
            <CardDescription>
              Exportieren Sie Ihre Datenbanktabellen sicher
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="table-select">Tabelle auswählen</Label>
              <Select value={selectedTable} onValueChange={setSelectedTable}>
                <SelectTrigger>
                  <SelectValue placeholder="Wählen Sie eine Tabelle..." />
                </SelectTrigger>
                <SelectContent>
                  {DATABASE_TABLES.map((table) => (
                    <SelectItem key={table.value} value={table.value}>
                      <div>
                        <div className="font-medium">{table.label}</div>
                        <div className="text-sm text-muted-foreground">
                          {table.description}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="format-select">Export-Format</Label>
              <Select value={selectedFormat} onValueChange={setSelectedFormat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BACKUP_FORMATS.map((format) => (
                    <SelectItem key={format.value} value={format.value}>
                      <div>
                        <div className="font-medium">{format.label}</div>
                        <div className="text-sm text-muted-foreground">
                          {format.description}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={handleDownload} 
              disabled={isDownloading || !selectedTable}
              className="w-full"
            >
              {isDownloading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Exportiere...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Backup herunterladen
                </>
              )}
            </Button>

            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <Shield className="h-4 w-4" />
              <span>Ihre Produktionsdaten bleiben bei Deployments erhalten</span>
            </div>
          </CardContent>
        </Card>

        {/* Restore Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Upload className="h-5 w-5" />
              <span>Datenbank Wiederherstellung</span>
            </CardTitle>
            <CardDescription>
              Stellen Sie Daten aus Backup-Dateien wieder her
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="restore-script">SQL-Wiederherstellungsskript</Label>
              <Textarea
                id="restore-script"
                placeholder="Fügen Sie hier Ihr SQL-Backup ein..."
                value={restoreScript}
                onChange={(e) => setRestoreScript(e.target.value)}
                className="min-h-[200px] font-mono text-sm"
              />
            </div>

            <Button 
              onClick={handleRestore} 
              disabled={isUploading || !restoreScript.trim()}
              className="w-full"
              variant="outline"
            >
              {isUploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                  Stelle wieder her...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Datenbank wiederherstellen
                </>
              )}
            </Button>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-start space-x-2">
                <Shield className="h-4 w-4 text-yellow-600 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <strong>Sicherheitshinweis:</strong> Wiederherstellung überschreibt bestehende Daten. 
                  Erstellen Sie vorher ein Backup!
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Deployment-Sicherheit</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="space-y-2">
              <h4 className="font-medium text-green-700">✓ Sicher bei Redeployment</h4>
              <p className="text-muted-foreground">
                Ihre Datenbanktabellen bleiben bei App-Updates vollständig erhalten
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-blue-700">⚡ Automatische Backups</h4>
              <p className="text-muted-foreground">
                Vor jeder Schema-Änderung wird automatisch ein Backup erstellt
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-purple-700">🔄 Rollback-fähig</h4>
              <p className="text-muted-foreground">
                Änderungen können jederzeit rückgängig gemacht werden
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}