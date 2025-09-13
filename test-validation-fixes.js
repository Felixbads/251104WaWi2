// Test validation fixes for goods receipt schemas
import { z } from 'zod';

// Simplified test versions of our fixed schemas
const goodsReceiptItemSchema = z.object({
  orderItemId: z.number().positive("Bestellposition-ID muss positiv sein"),
  productId: z.number().positive("Produkt-ID muss positiv sein"), 
  productName: z.string().min(1, "Produktname ist erforderlich"),
  quantityOrdered: z.number().min(0, "Bestellte Menge muss mindestens 0 sein"),
  quantityReceived: z.number().min(0, "Erhaltene Menge muss mindestens 0 sein"),
  expiryDate: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "MHD muss im Format YYYY-MM-DD sein"),
    z.date()
  ]).transform((val) => {
    if (typeof val === 'string') {
      const date = new Date(val);
      if (isNaN(date.getTime())) {
        throw new Error("Ungültiges MHD-Datum");
      }
      // Validierung: MHD darf nicht vor heute liegen (erlaubt Termine am gleichen Tag)
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      if (date < today) {
        throw new Error("MHD darf nicht in der Vergangenheit liegen");
      }
      return val;
    }
    return val.toISOString().split('T')[0];
  }).optional(),
  batchNumber: z.string().min(1, "Chargennummer ist erforderlich wenn MHD angegeben").optional(),
  qualityStatus: z.enum(["good", "damaged", "partial", "rejected"]).default("good"),
  damageDescription: z.string().optional(),
}).superRefine((data, ctx) => {
  // Quantity comparison validation: Warnung bei erheblicher Abweichung von bestellter Menge
  if (data.quantityOrdered > 0 && data.quantityReceived > 0) {
    const deviation = Math.abs(data.quantityReceived - data.quantityOrdered) / data.quantityOrdered;
    if (deviation > 0.1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Erhaltene Menge weicht um mehr als 10% von der bestellten Menge ab",
        path: ["quantityReceived"]
      });
    }
  }
  
  // MHD-Chargennummer validation: Wenn MHD angegeben ist, muss Chargennummer vorhanden sein
  if (data.expiryDate && !data.batchNumber) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Bei MHD-Angabe ist Chargennummer erforderlich",
      path: ["batchNumber"]
    });
  }
  
  // Damage description validation: Wenn Status "damaged" ist, muss Beschreibung vorhanden sein
  if (data.qualityStatus === "damaged" && !data.damageDescription) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Bei Schäden ist eine Beschreibung erforderlich",
      path: ["damageDescription"]
    });
  }
});

// Test cases
console.log("🧪 Testing Validation Fixes...\n");

// Test 1: Valid data should pass
console.log("✅ Test 1: Valid data");
try {
  const validData = {
    orderItemId: 1,
    productId: 123,
    productName: "Test Product",
    quantityOrdered: 10,
    quantityReceived: 10,
    qualityStatus: "good"
  };
  
  const result = goodsReceiptItemSchema.parse(validData);
  console.log("✓ Valid data passed successfully");
} catch (error) {
  console.log("✗ Valid data failed:", error.message);
}

// Test 2: Quantity deviation warning
console.log("\n⚠️  Test 2: Quantity deviation (should show warning)");
try {
  const deviationData = {
    orderItemId: 1,
    productId: 123,
    productName: "Test Product",
    quantityOrdered: 10,
    quantityReceived: 15, // 50% deviation
    qualityStatus: "good"
  };
  
  const result = goodsReceiptItemSchema.parse(deviationData);
  console.log("✗ Should have failed with quantity deviation warning");
} catch (error) {
  if (error.issues && error.issues[0].path.includes("quantityReceived")) {
    console.log("✓ Correctly caught quantity deviation with proper path:", error.issues[0].message);
  } else {
    console.log("✗ Wrong error or path:", error.message);
  }
}

// Test 3: MHD without batch number
console.log("\n🧪 Test 3: MHD without batch number");
try {
  const today = new Date().toISOString().split('T')[0];
  const mhdNoBatchData = {
    orderItemId: 1,
    productId: 123,
    productName: "Test Product",
    quantityOrdered: 10,
    quantityReceived: 10,
    expiryDate: today,
    // batchNumber missing
    qualityStatus: "good"
  };
  
  const result = goodsReceiptItemSchema.parse(mhdNoBatchData);
  console.log("✗ Should have failed with missing batch number");
} catch (error) {
  if (error.issues && error.issues[0].path.includes("batchNumber")) {
    console.log("✓ Correctly caught missing batch number with proper path:", error.issues[0].message);
  } else {
    console.log("✗ Wrong error or path:", error.message);
  }
}

// Test 4: Damaged status without description
console.log("\n🧪 Test 4: Damaged status without description");
try {
  const damagedNoDescData = {
    orderItemId: 1,
    productId: 123,
    productName: "Test Product",
    quantityOrdered: 10,
    quantityReceived: 8,
    qualityStatus: "damaged"
    // damageDescription missing
  };
  
  const result = goodsReceiptItemSchema.parse(damagedNoDescData);
  console.log("✗ Should have failed with missing damage description");
} catch (error) {
  if (error.issues && error.issues[0].path.includes("damageDescription")) {
    console.log("✓ Correctly caught missing damage description with proper path:", error.issues[0].message);
  } else {
    console.log("✗ Wrong error or path:", error.message);
  }
}

// Test 5: Same-day MHD should be allowed
console.log("\n📅 Test 5: Same-day MHD (should be allowed)");
try {
  const today = new Date().toISOString().split('T')[0];
  const sameDayMhdData = {
    orderItemId: 1,
    productId: 123,
    productName: "Test Product",
    quantityOrdered: 10,
    quantityReceived: 10,
    expiryDate: today,
    batchNumber: "BATCH123",
    qualityStatus: "good"
  };
  
  const result = goodsReceiptItemSchema.parse(sameDayMhdData);
  console.log("✓ Same-day MHD allowed successfully");
} catch (error) {
  console.log("✗ Same-day MHD failed:", error.message);
}

// Test 6: Past date MHD should fail
console.log("\n📅 Test 6: Past date MHD (should fail)");
try {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const pastDateMhdData = {
    orderItemId: 1,
    productId: 123,
    productName: "Test Product",
    quantityOrdered: 10,
    quantityReceived: 10,
    expiryDate: yesterday.toISOString().split('T')[0],
    batchNumber: "BATCH123",
    qualityStatus: "good"
  };
  
  const result = goodsReceiptItemSchema.parse(pastDateMhdData);
  console.log("✗ Past date MHD should have failed");
} catch (error) {
  console.log("✓ Correctly rejected past date MHD:", error.message);
}

console.log("\n🎉 Validation tests completed!");