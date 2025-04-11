import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { Slot } from "@radix-ui/react-slot"
import {
  Controller,
  ControllerProps,
  FieldPath,
  FieldValues,
  FormProvider,
  useFormContext,
} from "react-hook-form"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

const Form = FormProvider

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> = {
  name: TName
}

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
)

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  )
}

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)
  
  // Sichere Überprüfung, ob Kontexte vorhanden sind
  if (!fieldContext || !fieldContext.name) {
    console.error("FormField: fieldContext fehlt oder hat keine name-Eigenschaft")
    return {
      id: "error-id",
      name: "",
      formItemId: "error-form-item",
      formDescriptionId: "error-form-item-description",
      formMessageId: "error-form-item-message",
      error: undefined
    }
  }
  
  if (!itemContext || !itemContext.id) {
    console.error("FormField: itemContext fehlt oder hat keine id-Eigenschaft")
    return {
      id: "error-id",
      name: fieldContext.name,
      formItemId: "error-form-item",
      formDescriptionId: "error-form-item-description",
      formMessageId: "error-form-item-message",
      error: undefined
    }
  }
  
  // Sichere Extraktion statt Destructuring
  const formContext = useFormContext()
  if (!formContext || typeof formContext.getFieldState !== 'function') {
    console.error("FormField: formContext fehlt oder getFieldState ist keine Funktion")
    return {
      id: itemContext.id,
      name: fieldContext.name,
      formItemId: `${itemContext.id}-form-item`,
      formDescriptionId: `${itemContext.id}-form-item-description`,
      formMessageId: `${itemContext.id}-form-item-message`,
      error: undefined
    }
  }
  
  const getFieldState = formContext.getFieldState
  const formState = formContext.formState
  
  // Sichere Durchführung von getFieldState mit Fehlerbehandlung
  let fieldState = {}
  try {
    fieldState = getFieldState(fieldContext.name, formState) || {}
  } catch (err) {
    console.error("FormField: Fehler beim Abrufen des field state:", err)
  }
  
  // Alles sicher zusammensetzen
  const id = itemContext.id
  
  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  }
}

type FormItemContextValue = {
  id: string
}

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue
)

const FormItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const id = React.useId()

  return (
    <FormItemContext.Provider value={{ id }}>
      <div ref={ref} className={cn("space-y-2", className)} {...props} />
    </FormItemContext.Provider>
  )
})
FormItem.displayName = "FormItem"

const FormLabel = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => {
  try {
    // Standardwerte für den Fall dass kein Formkontext existiert
    let hasError = false;
    let itemId = '';
    
    try {
      const formField = useFormField();
      hasError = !!formField?.error;
      itemId = formField?.formItemId || '';
    } catch (e) {
      console.error("Fehler in FormLabel beim Zugriff auf useFormField:", e);
    }
    
    return (
      <Label
        ref={ref}
        className={cn(hasError && "text-destructive", className)}
        htmlFor={itemId}
        {...props}
      />
    );
  } catch (err) {
    console.error("Kritischer Fehler in FormLabel:", err);
    // Fallback bei schwerwiegendem Fehler
    return <Label ref={ref} className={className} {...props} />;
  }
})
FormLabel.displayName = "FormLabel"

const FormControl = React.forwardRef<
  React.ElementRef<typeof Slot>,
  React.ComponentPropsWithoutRef<typeof Slot>
>(({ ...props }, ref) => {
  try {
    // Standardwerte für den Fall dass kein Formkontext existiert
    let hasError = false;
    let itemId = '';
    let descriptionId = '';
    let messageId = '';
    
    try {
      const formField = useFormField();
      hasError = !!formField?.error;
      itemId = formField?.formItemId || '';
      descriptionId = formField?.formDescriptionId || '';
      messageId = formField?.formMessageId || '';
    } catch (e) {
      console.error("Fehler in FormControl beim Zugriff auf useFormField:", e);
    }
    
    return (
      <Slot
        ref={ref}
        id={itemId}
        aria-describedby={
          !hasError
            ? `${descriptionId}`
            : `${descriptionId} ${messageId}`
        }
        aria-invalid={hasError}
        {...props}
      />
    );
  } catch (err) {
    console.error("Kritischer Fehler in FormControl:", err);
    // Fallback bei schwerwiegendem Fehler
    return <Slot ref={ref} {...props} />;
  }
})
FormControl.displayName = "FormControl"

const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  try {
    // Standardwerte für den Fall dass kein Formkontext existiert
    let descriptionId = 'form-desc';
    
    try {
      const formField = useFormField();
      descriptionId = formField?.formDescriptionId || 'form-desc';
    } catch (e) {
      console.error("Fehler in FormDescription beim Zugriff auf useFormField:", e);
    }
    
    return (
      <p
        ref={ref}
        id={descriptionId}
        className={cn("text-sm text-muted-foreground", className)}
        {...props}
      />
    );
  } catch (err) {
    console.error("Kritischer Fehler in FormDescription:", err);
    // Fallback bei schwerwiegendem Fehler
    return <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />;
  }
})
FormDescription.displayName = "FormDescription"

const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  try {
    // Eine Fallback-Implementierung, die mit minimalem Risiko läuft
    let messageId = 'form-message';
    let errorMessage: React.ReactNode = children;
    
    try {
      // Versuche den Form-Kontext zu verwenden, falls verfügbar
      const formField = useFormField();
      
      if (formField && formField.formMessageId) {
        messageId = formField.formMessageId;
      }
      
      // Versuche den Fehler auszulesen, falls vorhanden
      if (formField && formField.error) {
        const error = formField.error as any;
        
        if (error) {
          if (typeof error === 'string') {
            errorMessage = error;
          } else if (typeof error === 'object') {
            // @ts-ignore: Ignoriere den TypeScript-Fehler für 'message'
            errorMessage = error.message || "Validierungsfehler";
          }
        }
      }
    } catch (contextError) {
      console.error("Fehler beim Zugriff auf FormField-Kontext:", contextError);
    }
    
    // Wenn keine Nachricht vorhanden ist, nichts rendern
    if (!errorMessage) {
      return null;
    }
    
    // Sicheres Rendering
    return (
      <p
        ref={ref}
        id={messageId}
        className={cn("text-sm font-medium text-destructive", className)}
        {...props}
      >
        {errorMessage}
      </p>
    );
  } catch (err) {
    // Letztes Fallback bei schwerwiegenden Fehlern
    console.error("Kritischer Fehler in FormMessage:", err);
    return null;
  }
})
FormMessage.displayName = "FormMessage"

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
}
