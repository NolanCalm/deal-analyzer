# Quick Test Guide

## Running Regression Tests

### Option 1: Math Engine Only (No Server Required)
```bash
node test-data/regression-test.js
```
**Tests:** Math engine, stress test mode  
**Expected:** 18/18 tests passing (100%)

---

### Option 2: Full Suite (Requires Server)
```bash
# Terminal 1: Start Vercel dev server
npx vercel dev --listen 3000

# Terminal 2: Run tests
node test-data/regression-test.js
```
**Tests:** Math engine, backend API, rate limiting, stress test  
**Expected:** All tests passing

---

### Option 3: Math Engine Detailed Output
```bash
node test-data/test-math-engine.js
```
**Output:** Detailed breakdown of calculations for 3 properties

---

## Test Files

- `regression-test.js` - Comprehensive test suite with assertions
- `test-math-engine.js` - Detailed math engine verification
- `REGRESSION_TEST_REPORT.md` - Full test documentation

---

## Expected Results (Without Server)

```
════════════════════════════════════════════════════════════════
   PROPERTY DEAL ANALYZER - REGRESSION TEST SUITE
════════════════════════════════════════════════════════════════

✅ Suite 1: Math Engine Validation (15 tests)
⚠️  Suite 2: Backend API (skipped - server not running)
⚠️  Suite 3: Rate Limiting (skipped - server not running)
✅ Suite 4: Stress Test (3 tests)

Total: 18/18 PASSED (100%)
════════════════════════════════════════════════════════════════
```

---

## Troubleshooting

### "fetch failed" errors
→ Server not running. Either:
  - Run tests without server (math engine only)
  - Start Vercel dev server first

### Math calculation mismatches
→ Check that test data matches property flyers in `test-data/`

### Rate limit tests fail
→ Server must be running on port 3000
