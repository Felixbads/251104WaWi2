import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { supplierEmailTemplates, suppliers } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

const router = Router();

// GET /api/supplier-email-templates/:supplierId - Alle Vorlagen für einen Lieferanten
router.get('/:supplierId', async (req: Request, res: Response) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    
    if (isNaN(supplierId)) {
      return res.status(400).json({ error: 'Ungültige Lieferanten-ID' });
    }

    const templates = await db.select()
      .from(supplierEmailTemplates)
      .where(eq(supplierEmailTemplates.supplierId, supplierId))
      .orderBy(supplierEmailTemplates.templateName);

    res.json(templates);
  } catch (error) {
    console.error('Fehler beim Laden der E-Mail-Vorlagen:', error);
    res.status(500).json({ 
      error: 'Fehler beim Laden der E-Mail-Vorlagen',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/supplier-email-templates - Neue Vorlage erstellen
router.post('/', async (req: Request, res: Response) => {
  try {
    const templateData = req.body;
    
    // Validierung
    if (!templateData.supplierId || !templateData.templateName || !templateData.subjectTemplate || !templateData.contentTemplate) {
      return res.status(400).json({ error: 'Pflichtfelder fehlen' });
    }

    // Wenn dies als Standard-Vorlage markiert ist, andere Standard-Vorlagen für diesen Lieferanten deaktivieren
    if (templateData.isDefault) {
      await db.update(supplierEmailTemplates)
        .set({ isDefault: false })
        .where(and(
          eq(supplierEmailTemplates.supplierId, templateData.supplierId),
          eq(supplierEmailTemplates.templateType, templateData.templateType || 'standard')
        ));
    }

    const [newTemplate] = await db.insert(supplierEmailTemplates)
      .values({
        supplierId: templateData.supplierId,
        templateName: templateData.templateName,
        subjectTemplate: templateData.subjectTemplate,
        contentTemplate: templateData.contentTemplate,
        isDefault: templateData.isDefault || false,
        templateType: templateData.templateType || 'standard'
      })
      .returning();

    res.json(newTemplate);
  } catch (error) {
    console.error('Fehler beim Erstellen der E-Mail-Vorlage:', error);
    res.status(500).json({ 
      error: 'Fehler beim Erstellen der E-Mail-Vorlage',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// PUT /api/supplier-email-templates/:id - Vorlage aktualisieren
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);
    const templateData = req.body;
    
    if (isNaN(templateId)) {
      return res.status(400).json({ error: 'Ungültige Vorlagen-ID' });
    }

    // Wenn dies als Standard-Vorlage markiert ist, andere Standard-Vorlagen für diesen Lieferanten deaktivieren
    if (templateData.isDefault) {
      const currentTemplate = await db.select()
        .from(supplierEmailTemplates)
        .where(eq(supplierEmailTemplates.id, templateId))
        .limit(1);

      if (currentTemplate.length > 0) {
        await db.update(supplierEmailTemplates)
          .set({ isDefault: false })
          .where(and(
            eq(supplierEmailTemplates.supplierId, currentTemplate[0].supplierId),
            eq(supplierEmailTemplates.templateType, templateData.templateType || currentTemplate[0].templateType)
          ));
      }
    }

    const [updatedTemplate] = await db.update(supplierEmailTemplates)
      .set({
        templateName: templateData.templateName,
        subjectTemplate: templateData.subjectTemplate,
        contentTemplate: templateData.contentTemplate,
        isDefault: templateData.isDefault || false,
        templateType: templateData.templateType || 'standard',
        updatedAt: new Date()
      })
      .where(eq(supplierEmailTemplates.id, templateId))
      .returning();

    if (!updatedTemplate) {
      return res.status(404).json({ error: 'Vorlage nicht gefunden' });
    }

    res.json(updatedTemplate);
  } catch (error) {
    console.error('Fehler beim Aktualisieren der E-Mail-Vorlage:', error);
    res.status(500).json({ 
      error: 'Fehler beim Aktualisieren der E-Mail-Vorlage',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// DELETE /api/supplier-email-templates/:id - Vorlage löschen
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);
    
    if (isNaN(templateId)) {
      return res.status(400).json({ error: 'Ungültige Vorlagen-ID' });
    }

    const [deletedTemplate] = await db.delete(supplierEmailTemplates)
      .where(eq(supplierEmailTemplates.id, templateId))
      .returning();

    if (!deletedTemplate) {
      return res.status(404).json({ error: 'Vorlage nicht gefunden' });
    }

    res.json({ message: 'Vorlage erfolgreich gelöscht' });
  } catch (error) {
    console.error('Fehler beim Löschen der E-Mail-Vorlage:', error);
    res.status(500).json({ 
      error: 'Fehler beim Löschen der E-Mail-Vorlage',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/supplier-email-templates/:id/set-default - Vorlage als Standard setzen
router.post('/:id/set-default', async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(req.params.id);
    
    if (isNaN(templateId)) {
      return res.status(400).json({ error: 'Ungültige Vorlagen-ID' });
    }

    // Aktuelle Vorlage finden
    const currentTemplate = await db.select()
      .from(supplierEmailTemplates)
      .where(eq(supplierEmailTemplates.id, templateId))
      .limit(1);

    if (currentTemplate.length === 0) {
      return res.status(404).json({ error: 'Vorlage nicht gefunden' });
    }

    // Alle anderen Standard-Vorlagen für diesen Lieferanten und Typ deaktivieren
    await db.update(supplierEmailTemplates)
      .set({ isDefault: false })
      .where(and(
        eq(supplierEmailTemplates.supplierId, currentTemplate[0].supplierId),
        eq(supplierEmailTemplates.templateType, currentTemplate[0].templateType)
      ));

    // Diese Vorlage als Standard setzen
    const [updatedTemplate] = await db.update(supplierEmailTemplates)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(supplierEmailTemplates.id, templateId))
      .returning();

    res.json(updatedTemplate);
  } catch (error) {
    console.error('Fehler beim Setzen der Standard-Vorlage:', error);
    res.status(500).json({ 
      error: 'Fehler beim Setzen der Standard-Vorlage',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;