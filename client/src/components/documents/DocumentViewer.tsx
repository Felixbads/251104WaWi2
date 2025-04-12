import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Download, Trash2, Upload, Plus, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface Document {
  id: number;
  name: string;
  type: string;
  createdAt: string;
  url: string;
  size?: number;
}

interface DocumentViewerProps {
  orderId?: number;
  documentType?: 'order' | 'invoice' | 'delivery' | 'other';
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  orderId,
  documentType = 'order'
}) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeDocument, setActiveDocument] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Beim Laden Dokumente abrufen
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // In einer echten Anwendung würden wir hier einen API-Aufruf machen
        // Für dieses Beispiel simulieren wir eine Antwort
        const response = orderId ? [
          {
            id: 1,
            name: `Bestellung_${orderId}_${format(new Date(), 'dd.MM.yyyy')}.pdf`,
            type: 'order',
            createdAt: new Date().toISOString(),
            url: `/api/documents/order_${orderId}.pdf`
          }
        ] : [];
        
        // Kurze Verzögerung für Demonstration
        setTimeout(() => {
          setDocuments(response);
          setIsLoading(false);
          
          // Automatisch das erste Dokument auswählen, wenn verfügbar
          if (response.length > 0) {
            setActiveDocument(response[0]);
          }
        }, 1000);
      } catch (err) {
        setError('Fehler beim Laden der Dokumente. Bitte versuchen Sie es später erneut.');
        setIsLoading(false);
      }
    };
    
    fetchDocuments();
  }, [orderId]);

  const handleViewDocument = (doc: Document) => {
    setActiveDocument(doc);
  };

  const handleDownloadDocument = (doc: Document) => {
    // In einer echten Anwendung würden wir hier einen Download initiieren
    toast({
      title: 'Download gestartet',
      description: `Die Datei "${doc.name}" wird heruntergeladen.`,
    });
  };

  const handleDeleteDocument = (doc: Document) => {
    // In einer echten Anwendung würden wir hier einen API-Aufruf machen
    toast({
      title: 'Dokument gelöscht',
      description: `Das Dokument "${doc.name}" wurde gelöscht.`,
    });
    
    // Dokument aus der Liste entfernen
    setDocuments(docs => docs.filter(d => d.id !== doc.id));
    
    // Aktives Dokument zurücksetzen, wenn es das gelöschte war
    if (activeDocument?.id === doc.id) {
      setActiveDocument(null);
    }
  };

  const handleUploadDocument = () => {
    // In einer echten Anwendung würden wir hier einen Upload-Dialog öffnen
    toast({
      title: 'Upload-Funktion',
      description: 'Diese Funktion wird in einem zukünftigen Update implementiert.',
    });
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unbekannt';
    
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd.MM.yyyy HH:mm', { locale: de });
    } catch (e) {
      return 'Ungültiges Datum';
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Dokumente</CardTitle>
        <CardDescription>Alle zugehörigen Dokumente</CardDescription>
      </CardHeader>
      
      <CardContent>
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Fehler</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
            <p className="text-muted-foreground">Dokumente werden geladen...</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed rounded-lg">
            <FileText className="h-12 w-12 text-muted-foreground opacity-40 mb-4" />
            <h3 className="text-lg font-medium mb-1">Keine Dokumente gefunden</h3>
            <p className="text-sm text-muted-foreground text-center mb-6">
              Es wurden keine Dokumente für diese Bestellung gefunden.
            </p>
            <Button onClick={handleUploadDocument}>
              <Upload className="h-4 w-4 mr-2" />
              Dokument hochladen
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 border rounded-md overflow-hidden">
              <div className="bg-muted p-3 font-medium border-b">
                Dokumentenliste
              </div>
              <div className="divide-y">
                {documents.map(doc => (
                  <div 
                    key={doc.id}
                    className={`p-3 hover:bg-muted/50 cursor-pointer flex items-start ${
                      activeDocument?.id === doc.id ? 'bg-muted/80' : ''
                    }`}
                    onClick={() => handleViewDocument(doc)}
                  >
                    <FileText className="h-5 w-5 mr-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{doc.name}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(doc.createdAt)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(doc.size)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 border-t">
                <Button 
                  variant="outline" 
                  onClick={handleUploadDocument}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Dokument hinzufügen
                </Button>
              </div>
            </div>
            
            <div className="md:col-span-2 border rounded-md overflow-hidden">
              <div className="bg-muted p-3 font-medium border-b flex justify-between items-center">
                <span>Dokumentenansicht</span>
                {activeDocument && (
                  <div className="flex items-center space-x-2">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleDownloadDocument(activeDocument)}
                      title="Herunterladen"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleDeleteDocument(activeDocument)}
                      title="Löschen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              
              {activeDocument ? (
                <div className="aspect-[3/4] bg-slate-50 flex items-center justify-center">
                  {/* Hier würde in einer echten Anwendung der PDF-Viewer oder Bildvorschau stehen */}
                  <div className="text-center p-6">
                    <FileText className="h-16 w-16 mx-auto text-muted-foreground opacity-40 mb-4" />
                    <h3 className="text-lg font-medium mb-2">{activeDocument.name}</h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      Die Vorschau für dieses Dokument ist in der aktuellen Version noch nicht verfügbar.
                    </p>
                    <Button 
                      onClick={() => handleDownloadDocument(activeDocument)}
                      className="mx-auto"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Herunterladen
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="aspect-[3/4] bg-slate-50 flex items-center justify-center">
                  <div className="text-center p-6">
                    <Eye className="h-16 w-16 mx-auto text-muted-foreground opacity-30 mb-4" />
                    <h3 className="text-lg font-medium mb-2">Keine Vorschau</h3>
                    <p className="text-sm text-muted-foreground">
                      Wählen Sie ein Dokument aus der Liste, um es anzuzeigen.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
      
      <CardFooter className="flex justify-end border-t pt-4">
        <Button variant="outline" onClick={() => setActiveDocument(null)}>
          Schließen
        </Button>
      </CardFooter>
    </Card>
  );
};

export default DocumentViewer;