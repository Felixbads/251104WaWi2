#!/usr/bin/env node
/**
 * REFILL-DETAILS SYNC - Holt fehlende Details von der Vendon API
 * Füllt alle leeren Refills mit echten Produktdaten
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const API_KEY = process.env.VENDON_API_KEY;
const BASE_URL = 'https://cloud.vendon.net/rest/v1.9.0';

/**
 * Holt Refill-Details von der Vendon API
 */
async function getRefillDetailsFromAPI(refillVendonId) {
  try {
    const url = `${BASE_URL}/refills/${refillVendonId}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Token ${API_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.warn(`⚠️  API Fehler für Refill ${refillVendonId}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    // API kann verschiedene Formate zurückgeben
    if (data.result) {
      return data.result;
    } else if (data.added && data.removed) {
      return data;
    } else if (Array.isArray(data)) {
      return { added: data, removed: [] };
    }
    
    return data;
  } catch (error) {
    console.error(`❌ Fehler beim Abrufen der Details für Refill ${refillVendonId}:`, error.message);
    return null;
  }
}

/**
 * Speichert Refill-Details in die Datenbank
 */
async function saveRefillDetails(refillId, refillVendonId, details) {
  if (!details) return 0;
  
  let saved = 0;
  
  try {
    // Verarbeite hinzugefügte Produkte
    if (details.added && Array.isArray(details.added)) {
      for (const product of details.added) {
        try {
          await pool.query(`
            INSERT INTO refill_details (
              refill_id, vendon_product_id, product_name, 
              added, removed, created_at
            ) VALUES ($1, $2, $3, $4, $5, NOW())

          `, [
            refillId,
            product.product_id || product.id,
            product.product_name || product.name || 'Unbekanntes Produkt',
            product.added || product.quantity || 0,
            0 // removed ist 0 für hinzugefügte Produkte
          ]);
          saved++;
        } catch (error) {
          if (!error.message.includes('duplicate')) {
            console.error(`   Fehler beim Speichern von Produkt:`, error.message.split('\n')[0]);
          }
        }
      }
    }
    
    // Verarbeite entfernte Produkte
    if (details.removed && Array.isArray(details.removed)) {
      for (const product of details.removed) {
        try {
          await pool.query(`
            INSERT INTO refill_details (
              refill_id, vendon_product_id, product_name, 
              added, removed, created_at
            ) VALUES ($1, $2, $3, $4, $5, NOW())

          `, [
            refillId,
            product.product_id || product.id,
            product.product_name || product.name || 'Unbekanntes Produkt',
            0, // added ist 0 für entfernte Produkte
            product.removed || product.quantity || 0
          ]);
          saved++;
        } catch (error) {
          if (!error.message.includes('duplicate')) {
            console.error(`   Fehler beim Speichern von Produkt:`, error.message.split('\n')[0]);
          }
        }
      }
    }
    
    // Fallback: Wenn details ein direktes Array ist
    if (Array.isArray(details)) {
      for (const product of details) {
        try {
          await pool.query(`
            INSERT INTO refill_details (
              refill_id, vendon_product_id, product_name, 
              added, removed, created_at
            ) VALUES ($1, $2, $3, $4, $5, NOW())

          `, [
            refillId,
            product.product_id || product.id,
            product.product_name || product.name || 'Unbekanntes Produkt',
            product.added || product.quantity || 0,
            product.removed || 0
          ]);
          saved++;
        } catch (error) {
          if (!error.message.includes('duplicate')) {
            console.error(`   Fehler beim Speichern von Produkt:`, error.message.split('\n')[0]);
          }
        }
      }
    }
    
  } catch (error) {
    console.error(`❌ Fehler beim Speichern der Details für Refill ${refillVendonId}:`, error.message);
  }
  
  return saved;
}

/**
 * Hauptfunktion - Füllt alle leeren Refills mit Details
 */
async function fillAllRefillDetails() {
  console.log('🚀 STARTE REFILL-DETAILS SYNCHRONISATION');
  console.log('==========================================\n');
  
  try {
    // 1. Finde alle Refills ohne Details
    const emptyRefillsResult = await pool.query(`
      SELECT r.id, r.vendon_id, r.machine_name, r.datetime
      FROM refills r
      LEFT JOIN refill_details rd ON r.id = rd.refill_id
      WHERE r.vendon_id IS NOT NULL
        AND rd.id IS NULL
      ORDER BY r.datetime DESC
      LIMIT 5
    `);
    
    const emptyRefills = emptyRefillsResult.rows;
    console.log(`📊 Gefunden: ${emptyRefills.length} Refills ohne Details`);
    
    if (emptyRefills.length === 0) {
      console.log('✅ Alle Refills haben bereits Details!');
      return;
    }
    
    let processed = 0;
    let successful = 0;
    let totalDetailsSaved = 0;
    
    // 2. Verarbeite jeden leeren Refill
    for (const refill of emptyRefills) {
      processed++;
      const progress = `[${processed}/${emptyRefills.length}]`;
      
      console.log(`\n${progress} 🔍 Verarbeite Refill ${refill.vendon_id}`);
      console.log(`   📍 ${refill.machine_name || 'Unbekannte Maschine'}`);
      console.log(`   📅 ${new Date(refill.datetime).toLocaleString('de-DE')}`);
      
      // Hole Details von der API
      const details = await getRefillDetailsFromAPI(refill.vendon_id);
      
      if (details) {
        // Speichere Details in der Datenbank
        const detailsSaved = await saveRefillDetails(refill.id, refill.vendon_id, details);
        
        if (detailsSaved > 0) {
          console.log(`   ✅ ${detailsSaved} Details gespeichert`);
          successful++;
          totalDetailsSaved += detailsSaved;
        } else {
          console.log(`   ⚠️  Keine Details erhalten`);
        }
      } else {
        console.log(`   ❌ API-Fehler oder keine Details`);
      }
      
      // Kleine Pause zwischen API-Aufrufen
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('\n==========================================');
    console.log('✅ REFILL-DETAILS SYNC ABGESCHLOSSEN!');
    console.log(`   ${processed} Refills verarbeitet`);
    console.log(`   ${successful} erfolgreich synchronisiert`);
    console.log(`   ${totalDetailsSaved} Details insgesamt gespeichert`);
    console.log('==========================================');
    
    // 3. Zeige aktuelle Statistik
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_refills,
        COUNT(CASE WHEN rd.id IS NULL THEN 1 END) as empty_refills,
        COUNT(CASE WHEN rd.id IS NOT NULL THEN 1 END) as filled_refills
      FROM refills r
      LEFT JOIN refill_details rd ON r.id = rd.refill_id
      WHERE r.created_at >= '2025-09-01'
    `);
    
    const stats = statsResult.rows[0];
    console.log(`\n📈 NEUE STATISTIK:`);
    console.log(`   Total Refills: ${stats.total_refills}`);
    console.log(`   Mit Details: ${stats.filled_refills}`);
    console.log(`   Ohne Details: ${stats.empty_refills}`);
    
    if (totalDetailsSaved > 0) {
      console.log('\n🎉 Die Lagerbewegungen werden jetzt korrekt aus Refill-Daten erstellt!');
    }
    
  } catch (error) {
    console.error('❌ Fehler bei der Refill-Details Synchronisation:', error.message);
  } finally {
    await pool.end();
  }
}

// Führe die Synchronisation aus
fillAllRefillDetails().catch(console.error);