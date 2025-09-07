import { Router, Request } from 'express';
import { db, rawDb } from '../db';
import { eq, desc, and, sql } from 'drizzle-orm';
import { 
  refillTemplates, 
  refillTemplateProducts, 
  machines,
  insertRefillTemplateSchema,
  insertRefillTemplateProductSchema,
  type RefillTemplate,
  type RefillTemplateProduct,
  type InsertRefillTemplate,
  type InsertRefillTemplateProduct
} from '../../shared/schema';
import { replitAuthMiddleware, ReplitUser } from '../auth/replit-auth';
import { RefillTemplateVendonService } from '../services/refillTemplateVendonService';
import * as MHDRefillService from '../services/mhdOptimizedRefillTemplateService';

const router = Router();

// Erweitere Request-Interface um user-Property
interface AuthenticatedRequest extends Request {
  user?: ReplitUser;
}

// Apply authentication middleware to all routes
router.use(replitAuthMiddleware);

/**
 * GET /api/machines/:machineId/refill-templates
 * Get all refill templates for a specific machine
 */
router.get('/:machineId/refilltemplates', async (req: AuthenticatedRequest, res) => {
  try {
    const { machineId } = req.params;
    console.log(`[REFILL-TEMPLATES API] Fetching templates for machine: ${machineId}`);

    // Resolve machine ID using the same logic as other machine endpoints
    let resolvedMachineId: number;
    const parsedId = parseInt(machineId);
    
    if (!isNaN(parsedId)) {
      // Check if it's an internal ID
      const machineCheck = await rawDb.query(
        'SELECT id FROM machines WHERE id = $1 LIMIT 1',
        [parsedId]
      );
      
      if (machineCheck.rows.length > 0) {
        resolvedMachineId = parsedId;
      } else {
        // Try as location_id
        const locationCheck = await rawDb.query(
          'SELECT id FROM machines WHERE location_id = $1 LIMIT 1',
          [parsedId]
        );
        
        if (locationCheck.rows.length > 0) {
          resolvedMachineId = locationCheck.rows[0].id;
        } else {
          // Try as vendon_id (parsed number)
          const vendonCheck = await rawDb.query(
            'SELECT id FROM machines WHERE vendon_id = $1 LIMIT 1',
            [parsedId.toString()]
          );
          
          if (vendonCheck.rows.length > 0) {
            resolvedMachineId = vendonCheck.rows[0].id;
          } else {
            return res.status(404).json({ error: 'Maschine nicht gefunden' });
          }
        }
      }
    } else {
      // Try as vendon_id (string)
      const vendonCheck = await rawDb.query(
        'SELECT id FROM machines WHERE vendon_id = $1 LIMIT 1',
        [machineId.toString()]
      );
      
      if (vendonCheck.rows.length > 0) {
        resolvedMachineId = vendonCheck.rows[0].id;
      } else {
        return res.status(404).json({ error: 'Maschine nicht gefunden' });
      }
    }

    // Fetch templates with their products
    const templates = await db
      .select({
        id: refillTemplates.id,
        machineId: refillTemplates.machineId,
        vendonId: refillTemplates.vendonId,
        name: refillTemplates.name,
        description: refillTemplates.description,
        isDefault: refillTemplates.isDefault,
        createdAt: refillTemplates.createdAt,
        updatedAt: refillTemplates.updatedAt,
        createdBy: refillTemplates.createdBy,
        updatedBy: refillTemplates.updatedBy
      })
      .from(refillTemplates)
      .where(eq(refillTemplates.machineId, resolvedMachineId))
      .orderBy(desc(refillTemplates.isDefault), desc(refillTemplates.updatedAt));

    // Fetch products for each template
    const templatesWithProducts = await Promise.all(
      templates.map(async (template) => {
        const products = await db
          .select()
          .from(refillTemplateProducts)
          .where(eq(refillTemplateProducts.templateId, template.id))
          .orderBy(refillTemplateProducts.position);

        return {
          ...template,
          products
        };
      })
    );

    console.log(`[REFILL-TEMPLATES API] Found ${templatesWithProducts.length} templates`);
    res.json(templatesWithProducts);

  } catch (error) {
    console.error(`[REFILL-TEMPLATES API] Error fetching templates:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Laden der Refill-Vorlagen',
      message: errorMessage
    });
  }
});

/**
 * POST /api/machines/:machineId/refill-templates
 * Create a new refill template
 */
router.post('/:machineId/refilltemplates', async (req: AuthenticatedRequest, res) => {
  try {
    const { machineId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Benutzer nicht authentifiziert' });
    }

    console.log(`[REFILL-TEMPLATES API] Creating template for machine: ${machineId}`);

    // Validate input
    const validation = insertRefillTemplateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validierungsfehler',
        details: validation.error.errors
      });
    }

    const templateData = validation.data;

    // Resolve machine ID
    let resolvedMachineId: number;
    const parsedId = parseInt(machineId);
    
    if (!isNaN(parsedId)) {
      const machineCheck = await rawDb.query(
        'SELECT id FROM machines WHERE id = $1 OR location_id = $1 LIMIT 1',
        [parsedId]
      );
      
      if (machineCheck.rows.length > 0) {
        resolvedMachineId = machineCheck.rows[0].id;
      } else {
        return res.status(404).json({ error: 'Maschine nicht gefunden' });
      }
    } else {
      const vendonCheck = await rawDb.query(
        'SELECT id FROM machines WHERE vendon_id = $1 LIMIT 1',
        [machineId]
      );
      
      if (vendonCheck.rows.length > 0) {
        resolvedMachineId = vendonCheck.rows[0].id;
      } else {
        return res.status(404).json({ error: 'Maschine nicht gefunden' });
      }
    }

    // If setting as default, remove default from other templates
    if (templateData.isDefault) {
      await db
        .update(refillTemplates)
        .set({ isDefault: false, updatedBy: userId })
        .where(eq(refillTemplates.machineId, resolvedMachineId));
    }

    // Create the template
    const [newTemplate] = await db
      .insert(refillTemplates)
      .values({
        ...templateData,
        machineId: resolvedMachineId,
        createdBy: userId,
        updatedBy: userId
      })
      .returning();

    console.log(`[REFILL-TEMPLATES API] Created template: ${newTemplate.name}`);
    res.status(201).json(newTemplate);

  } catch (error) {
    console.error(`[REFILL-TEMPLATES API] Error creating template:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Erstellen der Refill-Vorlage',
      message: errorMessage
    });
  }
});

/**
 * PUT /api/machines/:machineId/refill-templates/:templateId
 * Update a refill template
 */
router.put('/:machineId/refilltemplates/:templateId', async (req: AuthenticatedRequest, res) => {
  try {
    const { machineId, templateId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Benutzer nicht authentifiziert' });
    }

    console.log(`[REFILL-TEMPLATES API] Updating template: ${templateId}`);

    // Validate input
    const validation = insertRefillTemplateSchema.partial().safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validierungsfehler',
        details: validation.error.errors
      });
    }

    const updateData = validation.data;

    // If setting as default, remove default from other templates
    if (updateData.isDefault) {
      const resolvedMachineId = parseInt(machineId);
      await db
        .update(refillTemplates)
        .set({ isDefault: false, updatedBy: userId })
        .where(eq(refillTemplates.machineId, resolvedMachineId));
    }

    // Update the template
    const [updatedTemplate] = await db
      .update(refillTemplates)
      .set({
        ...updateData,
        updatedBy: userId,
        updatedAt: sql`NOW()`
      })
      .where(eq(refillTemplates.id, parseInt(templateId)))
      .returning();

    if (!updatedTemplate) {
      return res.status(404).json({ error: 'Refill-Vorlage nicht gefunden' });
    }

    console.log(`[REFILL-TEMPLATES API] Updated template: ${updatedTemplate.name}`);
    res.json(updatedTemplate);

  } catch (error) {
    console.error(`[REFILL-TEMPLATES API] Error updating template:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Aktualisieren der Refill-Vorlage',
      message: errorMessage
    });
  }
});

/**
 * DELETE /api/machines/:machineId/refill-templates/:templateId
 * Delete a refill template
 */
router.delete('/:machineId/refilltemplates/:templateId', async (req: AuthenticatedRequest, res) => {
  try {
    const { machineId, templateId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Benutzer nicht authentifiziert' });
    }

    console.log(`[REFILL-TEMPLATES API] Deleting template: ${templateId}`);

    // Delete the template (cascade will handle products)
    const [deletedTemplate] = await db
      .delete(refillTemplates)
      .where(eq(refillTemplates.id, parseInt(templateId)))
      .returning();

    if (!deletedTemplate) {
      return res.status(404).json({ error: 'Refill-Vorlage nicht gefunden' });
    }

    console.log(`[REFILL-TEMPLATES API] Deleted template: ${deletedTemplate.name}`);
    res.json({ message: 'Refill-Vorlage erfolgreich gelöscht' });

  } catch (error) {
    console.error(`[REFILL-TEMPLATES API] Error deleting template:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Löschen der Refill-Vorlage',
      message: errorMessage
    });
  }
});

/**
 * POST /api/machines/:machineId/refill-templates/:templateId/default
 * Set template as default
 */
router.post('/:machineId/refilltemplates/:templateId/default', async (req: AuthenticatedRequest, res) => {
  try {
    const { machineId, templateId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Benutzer nicht authentifiziert' });
    }

    console.log(`[REFILL-TEMPLATES API] Setting template as default: ${templateId}`);

    // Resolve machine ID
    let resolvedMachineId: number;
    const parsedId = parseInt(machineId);
    
    if (!isNaN(parsedId)) {
      const machineCheck = await rawDb.query(
        'SELECT id FROM machines WHERE id = $1 OR location_id = $1 LIMIT 1',
        [parsedId]
      );
      
      if (machineCheck.rows.length > 0) {
        resolvedMachineId = machineCheck.rows[0].id;
      } else {
        return res.status(404).json({ error: 'Maschine nicht gefunden' });
      }
    } else {
      const vendonCheck = await rawDb.query(
        'SELECT id FROM machines WHERE vendon_id = $1 LIMIT 1',
        [machineId]
      );
      
      if (vendonCheck.rows.length > 0) {
        resolvedMachineId = vendonCheck.rows[0].id;
      } else {
        return res.status(404).json({ error: 'Maschine nicht gefunden' });
      }
    }

    // Remove default from all templates for this machine
    await db
      .update(refillTemplates)
      .set({ isDefault: false, updatedBy: userId })
      .where(eq(refillTemplates.machineId, resolvedMachineId));

    // Set this template as default
    const [updatedTemplate] = await db
      .update(refillTemplates)
      .set({ 
        isDefault: true, 
        updatedBy: userId,
        updatedAt: sql`NOW()`
      })
      .where(eq(refillTemplates.id, parseInt(templateId)))
      .returning();

    if (!updatedTemplate) {
      return res.status(404).json({ error: 'Refill-Vorlage nicht gefunden' });
    }

    console.log(`[REFILL-TEMPLATES API] Set template as default: ${updatedTemplate.name}`);
    res.json(updatedTemplate);

  } catch (error) {
    console.error(`[REFILL-TEMPLATES API] Error setting default template:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Setzen der Standard-Vorlage',
      message: errorMessage
    });
  }
});

/**
 * DELETE /api/machines/:machineId/refill-templates/:templateId/default
 * Remove default status from template
 */
router.delete('/:machineId/refilltemplates/:templateId/default', async (req: AuthenticatedRequest, res) => {
  try {
    const { machineId, templateId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Benutzer nicht authentifiziert' });
    }

    console.log(`[REFILL-TEMPLATES API] Removing default status from template: ${templateId}`);

    // Remove default status
    const [updatedTemplate] = await db
      .update(refillTemplates)
      .set({ 
        isDefault: false, 
        updatedBy: userId,
        updatedAt: sql`NOW()`
      })
      .where(eq(refillTemplates.id, parseInt(templateId)))
      .returning();

    if (!updatedTemplate) {
      return res.status(404).json({ error: 'Refill-Vorlage nicht gefunden' });
    }

    console.log(`[REFILL-TEMPLATES API] Removed default status from template: ${updatedTemplate.name}`);
    res.json(updatedTemplate);

  } catch (error) {
    console.error(`[REFILL-TEMPLATES API] Error removing default status:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Entfernen der Standard-Vorlage',
      message: errorMessage
    });
  }
});

/**
 * POST /api/machines/:machineId/refill-templates/:templateId/products
 * Add products to a refill template
 */
router.post('/:machineId/refill-templates/:templateId/products', async (req: AuthenticatedRequest, res) => {
  try {
    const { machineId, templateId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Benutzer nicht authentifiziert' });
    }

    console.log(`[REFILL-TEMPLATES API] Adding products to template: ${templateId}`);

    // Validate input
    const validation = insertRefillTemplateProductSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validierungsfehler',
        details: validation.error.errors
      });
    }

    const productData = validation.data;

    // Create the product
    const [newProduct] = await db
      .insert(refillTemplateProducts)
      .values({
        ...productData,
        templateId: parseInt(templateId)
      })
      .returning();

    console.log(`[REFILL-TEMPLATES API] Added product to template: ${newProduct.productName}`);
    res.status(201).json(newProduct);

  } catch (error) {
    console.error(`[REFILL-TEMPLATES API] Error adding product:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Hinzufügen des Produkts',
      message: errorMessage
    });
  }
});

/**
 * PUT /api/machines/:machineId/refill-templates/:templateId/products/:productId
 * Update a product in a refill template
 */
router.put('/:machineId/refill-templates/:templateId/products/:productId', async (req: AuthenticatedRequest, res) => {
  try {
    const { machineId, templateId, productId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Benutzer nicht authentifiziert' });
    }

    console.log(`[REFILL-TEMPLATES API] Updating template product: ${productId}`);

    // Validate input
    const validation = insertRefillTemplateProductSchema.partial().safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validierungsfehler',
        details: validation.error.errors
      });
    }

    const updateData = validation.data;

    // Update the product
    const [updatedProduct] = await db
      .update(refillTemplateProducts)
      .set({
        ...updateData,
        updatedAt: sql`NOW()`
      })
      .where(eq(refillTemplateProducts.id, parseInt(productId)))
      .returning();

    if (!updatedProduct) {
      return res.status(404).json({ error: 'Produkt nicht gefunden' });
    }

    console.log(`[REFILL-TEMPLATES API] Updated template product: ${updatedProduct.productName}`);
    res.json(updatedProduct);

  } catch (error) {
    console.error(`[REFILL-TEMPLATES API] Error updating product:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Aktualisieren des Produkts',
      message: errorMessage
    });
  }
});

/**
 * DELETE /api/machines/:machineId/refill-templates/:templateId/products/:productId
 * Remove a product from a refill template
 */
router.delete('/:machineId/refill-templates/:templateId/products/:productId', async (req: AuthenticatedRequest, res) => {
  try {
    const { machineId, templateId, productId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Benutzer nicht authentifiziert' });
    }

    console.log(`[REFILL-TEMPLATES API] Removing product from template: ${productId}`);

    // Delete the product
    const [deletedProduct] = await db
      .delete(refillTemplateProducts)
      .where(eq(refillTemplateProducts.id, parseInt(productId)))
      .returning();

    if (!deletedProduct) {
      return res.status(404).json({ error: 'Produkt nicht gefunden' });
    }

    console.log(`[REFILL-TEMPLATES API] Removed product from template: ${deletedProduct.productName}`);
    res.json({ message: 'Produkt erfolgreich entfernt' });

  } catch (error) {
    console.error(`[REFILL-TEMPLATES API] Error removing product:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Entfernen des Produkts',
      message: errorMessage
    });
  }
});

/**
 * POST /api/machines/:machineId/refill-templates/:templateId/sync-to-vendon
 * Sync refill template to Vendon
 */
router.post('/:machineId/refill-templates/:templateId/sync-to-vendon', async (req: AuthenticatedRequest, res) => {
  try {
    const { machineId, templateId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Benutzer nicht authentifiziert' });
    }

    console.log(`[REFILL-TEMPLATES API] Syncing template ${templateId} to Vendon for machine ${machineId}`);

    // Get machine vendon_id
    const machineResult = await rawDb.query(
      'SELECT vendon_id FROM machines WHERE id = $1 OR location_id = $1 OR vendon_id = $2 LIMIT 1',
      [parseInt(machineId) || 0, machineId]
    );

    if (machineResult.rows.length === 0) {
      return res.status(404).json({ error: 'Maschine nicht gefunden' });
    }

    const vendonMachineId = machineResult.rows[0].vendon_id;
    if (!vendonMachineId) {
      return res.status(400).json({ error: 'Keine Vendon-ID für diese Maschine verfügbar' });
    }

    // Sync to Vendon
    const syncResult = await RefillTemplateVendonService.syncTemplateToVendon(
      parseInt(templateId),
      vendonMachineId
    );

    if (syncResult.success) {
      res.json({ 
        message: 'Refill-Vorlage erfolgreich mit Vendon synchronisiert',
        success: true
      });
    } else {
      res.status(500).json({
        error: 'Fehler bei der Vendon-Synchronisation',
        message: syncResult.error
      });
    }

  } catch (error) {
    console.error(`[REFILL-TEMPLATES API] Error syncing to Vendon:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler bei der Vendon-Synchronisation',
      message: errorMessage
    });
  }
});

/**
 * POST /api/machines/:machineId/refill-templates/import-from-vendon
 * Import refill templates from Vendon
 */
router.post('/:machineId/refill-templates/import-from-vendon', async (req: AuthenticatedRequest, res) => {
  try {
    const { machineId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Benutzer nicht authentifiziert' });
    }

    console.log(`[REFILL-TEMPLATES API] Importing templates from Vendon for machine ${machineId}`);

    // Resolve machine ID and get vendon_id
    let resolvedMachineId: number;
    let vendonMachineId: string;
    
    const parsedId = parseInt(machineId);
    if (!isNaN(parsedId)) {
      const machineCheck = await rawDb.query(
        'SELECT id, vendon_id FROM machines WHERE id = $1 OR location_id = $1 LIMIT 1',
        [parsedId]
      );
      
      if (machineCheck.rows.length > 0) {
        resolvedMachineId = machineCheck.rows[0].id;
        vendonMachineId = machineCheck.rows[0].vendon_id;
      } else {
        return res.status(404).json({ error: 'Maschine nicht gefunden' });
      }
    } else {
      const vendonCheck = await rawDb.query(
        'SELECT id, vendon_id FROM machines WHERE vendon_id = $1 LIMIT 1',
        [machineId]
      );
      
      if (vendonCheck.rows.length > 0) {
        resolvedMachineId = vendonCheck.rows[0].id;
        vendonMachineId = vendonCheck.rows[0].vendon_id;
      } else {
        return res.status(404).json({ error: 'Maschine nicht gefunden' });
      }
    }

    if (!vendonMachineId) {
      return res.status(400).json({ error: 'Keine Vendon-ID für diese Maschine verfügbar' });
    }

    // Import from Vendon
    const importResult = await RefillTemplateVendonService.importTemplatesFromVendon(
      resolvedMachineId,
      vendonMachineId
    );

    if (importResult.success) {
      res.json({
        message: `${importResult.imported} Refill-Vorlagen erfolgreich von Vendon importiert`,
        imported: importResult.imported,
        success: true
      });
    } else {
      res.status(500).json({
        error: 'Fehler beim Import von Vendon',
        message: importResult.error
      });
    }

  } catch (error) {
    console.error(`[REFILL-TEMPLATES API] Error importing from Vendon:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Import von Vendon',
      message: errorMessage
    });
  }
});

/**
 * POST /api/machines/:machineId/refill-templates/create-from-vendon-stock
 * Create refill template from current Vendon stock levels
 */
router.post('/:machineId/refilltemplates/create-from-vendon-stock', async (req: AuthenticatedRequest, res) => {
  try {
    const { machineId } = req.params;
    const { templateName } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Benutzer nicht authentifiziert' });
    }

    if (!templateName || typeof templateName !== 'string') {
      return res.status(400).json({ error: 'Template-Name ist erforderlich' });
    }

    console.log(`[REFILL-TEMPLATES API] Creating template from Vendon stock for machine ${machineId}`);

    // Resolve machine ID and get vendon_id
    let resolvedMachineId: number;
    let vendonMachineId: string;
    
    const parsedId = parseInt(machineId);
    if (!isNaN(parsedId)) {
      const machineCheck = await rawDb.query(
        'SELECT id, vendon_id FROM machines WHERE id = $1 OR location_id = $1 LIMIT 1',
        [parsedId]
      );
      
      if (machineCheck.rows.length > 0) {
        resolvedMachineId = machineCheck.rows[0].id;
        vendonMachineId = machineCheck.rows[0].vendon_id;
      } else {
        return res.status(404).json({ error: 'Maschine nicht gefunden' });
      }
    } else {
      const vendonCheck = await rawDb.query(
        'SELECT id, vendon_id FROM machines WHERE vendon_id = $1 LIMIT 1',
        [machineId]
      );
      
      if (vendonCheck.rows.length > 0) {
        resolvedMachineId = vendonCheck.rows[0].id;
        vendonMachineId = vendonCheck.rows[0].vendon_id;
      } else {
        return res.status(404).json({ error: 'Maschine nicht gefunden' });
      }
    }

    if (!vendonMachineId) {
      return res.status(400).json({ error: 'Keine Vendon-ID für diese Maschine verfügbar' });
    }

    // Create template from Vendon stock
    const createResult = await RefillTemplateVendonService.createTemplateFromVendonStock(
      resolvedMachineId,
      vendonMachineId,
      templateName
    );

    if (createResult.success) {
      res.status(201).json({
        message: 'Refill-Vorlage erfolgreich basierend auf Vendon-Beständen erstellt',
        templateId: createResult.templateId,
        success: true
      });
    } else {
      res.status(500).json({
        error: 'Fehler beim Erstellen der Vorlage aus Vendon-Beständen',
        message: createResult.error
      });
    }

  } catch (error) {
    console.error(`[REFILL-TEMPLATES API] Error creating template from Vendon stock:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Erstellen der Vorlage aus Vendon-Beständen',
      message: errorMessage
    });
  }
});

/**
 * POST /api/machines/:machineId/refill-templates/mhd-optimize
 * MHD-Optimierung für existierendes Template
 */
router.post('/:machineId/refill-templates/:templateId/mhd-optimize', async (req: AuthenticatedRequest, res) => {
  try {
    const { machineId, templateId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Benutzer nicht authentifiziert' });
    }

    console.log(`[REFILL-TEMPLATES API] MHD-Optimierung für Template ${templateId}`);

    const result = await MHDRefillService.optimizeTemplateForMHD(parseInt(templateId));

    if (result.success) {
      res.json({
        success: true,
        data: result.template,
        message: 'Template erfolgreich MHD-optimiert'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error(`[REFILL-TEMPLATES API] Fehler bei MHD-Optimierung:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler bei der MHD-Optimierung',
      message: errorMessage
    });
  }
});

/**
 * POST /api/machines/:machineId/refill-templates/mhd-workflow
 * Vollständiger MHD-Workflow: Import → Optimierung → Sync zu Vendon
 */
router.post('/:machineId/refill-templates/mhd-workflow', async (req: AuthenticatedRequest, res) => {
  try {
    const { machineId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Benutzer nicht authentifiziert' });
    }

    console.log(`[REFILL-TEMPLATES API] MHD-Workflow für Maschine ${machineId}`);

    // Hole Vendon-ID für die Maschine
    const machineResult = await rawDb.query(
      'SELECT vendon_id FROM machines WHERE id = $1 OR location_id = $1 OR vendon_id = $2 LIMIT 1',
      [parseInt(machineId) || 0, machineId]
    );

    if (machineResult.rows.length === 0) {
      return res.status(404).json({ error: 'Maschine nicht gefunden' });
    }

    const vendonMachineId = machineResult.rows[0].vendon_id;
    if (!vendonMachineId) {
      return res.status(400).json({ error: 'Keine Vendon-ID für diese Maschine verfügbar' });
    }

    const result = await MHDRefillService.fullMHDOptimizedWorkflow(
      parseInt(machineId), 
      vendonMachineId
    );

    if (result.success) {
      res.json({
        success: true,
        data: result.template,
        vendonSync: result.vendonSync,
        message: result.error || 'MHD-Workflow erfolgreich abgeschlossen'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error(`[REFILL-TEMPLATES API] Fehler bei MHD-Workflow:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim MHD-Workflow',
      message: errorMessage
    });
  }
});

/**
 * GET /api/machines/mhd-product-categories
 * Holt MHD-Produktkategorien für Dashboard
 */
router.get('/mhd-product-categories', async (req: AuthenticatedRequest, res) => {
  try {
    console.log(`[REFILL-TEMPLATES API] Hole MHD-Produktkategorien`);

    const categories = await MHDRefillService.categorizeProductsByMHD();

    res.json({
      success: true,
      data: categories,
      summary: {
        total: categories.length,
        kurzlebig: categories.filter(c => c.category === 'kurzlebig').length,
        mittel: categories.filter(c => c.category === 'mittel').length,
        langlebig: categories.filter(c => c.category === 'langlebig').length,
        requiresAdjustment: categories.filter(c => c.requiresAdjustment).length,
      }
    });

  } catch (error) {
    console.error(`[REFILL-TEMPLATES API] Fehler bei MHD-Kategorien:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler beim Laden der MHD-Kategorien',
      message: errorMessage
    });
  }
});

/**
 * POST /api/machines/batch-mhd-optimization
 * Batch-MHD-Optimierung für mehrere Maschinen
 */
router.post('/batch-mhd-optimization', async (req: AuthenticatedRequest, res) => {
  try {
    const { machineIds } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Benutzer nicht authentifiziert' });
    }

    console.log(`[REFILL-TEMPLATES API] Batch-MHD-Optimierung für ${machineIds?.length || 'alle'} Maschinen`);

    const result = await MHDRefillService.batchMHDOptimization(machineIds);

    res.json({
      success: result.success,
      data: result.results,
      summary: {
        totalMachines: result.results.length,
        successful: result.results.filter(r => r.success).length,
        failed: result.results.filter(r => !r.success).length,
        totalAdjustments: result.results.reduce((sum, r) => sum + r.adjustedProducts, 0),
      }
    });

  } catch (error) {
    console.error(`[REFILL-TEMPLATES API] Fehler bei Batch-MHD-Optimierung:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    res.status(500).json({
      error: 'Fehler bei der Batch-MHD-Optimierung',
      message: errorMessage
    });
  }
});

console.log(`[REFILL-TEMPLATES API] ✅ MHD-optimierte Refill-Template Routen hinzugefügt`);

export default router;