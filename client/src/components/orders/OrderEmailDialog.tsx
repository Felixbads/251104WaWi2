import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

interface OrderEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
  defaultSubject?: string;
  defaultContent?: string;
  defaultTo?: string;
  onSuccess?: () => void;
}

export function OrderEmailDialog({
  open,
  onOpenChange,
  order,
  defaultSubject = "",
  defaultContent = "",
  defaultTo = "",
  onSuccess
}: OrderEmailDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  // Form state
  const [to, setTo] = useState(defaultTo);
  const [from, setFrom] = useState("orders@meine-firma.de");
  const [subject, setSubject] = useState(defaultSubject || `Bestellung ${order?.orderNumber} - ${order?.supplierName || ""}`);
  const [emailBody, setEmailBody] = useState(defaultContent);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!to || !from) {
      toast({
        title: "Fehlende Angaben",
        description: "Bitte geben Sie Absender- und Empfängeradresse an.",
        variant: "destructive"
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      const response = await apiRequest(`/api/email/order/${order.id}`, {
        method: "POST",
        data: {
          to,
          from,
          subject,
          emailBody
        }
      });
      
      toast({
        title: "E-Mail erfolgreich versendet",
        description: "Die Bestellung wurde per E-Mail an den Lieferanten gesendet."
      });
      
      if (onSuccess) {
        onSuccess();
      }
      
      onOpenChange(false);
    } catch (error) {
      console.error("Fehler beim Senden der E-Mail:", error);
      toast({
        title: "Fehler beim Senden",
        description: error instanceof Error ? error.message : "Die E-Mail konnte nicht gesendet werden.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Bestellung per E-Mail senden</DialogTitle>
            <DialogDescription>
              Senden Sie diese Bestellung per E-Mail an den Lieferanten.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="to" className="text-right">
                Empfänger
              </Label>
              <Input
                id="to"
                placeholder="lieferant@example.com"
                className="col-span-3"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="from" className="text-right">
                Absender
              </Label>
              <Input
                id="from"
                placeholder="meine-firma@example.com"
                className="col-span-3"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                required
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="subject" className="text-right">
                Betreff
              </Label>
              <Input
                id="subject"
                placeholder="Bestellung"
                className="col-span-3"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="emailBody" className="text-right pt-2">
                Nachricht
              </Label>
              <Textarea
                id="emailBody"
                placeholder="Geben Sie hier den Text der E-Mail ein. Die Bestellpositionen werden automatisch als Tabelle unter dem Text eingefügt."
                className="col-span-3 h-[200px]"
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
              />
            </div>
            
            <div className="col-span-4">
              <p className="text-sm text-muted-foreground">
                <strong>Hinweis:</strong> Die Bestellpositionen werden automatisch als Tabelle in der E-Mail angezeigt. 
                Fügen Sie die Tabelle mit dem Platzhalter <code>{"{{orderItems}}"}</code> ein, oder sie wird automatisch am Ende der Nachricht eingefügt.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Wird gesendet...
                </>
              ) : (
                'E-Mail senden'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}