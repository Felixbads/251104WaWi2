import { vendonAPI } from './vendonAPI';
import { db, rawDb } from '../db';
import { eq, and } from 'drizzle-orm';
import { 
  refillTemplates, 
  refillTemplateProducts, 
  machines,
  type RefillTemplate,
  type RefillTemplateProduct 
} from '../../shared/schema';

/**
 * Service für die Integration zwischen Refill-Vorlagen und Vendon API
 */
export class RefillTemplateVendonService {
  
  /**
   * Synchronisiert Refill-Vorlage mit Vendon für eine spezifische Maschine
   */
  static async syncTemplateToVendon(templateId: number, machineVendonId: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`[REFILL-TEMPLATE-VENDON] Syncing template ${templateId} to Vendon machine ${machineVendonId}`);

      // Vorlage mit Produkten abrufen
      const template = await db
        .select()
        .from(refillTemplates)
        .where(eq(refillTemplates.id, templateId))
        .limit(1);

      if (template.length === 0) {
        return { success: false, error: 'Refill-Vorlage nicht gefunden' };
      }

      const templateData = template[0];

      // Produkte der Vorlage abrufen
      const products = await db
        .select()
        .from(refillTemplateProducts)
        .where(eq(refillTemplateProducts.templateId, templateId));

      console.log(`[REFILL-TEMPLATE-VENDON] Found ${products.length} products in template`);

      // Vendon-spezifische Refill-Daten erstellen
      const vendonRefillData = {
        templateName: templateData.name,
        description: templateData.description,
        machineId: machineVendonId,
        products: products.map(product => ({
          productName: product.productName,
          position: product.position,
          quantity: product.quantity,
          minRefill: product.minRefill,
          maxCapacity: product.maxCapacity
        }))
      };

      // An Vendon API senden (simuliert - echte Implementation würde Vendon API aufrufen)
      const vendonResponse = await this.sendTemplateToVendon(machineVendonId, vendonRefillData);
      
      if (vendonResponse.success) {
        // Vendon-ID in der Vorlage speichern
        await db
          .update(refillTemplates)
          .set({ 
            vendonId: vendonResponse.vendonTemplateId,
            updatedAt: new Date()
          })
          .where(eq(refillTemplates.id, templateId));

        console.log(`[REFILL-TEMPLATE-VENDON] Successfully synced template to Vendon with ID: ${vendonResponse.vendonTemplateId}`);
        return { success: true };
      } else {
        console.error(`[REFILL-TEMPLATE-VENDON] Failed to sync template to Vendon:`, vendonResponse.error);
        return { success: false, error: vendonResponse.error };
      }

    } catch (error) {
      console.error('[REFILL-TEMPLATE-VENDON] Error syncing template to Vendon:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unbekannter Fehler bei der Vendon-Synchronisation' 
      };
    }
  }

  /**
   * Importiert Refill-Vorlagen von Vendon für eine Maschine
   */
  static async importTemplatesFromVendon(machineId: number, vendonMachineId: string): Promise<{ success: boolean; imported: number; error?: string }> {
    try {
      console.log(`[REFILL-TEMPLATE-VENDON] Importing templates from Vendon for machine ${vendonMachineId}`);

      // Vendon-Templates für die Maschine abrufen (simuliert)
      const vendonTemplates = await this.getTemplatesFromVendon(vendonMachineId);

      if (!vendonTemplates.success) {
        return { success: false, imported: 0, error: vendonTemplates.error };
      }

      let importedCount = 0;

      for (const vendonTemplate of vendonTemplates.templates) {
        // Prüfen, ob Vorlage bereits existiert
        const existingTemplate = await db
          .select()
          .from(refillTemplates)
          .where(and(
            eq(refillTemplates.machineId, machineId),
            eq(refillTemplates.vendonId, vendonTemplate.id)
          ))
          .limit(1);

        if (existingTemplate.length === 0) {
          // Neue Vorlage erstellen
          const [newTemplate] = await db
            .insert(refillTemplates)
            .values({
              machineId: machineId,
              vendonId: vendonTemplate.id,
              name: vendonTemplate.name,
              description: vendonTemplate.description || `Importiert von Vendon am ${new Date().toLocaleDateString('de-DE')}`,
              isDefault: vendonTemplate.isDefault || false,
              createdBy: null, // System-Import
              updatedBy: null
            })
            .returning();

          // Produkte der Vorlage importieren
          if (vendonTemplate.products && vendonTemplate.products.length > 0) {
            const templateProducts = vendonTemplate.products.map((product: any) => ({
              templateId: newTemplate.id,
              productId: null, // Wird später über Mapping aufgelöst
              productName: product.productName,
              quantity: product.quantity || 0,
              minRefill: product.minRefill || 0,
              maxCapacity: product.maxCapacity || 0,
              position: product.position || null
            }));

            await db
              .insert(refillTemplateProducts)
              .values(templateProducts);
          }

          importedCount++;
          console.log(`[REFILL-TEMPLATE-VENDON] Imported template: ${vendonTemplate.name}`);
        } else {
          console.log(`[REFILL-TEMPLATE-VENDON] Template already exists: ${vendonTemplate.name}`);
        }
      }

      console.log(`[REFILL-TEMPLATE-VENDON] Import completed. ${importedCount} templates imported.`);
      return { success: true, imported: importedCount };

    } catch (error) {
      console.error('[REFILL-TEMPLATE-VENDON] Error importing templates from Vendon:', error);
      return { 
        success: false, 
        imported: 0,
        error: error instanceof Error ? error.message : 'Unbekannter Fehler beim Import' 
      };
    }
  }

  /**
   * Erstellt automatisch Refill-Vorlage basierend auf aktuellen Vendon-Beständen
   */
  static async createTemplateFromVendonStock(machineId: number, vendonMachineId: string, templateName: string): Promise<{ success: boolean; templateId?: number; error?: string }> {
    try {
      console.log(`[REFILL-TEMPLATE-VENDON] Creating template from Vendon stock for machine ${vendonMachineId}`);

      // Aktuelle Bestände von Vendon abrufen
      const stockData = await this.getVendonStock(vendonMachineId);

      if (!stockData.success) {
        return { success: false, error: stockData.error };
      }

      // Vorlage erstellen
      const [newTemplate] = await db
        .insert(refillTemplates)
        .values({
          machineId: machineId,
          name: templateName,
          description: `Automatisch erstellt basierend auf Vendon-Beständen am ${new Date().toLocaleDateString('de-DE')}`,
          isDefault: false,
          createdBy: null, // System-generiert
          updatedBy: null
        })
        .returning();

      // Produkte basierend auf aktuellen Beständen hinzufügen
      if (stockData.products && stockData.products.length > 0) {
        const templateProducts = stockData.products.map((product: any) => ({
          templateId: newTemplate.id,
          productId: null,
          productName: product.productName,
          quantity: Math.max(product.maxCapacity - product.currentStock, 0), // Auffüllmenge berechnen
          minRefill: Math.floor(product.maxCapacity * 0.2), // 20% der Kapazität als Minimum
          maxCapacity: product.maxCapacity,
          position: product.position
        }));

        await db
          .insert(refillTemplateProducts)
          .values(templateProducts);
      }

      console.log(`[REFILL-TEMPLATE-VENDON] Created template from Vendon stock: ${templateName}`);
      return { success: true, templateId: newTemplate.id };

    } catch (error) {
      console.error('[REFILL-TEMPLATE-VENDON] Error creating template from Vendon stock:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Fehler beim Erstellen der Vorlage aus Vendon-Beständen' 
      };
    }
  }

  /**
   * Simuliert das Senden einer Vorlage an Vendon (echte Implementation würde Vendon API verwenden)
   */
  private static async sendTemplateToVendon(machineId: string, templateData: any): Promise<{ success: boolean; vendonTemplateId?: string; error?: string }> {
    try {
      // Simuliert API-Aufruf zu Vendon
      console.log(`[REFILL-TEMPLATE-VENDON] Simulating Vendon API call for machine ${machineId}`);
      
      // In echter Implementation würde hier ein echter Vendon API Aufruf stehen:
      // const response = await vendonAPI.createRefillTemplate(machineId, templateData);
      
      // Simulierte erfolgreiche Antwort
      await new Promise(resolve => setTimeout(resolve, 500)); // Simuliere Netzwerk-Latenz
      
      const simulatedVendonId = `vendon_template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      return {
        success: true,
        vendonTemplateId: simulatedVendonId
      };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Vendon API Fehler'
      };
    }
  }

  /**
   * Simuliert das Abrufen von Vorlagen von Vendon
   */
  private static async getTemplatesFromVendon(machineId: string): Promise<{ success: boolean; templates: any[]; error?: string }> {
    try {
      // Simuliert API-Aufruf zu Vendon
      console.log(`[REFILL-TEMPLATE-VENDON] Simulating Vendon API call to get templates for machine ${machineId}`);
      
      // Simulierte Antwort mit Beispiel-Vorlagen
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const simulatedTemplates = [
        {
          id: `vendon_template_${machineId}_1`,
          name: 'Standard-Auffüllung',
          description: 'Standard Refill-Vorlage für normale Betriebstage',
          isDefault: true,
          products: [
            {
              productName: 'Coca Cola 0.33l',
              position: 'A1',
              quantity: 10,
              minRefill: 5,
              maxCapacity: 15
            },
            {
              productName: 'Snickers 50g',
              position: 'B2',
              quantity: 8,
              minRefill: 3,
              maxCapacity: 12
            }
          ]
        },
        {
          id: `vendon_template_${machineId}_2`,
          name: 'Wochenende-Mix',
          description: 'Spezielle Mischung für Wochenenden',
          isDefault: false,
          products: [
            {
              productName: 'Red Bull 0.25l',
              position: 'A2',
              quantity: 6,
              minRefill: 2,
              maxCapacity: 10
            }
          ]
        }
      ];
      
      return {
        success: true,
        templates: simulatedTemplates
      };
      
    } catch (error) {
      return {
        success: false,
        templates: [],
        error: error instanceof Error ? error.message : 'Fehler beim Abrufen der Vendon-Vorlagen'
      };
    }
  }

  /**
   * Simuliert das Abrufen von aktuellen Beständen von Vendon
   */
  private static async getVendonStock(machineId: string): Promise<{ success: boolean; products: any[]; error?: string }> {
    try {
      // Simuliert API-Aufruf zu Vendon
      console.log(`[REFILL-TEMPLATE-VENDON] Simulating Vendon API call to get stock for machine ${machineId}`);
      
      await new Promise(resolve => setTimeout(resolve, 400));
      
      // Simulierte Bestände
      const simulatedStock = [
        {
          productName: 'Coca Cola 0.33l',
          position: 'A1',
          currentStock: 5,
          maxCapacity: 15
        },
        {
          productName: 'Pepsi Cola 0.33l',
          position: 'A2',
          currentStock: 3,
          maxCapacity: 15
        },
        {
          productName: 'Snickers 50g',
          position: 'B1',
          currentStock: 2,
          maxCapacity: 12
        },
        {
          productName: 'Mars 50g',
          position: 'B2',
          currentStock: 4,
          maxCapacity: 12
        }
      ];
      
      return {
        success: true,
        products: simulatedStock
      };
      
    } catch (error) {
      return {
        success: false,
        products: [],
        error: error instanceof Error ? error.message : 'Fehler beim Abrufen der Vendon-Bestände'
      };
    }
  }
}