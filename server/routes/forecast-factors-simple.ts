import { Router } from 'express';

const router = Router();

// Simple forecast factors endpoint
router.get('/:weeks', async (req, res) => {
  try {
    const weeks = parseInt(req.params.weeks);
    
    if (isNaN(weeks) || weeks < 1 || weeks > 8) {
      return res.status(400).json({ error: 'Invalid weeks parameter (1-8 allowed)' });
    }

    const currentMonth = new Date().getMonth(); // 0 = Januar, 6 = Juli
    
    // Seasonal weather descriptions for July
    let weatherDescription = 'Hochsommerlich warm, 22-28°C, meist sonnig';
    if (weeks === 1) {
      weatherDescription = 'Sommerlich warm, 24-30°C, vereinzelt Gewitter';
    } else if (weeks === 2) {
      weatherDescription = 'Hochsommer, 22-28°C, wechselnd bewölkt';
    } else if (weeks === 3) {
      weatherDescription = 'Warm und sonnig, 20-26°C, vereinzelt Schauer';
    } else if (weeks >= 4) {
      weatherDescription = 'Spätsommer, 18-24°C, zunehmend wechselhaft';
    }

    // Check for summer holidays in Saxony (typically July/August)
    let holidaysDescription = 'Sommerferienzeit - erhöhte Tourismusaktivität';
    let holidayEvents = [];
    
    if (currentMonth === 6) { // Juli
      holidaysDescription = 'Sachsen Sommerferien (8. Juli - 15. August) - Hauptferienzeit';
      holidayEvents = [
        {
          name: 'Sommerferien Sachsen',
          date: '2025-07-08',
          description: 'Beginn der Sommerferien in Sachsen'
        }
      ];
    } else if (currentMonth === 7) { // August 
      holidaysDescription = 'Sachsen Sommerferien bis 15. August - Ferienende naht';
      holidayEvents = [
        {
          name: 'Ende Sommerferien Sachsen',
          date: '2025-08-15',
          description: 'Ende der Sommerferien in Sachsen'
        }
      ];
    } else {
      holidaysDescription = 'Keine besonderen Feiertage oder Ferienzeiten';
    }

    res.json({
      weather: {
        description: weatherDescription,
        expected: true
      },
      holidays: {
        description: holidaysDescription,
        events: holidayEvents
      },
      notes: `Prognose für ${weeks} Woche(n) basiert auf saisonalen Trends und aktueller Ferienzeit`
    });

  } catch (error) {
    console.error('Error in forecast factors:', error);
    res.status(500).json({ error: 'Failed to fetch forecast factors' });
  }
});

export default router;