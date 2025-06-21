import React from 'react';
import { Button } from "@/components/ui/button";
import { Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

interface CopyOrderButtonProps {
  orderId: number;
  orderNumber?: string;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'default' | 'outline' | 'secondary' | 'destructive' | 'ghost' | 'link';
  className?: string;
}

const CopyOrderButton: React.FC<CopyOrderButtonProps> = ({
  orderId,
  orderNumber,
  size = 'sm',
  variant = 'outline',
  className = ''
}) => {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const handleCopyOrder = () => {
    // Navigate to the enhanced order process with copy mode
    navigate(`/bestellungen/neu-enhanced?mode=copy&sourceOrderId=${orderId}`);
    
    toast({
      title: 'Bestellung kopieren',
      description: `Bestellung ${orderNumber || orderId} wird als Vorlage verwendet.`,
    });
  };

  return (
    <Button
      size={size}
      variant={variant}
      onClick={handleCopyOrder}
      className={className}
    >
      <Copy className="h-4 w-4 mr-1" />
      Kopieren
    </Button>
  );
};

export default CopyOrderButton;