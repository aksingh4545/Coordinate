# 🔐 How to Add Secrets to GitHub (Securely)

## Step 1: Generate New Tokens (After Revoking Old Ones)

### GitHub Token (if needed for actions)
1. Go to: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Give it a name: `Vercel Deployment`
4. Select scopes: `repo`, `workflow`
5. Click "Generate token"
6. **Copy and save immediately** - you won't see it again!

### Vercel Token
1. Go to: https://vercel.com/account/tokens
2. Click "Create"
3. Name: `GitHub Actions`
4. Click "Create"
5. **Copy and save immediately**

---

## Step 2: Add Tokens to GitHub Secrets

1. **Go to your repository** on GitHub
2. **Click** "Settings" tab
3. **Click** "Secrets and variables" → "Actions" (left sidebar)
4. **Click** "New repository secret"

### Add Vercel Token:
```
Name: VERCEL_TOKEN
Value: vcp_your_new_token_here
```

### Add GitHub Token (if needed):
```
Name: GITHUB_TOKEN
Value: ghp_your_new_token_here
```

5. **Click** "Add secret"

---

## Step 3: Verify Secrets

Your secrets should look like this:

| Name | Value |
|------|-------|
| `VERCEL_TOKEN` | `***` (hidden) |
| `GITHUB_TOKEN` | `***` (hidden) |

---

## Step 4: Test Deployment

Push to production branch:

```bash
git checkout production
git push origin production
```

GitHub Actions will automatically deploy to Vercel!

---

## ⚠️ Security Best Practices

1. **Never commit tokens** to git
2. **Never share tokens** in chat/issues
3. **Rotate tokens** every 90 days
4. **Use minimum scopes** needed
5. **Delete unused tokens** immediately

---

## 🔍 Check if Token is Compromised

If you accidentally exposed a token:

1. **Revoke it immediately**
2. **Generate a new one**
3. **Update all places** using the old token
4. **Check for unauthorized access** in account activity

---

## Alternative: Manual Deploy (No Tokens Needed)

If you don't want to use GitHub Actions:

1. Go to https://vercel.com
2. Import your GitHub repo
3. Vercel handles deployment automatically
4. No tokens or secrets needed!

**This is the recommended approach for most users.**
