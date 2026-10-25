# Security sweep, 25 Oct 2026

After Railway's environment-variable breach (21 Oct).  Sales platform repo, its full git history, and this PC's synced folders.

## Summary

- No real keys or passwords are in the code or anywhere in its history.  `.env` was never committed.
- **Top risk:** the secret that signs admin logins to the sales platform (`JWT_SECRET`) is the 12-character default `onecloud2026`, which is written in the code.  Anyone with the code or the leaked Railway variables can make an admin login.  Fixed in code; you change the value in Railway (below).
- Customer data (two database backups, a prospect spreadsheet, 21 import files) was stored in GitHub.  Removed going forward.
- 137 scripts on this PC (OneDrive\Desktop\admin) contain the live database password, and a text file in OneDrive holds the Microsoft client secret.

## Findings

| What | Where | Fixed in code? | What to do | Where |
|---|---|---|---|---|
| Admin login secret is the default word | Railway `JWT_SECRET`, code default | Yes: links now have their own `LINK_SECRET`, old links still accepted | Set a new `JWT_SECRET` and `LINK_SECRET`, keep the old word as `LINK_SECRET_OLD` | Railway Variables |
| Customer data in GitHub | `backups/`, `import_prospects.sql`, `scripts/*.sql` | Yes: no longer tracked, `.gitignore` blocks it | Optional: wipe from history (force push, your call) | GitHub |
| Unused login file with a `dev-secret` fallback | `server/middleware/auth.js` | Yes: removed (nothing used it) | Nothing | |
| Database password in 137 local scripts | OneDrive\Desktop\admin | No (your files) | Rotating the DB password makes them harmless | Railway MySQL |
| Microsoft client secret in a text file | `OneDrive\new key 102126 msft.txt` | No (your file) | Put it in your password manager, then delete the file | This PC |
| GitHub token saved in the repo's remote address | `claude-code-workspace\.git\config` (this PC only) | No | Revoke the token, switch to Windows sign-in | github.com > Settings > Developer settings |
| Microsoft app can read and send as every mailbox and read every calendar | Entra app "1Cloud Sales Platform" | No | Limit it to the ~10 mailboxes it uses (guided, after hours) | Exchange Online PowerShell |
| Keys exposed in the breach | Railway variables | No | Rotate one at a time: Apollo, NeverBounce, Anthropic, database password, `ADMIN_PASSWORD`, `SMTP_ENCRYPTION_KEY` | Each vendor's site, then Railway |

Already rotated after the breach: Microsoft client secret (21 Oct).

## Railway variables for the login secret (after this code is live)

Make two long random values on your PC.  Each command copies one to the clipboard so it never appears on screen:

```powershell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b) | Set-Clipboard
```

1. Run it, then in Railway set `LINK_SECRET` = paste.
2. Add `LINK_SECRET_OLD` = `onecloud2026` (keeps every unsubscribe and approval link already emailed working).
3. Run it again, then set `JWT_SECRET` = paste.
4. Deploy once.  You will need to sign in to the sales platform web app again.  Nothing else changes.
5. After about 60 days, delete `LINK_SECRET_OLD`.

## What changed in the code

- `server/services/linkSecret.js`: new.  Signs and checks email links with `LINK_SECRET`, accepts `LINK_SECRET_OLD`.
- `server/routes/unsubscribe.js`, `server/services/replacement.js`, `server/routes/replacement.js`: use it.  With no `LINK_SECRET` set, links are exactly as before.
- `server/middleware/auth.js`: removed (unused, had a weak fallback).
- `.gitignore`: blocks `backups/`, `*.csv`, `scripts/*.sql`, `import_prospects.sql`.
- `server/tests/links.test.js`: proves old links keep working and forged links fail.

## Not done, needs you

- The Railway variables above.
- Key rotations, one at a time (I walk you through each, and say what pauses first).
- Microsoft mailbox lockdown (about 10 minutes, after hours, with me).
- Optional history wipe of the customer data files.
