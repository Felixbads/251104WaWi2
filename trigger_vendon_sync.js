import { vendonSync } from './server/services/vendonSync.js';

async function triggerTodaySync() {
  try {
    console.log('🚀 Triggere Vendon-Synchronisation für heute...');
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    console.log(`📅 Synchronisiere von ${yesterday.toISOString()} bis ${today.toISOString()}`);
    
    const result = await vendonSync.syncTransactions(
      yesterday,
      today,
      true
    );
    
    console.log('✅ Synchronisation abgeschlossen:', result);
    
  } catch (error) {
    console.error('❌ Fehler bei der Synchronisation:', error);
  }
}

triggerTodaySync();