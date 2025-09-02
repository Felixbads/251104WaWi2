import React from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  CheckCircle, 
  Clock, 
  Truck, 
  Package, 
  Mail, 
  Calendar,
  FileText,
  ArrowRight,
  AlertCircle,
  X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Interfaces
interface OrderStatusStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  status: 'completed' | 'current' | 'pending' | 'skipped';
  date?: string;
  details?: string;
}

interface OrderStatusWorkflowProps {
  order: any; // Order data with status information
  onNavigateToStep?: (step: string) => void;
}

// Helper function to determine workflow steps based on order data
const getWorkflowSteps = (order: any): OrderStatusStep[] => {
  const steps: OrderStatusStep[] = [
    {
      id: 'draft',
      title: 'Bestellung erstellt',
      description: 'Bestellung wurde als Entwurf erstellt',
      icon: <FileText className="h-4 w-4" />,
      status: 'completed',
      date: order.orderDate,
      details: `Erstellt von ${order.createdByName || 'System'}`
    },
    {
      id: 'sent',
      title: 'Bestellung versendet',
      description: 'Bestellung an Lieferant übermittelt',
      icon: <Mail className="h-4 w-4" />,
      status: getStepStatus(order.status, ['draft'], ['sent', 'confirmed', 'received']),
      date: order.sentDate || order.emailSentDate,
      details: order.supplierEmail ? `An ${order.supplierEmail}` : 'Per E-Mail versendet'
    },
    {
      id: 'confirmed',
      title: 'Lieferant bestätigt',
      description: 'Bestellung vom Lieferant angenommen',
      icon: <CheckCircle className="h-4 w-4" />,
      status: getStepStatus(order.status, ['draft', 'sent'], ['confirmed', 'received']),
      date: order.confirmedDate,
      details: order.supplierConfirmation ? 'Bestätigung erhalten' : 'Warten auf Bestätigung'
    },
    {
      id: 'received',
      title: 'Wareneingang geprüft',
      description: 'Ware wurde eingelagert',
      icon: <Package className="h-4 w-4" />,
      status: getStepStatus(order.status, ['draft', 'sent', 'confirmed'], ['received']),
      date: order.receivedDate,
      details: order.receivedDate ? 'Vollständig eingelagert' : 'Wareneingang ausstehend'
    }
  ];

  return steps;
};

// Helper function to determine step status
function getStepStatus(orderStatus: string, beforeStates: string[], currentAndAfterStates: string[]): 'completed' | 'current' | 'pending' | 'skipped' {
  if (currentAndAfterStates.includes(orderStatus)) {
    return 'completed';
  }
  if (beforeStates.includes(orderStatus)) {
    return 'pending';
  }
  
  // Current step logic
  if (orderStatus === 'draft' && beforeStates.length === 0) return 'current';
  if (orderStatus === 'sent' && beforeStates.includes('draft')) return 'current';
  if (orderStatus === 'confirmed' && beforeStates.includes('sent')) return 'current';
  if (orderStatus === 'received' && beforeStates.includes('confirmed')) return 'current';
  
  return 'pending';
}

// Status color mapping
const getStatusColor = (status: 'completed' | 'current' | 'pending' | 'skipped') => {
  switch (status) {
    case 'completed': return 'text-green-600 bg-green-100 border-green-200';
    case 'current': return 'text-blue-600 bg-blue-100 border-blue-200';
    case 'pending': return 'text-gray-400 bg-gray-50 border-gray-200';
    case 'skipped': return 'text-red-600 bg-red-100 border-red-200';
    default: return 'text-gray-400 bg-gray-50 border-gray-200';
  }
};

const getStatusIcon = (status: 'completed' | 'current' | 'pending' | 'skipped') => {
  switch (status) {
    case 'completed': return <CheckCircle className="h-5 w-5 text-green-600" />;
    case 'current': return <Clock className="h-5 w-5 text-blue-600" />;
    case 'pending': return <Clock className="h-5 w-5 text-gray-400" />;
    case 'skipped': return <X className="h-5 w-5 text-red-600" />;
    default: return <Clock className="h-5 w-5 text-gray-400" />;
  }
};

/**
 * OrderStatusWorkflow - Zeigt den Fortschritt einer Bestellung als Workflow an
 */
const OrderStatusWorkflow: React.FC<OrderStatusWorkflowProps> = ({ 
  order, 
  onNavigateToStep 
}) => {
  const steps = getWorkflowSteps(order);
  const currentStepIndex = steps.findIndex(step => step.status === 'current');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowRight className="h-5 w-5" />
          Bestellstatus-Workflow
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-start gap-4">
              {/* Status Icon */}
              <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${getStatusColor(step.status)}`}>
                {getStatusIcon(step.status)}
              </div>
              
              {/* Step Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className={`font-medium ${step.status === 'current' ? 'text-blue-600' : step.status === 'completed' ? 'text-green-700' : 'text-gray-500'}`}>
                      {step.title}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">{step.description}</p>
                    {step.details && (
                      <p className="text-xs text-gray-500 mt-1">{step.details}</p>
                    )}
                  </div>
                  
                  <div className="text-right">
                    {step.date && (
                      <div className="text-sm text-gray-600">
                        {format(new Date(step.date), 'dd.MM.yyyy', { locale: de })}
                      </div>
                    )}
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${getStatusColor(step.status)}`}
                    >
                      {step.status === 'completed' ? 'Abgeschlossen' :
                       step.status === 'current' ? 'Aktuell' :
                       step.status === 'pending' ? 'Ausstehend' : 'Übersprungen'}
                    </Badge>
                  </div>
                </div>
                
                {/* Action Buttons */}
                {step.status === 'current' && onNavigateToStep && (
                  <div className="mt-2">
                    {step.id === 'sent' && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => onNavigateToStep('sendOrder')}
                      >
                        <Mail className="h-3 w-3 mr-1" />
                        E-Mail senden
                      </Button>
                    )}
                    {step.id === 'received' && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => onNavigateToStep('goodsReceipt')}
                      >
                        <Package className="h-3 w-3 mr-1" />
                        Wareneingang
                      </Button>
                    )}
                  </div>
                )}
              </div>
              
              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div className="absolute left-5 mt-10 w-0.5 h-6 bg-gray-200" />
              )}
            </div>
          ))}
        </div>
        
        {/* Progress Summary */}
        <div className="mt-6 pt-4 border-t">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">
              Fortschritt: {steps.filter(s => s.status === 'completed').length} von {steps.length} abgeschlossen
            </span>
            <span className="text-gray-600">
              {currentStepIndex >= 0 ? `Aktueller Schritt: ${steps[currentStepIndex].title}` : 'Alle Schritte abgeschlossen'}
            </span>
          </div>
          
          {/* Progress Bar */}
          <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-500 h-2 rounded-full transition-all duration-300"
              style={{ 
                width: `${(steps.filter(s => s.status === 'completed').length / steps.length) * 100}%` 
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default OrderStatusWorkflow;