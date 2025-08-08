import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Users, Mail, FileText, TestTube, Activity } from 'lucide-react';
import { EmailNotificationSettings } from '@/components/email/daily/EmailNotificationSettings';
import { EmailRecipientsManager } from '@/components/email/daily/EmailRecipientsManager';
import { EmailTemplatesManager } from '@/components/email/daily/EmailTemplatesManager';
import { EmailLogsViewer } from '@/components/email/daily/EmailLogsViewer';
import { TestEmailSender } from '@/components/email/daily/TestEmailSender';
// Remove PageHeader import for now since it's not available

const DailyEmailSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState("settings");

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tägliche E-Mail-Benachrichtigungen</h1>
        <p className="text-muted-foreground mt-1">
          Konfigurieren Sie automatische tägliche Statusberichte und E-Mail-Benachrichtigungen für Ihr Proviantomat-System.
        </p>
      </div>
      
      <Tabs 
        value={activeTab} 
        onValueChange={setActiveTab} 
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-6 mb-6">
          <TabsTrigger value="settings">
            <Settings className="mr-2 h-4 w-4" />
            Einstellungen
          </TabsTrigger>
          <TabsTrigger value="recipients">
            <Users className="mr-2 h-4 w-4" />
            Empfänger
          </TabsTrigger>
          <TabsTrigger value="templates">
            <FileText className="mr-2 h-4 w-4" />
            Vorlagen
          </TabsTrigger>
          <TabsTrigger value="test">
            <TestTube className="mr-2 h-4 w-4" />
            Test
          </TabsTrigger>
          <TabsTrigger value="logs">
            <Activity className="mr-2 h-4 w-4" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="manual">
            <Mail className="mr-2 h-4 w-4" />
            Manuell
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="settings" className="space-y-6">
          <EmailNotificationSettings />
        </TabsContent>
        
        <TabsContent value="recipients" className="space-y-6">
          <EmailRecipientsManager />
        </TabsContent>
        
        <TabsContent value="templates" className="space-y-6">
          <EmailTemplatesManager />
        </TabsContent>
        
        <TabsContent value="test" className="space-y-6">
          <TestEmailSender />
        </TabsContent>
        
        <TabsContent value="logs" className="space-y-6">
          <EmailLogsViewer />
        </TabsContent>
        
        <TabsContent value="manual" className="space-y-6">
          <TestEmailSender manual={true} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DailyEmailSettings;