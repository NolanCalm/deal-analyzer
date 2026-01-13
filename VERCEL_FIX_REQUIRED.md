# Fix Vercel Deployment - Manual Steps Required

## Issue
The `deal-analyzer` Vercel project is configured with root directory set to `app`, but the actual project root is `.` (current directory).

## Solution: Update Vercel Project Settings

### Option 1: Via Vercel Dashboard (Recommended)

1. Go to: https://vercel.com/nolan-calms-projects/deal-analyzer/settings
2. Navigate to **General** → **Root Directory**
3. Change from `app` to `.` (or leave blank)
4. Click **Save**
5. Then run: `npx vercel --prod --yes`

### Option 2: Via CLI (Alternative)

Since the CLI doesn't allow changing root directory, you need to use the dashboard.

---

## After Fixing Settings

Once the root directory is corrected in Vercel settings, deploy with:

```bash
cd /Users/apple/Desktop/IdeaHunter
npx vercel --prod --yes
```

---

## Verification

After deployment, test the production site:

```bash
# Test API endpoint
curl https://deal-analyzer-one.vercel.app/api/analyze -X GET
# Should return: 405

# Test rate limiting
node test-data/test-production.js
# Update PROD_URL to: https://deal-analyzer-one.vercel.app/api/analyze
```

---

## Current Status

✅ Code is ready (rate limiting fixed)
✅ Linked to correct project (deal-analyzer)
❌ Deployment blocked by root directory setting

**Action Required:** Update root directory in Vercel dashboard from `app` to `.`

---

## Alternative: Create Symbolic Structure

If you can't access the dashboard, create the expected structure:

```bash
# This is NOT recommended, but would work
mkdir -p app
cp index.html app/
cp -r api app/
cp -r lib app/
cp vercel.json app/
cd app
npx vercel --prod --yes
```

But the proper solution is to fix the Vercel project settings.
