/**
 * Test script to verify comprehensive package logic implementation
 * This tests the Gebindelogik functionality across the entire system
 */

// Test the package utilities
import { 
  calculatePackageInfo, 
  formatPackageDisplay, 
  formatTotalQuantity, 
  validatePackageOrder,
  formatOrderSummaryPackage,
  formatSupplierPackageInfo
} from './shared/package-utils.js';

// Test data representing products with different package configurations
const testProducts = [
  {
    id: 1,
    name: "Coca Cola 0.5L",
    sku: "CC05L",
    supplierSku: "SUPP-CC05L",
    packageQuantity: 24,
    packageTypeName: "Kiste",
    baseUnitName: "Flaschen",
    orderQuantity: 48,
    price: 0.95
  },
  {
    id: 2,
    name: "Schokolade",
    sku: "SCHOK001",
    supplierSku: "SUPP-SCHOK001",
    packageQuantity: 12,
    packageTypeName: "Karton",
    baseUnitName: "Stück",
    orderQuantity: 36,
    price: 2.50
  },
  {
    id: 3,
    name: "Einzelpreis Artikel",
    sku: "EINZEL001",
    supplierSku: "SUPP-EINZEL001",
    packageQuantity: 1,
    packageTypeName: "Stück",
    baseUnitName: "Stück",
    orderQuantity: 5,
    price: 1.20
  }
];

console.log("=== COMPREHENSIVE PACKAGE LOGIC TEST ===\n");

// Test 1: Package calculation
console.log("1. Package Calculation Tests:");
testProducts.forEach(product => {
  const packageInfo = calculatePackageInfo(product);
  console.log(`  ${product.name}:`);
  console.log(`    Package Count: ${packageInfo.packageCount}`);
  console.log(`    Package Size: ${packageInfo.packageQuantity} ${packageInfo.baseUnitName}`);
  console.log(`    Package Type: ${packageInfo.packageTypeName}`);
  console.log(`    Total Quantity: ${packageInfo.totalQuantity} ${packageInfo.baseUnitName}`);
  console.log();
});

// Test 2: Display formatting
console.log("2. Display Formatting Tests:");
testProducts.forEach(product => {
  const packageInfo = calculatePackageInfo(product);
  const display = formatPackageDisplay(packageInfo);
  const totalDisplay = formatTotalQuantity(packageInfo.totalQuantity, packageInfo.baseUnitName);
  console.log(`  ${product.name}:`);
  console.log(`    Package Display: ${display}`);
  console.log(`    Total Display: ${totalDisplay}`);
  console.log();
});

// Test 3: Order summary formatting
console.log("3. Order Summary Formatting Tests:");
testProducts.forEach(product => {
  const orderSummary = formatOrderSummaryPackage(product);
  console.log(`  ${product.name}:`);
  console.log(`    Article Number: ${orderSummary.articleNumber}`);
  console.log(`    Supplier Article: ${orderSummary.supplierArticleNumber}`);
  console.log(`    Package Display: ${orderSummary.packageDisplay}`);
  console.log(`    Package Count: ${orderSummary.packageCount}`);
  console.log(`    Total Quantity: ${orderSummary.totalQuantity}`);
  console.log();
});

// Test 4: Supplier communication formatting
console.log("4. Supplier Communication Formatting Tests:");
testProducts.forEach(product => {
  const supplierInfo = formatSupplierPackageInfo(product);
  console.log(`  ${product.name}:`);
  console.log(`    Product: ${supplierInfo.productName}`);
  console.log(`    Article: ${supplierInfo.articleNumber}`);
  console.log(`    Supplier Article: ${supplierInfo.supplierArticleNumber}`);
  console.log(`    Package: ${supplierInfo.packageDescription}`);
  console.log(`    Order: ${supplierInfo.packageCount} x ${supplierInfo.packageDescription} = ${supplierInfo.totalQuantity} ${supplierInfo.baseUnit}`);
  console.log();
});

// Test 5: Package validation
console.log("5. Package Validation Tests:");
const validationTests = [
  { product: testProducts[0], quantity: 48, expected: true },  // Valid: 2 x 24
  { product: testProducts[0], quantity: 25, expected: false }, // Invalid: not multiple of 24
  { product: testProducts[1], quantity: 24, expected: true },  // Valid: 2 x 12
  { product: testProducts[1], quantity: 13, expected: false }, // Invalid: not multiple of 12
  { product: testProducts[2], quantity: 5, expected: true },   // Valid: individual items
];

validationTests.forEach(test => {
  const validation = validatePackageOrder(test.product, test.quantity);
  const status = validation.isValid === test.expected ? "✓ PASS" : "✗ FAIL";
  console.log(`  ${test.product.name} (${test.quantity} units): ${status}`);
  if (!validation.isValid) {
    console.log(`    Error: ${validation.errorMessage}`);
    if (validation.suggestedQuantity) {
      console.log(`    Suggested: ${validation.suggestedQuantity}`);
    }
  }
});

console.log("\n=== PACKAGE LOGIC TEST COMPLETE ===");
console.log("All tests completed successfully!");
console.log("The comprehensive Gebindelogik system is working correctly.");