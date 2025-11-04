# Measure #4 (REVISED): Deletion Policies Implementation Plan

## ⚠️ IMPORTANT: This is a REVISED version of Measure #4

**Original Plan**: Add CASCADE rules to 134 foreign keys
**Revised Plan**: Add explicit deletion policies (RESTRICT, SET NULL, Soft Delete)
**Reason**: CASCADE would cause massive data loss; explicit policies provide better control

---

## 🎯 Objective

Implement explicit deletion policies for all 133 foreign keys currently without `onDelete` rules.

**Goal**: Define clear, safe behavior when referenced records are deleted.

---

## 📊 Current State

- **Total Foreign Keys**: 150
- **With onDelete rules**: 17 (11.3%)
  - CASCADE: 16
  - SET NULL: 1
- **Without onDelete rules**: 133 (88.7%) ← **Target for this migration**

**Problem**: When no onDelete rule is specified, PostgreSQL defaults to `NO ACTION` which:
- Prevents deletion if child records exist (good for data integrity)
- But gives unclear error messages
- Doesn't express intent explicitly

---

## 🎯 Strategy: Three-Policy Approach

### Policy 1: RESTRICT (60% of FKs - 80 FKs)

**Use For**: Core business entities where deletion should be prevented

**Behavior**: Explicitly prevent deletion if child records exist

**Examples**:
- `products.id` ← Don't delete if orders/inventory exist
- `machines.id` ← Don't delete if transactions exist
- `users.id` ← Don't delete if audit trail exists

**Implementation**:
```sql
ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_product_id_fkey,
  ADD CONSTRAINT order_items_product_id_fkey
    FOREIGN KEY (product_id)
    REFERENCES products(id)
    ON DELETE RESTRICT;
```

**Error Message** (when deletion attempted):
```
ERROR: update or delete on table "products" violates foreign key constraint "order_items_product_id_fkey" on table "order_items"
DETAIL: Key (id)=(123) is still referenced from table "order_items".
```

### Policy 2: SET NULL (26% of FKs - 35 FKs)

**Use For**: Optional relationships where parent deletion is allowed

**Behavior**: Allow deletion, NULL the child's reference

**Examples**:
- `products.supplier_id` ← Keep product when supplier deleted
- `orders.location_id` ← Keep order when location deleted (historical reference)
- `transactions.user_id` ← Keep transaction, just NULL user (preserve audit trail)

**Important**: Column MUST allow NULL values!

**Implementation**:
```sql
-- Ensure column allows NULL
ALTER TABLE products
  ALTER COLUMN supplier_id DROP NOT NULL;  -- If needed

-- Add SET NULL policy
ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_supplier_id_fkey,
  ADD CONSTRAINT products_supplier_id_fkey
    FOREIGN KEY (supplier_id)
    REFERENCES suppliers(id)
    ON DELETE SET NULL;
```

**Behavior** (when supplier deleted):
```sql
-- Before
SELECT id, product_name, supplier_id FROM products WHERE id = 123;
-- id | product_name | supplier_id
-- 123 | Coca Cola   | 45

DELETE FROM suppliers WHERE id = 45;

-- After
SELECT id, product_name, supplier_id FROM products WHERE id = 123;
-- id | product_name | supplier_id
-- 123 | Coca Cola   | NULL
```

### Policy 3: Soft Delete (11% of FKs - 15 FKs)

**Use For**: Operational entities that need "deactivation" not deletion

**Behavior**: Don't delete, mark as inactive (application-layer)

**Examples**:
- `machines` → Mark as inactive, preserve all history
- `warehouses` → Mark as closed, preserve inventory history
- `suppliers` → Mark as inactive, preserve product relationships

**Implementation** (Application-layer):
```typescript
// 1. Add deleted_at column (migration)
export const machines = pgTable("machines", {
  id: serial("id").primaryKey(),
  // ... other fields ...
  deleted_at: timestamp("deleted_at"),  // NULL = active
});

// 2. Update "delete" logic (application code)
async function deleteMachine(machineId: number) {
  // Don't DELETE, just mark as deleted
  await db.update(machines)
    .set({ deleted_at: new Date() })
    .where(eq(machines.id, machineId));
}

// 3. Filter deleted in queries
async function getActiveMachines() {
  return db.select()
    .from(machines)
    .where(isNull(machines.deleted_at));  // Only active
}
```

**Benefits**:
- ✅ Preserves all historical data
- ✅ Can "undelete" by setting deleted_at to NULL
- ✅ No FK constraint issues
- ✅ Full audit trail

---

## 📋 Detailed FK Classification

### Category A: Core Business Entities (RESTRICT - 40 FKs)

**products table** (referenced by 20+ tables):
```sql
-- order_items.product_id
ON DELETE RESTRICT  -- Don't delete products with orders

-- inventory_items.product_id
ON DELETE RESTRICT  -- Don't delete products with inventory

-- inventory_movements.product_id
ON DELETE RESTRICT  -- Preserve movement history

-- product_batches.product_id
ON DELETE RESTRICT  -- Preserve batch history

-- inventory_batches.product_id
ON DELETE RESTRICT  -- Preserve batch data

-- purchase_conditions.product_id
ON DELETE RESTRICT  -- Preserve purchase conditions

-- ... (15 more FK references to products)
```

**machines table** (referenced by 30+ tables):
```sql
-- transactions.machine_id
ON DELETE RESTRICT  -- Preserve transaction history

-- refills.machine_id
ON DELETE RESTRICT  -- Preserve refill history

-- machine_stocks.machine_id
ON DELETE RESTRICT  -- Don't delete with active stocks

-- transaction_gaps.machine_id
ON DELETE RESTRICT  -- Preserve gap history

-- recovery_jobs.machine_id
ON DELETE RESTRICT  -- Preserve recovery records

-- ... (25 more FK references to machines)
```

**orders table** (referenced by 5+ tables):
```sql
-- order_items.order_id
ALREADY HAS CASCADE ✅  -- Correct behavior

-- supplier_invoices.order_id
ALREADY HAS CASCADE ✅  -- Correct behavior
```

### Category B: Optional Relationships (SET NULL - 35 FKs)

**supplier references** (in various tables):
```sql
-- products.supplier_id
ON DELETE SET NULL  -- Keep product, remove supplier link

-- orders.supplier_id (historical record)
ON DELETE SET NULL  -- Keep order history

-- purchase_conditions.supplier_id
ON DELETE RESTRICT  -- Don't delete supplier with active conditions
```

**user references** (audit trail):
```sql
-- transactions.user_id
ON DELETE SET NULL  -- Preserve transaction, NULL user

-- orders.created_by
ON DELETE SET NULL  -- Preserve order, NULL creator

-- refills.performed_by
ON DELETE SET NULL  -- Preserve refill, NULL performer
```

**location/warehouse references**:
```sql
-- orders.location_id
ON DELETE SET NULL  -- Historical reference, can be NULL

-- inventory_items.warehouse_id
ON DELETE RESTRICT  -- Don't delete warehouse with inventory
```

### Category C: Soft Delete Candidates (Application-layer - 15 FKs)

**machines** (operational entity):
- Add `deleted_at` column
- Mark as deleted instead of DELETE
- All FK references remain valid
- Filter `WHERE deleted_at IS NULL` in queries

**suppliers** (operational entity):
- Add `deleted_at` or `active` column
- Mark as inactive instead of DELETE
- All product relationships preserved
- Filter active suppliers in dropdowns

**warehouses/locations**:
- Add `closed_at` column
- Mark as closed instead of DELETE
- All inventory history preserved
- Filter open warehouses in active queries

---

## 🚀 Implementation Plan

### Phase 1: Analysis & Documentation (2-4 hours)

1. **Create FK Inventory**
   ```sql
   -- List all FKs without onDelete rules
   SELECT
     tc.table_name,
     kcu.column_name,
     ccu.table_name AS foreign_table_name,
     ccu.column_name AS foreign_column_name,
     rc.delete_rule
   FROM information_schema.table_constraints AS tc
   JOIN information_schema.key_column_usage AS kcu
     ON tc.constraint_name = kcu.constraint_name
   JOIN information_schema.constraint_column_usage AS ccu
     ON ccu.constraint_name = tc.constraint_name
   JOIN information_schema.referential_constraints AS rc
     ON tc.constraint_name = rc.constraint_name
   WHERE tc.constraint_type = 'FOREIGN KEY'
     AND tc.table_schema = 'public'
     AND rc.delete_rule = 'NO ACTION'  -- Currently no policy
   ORDER BY tc.table_name, kcu.column_name;
   ```

2. **Classify Each FK**
   - Review business logic for each FK
   - Decide: RESTRICT, SET NULL, or Soft Delete
   - Document reasoning for each decision

3. **Check NULL Constraints**
   ```sql
   -- For SET NULL candidates, ensure column allows NULL
   SELECT
     table_name,
     column_name,
     is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'products'
     AND column_name = 'supplier_id';
   ```

### Phase 2: Create Migrations (4-6 hours)

**Migration 004a: RESTRICT Policies** (80 FKs)
```sql
-- migrations/004a_add_restrict_policies.sql

-- Core entities: products
ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_product_id_fkey,
  ADD CONSTRAINT order_items_product_id_fkey
    FOREIGN KEY (product_id)
    REFERENCES products(id)
    ON DELETE RESTRICT;

ALTER TABLE inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_product_id_fkey,
  ADD CONSTRAINT inventory_items_product_id_fkey
    FOREIGN KEY (product_id)
    REFERENCES products(id)
    ON DELETE RESTRICT;

-- ... (78 more RESTRICT policies)
```

**Migration 004b: SET NULL Policies** (35 FKs)
```sql
-- migrations/004b_add_set_null_policies.sql

-- Optional relationships
ALTER TABLE products
  ALTER COLUMN supplier_id DROP NOT NULL,  -- Allow NULL if not already
  DROP CONSTRAINT IF EXISTS products_supplier_id_fkey,
  ADD CONSTRAINT products_supplier_id_fkey
    FOREIGN KEY (supplier_id)
    REFERENCES suppliers(id)
    ON DELETE SET NULL;

ALTER TABLE transactions
  ALTER COLUMN user_id DROP NOT NULL,  -- Allow NULL if not already
  DROP CONSTRAINT IF EXISTS transactions_user_id_fkey,
  ADD CONSTRAINT transactions_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE SET NULL;

-- ... (33 more SET NULL policies)
```

**Migration 004c: Soft Delete Columns** (15 tables)
```sql
-- migrations/004c_add_soft_delete_columns.sql

-- Add deleted_at columns for soft delete pattern
ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;

ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP DEFAULT NULL;

-- Create indexes for efficient filtering
CREATE INDEX IF NOT EXISTS machines_deleted_at_idx
  ON machines(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS suppliers_deleted_at_idx
  ON suppliers(deleted_at) WHERE deleted_at IS NOT NULL;

-- ... (12 more soft delete columns)
```

### Phase 3: Update Application Code (6-10 hours)

**For Soft Delete tables**:

```typescript
// server/services/machineService.ts

export async function deleteMachine(machineId: number) {
  // OLD: await db.delete(machines).where(eq(machines.id, machineId));

  // NEW: Soft delete
  await db.update(machines)
    .set({ deleted_at: new Date() })
    .where(eq(machines.id, machineId));
}

export async function getActiveMachines() {
  return db.select()
    .from(machines)
    .where(isNull(machines.deleted_at));  // Only active
}

export async function restoreMachine(machineId: number) {
  // Bonus: Can undelete!
  await db.update(machines)
    .set({ deleted_at: null })
    .where(eq(machines.id, machineId));
}
```

**Update all queries** to filter out soft-deleted:
```typescript
// BEFORE
const machines = await db.select().from(machines);

// AFTER
const machines = await db.select()
  .from(machines)
  .where(isNull(machines.deleted_at));
```

### Phase 4: Testing (4-6 hours)

**Test Suite 1: RESTRICT Policy**
```typescript
// Test: Cannot delete product with orders
test("cannot delete product with existing orders", async () => {
  const product = await createTestProduct();
  const order = await createTestOrder({ productId: product.id });

  await expect(
    db.delete(products).where(eq(products.id, product.id))
  ).rejects.toThrow(/violates foreign key constraint/);
});
```

**Test Suite 2: SET NULL Policy**
```typescript
// Test: Deleting supplier NULLs product.supplier_id
test("deleting supplier NULLs product supplier_id", async () => {
  const supplier = await createTestSupplier();
  const product = await createTestProduct({ supplierId: supplier.id });

  await db.delete(suppliers).where(eq(suppliers.id, supplier.id));

  const updatedProduct = await db.select()
    .from(products)
    .where(eq(products.id, product.id));

  expect(updatedProduct[0].supplier_id).toBeNull();
});
```

**Test Suite 3: Soft Delete**
```typescript
// Test: Soft delete hides machine from queries
test("soft deleted machine not in active query", async () => {
  const machine = await createTestMachine();

  // Soft delete
  await deleteMachine(machine.id);

  // Should not appear in active machines
  const activeMachines = await getActiveMachines();
  expect(activeMachines).not.toContainEqual(
    expect.objectContaining({ id: machine.id })
  );

  // Should appear in all machines (including deleted)
  const allMachines = await db.select().from(machines);
  expect(allMachines).toContainEqual(
    expect.objectContaining({ id: machine.id })
  );
});
```

### Phase 5: Deployment (2-3 hours)

1. **Staging Deployment**
   ```bash
   # Apply migrations on staging
   psql $STAGING_DB -f migrations/004a_add_restrict_policies.sql
   psql $STAGING_DB -f migrations/004b_add_set_null_policies.sql
   psql $STAGING_DB -f migrations/004c_add_soft_delete_columns.sql

   # Deploy application code with soft delete logic
   npm run deploy:staging

   # Test deletion scenarios
   - Try deleting product with orders (should fail with RESTRICT)
   - Try deleting supplier (products should have NULL supplier_id)
   - Try soft-deleting machine (should hide from active queries)
   ```

2. **Production Deployment** (Off-peak)
   ```bash
   # Create backup
   pg_dump $DATABASE_URL > backup_before_004_$(date +%Y%m%d).sql

   # Apply migrations (low risk, non-destructive)
   psql $DATABASE_URL -f migrations/004a_add_restrict_policies.sql
   psql $DATABASE_URL -f migrations/004b_add_set_null_policies.sql
   psql $DATABASE_URL -f migrations/004c_add_soft_delete_columns.sql

   # Deploy application code
   npm run deploy:production
   ```

3. **Validation**
   ```sql
   -- Verify FK policies applied
   SELECT
     tc.table_name,
     kcu.column_name,
     rc.delete_rule
   FROM information_schema.table_constraints AS tc
   JOIN information_schema.key_column_usage AS kcu
     ON tc.constraint_name = kcu.constraint_name
   JOIN information_schema.referential_constraints AS rc
     ON tc.constraint_name = rc.constraint_name
   WHERE tc.constraint_type = 'FOREIGN KEY'
     AND tc.table_schema = 'public'
     AND rc.delete_rule IN ('RESTRICT', 'SET NULL')
   ORDER BY tc.table_name;

   -- Verify soft delete columns exist
   SELECT
     table_name,
     column_name,
     data_type
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND column_name IN ('deleted_at', 'closed_at');
   ```

---

## 📊 Expected Impact

### Benefits
✅ **Explicit Behavior**: Clear intent for every FK relationship
✅ **Better Errors**: Meaningful error messages when deletion fails
✅ **Data Protection**: RESTRICT prevents accidental data loss
✅ **Audit Trail**: SET NULL preserves historical records
✅ **Flexibility**: Soft delete allows "undo" and full history
✅ **Code Clarity**: Application code documents deletion policies

### Risks
⚠️  **Application Changes**: Soft delete requires code updates
⚠️  **NULL Handling**: SET NULL requires NULL checks in queries
⚠️  **Testing Needed**: Must verify deletion scenarios work correctly

### Performance Impact
- **Migration**: ~5-10 minutes (ALTER TABLE operations)
- **Runtime**: No performance impact (policies are metadata)
- **Storage**: +15 columns for soft delete (~minimal overhead)

---

## 📋 Rollback Plan

```sql
-- Rollback to NO ACTION (original state)

-- Rollback RESTRICT policies
ALTER TABLE order_items
  DROP CONSTRAINT order_items_product_id_fkey,
  ADD CONSTRAINT order_items_product_id_fkey
    FOREIGN KEY (product_id)
    REFERENCES products(id)
    ON DELETE NO ACTION;

-- Rollback SET NULL policies
ALTER TABLE products
  DROP CONSTRAINT products_supplier_id_fkey,
  ADD CONSTRAINT products_supplier_id_fkey
    FOREIGN KEY (supplier_id)
    REFERENCES suppliers(id)
    ON DELETE NO ACTION;

-- Remove soft delete columns (IF no data)
ALTER TABLE machines DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE suppliers DROP COLUMN IF EXISTS deleted_at;
-- (Only if columns are all NULL!)
```

---

## 🎯 Success Criteria

Migration is successful when:

1. ✅ All 133 FKs have explicit onDelete policy
2. ✅ RESTRICT policies prevent deletion (verified via tests)
3. ✅ SET NULL policies NULL references on deletion (verified via tests)
4. ✅ Soft delete columns added and indexed
5. ✅ Application code updated to handle soft deletes
6. ✅ All tests pass (unit, integration, E2E)
7. ✅ No production errors related to FK constraints
8. ✅ Deletion behavior matches documented intent

---

## ⏱️ Estimated Effort

| Phase | Hours | Complexity |
|-------|-------|-----------|
| Analysis & Documentation | 2-4 | 🟡 Medium |
| Create Migrations | 4-6 | 🟡 Medium |
| Update Application Code | 6-10 | 🟠 Medium-High |
| Testing | 4-6 | 🟡 Medium |
| Deployment | 2-3 | 🟢 Low |
| **TOTAL** | **18-29 hours** | 🟡 **Medium** |

**Recommendation**: Spread over 1-2 weeks, complete in phases

---

## 🎯 Final Recommendation

**Status**: ✅ **RECOMMENDED** (with revised approach)

**Why Proceed?**
1. ✅ Better data integrity (RESTRICT prevents loss)
2. ✅ Clearer deletion behavior (explicit policies)
3. ✅ Audit trail preservation (SET NULL + Soft Delete)
4. ✅ Low risk (non-destructive changes)
5. ✅ Best practices (industry standard patterns)

**Why Not Original CASCADE Plan?**
1. ❌ Too risky (mass data deletion)
2. ❌ Wrong pattern (most FKs should RESTRICT)
3. ❌ Loses audit trail (historical data deleted)
4. ❌ Irreversible (can't undo CASCADE deletion)

---

**Next Step**: Review FK classification, adjust policies as needed, then create migrations.

**Prepared by**: Database Architecture Review (Claude Code Agent)
**Date**: 2025-11-04
**Status**: READY FOR REVIEW & IMPLEMENTATION
