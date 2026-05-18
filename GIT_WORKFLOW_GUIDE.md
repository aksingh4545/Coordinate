# Git Workflow Guide - Coordinator Project

## Branch Structure

This project uses **3 branches** for proper development workflow:

| Branch | Purpose | Stability |
|--------|---------|-----------|
| `main` | Latest development code | ⚠️ May have bugs |
| `production` | Stable, tested code | ✅ Production-ready |
| `develop` | Active development | 🔧 Work in progress |

---

## 📋 Branch Descriptions

### `production` Branch
- **Purpose**: Contains stable, production-ready code
- **When to update**: Only when features are fully tested and working
- **Deploy**: This branch should be deployed to production servers

### `main` Branch  
- **Purpose**: Primary development branch
- **When to update**: Regular commits during development
- **Deploy**: Can be deployed to staging/test servers

### `develop` Branch
- **Purpose**: Current working branch (you are here now)
- **When to update**: Daily development work
- **Deploy**: For local testing only

---

## 🚀 Common Git Commands

### Check Current Branch
```bash
git branch
```
The `*` shows your current branch.

### Switch Branches
```bash
# Switch to production
git checkout production

# Switch to main
git checkout main

# Switch to develop
git checkout develop
```

### Create New Feature Branch
```bash
# From develop, create a new feature branch
git checkout develop
git checkout -b feature/new-feature-name
```

### Stage and Commit Changes
```bash
# See what changed
git status

# Stage all changes
git add .

# Commit with message
git commit -m "Description of changes"
```

### Push to Remote
```bash
# Push current branch to GitHub
git push origin <branch-name>
```

### Merge Branches
```bash
# Merge develop into main
git checkout main
git merge develop

# Merge main into production
git checkout production
git merge main
```

---

## 📝 Recommended Workflow

### 1. Daily Development
```bash
# Start work
git checkout develop
git pull origin develop

# Make your changes...

# Save changes
git add .
git commit -m "Added new feature"
git push origin develop
```

### 2. Testing Before Production
```bash
# Test on main branch
git checkout main
git merge develop
git push origin main

# Test the application thoroughly
# If bugs found, fix them on develop
```

### 3. Releasing to Production
```bash
# When everything is tested and working
git checkout production
git merge main
git push origin production

# Tag the release
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin --tags
```

---

## 🔄 Syncing Branches

### Update All Branches from Remote
```bash
# Fetch latest from GitHub
git fetch --all

# Update develop
git checkout develop
git pull origin develop

# Update main
git checkout main
git pull origin main

# Update production
git checkout production
git pull origin production
```

### Resolve Conflicts
If you get merge conflicts:
```bash
# Git will show conflicting files
# Edit files to resolve conflicts
# Look for <<<<<<< and >>>>>>> markers

# After fixing:
git add .
git commit -m "Resolved merge conflicts"
```

---

## 📊 Visual Branch Workflow

```
production  o---------------o---------------o (stable)
             \             /
main          o-----o-----o (tested)
               \   /
develop         o-o-o-o-o (development)
```

---

## ⚠️ Important Notes

1. **Never commit directly to `production`** - Always merge from `main`
2. **Test on `main` first** - Before merging to production
3. **Commit often** - Small commits are easier to manage
4. **Write clear commit messages** - Explain WHAT and WHY
5. **Pull before you push** - Always get latest changes first

---

## 🎯 Quick Reference

| Task | Command |
|------|---------|
| See current branch | `git branch` |
| Switch branch | `git checkout <branch>` |
| Create new branch | `git checkout -b <branch>` |
| Stage all files | `git add .` |
| Commit changes | `git commit -m "message"` |
| Push to GitHub | `git push origin <branch>` |
| Pull from GitHub | `git pull origin <branch>` |
| Merge branches | `git merge <branch>` |

---

## 🔧 For This Project

### Development Setup
```bash
# Work on develop branch
git checkout develop

# Install dependencies
cd Backend && npm install
cd ../Frontend && npm install

# Run servers
# Backend: cd Backend && npm run dev
# Frontend: cd Frontend && npm run dev
```

### Deploy to Production
```bash
# When ready for production
git checkout production
git merge main
git push origin production

# Deploy to Vercel/Heroku/etc from production branch
```

---

## Need Help?

```bash
# See git log
git log --oneline --graph --all

# See differences
git diff main..develop

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Discard local changes
git checkout -- <filename>
```
