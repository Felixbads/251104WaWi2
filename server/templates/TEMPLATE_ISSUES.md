# Email Template Issues Documentation

## Critical Issues Identified by Architect Review

### 1. CRITICAL: Handlebars Syntax Issues (MUST FIX IMMEDIATELY)

#### Invalid "else if" Constructs
Handlebars does not support `{{else if}}` - must use nested `{{#if}}` within `{{else}}` blocks.

**Files affected:** All templates contain multiple "else if" constructs that need fixing.

**Example of incorrect syntax:**
```handlebars
{{#if condition1}}
    Option 1
{{else if condition2}}
    Option 2  
{{else}}
    Option 3
{{/if}}
```

**Correct syntax:**
```handlebars
{{#if condition1}}
    Option 1
{{else}}
    {{#if condition2}}
        Option 2
    {{else}}
        Option 3
    {{/if}}
{{/if}}
```

#### Files requiring fixes:
- sales_yesterday.hbs: ~10 instances
- sales_weekly.hbs: ~15 instances  
- margin_report.hbs: ~20 instances
- forecast_week.hbs: ~25 instances
- cash_high.hbs: ~5 instances
- mhd_soon.hbs: ✅ FIXED
- stock_low.hbs: ✅ FIXED

### 2. BLOCKING: Missing Handlebars Helper Functions

**Required helpers that must be registered in mailer service:**

#### Comparison Helpers:
- `gt` (greater than)
- `gte` (greater than or equal) 
- `lt` (less than)
- `lte` (less than or equal)
- `eq` (equals)

#### Arithmetic Helpers:
- `add` (addition)
- `subtract` (subtraction)

#### Formatting Helpers:
- `formatDate` (date formatting with timezone)

#### German Locale Helpers (MUST IMPLEMENT):
- `formatCurrency` (1234.56 → "1.234,56 €")
- `formatPercent` (0.1234 → "+12,34%")
- `formatNumber` (1234.56 → "1.234,56")

### 3. EMAIL CLIENT COMPATIBILITY ISSUES

#### CSS Issues:
- CSS Grid/Flexbox not supported in Outlook
- Scoped CSS classes may not work reliably
- Need table-based layouts for complex structures

#### Required Changes:
1. Replace CSS Grid with table-based layouts for:
   - KPI grids (kpi-grid class)
   - Daily forecast grids (daily-grid class)
   - Stats grids (stats class)

2. Use inline styles or CSS inlining tool (like Juice)

3. Test across email clients (Outlook, Gmail, Apple Mail)

### 4. Data Formatting Issues

#### Currency Formatting:
- Current: `{{totalRevenue}} €` (raw number + literal €)
- Required: German locale with proper thousands separator and decimal comma
- Solution: Use `{{formatCurrency totalRevenue}}` helper

#### Percentage Formatting:
- Current: `{{changePercent}}%` (raw number + literal %)
- Required: Signed percentages with fixed decimals
- Solution: Use `{{formatPercent changePercent}}` helper

### 5. Minor Logic Issues

#### cash_high.hbs:
- Revenue block guards `{{#if dailyRevenue}}` but displays `weeklyRevenue` inside
- Fix: Use separate guards or combined condition

### 6. Implementation Priority

#### Phase 1 (CRITICAL - Fix Now):
1. ✅ Fix all "else if" constructs in remaining templates
2. Create helper function stubs

#### Phase 2 (For Mailer Service Implementation):
1. Register all required Handlebars helpers
2. Implement German locale formatting helpers
3. Create email-safe table-based layouts
4. Add CSS inlining process

#### Phase 3 (Testing):
1. Test rendering with real data
2. Test across email clients
3. Validate German locale formatting

## Template Status

- ✅ coin_low.hbs: Syntax fixed
- ✅ cash_high.hbs: Minor issues noted
- ✅ mhd_soon.hbs: Syntax fixed  
- ✅ stock_low.hbs: Syntax fixed
- 🔄 sales_yesterday.hbs: Partially fixed, more needed
- ❌ sales_weekly.hbs: Needs syntax fixes
- ❌ margin_report.hbs: Needs syntax fixes  
- ❌ forecast_week.hbs: Needs syntax fixes

## Next Actions

When implementing the mailer service (Task 9):
1. Register all required Handlebars helpers
2. Implement German locale formatting
3. Set up email-safe rendering pipeline
4. Test with real notification data
5. Validate cross-client compatibility