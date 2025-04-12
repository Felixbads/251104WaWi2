import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, FileText, Mail } from 'lucide-react';
import { EmailServerConfig } from '@/components/email/EmailServerConfig';
import { EmailTemplateManager } from '@/components/email/EmailTemplateManager';

const MailSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState("server");

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">E-Mail-Einstellungen</h1>
        <p className="text-muted-foreground mt-1">
          Konfigurieren Sie E-Mail-Server und verwalten Sie Vorlagen für das Versenden von Bestellungen.
        </p>
      </div>
      
      <Tabs 
        value={activeTab} 
        onValueChange={setActiveTab} 
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="server">
            <Settings className="mr-2 h-4 w-4" />
            Server-Einstellungen
          </TabsTrigger>
          <TabsTrigger value="templates">
            <FileText className="mr-2 h-4 w-4" />
            E-Mail-Vorlagen
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="server" className="space-y-6">
          <EmailServerConfig />
        </TabsContent>
        
        <TabsContent value="templates" className="space-y-6">
          <EmailTemplateManager />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MailSettings;