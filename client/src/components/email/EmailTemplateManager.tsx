import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mail, Save, Plus, Trash, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  body: string;
  type: string;
  isDefault?: boolean;
}

interface EmailTemplateManagerProps {
  type?: 'order' | 'invoice' | 'delivery' | 'all';
  onSelect?: (template: EmailTemplate) => void;
}

export const EmailTemplateManager: React.FC<EmailTemplateManagerProps> = ({
  type = 'all',
  onSelect
}) => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [currentTemplate, setCurrentTemplate] = useState<EmailTemplate | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Vorlage-Beispiele
  const defaultTemplates: EmailTemplate[] = [
    {
      id: 1,
      name: 'Standard Bestellung',
      subject: 'Neue Bestellung #{orderNumber}',
      body: `Sehr geehrte Damen und Herren,

anbei erhalten Sie unsere Bestellung mit der Bestellnummer #{orderNumber}.

Wir bitten um eine Bestätigung des Erhalts und des voraussichtlichen Lieferdatums.

Mit freundlichen Grüßen,
Ihr Team`,
      type: 'order',
      isDefault: true
    },
    {
      id: 2,
      name: 'Dringende Bestellung',
      subject: 'DRINGEND: Bestellung #{orderNumber}',
      body: `Sehr geehrte Damen und Herren,

anbei erhalten Sie unsere DRINGENDE Bestellung mit der Bestellnummer #{orderNumber}.

Wir benötigen diese Lieferung dringend und bitten um schnellstmögliche Bearbeitung.

Bitte bestätigen Sie den Erhalt und teilen Sie uns mit, ob die Lieferung bis zum gewünschten Datum möglich ist.

Mit freundlichen Grüßen,
Ihr Team`,
      type: 'order'
    },
    {
      id: 3,
      name: 'Standard Lieferschein',
      subject: 'Lieferschein für Bestellung #{orderNumber}',
      body: `Sehr geehrte Damen und Herren,

anbei erhalten Sie den Lieferschein für die Bestellung #{orderNumber}.

Mit freundlichen Grüßen,
Ihr Team`,
      type: 'delivery',
      isDefault: true
    }
  ];

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Simulate API call with delay
        setTimeout(() => {
          // Filter templates based on type prop
          const filteredTemplates = type === 'all' 
            ? defaultTemplates 
            : defaultTemplates.filter(t => t.type === type);
          
          setTemplates(filteredTemplates);
          
          // Set the default template as current if available
          const defaultTemplate = filteredTemplates.find(t => t.isDefault);
          if (defaultTemplate) {
            setCurrentTemplate(defaultTemplate);
          } else if (filteredTemplates.length > 0) {
            setCurrentTemplate(filteredTemplates[0]);
          }
          
          setIsLoading(false);
        }, 1000);
      } catch (err) {
        setError('Fehler beim Laden der E-Mail-Vorlagen');
        setIsLoading(false);
      }
    };
    
    fetchTemplates();
  }, [type]);

  const handleSelectTemplate = (templateId: number) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setCurrentTemplate(template);
      setIsEditing(false);
      
      if (onSelect) {
        onSelect(template);
      }
    }
  };

  const handleEditTemplate = () => {
    setIsEditing(true);
  };

  const handleSaveTemplate = () => {
    if (!currentTemplate) return;
    
    // In a real app, we would save to the server here
    setTemplates(prevTemplates => 
      prevTemplates.map(t => 
        t.id === currentTemplate.id ? currentTemplate : t
      )
    );
    
    setIsEditing(false);
    
    toast({
      title: 'Vorlage gespeichert',
      description: `Die Vorlage "${currentTemplate.name}" wurde erfolgreich gespeichert.`,
    });
  };

  const handleCreateTemplate = () => {
    // Create a new template
    const newTemplate: EmailTemplate = {
      id: Math.max(0, ...templates.map(t => t.id)) + 1,
      name: 'Neue Vorlage',
      subject: '',
      body: '',
      type: type === 'all' ? 'order' : type
    };
    
    setTemplates([...templates, newTemplate]);
    setCurrentTemplate(newTemplate);
    setIsEditing(true);
  };

  const handleDeleteTemplate = () => {
    if (!currentTemplate) return;
    
    const isDefault = currentTemplate.isDefault;
    
    if (isDefault) {
      toast({
        title: 'Aktion nicht möglich',
        description: 'Standard-Vorlagen können nicht gelöscht werden.',
        variant: 'destructive'
      });
      return;
    }
    
    // In a real app, we would delete from the server here
    setTemplates(prevTemplates => 
      prevTemplates.filter(t => t.id !== currentTemplate.id)
    );
    
    // Select first template after deletion
    if (templates.length > 1) {
      const firstNonDeletedTemplate = templates.find(t => t.id !== currentTemplate.id);
      setCurrentTemplate(firstNonDeletedTemplate || null);
    } else {
      setCurrentTemplate(null);
    }
    
    setIsEditing(false);
    
    toast({
      title: 'Vorlage gelöscht',
      description: `Die Vorlage "${currentTemplate.name}" wurde gelöscht.`,
    });
  };

  const handleInputChange = (field: keyof EmailTemplate, value: string) => {
    if (!currentTemplate) return;
    
    setCurrentTemplate({
      ...currentTemplate,
      [field]: value
    });
  };

  const handleSetDefault = () => {
    if (!currentTemplate) return;
    
    // Remove default flag from all templates of the same type
    const updatedTemplates = templates.map(t => ({
      ...t,
      isDefault: t.type === currentTemplate.type ? false : t.isDefault
    }));
    
    // Set current template as default
    const updatedCurrentTemplate = {
      ...currentTemplate,
      isDefault: true
    };
    
    setCurrentTemplate(updatedCurrentTemplate);
    
    // Update templates list
    setTemplates(updatedTemplates.map(t => 
      t.id === currentTemplate.id ? updatedCurrentTemplate : t
    ));
    
    toast({
      title: 'Standard geändert',
      description: `"${currentTemplate.name}" ist jetzt die Standard-Vorlage für ${currentTemplate.type === 'order' ? 'Bestellungen' : currentTemplate.type === 'delivery' ? 'Lieferscheine' : 'Rechnungen'}.`,
    });
  };

  // Helper function to get template type name in German
  const getTemplateTypeName = (templateType: string): string => {
    switch (templateType) {
      case 'order': return 'Bestellung';
      case 'invoice': return 'Rechnung';
      case 'delivery': return 'Lieferschein';
      default: return templateType;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>E-Mail-Vorlagen</CardTitle>
        <CardDescription>Verwalten Sie Ihre E-Mail-Vorlagen für verschiedene Zwecke</CardDescription>
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
            <p className="text-muted-foreground">Vorlagen werden geladen...</p>
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed rounded-lg">
            <Mail className="h-12 w-12 text-muted-foreground opacity-40 mb-4" />
            <h3 className="text-lg font-medium mb-1">Keine Vorlagen gefunden</h3>
            <p className="text-sm text-muted-foreground text-center mb-6">
              Es wurden keine E-Mail-Vorlagen gefunden. Erstellen Sie eine neue Vorlage, um loszulegen.
            </p>
            <Button onClick={handleCreateTemplate}>
              <Plus className="h-4 w-4 mr-2" />
              Neue Vorlage erstellen
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 border rounded-md overflow-hidden">
              <div className="bg-muted p-3 font-medium border-b flex justify-between items-center">
                <span>Vorlagen</span>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={handleCreateTemplate}
                  title="Neue Vorlage"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="divide-y max-h-[400px] overflow-y-auto">
                {templates.map(template => (
                  <div 
                    key={template.id}
                    className={`p-3 hover:bg-muted/50 cursor-pointer ${
                      currentTemplate?.id === template.id ? 'bg-muted/80' : ''
                    }`}
                    onClick={() => handleSelectTemplate(template.id)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{template.name}</span>
                      {template.isDefault && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          Standard
                        </span>
                      )}
                    </div>
                    <div className="flex items-center mt-1">
                      <span className="text-xs text-muted-foreground">
                        {getTemplateTypeName(template.type)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="md:col-span-2">
              {currentTemplate ? (
                <div className="border rounded-md overflow-hidden">
                  <div className="bg-muted p-3 font-medium border-b flex justify-between items-center">
                    <span>{isEditing ? 'Vorlage bearbeiten' : 'Vorlage ansehen'}</span>
                    <div className="flex items-center space-x-2">
                      {isEditing ? (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={handleSaveTemplate}
                        >
                          <Save className="h-4 w-4 mr-2" />
                          Speichern
                        </Button>
                      ) : (
                        <>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={handleEditTemplate}
                          >
                            Bearbeiten
                          </Button>
                          {!currentTemplate.isDefault && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={handleSetDefault}
                            >
                              Als Standard
                            </Button>
                          )}
                          {!currentTemplate.isDefault && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={handleDeleteTemplate}
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="p-4 space-y-4">
                    <div>
                      <Label htmlFor="template-name">Name</Label>
                      <Input 
                        id="template-name"
                        value={currentTemplate.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        disabled={!isEditing}
                        className="mt-1"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="template-type">Typ</Label>
                      <Select 
                        value={currentTemplate.type}
                        onValueChange={(value) => handleInputChange('type', value)}
                        disabled={!isEditing}
                      >
                        <SelectTrigger id="template-type" className="mt-1">
                          <SelectValue placeholder="Wählen Sie einen Typ" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="order">Bestellung</SelectItem>
                          <SelectItem value="invoice">Rechnung</SelectItem>
                          <SelectItem value="delivery">Lieferschein</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label htmlFor="template-subject">Betreff</Label>
                      <Input 
                        id="template-subject"
                        value={currentTemplate.subject}
                        onChange={(e) => handleInputChange('subject', e.target.value)}
                        disabled={!isEditing}
                        className="mt-1"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="template-body">Inhalt</Label>
                      <Textarea 
                        id="template-body"
                        value={currentTemplate.body}
                        onChange={(e) => handleInputChange('body', e.target.value)}
                        disabled={!isEditing}
                        className="mt-1 min-h-[200px] font-mono text-sm"
                      />
                    </div>
                    
                    <div className="bg-muted/50 rounded p-3">
                      <h4 className="text-sm font-medium mb-2">Verfügbare Platzhalter:</h4>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        <li><code>#{'{orderNumber}'}</code> - Bestellnummer</li>
                        <li><code>#{'{deliveryDate}'}</code> - Lieferdatum</li>
                        <li><code>#{'{companyName}'}</code> - Firmenname</li>
                        <li><code>#{'{totalAmount}'}</code> - Gesamtbetrag</li>
                        <li><code>#{'{recipientName}'}</code> - Name des Empfängers</li>
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full border rounded-md p-8">
                  <Mail className="h-12 w-12 text-muted-foreground opacity-30 mb-4" />
                  <h3 className="text-lg font-medium mb-2">Keine Vorlage ausgewählt</h3>
                  <p className="text-sm text-muted-foreground text-center">
                    Wählen Sie eine Vorlage aus der Liste oder erstellen Sie eine neue Vorlage.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
      
      <CardFooter className="flex justify-between border-t pt-4">
        <div>
          {currentTemplate && !isEditing && (
            <Button 
              variant="outline"
              onClick={() => {
                if (onSelect && currentTemplate) {
                  onSelect(currentTemplate);
                }
                
                toast({
                  title: 'Vorlage ausgewählt',
                  description: `Die Vorlage "${currentTemplate.name}" wurde ausgewählt.`,
                });
              }}
            >
              <Mail className="mr-2 h-4 w-4" />
              Diese Vorlage verwenden
            </Button>
          )}
        </div>
        
        <Button variant="outline" onClick={() => {
          if (isEditing) {
            setIsEditing(false);
            // Reset to original template
            const originalTemplate = templates.find(t => t.id === currentTemplate?.id);
            if (originalTemplate) {
              setCurrentTemplate(originalTemplate);
            }
          }
        }}>
          {isEditing ? 'Abbrechen' : 'Schließen'}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default EmailTemplateManager;