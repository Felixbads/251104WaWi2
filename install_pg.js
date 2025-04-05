// Install pg package
import { execSync } from 'child_process';

try {
  console.log('Installing pg package...');
  execSync('npm install pg @types/pg', { stdio: 'inherit' });
  console.log('pg package installed successfully');
} catch (error) {
  console.error('Error installing pg package:', error);
  process.exit(1);
}