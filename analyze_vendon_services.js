
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 VENDON SERVICES COMPREHENSIVE AUDIT');
console.log('=====================================\n');

// 1. Find all Vendon-related files
console.log('📁 Suche alle Vendon-bezogenen Dateien...');
try {
  const vendonFiles = execSync(`find . -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.md" \\) -exec grep -l -i "vendon" {} \\;`)
    .toString().trim().split('\n').filter(f => f);
  
  console.log(`✅ ${vendonFiles.length} Dateien mit Vendon-Referenzen gefunden:`);
  vendonFiles.forEach(file => console.log(`   - ${file}`));
} catch (error) {
  console.log('❌ Fehler beim Suchen der Vendon-Dateien:', error.message);
}

console.log('\n📡 Suche API-Aufrufe...');
try {
  const apiCalls = execSync(`grep -r "cloud\\.vendon\\.net\\|VENDON_API" . --include="*.ts" --include="*.js" --include="*.env*"`)
    .toString().trim();
  
  if (apiCalls) {
    console.log('✅ API-Aufrufe gefunden:');
    console.log(apiCalls.split('\n').slice(0, 10).join('\n')); // Erste 10 Zeilen
  } else {
    console.log('ℹ️ Keine direkten API-Aufrufe gefunden');
  }
} catch (error) {
  console.log('ℹ️ Keine API-Aufrufe in den Dateien gefunden');
}

console.log('\n🔗 Suche Vendon-IDs in der Datenbank...');
try {
  const vendonIds = execSync(`grep -r "vendon_id\\|vendonId" server/ --include="*.ts" --include="*.sql"`)
    .toString().trim();
  
  if (vendonIds) {
    console.log('✅ Vendon-ID Referenzen gefunden:');
    console.log(vendonIds.split('\n').slice(0, 10).join('\n')); // Erste 10 Zeilen
  } else {
    console.log('ℹ️ Keine Vendon-ID Referenzen gefunden');
  }
} catch (error) {
  console.log('ℹ️ Keine Vendon-ID Referenzen gefunden');
}

console.log('\n📦 Suche Service-Imports...');
try {
  const imports = execSync(`grep -r "import.*vendon\\|from.*vendon" server/ client/ --include="*.ts" --include="*.tsx"`)
    .toString().trim();
  
  if (imports) {
    console.log('✅ Vendon-Service-Imports gefunden:');
    console.log(imports.split('\n').slice(0, 10).join('\n')); // Erste 10 Zeilen
  } else {
    console.log('ℹ️ Keine Vendon-Service-Imports gefunden');
  }
} catch (error) {
  console.log('ℹ️ Keine Vendon-Service-Imports gefunden');
}

console.log('\n⏰ Suche Scheduler/Timer...');
try {
  const schedulers = execSync(`grep -r "setInterval\\|setTimeout.*vendon\\|cron.*vendon" server/ --include="*.ts"`)
    .toString().trim();
  
  if (schedulers) {
    console.log('✅ Vendon-Scheduler gefunden:');
    console.log(schedulers.split('\n').slice(0, 10).join('\n')); // Erste 10 Zeilen
  } else {
    console.log('ℹ️ Keine Vendon-Scheduler gefunden');
  }
} catch (error) {
  console.log('ℹ️ Keine Vendon-Scheduler gefunden');
}

console.log('\n🎯 Suche API-Methoden...');
try {
  const apiMethods = execSync(`grep -r "makeRequest\\|getTransactions\\|getMachines\\|getEvents\\|getRefills" server/services/ --include="*.ts"`)
    .toString().trim();
  
  if (apiMethods) {
    console.log('✅ API-Methoden gefunden:');
    console.log(apiMethods.split('\n').slice(0, 10).join('\n')); // Erste 10 Zeilen
  } else {
    console.log('ℹ️ Keine API-Methoden gefunden');
  }
} catch (error) {
  console.log('ℹ️ Keine API-Methoden gefunden');
}

// Analysiere Service-Dateien im Detail
console.log('\n📊 Detaillierte Service-Analyse...');
const serviceDir = 'server/services';
if (fs.existsSync(serviceDir)) {
  const serviceFiles = fs.readdirSync(serviceDir)
    .filter(f => f.toLowerCase().includes('vendon') && f.endsWith('.ts'));
  
  console.log(`✅ ${serviceFiles.length} Vendon-Services gefunden:`);
  
  serviceFiles.forEach(file => {
    const filePath = path.join(serviceDir, file);
    const stats = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').length;
    
    console.log(`\n📄 ${file}:`);
    console.log(`   - Zeilen: ${lines}`);
    console.log(`   - Größe: ${Math.round(stats.size / 1024)}KB`);
    console.log(`   - Letzte Änderung: ${stats.mtime.toLocaleDateString()}`);
    
    // Suche nach exports/classes
    const exports = content.match(/export\s+(class|function|const)\s+(\w+)/g) || [];
    if (exports.length > 0) {
      console.log(`   - Exports: ${exports.map(e => e.split(' ').pop()).join(', ')}`);
    }
    
    // Suche nach API-Aufrufen
    const apiCalls = content.match(/https?:\/\/[^\s'"]+/g) || [];
    if (apiCalls.length > 0) {
      console.log(`   - API-Aufrufe: ${apiCalls.length}`);
    }
  });
} else {
  console.log('❌ Services-Verzeichnis nicht gefunden');
}

// Analysiere Frontend-Components
console.log('\n🖥️ Frontend-Component-Analyse...');
const frontendVendonPaths = [
  'client/src/pages/admin',
  'client/src/components/sync'
];

frontendVendonPaths.forEach(dir => {
  if (fs.existsSync(dir)) {
    try {
      const vendonComponents = execSync(`find ${dir} -name "*.tsx" -exec grep -l -i "vendon" {} \\;`)
        .toString().trim().split('\n').filter(f => f);
      
      if (vendonComponents.length > 0) {
        console.log(`✅ Vendon-Components in ${dir}:`);
        vendonComponents.forEach(comp => console.log(`   - ${comp}`));
      }
    } catch (error) {
      console.log(`ℹ️ Keine Vendon-Components in ${dir} gefunden`);
    }
  }
});

console.log('\n📋 AUDIT ZUSAMMENFASSUNG');
console.log('========================');
console.log('✅ Datei-Suche abgeschlossen');
console.log('✅ API-Analyse abgeschlossen');
console.log('✅ Service-Analyse abgeschlossen');
console.log('✅ Frontend-Analyse abgeschlossen');
console.log('\n📝 Nächste Schritte:');
console.log('1. Detaillierte Code-Review jedes identifizierten Services');
console.log('2. Datenbank-Schema-Analyse durchführen');
console.log('3. Performance-Messungen der aktuellen Services');
console.log('4. Clean-Slate-Architecture entwerfen');
console.log('\n🎯 Bereit für Phase 2: Impact Analysis');
