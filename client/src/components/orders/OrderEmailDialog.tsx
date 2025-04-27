import React, { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import LoadingButton from "@/components/common/LoadingButton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";

interface OrderEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: number;
  supplierEmail?: string;
  orderNumber: string;
  supplierName: string;
}

const OrderEmailDialog: React.FC<OrderEmailDialogProps> = ({
  open,
  onOpenChange,
  orderId,
  supplierEmail: initialSupplierEmail = "",
  orderNumber,
  supplierName,
}) => {
  const { toast } = useToast();
  const [emailContent, setEmailContent] = useState<string>("");
  const [supplierEmail, setSupplierEmail] = useState<string>(initialSupplierEmail);
  const [emailSubject, setEmailSubject] = useState<string>("");
  const [templateType, setTemplateType] = useState<string>("standard");

  // E-Mail-Vorlage laden
  const { data: templateData, isLoading: templateLoading } = useQuery({
    queryKey: ["/api/orders", orderId, "email-template", templateType],
    queryFn: () => 
      apiRequest(`/api/orders/${orderId}/email-template?type=${templateType}`),
    enabled: open,
  });

  // Aktualisiert die E-Mail-Vorlage, wenn sich der Vorlagentyp ändert
  useEffect(() => {
    if (templateData) {
      setEmailContent(templateData.content);
      setEmailSubject(templateData.subject);
    }
  }, [templateData]);

  // E-Mail senden Mutation
  const { mutate: sendEmail, isPending: isSending } = useMutation({
    mutationFn: (data: {
      to: string;
      subject: string;
      content: string;
      templateType: string;
    }) => 
      apiRequest(`/api/orders/${orderId}/email`, {
        method: "POST",
        data,
      }),
    onSuccess: () => {
      toast({
        title: "E-Mail gesendet",
        description: "Die E-Mail wurde erfolgreich versendet",
        variant: "default",
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Die E-Mail konnte nicht gesendet werden. " + (error as Error).message,
        variant: "destructive",
      });
    },
  });

  // Ausgewählte Vorlage beim Klick auf den Tab aktualisieren
  const handleTemplateChange = (value: string) => {
    setTemplateType(value);
  };

  // E-Mail senden
  const handleSendEmail = () => {
    if (!supplierEmail) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie eine E-Mail-Adresse ein",
        variant: "destructive",
      });
      return;
    }

    sendEmail({
      to: supplierEmail,
      subject: emailSubject,
      content: emailContent,
      templateType,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bestellung an Lieferant senden</DialogTitle>
          <DialogDescription>
            Bestellung {orderNumber} an {supplierName} per E-Mail versenden
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="email" className="text-right">
              E-Mail-Adresse
            </Label>
            <Input
              id="email"
              value={supplierEmail}
              onChange={(e) => setSupplierEmail(e.target.value)}
              placeholder="lieferant@example.com"
              className="col-span-3"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="subject" className="text-right">
              Betreff
            </Label>
            <Input
              id="subject"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              className="col-span-3"
            />
          </div>

          <Tabs
            defaultValue="standard"
            value={templateType}
            onValueChange={handleTemplateChange}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="standard">Standard</TabsTrigger>
              <TabsTrigger value="dringend">Dringend</TabsTrigger>
              <TabsTrigger value="nachbestellung">Nachbestellung</TabsTrigger>
            </TabsList>

            <TabsContent value={templateType} className="mt-2">
              {templateLoading ? (
                <div className="flex items-center justify-center p-6">
                  <p>Vorlage wird geladen...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label htmlFor="emailContent" className="mb-2 block">
                      E-Mail-Inhalt
                    </Label>
                    <Textarea
                      id="emailContent"
                      value={emailContent}
                      onChange={(e) => setEmailContent(e.target.value)}
                      className="min-h-[300px] font-mono text-sm"
                      placeholder="E-Mail-Inhalt wird geladen..."
                    />
                    <p className="mt-2 text-sm text-muted-foreground">
                      Artikel werden automatisch in der fertigen E-Mail angezeigt
                    </p>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <DialogClose asChild>
            <Button variant="outline">Abbrechen</Button>
          </DialogClose>
          <LoadingButton
            isLoading={isSending}
            loadingText="Wird gesendet..."
            onClick={handleSendEmail}
            variant="default"
          >
            E-Mail senden
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OrderEmailDialog;