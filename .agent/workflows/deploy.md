---
description: Deploy to Vercel and watch the build until it succeeds or fails
---

// turbo-all

1. Stage and commit all changes:
```bash
git add -A && git commit -m "<descriptive commit message>"
```

2. Run the deploy-and-watch script:
```bash
./deploy-and-watch.sh
```

3. If the build fails, check the output for errors and fix them. Then repeat from step 1.
