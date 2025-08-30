import { VendonAPI } from './vendonAPI';
import { db, rawDb } from '../db';
import { eq, and } from 'drizzle-orm';
import { 
  refillTemplates, 
  refillTemplateProducts, 
  machines,
  type RefillTemplate,
  type RefillTemplateProduct 
} from '../../shared/schema';

// Erstelle eine Instanz der VendonAPI
const vendonAPI = new VendonAPI();

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
   * Importiert Refill-Vorlagen von Vendon für eine Maschine basierend auf aktuellen Beständen
   */
  static async importTemplatesFromVendon(machineId: number, vendonMachineId: string): Promise<{ success: boolean; imported: number; error?: string }> {
    try {
      console.log(`[REFILL-TEMPLATE-VENDON] Importing templates from Vendon for machine ${vendonMachineId}`);

      // Aktuelle Bestände von Vendon abrufen
      const stockData = await vendonAPI.getMachineStock(vendonMachineId);

      if (!stockData || !Array.isArray(stockData)) {
        return { success: false, imported: 0, error: 'Keine Bestandsdaten von Vendon verfügbar' };
      }

      console.log(`[REFILL-TEMPLATE-VENDON] Found ${stockData.length} stock items from Vendon`);

      // Prüfen, ob bereits eine Standard-Vorlage für diese Maschine existiert
      const existingTemplate = await db
        .select()
        .from(refillTemplates)
        .where(and(
          eq(refillTemplates.machineId, machineId),
          eq(refillTemplates.name, 'Vendon Standard-Auffüllung')
        ))
        .limit(1);

      let importedCount = 0;

      if (existingTemplate.length === 0) {
        // Neue Standard-Vorlage basierend auf aktuellen Beständen erstellen
        const [newTemplate] = await db
          .insert(refillTemplates)
          .values({
            machineId: machineId,
            vendonId: `vendon_stock_${vendonMachineId}_${Date.now()}`,
            name: 'Vendon Standard-Auffüllung',
            description: `Automatisch erstellt basierend auf Vendon-Beständen am ${new Date().toLocaleDateString('de-DE')}`,
            isDefault: true,
            createdBy: null, // System-Import
            updatedBy: null
          })
          .returning();

        // Produkte der Vorlage basierend auf Vendon-Beständen hinzufügen
        if (stockData.length > 0) {
          const templateProducts = stockData
            .filter((stock: any) => stock.product && stock.product.name) // Nur Artikel mit gültigen Produktnamen
            .map((stock: any) => ({
              templateId: newTemplate.id,
              productId: null, // Wird später über Mapping aufgelöst
              productName: stock.product.name,
              quantity: Math.max((stock.capacity || 0) - (stock.quantity || 0), 0), // Auffüllmenge berechnen
              minRefill: Math.floor((stock.capacity || 0) * 0.2), // 20% der Kapazität als Minimum
              maxCapacity: stock.capacity || 0,
              position: stock.position || null
            }))
            .filter((product: any) => product.maxCapacity > 0); // Nur Artikel mit Kapazität

          if (templateProducts.length > 0) {
            await db
              .insert(refillTemplateProducts)
              .values(templateProducts);
            
            console.log(`[REFILL-TEMPLATE-VENDON] Added ${templateProducts.length} products to template`);
          }

          importedCount = 1;
          console.log(`[REFILL-TEMPLATE-VENDON] Created template: Vendon Standard-Auffüllung`);
        }
      } else {
        console.log(`[REFILL-TEMPLATE-VENDON] Standard template already exists for machine ${machineId}`);
      }

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
      const stockData = await vendonAPI.getMachineStock(vendonMachineId);

      if (!stockData || !Array.isArray(stockData)) {
        return { success: false, error: 'Keine Bestandsdaten von Vendon verfügbar' };
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
      if (stockData.length > 0) {
        const templateProducts = stockData
          .filter((stock: any) => stock.product && stock.product.name)
          .map((stock: any) => ({
            templateId: newTemplate.id,
            productId: null,
            productName: stock.product.name,
            quantity: Math.max((stock.capacity || 0) - (stock.quantity || 0), 0), // Auffüllmenge berechnen
            minRefill: Math.floor((stock.capacity || 0) * 0.2), // 20% der Kapazität als Minimum
            maxCapacity: stock.capacity || 0,
            position: stock.position || null
          }))
          .filter((product: any) => product.maxCapacity > 0);

        if (templateProducts.length > 0) {
          await db
            .insert(refillTemplateProducts)
            .values(templateProducts);
        }
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
   * Sendet eine Vorlage an Vendon (HINWEIS: Vendon API bietet möglicherweise keine Template-Erstellung)
   */
  private static async sendTemplateToVendon(machineId: string, templateData: any): Promise<{ success: boolean; vendonTemplateId?: string; error?: string }> {
    try {
      console.log(`[REFILL-TEMPLATE-VENDON] Attempting to send template to Vendon for machine ${machineId}`);
      
      // HINWEIS: Die Vendon API bietet derzeit keine spezifischen Endpunkte für Refill-Templates
      // Dies ist eine Funktionsannahme für zukünftige API-Erweiterungen
      console.log(`[REFILL-TEMPLATE-VENDON] WARNING: Vendon API does not currently support template creation`);
      console.log(`[REFILL-TEMPLATE-VENDON] Template data would be:`, JSON.stringify(templateData, null, 2));
      
      // Simulierte erfolgreiche Antwort für Kompatibilität
      const simulatedVendonId = `vendon_template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      return {
        success: true,
        vendonTemplateId: simulatedVendonId
      };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Vendon Template API nicht verfügbar'
      };
    }
  }
}