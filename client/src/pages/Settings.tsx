import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  AlertCircle, Save, RefreshCw, Database, Key, 
  Bell, User, Clock, Shield, Cog, Mail, Menu
} from "lucide-react";
import DatabaseViewer from "@/components/settings/DatabaseViewer";
import DatabaseManager from "@/pages/DatabaseManager";
import EmailNotificationsSettings from "@/components/email/EmailNotificationsSettings";
import MobileMenu from "@/components/layout/MobileMenu";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("api");
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  
  // API Connection Settings (these would normally come from API/storage)
  const [apiSettings, setApiSettings] = useState({
    apiUrl: "https://api.vendon.example.com/v1",
    apiKey: "••••••••••••••••••••••••••••••",
    connectionTimeout: "30",
    requestRetries: "3",
  });

  // Sync settings
  const [syncSettings, setSyncSettings] = useState({
    autoSync: true,
    syncInterval: "60",
    syncOnStartup: true,
    syncHistoryDays: "30",
    batchSize: "100",
  });

  // Notification settings
  const [notificationSettings, setNotificationSettings] = useState({
    enableNotifications: true,
    notifyOnError: true,
    notifyOnSuccess: false,
    soundAlerts: false,
    emailNotifications: false,
    email: "",
  });

  // Handle input change for API settings
  const handleApiSettingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setApiSettings({
      ...apiSettings,
      [name]: value,
    });
  };

  // Handle input change for sync settings
  const handleSyncSettingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSyncSettings({
      ...syncSettings,
      [name]: value,
    });
  };

  // Handle switch change for sync settings
  const handleSyncSwitchChange = (name: string, checked: boolean) => {
    setSyncSettings({
      ...syncSettings,
      [name]: checked,
    });
  };

  // Handle select change for sync settings
  const handleSyncSelectChange = (name: string, value: string) => {
    setSyncSettings({
      ...syncSettings,
      [name]: value,
    });
  };

  // Handle notification setting changes
  const handleNotificationSettingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNotificationSettings({
      ...notificationSettings,
      [name]: value,
    });
  };

  // Handle switch change for notification settings
  const handleNotificationSwitchChange = (name: string, checked: boolean) => {
    setNotificationSettings({
      ...notificationSettings,
      [name]: checked,
    });
  };

  // Handle save settings
  const handleSaveSettings = () => {
    setIsSaving(true);
    
    // Simulate API call
    setTimeout(() => {
      setIsSaving(false);
      toast({
        title: "Einstellungen gespeichert",
        description: "Ihre Einstellungen wurden erfolgreich gespeichert.",
        variant: "success",
      });
    }, 1000);
  };

  // Handle test connection
  const handleTestConnection = () => {
    toast({
      title: "Verbindung wird getestet",
      description: "Bitte warten...",
    });
    
    // Simulate API connection test
    setTimeout(() => {
      toast({
        title: "Verbindung erfolgreich",
        description: "Die API-Verbindung wurde erfolgreich hergestellt.",
        variant: "success",
      });
    }, 2000);
  };

  // Handle mobile menu toggle
  const toggleMobileMenu = () => {
    setShowMobileMenu(!showMobileMenu);
  };

  return (
    <div className="space-y-6">
      {/* Mobile Menu Overlay */}
      <MobileMenu
        isOpen={showMobileMenu}
        onClose={toggleMobileMenu}
      />

      {/* Einheitliche Filter- und Aktionsleiste */}
      <div className="w-full flex flex-col md:flex-row gap-3 mb-6">
        {/* Linke Seite: Mobile Menu Button + Titel */}
        <div className="flex-grow flex items-center">
          {/* Mobile Menu Button - nur auf mobile sichtbar */}
          <button
            onClick={toggleMobileMenu}
            className="md:hidden p-2 rounded-lg bg-red-600 text-white hover:bg-red-700 active:bg-red-800 transition-colors duration-200 mr-3 min-h-[44px] min-w-[44px] flex items-center justify-center shadow-md border border-red-700"
            data-testid="button-mobile-menu"
            aria-label="Menü öffnen"
          >
            <Menu className="h-6 w-6" />
          </button>
          <h1 className="text-xl font-semibold">Einstellungen</h1>
        </div>
        
        {/* Rechte Seite: Aktionen */}
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant="default" 
            size="sm" 
            className="h-9"
            onClick={handleSaveSettings}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Speichert...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Änderungen speichern
              </>
            )}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value)} className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              <TabsTrigger value="api" className="flex items-center">
                <Key className="h-4 w-4 mr-2" />
                API-Verbindung
              </TabsTrigger>
              <TabsTrigger value="sync" className="flex items-center">
                <RefreshCw className="h-4 w-4 mr-2" />
                Synchronisation
              </TabsTrigger>
              <TabsTrigger value="notifications" className="flex items-center">
                <Bell className="h-4 w-4 mr-2" />
                Benachrichtigungen
              </TabsTrigger>
              <TabsTrigger value="email" className="flex items-center">
                <Mail className="h-4 w-4 mr-2" />
                Mail-Benachrichtigungen
              </TabsTrigger>
              <TabsTrigger value="database" className="flex items-center">
                <Database className="h-4 w-4 mr-2" />
                Datenbank-Viewer
              </TabsTrigger>
              <TabsTrigger value="backup" className="flex items-center">
                <Database className="h-4 w-4 mr-2" />
                Datenbank-Manager
              </TabsTrigger>
            </TabsList>

            {/* API Connection Tab */}
            <TabsContent value="api" className="space-y-4">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="apiUrl">API URL</Label>
                  <Input
                    id="apiUrl"
                    name="apiUrl"
                    value={apiSettings.apiUrl}
                    onChange={handleApiSettingChange}
                    placeholder="https://api.vendon.example.com/v1"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Schlüssel</Label>
                  <div className="flex gap-2">
                    <Input
                      id="apiKey"
                      name="apiKey"
                      type="password"
                      value={apiSettings.apiKey}
                      onChange={handleApiSettingChange}
                      placeholder="Ihr API Schlüssel"
                    />
                    <Button variant="outline" onClick={handleTestConnection}>
                      Test
                    </Button>
                  </div>
                </div>
                
                <Separator />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="connectionTimeout">Verbindungs-Timeout (Sekunden)</Label>
                    <Input
                      id="connectionTimeout"
                      name="connectionTimeout"
                      type="number"
                      value={apiSettings.connectionTimeout}
                      onChange={handleApiSettingChange}
                      min="5"
                      max="120"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="requestRetries">Anfrage-Wiederholungen</Label>
                    <Input
                      id="requestRetries"
                      name="requestRetries"
                      type="number"
                      value={apiSettings.requestRetries}
                      onChange={handleApiSettingChange}
                      min="0"
                      max="10"
                    />
                  </div>
                </div>
                
                <Alert className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Wichtiger Hinweis</AlertTitle>
                  <AlertDescription>
                    Der API-Schlüssel wird sicher in der Datenbank gespeichert. Stellen Sie sicher, dass Sie einen gültigen API-Schlüssel mit ausreichenden Berechtigungen verwenden.
                  </AlertDescription>
                </Alert>
              </div>
            </TabsContent>

            {/* Sync Settings Tab */}
            <TabsContent value="sync" className="space-y-4">
              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="autoSync">Automatische Synchronisierung</Label>
                    <p className="text-sm text-muted-foreground">
                      Aktiviert regelmäßige automatische Synchronisierung
                    </p>
                  </div>
                  <Switch
                    id="autoSync"
                    checked={syncSettings.autoSync}
                    onCheckedChange={(checked) => handleSyncSwitchChange("autoSync", checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="syncOnStartup">Beim Start synchronisieren</Label>
                    <p className="text-sm text-muted-foreground">
                      Startet Synchronisierung beim Anwendungsstart
                    </p>
                  </div>
                  <Switch
                    id="syncOnStartup"
                    checked={syncSettings.syncOnStartup}
                    onCheckedChange={(checked) => handleSyncSwitchChange("syncOnStartup", checked)}
                  />
                </div>
                
                <Separator className="my-2" />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="syncInterval">Synchronisierungsintervall (Minuten)</Label>
                    <Select
                      value={syncSettings.syncInterval}
                      onValueChange={(value) => handleSyncSelectChange("syncInterval", value)}
                    >
                      <SelectTrigger id="syncInterval">
                        <SelectValue placeholder="Intervall auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 Minuten</SelectItem>
                        <SelectItem value="30">30 Minuten</SelectItem>
                        <SelectItem value="60">1 Stunde</SelectItem>
                        <SelectItem value="120">2 Stunden</SelectItem>
                        <SelectItem value="360">6 Stunden</SelectItem>
                        <SelectItem value="720">12 Stunden</SelectItem>
                        <SelectItem value="1440">24 Stunden</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="batchSize">Batch-Größe</Label>
                    <Select
                      value={syncSettings.batchSize}
                      onValueChange={(value) => handleSyncSelectChange("batchSize", value)}
                    >
                      <SelectTrigger id="batchSize">
                        <SelectValue placeholder="Batch-Größe auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="50">50 Einträge</SelectItem>
                        <SelectItem value="100">100 Einträge</SelectItem>
                        <SelectItem value="250">250 Einträge</SelectItem>
                        <SelectItem value="500">500 Einträge</SelectItem>
                        <SelectItem value="1000">1000 Einträge</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="syncHistoryDays">Synchronisierungsverlauf speichern (Tage)</Label>
                  <Select
                    value={syncSettings.syncHistoryDays}
                    onValueChange={(value) => handleSyncSelectChange("syncHistoryDays", value)}
                  >
                    <SelectTrigger id="syncHistoryDays">
                      <SelectValue placeholder="Tage auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 Tage</SelectItem>
                      <SelectItem value="14">14 Tage</SelectItem>
                      <SelectItem value="30">30 Tage</SelectItem>
                      <SelectItem value="60">60 Tage</SelectItem>
                      <SelectItem value="90">90 Tage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <Alert>
                  <Database className="h-4 w-4" />
                  <AlertTitle>Hinweis zur Datenspeicherung</AlertTitle>
                  <AlertDescription>
                    Häufigere Synchronisierungen und größere Batch-Größen können die Serverleistung beeinträchtigen. Passen Sie die Einstellungen an Ihre Systemkapazitäten an.
                  </AlertDescription>
                </Alert>
              </div>
            </TabsContent>

            {/* Notifications Tab */}
            <TabsContent value="notifications" className="space-y-4">
              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="enableNotifications">Benachrichtigungen aktivieren</Label>
                    <p className="text-sm text-muted-foreground">
                      Aktiviert System-Benachrichtigungen
                    </p>
                  </div>
                  <Switch
                    id="enableNotifications"
                    checked={notificationSettings.enableNotifications}
                    onCheckedChange={(checked) => handleNotificationSwitchChange("enableNotifications", checked)}
                  />
                </div>
                
                <Separator className="my-2" />
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="notifyOnError">Bei Fehlern benachrichtigen</Label>
                    <p className="text-sm text-muted-foreground">
                      Sendet Benachrichtigungen bei Synchronisierungsfehlern
                    </p>
                  </div>
                  <Switch
                    id="notifyOnError"
                    checked={notificationSettings.notifyOnError}
                    onCheckedChange={(checked) => handleNotificationSwitchChange("notifyOnError", checked)}
                    disabled={!notificationSettings.enableNotifications}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="notifyOnSuccess">Bei Erfolg benachrichtigen</Label>
                    <p className="text-sm text-muted-foreground">
                      Sendet Benachrichtigungen bei erfolgreicher Synchronisierung
                    </p>
                  </div>
                  <Switch
                    id="notifyOnSuccess"
                    checked={notificationSettings.notifyOnSuccess}
                    onCheckedChange={(checked) => handleNotificationSwitchChange("notifyOnSuccess", checked)}
                    disabled={!notificationSettings.enableNotifications}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="soundAlerts">Tonbenachrichtigungen</Label>
                    <p className="text-sm text-muted-foreground">
                      Aktiviert Tonbenachrichtigungen im Browser
                    </p>
                  </div>
                  <Switch
                    id="soundAlerts"
                    checked={notificationSettings.soundAlerts}
                    onCheckedChange={(checked) => handleNotificationSwitchChange("soundAlerts", checked)}
                    disabled={!notificationSettings.enableNotifications}
                  />
                </div>
                
                <Separator className="my-2" />
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="emailNotifications">E-Mail-Benachrichtigungen</Label>
                    <p className="text-sm text-muted-foreground">
                      Sendet E-Mail-Benachrichtigungen
                    </p>
                  </div>
                  <Switch
                    id="emailNotifications"
                    checked={notificationSettings.emailNotifications}
                    onCheckedChange={(checked) => handleNotificationSwitchChange("emailNotifications", checked)}
                    disabled={!notificationSettings.enableNotifications}
                  />
                </div>
                
                {notificationSettings.emailNotifications && (
                  <div className="space-y-2">
                    <Label htmlFor="email">E-Mail-Adresse</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={notificationSettings.email}
                      onChange={handleNotificationSettingChange}
                      placeholder="name@beispiel.de"
                      disabled={!notificationSettings.emailNotifications || !notificationSettings.enableNotifications}
                    />
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Email Notifications Tab */}
            <TabsContent value="email" className="space-y-4">
              <EmailNotificationsSettings />
            </TabsContent>

            {/* Database Viewer Tab */}
            <TabsContent value="database" className="space-y-4">
              <DatabaseViewer />
            </TabsContent>

            {/* Database Manager Tab */}
            <TabsContent value="backup" className="space-y-4">
              <DatabaseManager />
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="flex justify-end space-x-2">
          <Button variant="outline">Abbrechen</Button>
          <Button onClick={handleSaveSettings} disabled={isSaving}>
            {isSaving ? (
              <>
                <Cog className="h-4 w-4 mr-2 animate-spin" />
                Speichern...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Einstellungen speichern
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
