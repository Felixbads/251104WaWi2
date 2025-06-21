import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Clipboard, 
  Copy, 
  BarChart4, 
  CheckCircle2, 
  Package2, 
  AlertCircle,
  Truck,
  ArrowRight
} from 'lucide-react';

// Enhanced Order Mode Types
export type EnhancedOrderMode = 'standard' | 'refill' | 'special' | 'emergency' | 'copy';

interface OrderModeOption {
  id: EnhancedOrderMode;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  features: string[];
}

interface EnhancedOrderModeSelectorProps {
  mode: EnhancedOrderMode;
  onSelectMode: (mode: EnhancedOrderMode) => void;
  onNext: () => void;
  onBack: () => void;
}

const EnhancedOrderModeSelector: React.FC<EnhancedOrderModeSelectorProps> = ({
  mode,
  onSelectMode,
  onNext,
  onBack
}) => {
  // Enhanced Order Modes with detailed descriptions
  const orderModes: OrderModeOption[] = [
    {
      id: 'standard',
      title: 'Standardbestellung',
      description: 'Reguläre Bestellung mit normaler Priorität und Standard-Lieferzeit.',
      icon: <Clipboard className="h-8 w-8" />,
      color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
      features: ['Normale Priorität', 'Standard-Lieferzeit', 'Reguläre Konditionen']
    },
    {
      id: 'refill',
      title: 'Nachfüllbestellung',
      description: 'Automatisierte Bestellung basierend auf Mindestbeständen und Verbrauchsprognosen.',
      icon: <Package2 className="h-8 w-8" />,
      color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
      features: ['Bestandsbasiert', 'Automatische Mengen', 'Optimierte Nachfüllung']
    },
    {
      id: 'special',
      title: 'Sonderbestellung',
      description: 'Spezielle Bestellung für besondere Anlässe oder einmalige Anforderungen.',
      icon: <BarChart4 className="h-8 w-8" />,
      color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',
      features: ['Individuelle Anpassung', 'Sonderkonditionen', 'Flexible Lieferung']
    },
    {
      id: 'emergency',
      title: 'Eilbestellung',
      description: 'Dringliche Bestellung mit höchster Priorität und Express-Lieferung.',
      icon: <AlertCircle className="h-8 w-8" />,
      color: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
      features: ['Höchste Priorität', 'Express-Lieferung', 'Sofortige Bearbeitung']
    },
    {
      id: 'copy',
      title: 'Bestellung kopieren',
      description: 'Erstellen Sie eine neue Bestellung basierend auf einer bestehenden Bestellung.',
      icon: <Copy className="h-8 w-8" />,
      color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300',
      features: ['Vorlage verwenden', 'Zeitsparend', 'Bewährte Zusammenstellung']
    }
  ];

  return (
    <Card className="w-full max-w-5xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          <span>Bestellmodus wählen</span>
        </CardTitle>
        <CardDescription>
          Wählen Sie zuerst den passenden Bestellmodus für Ihre neue Bestellung.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orderModes.map(orderMode => (
            <Card 
              key={orderMode.id}
              className={`cursor-pointer transition-all hover:border-primary hover:bg-accent/50 ${
                mode === orderMode.id ? 'border-primary bg-accent/50' : ''
              }`}
              onClick={() => onSelectMode(orderMode.id)}
            >
              <CardContent className="p-4">
                <div className={`rounded-full p-3 mb-4 w-fit ${orderMode.color}`}>
                  {orderMode.icon}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-lg">{orderMode.title}</h3>
                    {mode === orderMode.id && (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{orderMode.description}</p>
                  <div className="space-y-1">
                    {orderMode.features.map((feature, index) => (
                      <div key={index} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onBack}>
            Zurück zur Übersicht
          </Button>
          <Button onClick={onNext} disabled={!mode}>
            Weiter
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default EnhancedOrderModeSelector;