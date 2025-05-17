import { Router, Request, Response } from 'express';

const router = Router();

// Standard-E-Mail-Vorlagen
const emailTemplates = [
  {
    id: '1',
    name: 'Standard Bestellung',
    subject: 'Bestellung {{orderNumber}} von Elbsandstein Proviant & Quartier GmbH',
    content: `Sehr geehrter {{supplierName}},

hiermit bestellen wir gemäß der angehängten Bestellung {{orderNumber}} die aufgeführten Artikel.

Bitte bestätigen Sie den Erhalt dieser Bestellung und teilen Sie uns mit, wann wir mit der Lieferung rechnen können.

Mit freundlichen Grüßen,
Elbsandstein Proviant & Quartier GmbH
`
  },
  {
    id: '2',
    name: 'Dringende Bestellung',
    subject: 'DRINGEND: Bestellung {{orderNumber}} von Elbsandstein Proviant & Quartier GmbH',
    content: `Sehr geehrter {{supplierName}},

hiermit senden wir Ihnen unsere DRINGENDE Bestellung {{orderNumber}}.

Wir benötigen die Lieferung so schnell wie möglich, spätestens jedoch bis zum kommenden Werktag. Bitte bestätigen Sie den Erhalt dieser Bestellung und die mögliche Lieferzeit umgehend.

Die bestellten Artikel finden Sie in der angehängten Bestellung.

Mit freundlichen Grüßen,
Elbsandstein Proviant & Quartier GmbH
`
  },
  {
    id: '3',
    name: 'Nachbestellung',
    subject: 'Nachbestellung {{orderNumber}} von Elbsandstein Proviant & Quartier GmbH',
    content: `Sehr geehrter {{supplierName}},

hiermit bestellen wir erneut nach. Alle Details finden Sie in der angehängten Bestellung {{orderNumber}}.

Bitte liefern Sie die aufgeführten Artikel gemäß unserer üblichen Konditionen.

Mit freundlichen Grüßen,
Elbsandstein Proviant & Quartier GmbH
`
  }
];

// Alle E-Mail-Vorlagen abrufen
router.get('/', (_req: Request, res: Response) => {
  try {
    res.json(emailTemplates);
  } catch (error) {
    console.error("Fehler beim Abrufen der E-Mail-Vorlagen:", error);
    res.status(500).json({ error: "Fehler beim Abrufen der E-Mail-Vorlagen" });
  }
});

// Eine spezifische E-Mail-Vorlage abrufen
router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const template = emailTemplates.find(t => t.id === id);
    
    if (!template) {
      return res.status(404).json({ error: "E-Mail-Vorlage nicht gefunden" });
    }
    
    res.json(template);
  } catch (error) {
    console.error("Fehler beim Abrufen der E-Mail-Vorlage:", error);
    res.status(500).json({ error: "Fehler beim Abrufen der E-Mail-Vorlage" });
  }
});

// POST für die gleichen Endpunkte zur Kompatibilität mit existierendem Code
router.post('/', (_req: Request, res: Response) => {
  try {
    res.json(emailTemplates);
  } catch (error) {
    console.error("Fehler beim Abrufen der E-Mail-Vorlagen:", error);
    res.status(500).json({ error: "Fehler beim Abrufen der E-Mail-Vorlagen" });
  }
});

router.post('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const template = emailTemplates.find(t => t.id === id);
    
    if (!template) {
      return res.status(404).json({ error: "E-Mail-Vorlage nicht gefunden" });
    }
    
    res.json(template);
  } catch (error) {
    console.error("Fehler beim Abrufen der E-Mail-Vorlage:", error);
    res.status(500).json({ error: "Fehler beim Abrufen der E-Mail-Vorlage" });
  }
});

export default router;