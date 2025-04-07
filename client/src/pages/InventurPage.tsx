import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, BarChart3, Package, CheckCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import InventurListe from '@/components/inventur/InventurListe';
import InventurStarten from '@/components/inventur/InventurStarten';
import InventurStatistik from '@/components/inventur/InventurStatistik';

export default function InventurPage() {
  const [activeTab, setActiveTab] = useState('uebersicht');

  // Lade Lagerübersicht
  const { data: warehouses, isLoading: isLoadingWarehouses } = useQuery({
    queryKey: ['/api/warehouses'],
    staleTime: 5 * 60 * 1000, // 5 Minuten Cache
  });

  return (
    <div className="container mx-auto py-6 space-y-8">
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Inventur</h1>
        <p className="text-muted-foreground">
          Erfassen und verwalten Sie den Lagerbestand durch regelmäßige Inventuren
        </p>
      </div>

      <Tabs
        defaultValue="uebersicht"
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="uebersicht" className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            <span>Übersicht</span>
          </TabsTrigger>
          <TabsTrigger value="neu" className="flex items-center gap-2">
            <CheckCheck className="h-4 w-4" />
            <span>Neue Inventur</span>
          </TabsTrigger>
          <TabsTrigger value="statistik" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span>Statistik</span>
          </TabsTrigger>
        </TabsList>

        {/* Überblick über bestehende Inventuren */}
        <TabsContent value="uebersicht">
          <InventurListe />
        </TabsContent>

        {/* Neue Inventur starten */}
        <TabsContent value="neu">
          <InventurStarten onInventurGestartet={() => setActiveTab('uebersicht')} />
        </TabsContent>

        {/* Inventurdaten und Statistik */}
        <TabsContent value="statistik">
          <InventurStatistik />
        </TabsContent>
      </Tabs>
    </div>
  );
}