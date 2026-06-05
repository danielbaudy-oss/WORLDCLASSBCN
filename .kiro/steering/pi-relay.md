---
inclusion: auto
---

# Git Push via Raspberry Pi

This laptop CANNOT push to GitHub directly (github.com is blocked at the network level).

**Always push through the Pi relay:**

1. Copy changed files to Pi:
```bash
scp "C:\Users\baudy\Documents\Extensions\HR_2\<file>" baudy@baudypi.local:~/WORLDCLASSBCN/<file>
```

2. Commit and push from Pi:
```bash
ssh baudy@baudypi.local "cd ~/WORLDCLASSBCN && git add -A && git commit -m 'message' && git push origin main 2>&1"
```

For multiple files, scp each one first, then do a single commit+push.

**Never attempt `git push` directly from this machine — it will always fail.**

See `PI-INTERACTION-GUIDE.md` in the project root for full Pi connection details.
