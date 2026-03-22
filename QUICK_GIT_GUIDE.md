# Quick Git Commands Cheat Sheet

## Current Setup
✅ **3 branches created**: `main`, `develop`, `production`
✅ **All pushed to GitHub**

---

## 🎯 Daily Development (Use This)

```bash
# 1. Start working
git checkout develop
git pull

# 2. Make your changes, then save
git add .
git commit -m "what you did"
git push

# 3. Test locally
cd Backend && npm run dev
cd Frontend && npm run dev
```

---

## 🧪 Testing (Before Production)

```bash
# Merge develop to main for testing
git checkout main
git merge develop
git push

# Test at: http://localhost:5173
# If bugs → fix on develop branch
```

---

## 🚀 Deploy to Production

```bash
# When everything works
git checkout production
git merge main
git push

# Deploy to Vercel/production server
```

---

## 📱 Check Status

```bash
git branch          # See all branches
git status          # See current changes
git log --oneline   # See recent commits
```

---

## Branch Rules

| Branch | Use For | Deploy To |
|--------|---------|-----------|
| `develop` | Daily coding | Local testing |
| `main` | Integration testing | Staging server |
| `production` | Final releases | Live/Production |

---

**You are currently on**: `develop` branch ✅
