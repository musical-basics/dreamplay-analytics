#!/bin/bash
# Deploy & Watch — pushes to git and monitors the Vercel build until it succeeds or fails.

set -e

# 1. Push the code
echo "🚀 Pushing to origin..."
git push

# 2. Wait for Vercel to pick up the deployment
echo "⏳ Waiting for Vercel to register the build..."
sleep 10

# 3. Get the latest deployment URL
DEPLOYMENT_URL=$(npx -y vercel ls --target production --limit 1 2>/dev/null | awk 'NR==2 {print $2}')

if [ -z "$DEPLOYMENT_URL" ]; then
  echo "⚠️  Could not detect deployment URL. Trying with 'vercel ls' (no target filter)..."
  DEPLOYMENT_URL=$(npx -y vercel ls --limit 1 2>/dev/null | awk 'NR==2 {print $2}')
fi

if [ -z "$DEPLOYMENT_URL" ]; then
  echo "❌ Failed to get deployment URL. Make sure Vercel CLI is installed and linked."
  exit 1
fi

# 4. Inspect and wait for build completion
echo "📡 Tracking deployment: $DEPLOYMENT_URL"
npx -y vercel inspect "$DEPLOYMENT_URL" --wait

# 5. Report result
if [ $? -eq 0 ]; then
  echo "✅ Build Succeeded!"
else
  echo "❌ Build Failed! Check Vercel logs."
  exit 1
fi
