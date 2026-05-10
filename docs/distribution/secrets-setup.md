# Release secrets setup

How to generate every secret the `release-tauri.yml` workflow consumes,
in the order you need them. Each secret is set under
**Settings → Secrets and variables → Actions → New repository secret**
on github.com/jonaseck2/slaktforskning.

This doc is paired with `.github/workflows/release-tauri.yml` and
`src-tauri/tauri.conf.json`. The workflow's leading comment lists the
secret names; this file is the how-to for filling them in.

---

## 1. macOS — Developer ID + notarization

You need an active Apple Developer Program membership (US$99/year).

### 1a. Developer ID Application certificate

1. Open Xcode → Settings → Accounts → your team → "Manage Certificates…".
2. Click `+` → "Developer ID Application". Xcode generates the cert and
   installs it in your login keychain.
3. In Keychain Access, find the new "Developer ID Application: <name> (TEAMID)"
   cert, expand it to reveal the private key, select both, right-click →
   "Export 2 items…" → save as `developer-id.p12` with a strong password.
4. Encode for GitHub:
   ```bash
   base64 -i developer-id.p12 | pbcopy
   ```

| Secret name | Value |
|---|---|
| `APPLE_CERTIFICATE` | The base64 string from `pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | The .p12 password you set in step 3 |
| `APPLE_SIGNING_IDENTITY` | The full common name, e.g. `Developer ID Application: Jonas Ahnstedt (ABCDE12345)` |

### 1b. Notarytool credentials

Notarization replaces the deprecated `altool` flow.

1. Sign in to https://appleid.apple.com → Sign-In and Security →
   App-Specific Passwords → generate one labelled "tauri-notarize".
   (Save it — you can't view it again.)
2. Find your Team ID in https://developer.apple.com/account → Membership
   (10 char alphanumeric).
3. The Provider Short Name is usually identical to the Team ID; if not,
   `xcrun notarytool history --apple-id <id> --password <pw> --team-id <id>`
   prints it.

| Secret name | Value |
|---|---|
| `APPLE_ID` | Your Apple ID email |
| `APPLE_PASSWORD` | The app-specific password from step 1 |
| `APPLE_TEAM_ID` | The 10-char team ID |
| `APPLE_PROVIDER_SHORT_NAME` | Usually = `APPLE_TEAM_ID` |

---

## 2. Windows — Authenticode signing

You need a code-signing certificate from a trusted CA (DigiCert, Sectigo,
SSL.com, etc.). EV certs avoid SmartScreen reputation warmup; standard
OV certs work but show a SmartScreen warning until the binary builds
reputation. Either way the workflow signs identically.

1. Receive the .pfx (or .p12) from your CA. If they shipped a `.cer` +
   private key separately, combine with:
   ```bash
   openssl pkcs12 -export -out cert.pfx -inkey private.key -in cert.cer
   ```
2. Encode:
   ```bash
   base64 -i cert.pfx | pbcopy   # macOS
   base64 -w 0 cert.pfx          # Linux
   ```

| Secret name | Value |
|---|---|
| `WINDOWS_CERTIFICATE` | The base64 string |
| `WINDOWS_CERTIFICATE_PASSWORD` | The .pfx password |

The cert's SHA-1 thumbprint normally goes in `tauri.conf.json`
`bundle.windows.certificateThumbprint`, but `tauri-action` accepts the
above env vars and resolves the thumbprint internally — leave the JSON
field as `null` (the default in this repo).

---

## 3. Linux — AppImage GPG signing

See [linux-signing.md](./linux-signing.md) for the GPG key generation
walkthrough. Once you have a key, set:

| Secret name | Value |
|---|---|
| `LINUX_GPG_PRIVATE_KEY` | ASCII-armored private key (`gpg --armor --export-secret-keys <key-id>`) |
| `LINUX_GPG_PASSPHRASE` | The passphrase you protect the key with |
| `LINUX_GPG_KEY_ID` | Long key ID or fingerprint |

These are optional — the workflow's `Sign Linux AppImage with GPG` step
is gated on `secrets.LINUX_GPG_PRIVATE_KEY != ''` so the build still
succeeds for forks without GPG configured (it just ships an unsigned
AppImage).

---

## 4. Tauri auto-updater signing key

Independent of code-signing certs. Used to sign `latest.json` so the
in-app updater can verify the manifest before downloading the new
binary. **Do not reuse the macOS / Windows certs for this — different
algorithm, different threat model.**

1. Generate a fresh keypair:
   ```bash
   npm run tauri -- signer generate -w ~/.tauri/slaktforskning-updater.key
   ```
   You'll be prompted for a passphrase. Save it somewhere safe (1Password,
   keychain) — losing it strands every install on its current version.
2. The command prints both keys:
   - **Public key** — paste into `src-tauri/tauri.conf.json`
     `plugins.updater.pubkey`. This is committed to the repo.
   - **Private key** — saved to the path above. Read it back as one line:
     ```bash
     cat ~/.tauri/slaktforskning-updater.key
     ```

| Secret name | Value |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | The contents of the private-key file |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The passphrase from step 1 |

---

## Verification checklist

After setting all secrets:

1. Push a `v0.250.0-tauri.0` tag (the workflow treats `-tauri.` /
   `-beta` / `-rc` suffixes as pre-releases — ideal for the first cut).
2. Watch `release-tauri.yml` run on each of the four matrix runners.
   Failures usually come down to:
   - `APPLE_SIGNING_IDENTITY` typo — must match the cert's CN exactly.
   - `WINDOWS_CERTIFICATE` not base64-encoded properly — verify locally
     with `echo "$WINDOWS_CERTIFICATE" | base64 -d > test.pfx` and
     `openssl pkcs12 -info -in test.pfx`.
   - `TAURI_SIGNING_PRIVATE_KEY` mismatch with the pubkey in
     `tauri.conf.json` — regenerate both as a pair.
3. The release lands as a **draft** (per `releaseDraft: true`); review
   the assets, confirm `latest.json` is present, then publish manually.
4. To verify the auto-updater end-to-end: install the published
   `0.250.0-tauri.0`, push `v0.250.0-tauri.1` with one trivial change,
   wait for the release to publish, restart the installed app — the
   in-app boot path's update check (5 s after mount) should detect the
   new version.

## Rotation

- macOS Developer ID certs expire after 5 years. Apple emails 30 days
  prior. Re-export, re-base64, update `APPLE_CERTIFICATE` +
  `APPLE_SIGNING_IDENTITY`.
- Windows Authenticode certs typically expire 1-3 years. Same procedure
  as the initial setup.
- The Tauri updater key has no expiry but rotate every 2-3 years as
  hygiene. Rotation requires shipping the new pubkey first (in a
  release that pre-existing installs can still verify with the OLD
  key), then switching the signing key. Plan a release boundary.
