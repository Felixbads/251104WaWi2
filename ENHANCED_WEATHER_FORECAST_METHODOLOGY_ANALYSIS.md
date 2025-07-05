# ERWEITERTE WETTERBASIERTE PROGNOSEMETHODIK FÜR VERKAUFSAUTOMATEN
## Umfassende Analyse und Implementierungskonzept

### Zusammenfassung
Diese Analyse untersucht die aktuelle Prognosemethodik für Verkaufszahlen im Automatenbetrieb und entwickelt ein verbessertes System, das **negative Wettereffekte und ausgebliebene Transaktionen als aktive Prognosefaktoren** berücksichtigt.

---

## 1. PROBLEMSTELLUNG: FEHLENDE NEGATIVE DATENPUNKTE

### Aktueller Zustand
- **Positive Ereignisse werden erfasst**: Jede Transaktion wird mit Zeitstempel, Produkt, Wetter gespeichert
- **Negative Ereignisse fehlen**: Ausgebliebene Käufe bei schlechtem Wetter werden nicht quantifiziert
- **Einseitige Datenbasis**: Das Modell lernt nur aus erfolgreichen Transaktionen

### Identifizierte Lücken
1. **Schlechtwetter-Perioden ohne Transaktionen** bleiben unsichtbar
2. **Erwartete vs. tatsächliche Verkäufe** werden nicht verglichen
3. **Wettersensitivität pro Standort** ist nicht quantifiziert
4. **Baseline-Erwartungen** fehlen für Normalwetter-Szenarien

---

## 2. ERWEITERTE PROGNOSEMETHODIK

### 2.1 Wettereffekte bei fehlenden Transaktionen bewerten

#### Konzept: Negative Event Detection
```sql
-- Identifikation von "erwarteten aber ausgebliebenen" Transaktionen
WITH expected_activity AS (
  SELECT 
    m.id as machine_id,
    generate_series(
      date_trunc('hour', NOW() - INTERVAL '7 days'),
      date_trunc('hour', NOW()),
      INTERVAL '1 hour'
    ) as hour_slot,
    -- Erwartete Transaktionen basierend auf historischen Daten
    AVG(hourly_sales.transaction_count) as expected_count
  FROM machines m
  CROSS JOIN (
    SELECT 
      date_trunc('hour', datetime) as hour,
      machine_id,
      COUNT(*) as transaction_count
    FROM transactions t
    WHERE datetime >= NOW() - INTERVAL '30 days'
    AND EXTRACT(dow FROM datetime) = EXTRACT(dow FROM NOW())
    GROUP BY 1, 2
  ) hourly_sales
  GROUP BY 1, 2
),
weather_gaps AS (
  SELECT 
    ea.*,
    COALESCE(actual.transaction_count, 0) as actual_count,
    wd.temperature,
    wd.humidity,
    wd.wind_speed,
    wd.precipitation,
    CASE 
      WHEN wd.temperature < 5 THEN 'EXTREME_COLD'
      WHEN wd.temperature < 10 THEN 'COLD'
      WHEN wd.precipitation > 5 THEN 'HEAVY_RAIN'
      WHEN wd.wind_speed > 30 THEN 'STRONG_WIND'
      ELSE 'NORMAL'
    END as weather_condition
  FROM expected_activity ea
  LEFT JOIN actual_transactions actual ON ea.machine_id = actual.machine_id 
    AND ea.hour_slot = actual.hour
  LEFT JOIN weather_data wd ON DATE(ea.hour_slot) = wd.date
  WHERE ea.expected_count > 0.5  -- Nur Zeiten mit erwarteter Aktivität
)
SELECT 
  machine_id,
  weather_condition,
  AVG(expected_count - actual_count) as avg_lost_sales,
  COUNT(*) as occurrence_count
FROM weather_gaps
WHERE weather_condition != 'NORMAL'
GROUP BY 1, 2;
```

#### Implementierung: WeatherImpactAnalyzer Service
```typescript
interface WeatherImpact {
  machineId: number;
  weatherCondition: 'EXTREME_COLD' | 'COLD' | 'HEAVY_RAIN' | 'STRONG_WIND';
  averageLostSales: number;
  impactPercentage: number;
  sampleSize: number;
}

class WeatherImpactAnalyzer {
  async calculateNegativeWeatherEffects(machineId: number, days: number = 30): Promise<WeatherImpact[]> {
    // 1. Baseline-Verkäufe bei Normalwetter ermitteln
    const baselineSales = await this.getBaselineSales(machineId, days);
    
    // 2. Schlechtwetter-Perioden identifizieren
    const badWeatherPeriods = await this.identifyBadWeatherPeriods(days);
    
    // 3. Tatsächliche vs. erwartete Verkäufe vergleichen
    const impacts = [];
    for (const period of badWeatherPeriods) {
      const expectedSales = this.calculateExpectedSales(baselineSales, period);
      const actualSales = await this.getActualSales(machineId, period);
      
      impacts.push({
        machineId,
        weatherCondition: period.condition,
        averageLostSales: expectedSales - actualSales,
        impactPercentage: ((expectedSales - actualSales) / expectedSales) * 100,
        sampleSize: period.hours
      });
    }
    
    return impacts;
  }
}
```

### 2.2 Fehlende Transaktionen als implizite Datenpunkte

#### Konzept: Negative Sampling für Prophet
```python
def create_negative_samples(df_transactions, weather_data):
    """
    Erstellt 'negative' Datenpunkte für ausgebliebene Verkäufe bei schlechtem Wetter
    """
    
    # 1. Baseline-Verkaufsmuster ermitteln
    baseline_pattern = df_transactions.groupby([
        df_transactions['datetime'].dt.hour,
        df_transactions['datetime'].dt.dayofweek
    ])['quantity'].mean().reset_index()
    
    # 2. Schlechtwetter-Stunden identifizieren
    bad_weather_hours = weather_data[
        (weather_data['temperature'] < 10) |
        (weather_data['precipitation'] > 3) |
        (weather_data['wind_speed'] > 25)
    ]
    
    # 3. Negative Samples generieren
    negative_samples = []
    for _, weather_row in bad_weather_hours.iterrows():
        expected_sales = baseline_pattern[
            (baseline_pattern['hour'] == weather_row['datetime'].hour) &
            (baseline_pattern['dayofweek'] == weather_row['datetime'].dayofweek)
        ]['quantity'].values[0]
        
        actual_sales = df_transactions[
            df_transactions['datetime'].dt.floor('H') == weather_row['datetime'].floor('H')
        ]['quantity'].sum()
        
        if actual_sales < expected_sales * 0.5:  # Signifikant weniger als erwartet
            negative_samples.append({
                'ds': weather_row['datetime'],
                'y': -(expected_sales - actual_sales),  # Negative Verkäufe
                'weather_impact': 1,
                'temperature': weather_row['temperature'],
                'precipitation': weather_row['precipitation']
            })
    
    return pd.DataFrame(negative_samples)

# Integration in Prophet-Modell
def enhanced_prophet_forecast(df_positive, df_negative, weather_forecast):
    # Kombiniere positive und negative Samples
    df_combined = pd.concat([df_positive, df_negative], ignore_index=True)
    
    model = Prophet(
        yearly_seasonality=True,
        weekly_seasonality=True,
        daily_seasonality=True
    )
    
    # Wetter-Regressoren hinzufügen
    model.add_regressor('temperature')
    model.add_regressor('precipitation')
    model.add_regressor('weather_impact')
    
    model.fit(df_combined)
    
    # Zukunftsprognose mit Wettervorhersage
    future = model.make_future_dataframe(periods=168, freq='H')  # 7 Tage
    future = future.merge(weather_forecast, on='ds', how='left')
    
    forecast = model.predict(future)
    return forecast
```

### 2.3 Wetter-Sensitivitätsmatrix pro Automat

#### Implementierung: Standortspezifische Wettereffekte
```typescript
interface WeatherSensitivityMatrix {
  machineId: number;
  machineName: string;
  location: string;
  weatherEffects: {
    temperature: {
      below5C: number;      // -60% Verkäufe
      below10C: number;     // -30% Verkäufe
      above30C: number;     // +20% Verkäufe (Getränke)
    };
    precipitation: {
      lightRain: number;    // -15% Verkäufe
      heavyRain: number;    // -50% Verkäufe
      snow: number;         // -70% Verkäufe
    };
    wind: {
      moderate: number;     // -10% Verkäufe
      strong: number;       // -35% Verkäufe
    };
    combination: {
      coldRain: number;     // -80% Verkäufe
      hotSun: number;       // +30% Verkäufe
    };
  };
  baselineExpectation: {
    hourlyAverage: number[];  // 24 Stunden
    weeklyPattern: number[];  // 7 Tage
    seasonalFactor: number;
  };
}

class WeatherSensitivityCalculator {
  async calculateMachineMatrix(machineId: number): Promise<WeatherSensitivityMatrix> {
    // Historische Daten analysieren
    const historicalData = await this.getHistoricalWeatherTransactions(machineId, 365);
    
    // Baseline ohne Wettereffekte
    const baseline = this.calculateBaseline(historicalData);
    
    // Wettereffekte pro Kategorie berechnen
    const effects = {
      temperature: {
        below5C: this.calculateEffect(historicalData, { temp: '<5' }),
        below10C: this.calculateEffect(historicalData, { temp: '<10' }),
        above30C: this.calculateEffect(historicalData, { temp: '>30' })
      },
      precipitation: {
        lightRain: this.calculateEffect(historicalData, { rain: '1-5mm' }),
        heavyRain: this.calculateEffect(historicalData, { rain: '>5mm' }),
        snow: this.calculateEffect(historicalData, { snow: '>0' })
      },
      wind: {
        moderate: this.calculateEffect(historicalData, { wind: '15-30' }),
        strong: this.calculateEffect(historicalData, { wind: '>30' })
      }
    };
    
    return {
      machineId,
      machineName: await this.getMachineName(machineId),
      location: await this.getMachineLocation(machineId),
      weatherEffects: effects,
      baselineExpectation: baseline
    };
  }
}
```

### 2.4 Erwartungswert-Modellierung

#### Konzept: Probabilistic Baseline Model
```python
class ExpectationValueModel:
    def __init__(self, machine_id):
        self.machine_id = machine_id
        self.baseline_patterns = {}
        
    def calculate_baseline_expectation(self, datetime_obj, weather_normal=True):
        """
        Berechnet erwartete Verkäufe unter Normalbedingungen
        """
        hour = datetime_obj.hour
        weekday = datetime_obj.weekday()
        month = datetime_obj.month
        
        # Basis-Erwartung aus historischen Patterns
        base_expectation = self.baseline_patterns.get(
            f"{weekday}_{hour}", 0
        )
        
        # Saisonale Adjustierung
        seasonal_factor = self.get_seasonal_factor(month)
        
        # Feiertagseffekt
        holiday_factor = self.get_holiday_factor(datetime_obj)
        
        expected_value = base_expectation * seasonal_factor * holiday_factor
        
        if not weather_normal:
            # Wetterkorrektur anwenden
            weather_impact = self.get_weather_impact(datetime_obj)
            expected_value *= (1 + weather_impact)
            
        return {
            'expected_transactions': expected_value,
            'confidence_interval': self.calculate_confidence(expected_value),
            'factors_applied': {
                'seasonal': seasonal_factor,
                'holiday': holiday_factor,
                'weather': weather_impact if not weather_normal else 0
            }
        }
    
    def detect_anomalies(self, actual_sales, expected_sales):
        """
        Erkennt signifikante Abweichungen von Erwartungen
        """
        deviation = (actual_sales - expected_sales) / expected_sales
        
        if deviation < -0.5:
            return 'SIGNIFICANT_UNDERPERFORMANCE'
        elif deviation > 0.5:
            return 'SIGNIFICANT_OVERPERFORMANCE'
        elif abs(deviation) > 0.2:
            return 'MODERATE_DEVIATION'
        else:
            return 'NORMAL'
```

### 2.5 Zukunftsprognose mit Wettervorhersage

#### Integration: 7-Tage Wetterprognose-Integration
```typescript
interface EnhancedForecast {
  datetime: Date;
  expectedSales: number;
  weatherAdjustedSales: number;
  confidenceInterval: [number, number];
  weatherFactors: {
    temperature: number;
    precipitation: number;
    wind: number;
    combinedImpact: number;
  };
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendations: string[];
}

class EnhancedForecastEngine {
  async generateWeatherAwareForecast(
    machineId: number, 
    days: number = 7
  ): Promise<EnhancedForecast[]> {
    // 1. Wettervorhersage abrufen
    const weatherForecast = await this.getWeatherForecast(days);
    
    // 2. Basis-Prognose ohne Wettereffekte
    const baseForecast = await this.getBaseForecast(machineId, days);
    
    // 3. Wetter-Sensitivitätsmatrix laden
    const sensitivityMatrix = await this.getWeatherSensitivity(machineId);
    
    const enhancedForecast: EnhancedForecast[] = [];
    
    for (let i = 0; i < days * 24; i++) {
      const datetime = new Date();
      datetime.setHours(datetime.getHours() + i);
      
      const weather = weatherForecast[i];
      const baseExpectation = baseForecast[i];
      
      // Wetterimpact berechnen
      const weatherImpact = this.calculateWeatherImpact(
        weather, 
        sensitivityMatrix
      );
      
      const adjustedSales = baseExpectation * (1 + weatherImpact.combinedImpact);
      
      enhancedForecast.push({
        datetime,
        expectedSales: baseExpectation,
        weatherAdjustedSales: Math.max(0, adjustedSales),
        confidenceInterval: this.calculateConfidence(adjustedSales, weather),
        weatherFactors: weatherImpact,
        riskLevel: this.assessRisk(weatherImpact),
        recommendations: this.generateRecommendations(weatherImpact, adjustedSales)
      });
    }
    
    return enhancedForecast;
  }
  
  private generateRecommendations(
    weatherImpact: any, 
    adjustedSales: number
  ): string[] {
    const recommendations = [];
    
    if (weatherImpact.combinedImpact < -0.3) {
      recommendations.push('Lagerbestände reduzieren');
      recommendations.push('Marketing-Aktivitäten verschieben');
    }
    
    if (weatherImpact.temperature > 0.2) {
      recommendations.push('Kühle Getränke aufstocken');
      recommendations.push('Eis-Produkte bevorraten');
    }
    
    if (weatherImpact.precipitation < -0.4) {
      recommendations.push('Wartung/Reinigung bei schlechtem Wetter planen');
    }
    
    return recommendations;
  }
}
```

---

## 3. PRAKTISCHE IMPLEMENTIERUNG

### 3.1 Datenbank-Erweiterungen
```sql
-- Neue Tabelle: Erwartungswerte
CREATE TABLE baseline_expectations (
  id SERIAL PRIMARY KEY,
  machine_id INTEGER REFERENCES machines(id),
  hour_of_day INTEGER CHECK (hour_of_day >= 0 AND hour_of_day <= 23),
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
  month INTEGER CHECK (month >= 1 AND month <= 12),
  expected_transactions DECIMAL(8,2),
  confidence_level DECIMAL(3,2),
  sample_size INTEGER,
  last_updated TIMESTAMP DEFAULT NOW()
);

-- Neue Tabelle: Wetterimpact-Matrix
CREATE TABLE weather_sensitivity_matrix (
  id SERIAL PRIMARY KEY,
  machine_id INTEGER REFERENCES machines(id),
  weather_condition VARCHAR(50),
  impact_percentage DECIMAL(5,2),
  sample_size INTEGER,
  last_calculated TIMESTAMP DEFAULT NOW()
);

-- Neue Tabelle: Negative Events (ausgebliebene Verkäufe)
CREATE TABLE negative_events (
  id SERIAL PRIMARY KEY,
  machine_id INTEGER REFERENCES machines(id),
  datetime TIMESTAMP,
  expected_sales DECIMAL(8,2),
  actual_sales DECIMAL(8,2),
  weather_condition VARCHAR(50),
  impact_severity VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 3.2 API-Endpunkte
```typescript
// /api/forecast/enhanced-weather
app.get('/api/forecast/enhanced-weather/:machineId', async (req, res) => {
  const { machineId } = req.params;
  const { days = 7 } = req.query;
  
  const forecastEngine = new EnhancedForecastEngine();
  const forecast = await forecastEngine.generateWeatherAwareForecast(
    parseInt(machineId), 
    parseInt(days)
  );
  
  res.json({
    success: true,
    data: forecast,
    metadata: {
      generatedAt: new Date(),
      machineId,
      forecastDays: days,
      includesWeatherEffects: true
    }
  });
});

// /api/analysis/weather-impact/:machineId
app.get('/api/analysis/weather-impact/:machineId', async (req, res) => {
  const analyzer = new WeatherImpactAnalyzer();
  const impacts = await analyzer.calculateNegativeWeatherEffects(
    parseInt(req.params.machineId)
  );
  
  res.json({ success: true, data: impacts });
});
```

### 3.3 Frontend-Integration
```typescript
// Enhanced Forecast Widget
const EnhancedForecastWidget: React.FC = () => {
  const { data: enhancedForecast } = useQuery({
    queryKey: ['enhanced-forecast', selectedMachine],
    queryFn: () => getEnhancedWeatherForecast(selectedMachine, 7)
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Wetterbasierte Verkaufsprognose</CardTitle>
      </CardHeader>
      <CardContent>
        {enhancedForecast?.map(forecast => (
          <div key={forecast.datetime.toISOString()}>
            <div>
              Erwartet: {forecast.expectedSales.toFixed(1)} Verkäufe
            </div>
            <div>
              Wetterkorrigiert: {forecast.weatherAdjustedSales.toFixed(1)} Verkäufe
            </div>
            <div>
              Risiko: <Badge variant={
                forecast.riskLevel === 'HIGH' ? 'destructive' : 
                forecast.riskLevel === 'MEDIUM' ? 'secondary' : 'default'
              }>{forecast.riskLevel}</Badge>
            </div>
            {forecast.recommendations.map(rec => (
              <Alert key={rec}>
                <AlertDescription>{rec}</AlertDescription>
              </Alert>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
```

---

## 4. ERWARTETE VERBESSERUNGEN

### 4.1 Prognosege­nauigkeit
- **20-30% höhere Genauigkeit** bei Schlechtwetter-Prognosen
- **Reduzierte False Positives** bei schlechtem Wetter
- **Bessere Saisonalitätserkennung** durch Wetterbereinigung

### 4.2 Operative Vorteile
- **Intelligente Bestandsplanung** basierend auf Wettervorhersage
- **Präventive Wartungsplanung** während vorhergesagten Schlechtwetter-Perioden
- **Optimierte Logistik** durch wetterbedingte Nachfragevorhersage

### 4.3 Geschäftsentscheidungen
- **Datengetriebene Standortbewertung** unter Berücksichtigung der Wettersensitivität
- **Produktportfolio-Optimierung** pro Standort basierend auf Wettermustern
- **Marketing-Timing** optimiert für wetterbewusste Kampagnen

---

## 5. IMPLEMENTIERUNGSPLAN

### Phase 1: Datensammlung (2 Wochen)
- [x] Historische Wetterdaten vervollständigen
- [ ] Baseline-Expectations berechnen  
- [ ] Wettersensitivitäts-Matrix erstellen

### Phase 2: Algorithmus-Entwicklung (3 Wochen)
- [ ] Negative Sampling implementieren
- [ ] Enhanced Prophet Model entwickeln
- [ ] Wetterimpact-Analyzer programmieren

### Phase 3: API & Frontend (2 Wochen)
- [ ] API-Endpunkte implementieren
- [ ] Frontend-Widgets erstellen
- [ ] Dashboard-Integration

### Phase 4: Testing & Optimierung (2 Wochen)
- [ ] A/B Testing mit bestehender Prognose
- [ ] Performance-Optimierung
- [ ] Dokumentation vervollständigen

---

## 6. FAZIT

Die erweiterte wetterbasierte Prognosemethodik adressiert eine kritische Lücke in der aktuellen Verkaufsprognose: **Die systematische Berücksichtigung negativer Wettereffekte und ausgebliebener Transaktionen**.

Durch die Integration von Erwartungswert-Modellierung, Wetter-Sensitivitätsmatrizen und negativen Sampling-Techniken wird das System deutlich präziser in der Vorhersage von witterungsbedingten Verkaufsschwankungen.

**Kernnutzen:**
- Präzisere Prognosen bei extremem Wetter
- Intelligent optimierte Bestandsplanung
- Datengetriebene operative Entscheidungen
- Reduzierte Verschwendung durch bessere Vorhersagen

Die Implementierung sollte schrittweise erfolgen, um kontinuierliche Verbesserungen zu ermöglichen und das Risiko zu minimieren.