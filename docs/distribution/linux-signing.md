# Linux AppImage signing

The Tauri release workflow's `Sign Linux AppImage with GPG` step
detaches a `.AppImage.asc` signature alongside each AppImage. Users
verify with:

```bash
gpg --verify Slaktforskning-0.250.0.AppImage.asc Slaktforskning-0.250.0.AppImage
```

This is optional — the workflow gates the step on the GPG secret being
present, so unsigned AppImages still ship. But many distros (and the
AppImage spec itself) recommend GPG-signed builds.

## Generating the signing key

One-time setup. Use a key dedicated to release signing — never a key
you also use for personal email or commit signing.

1. Generate the key (interactive):
   ```bash
   gpg --full-generate-key
   ```
   - Type: `RSA and RSA`
   - Size: `4096`
   - Expiry: `0` (does not expire) or `2y` (rotate every two years)
   - Real name: `Släktforskning Release`
   - Email: `releases@<your-domain>` (the email goes into the key's UID;
     it doesn't have to be a real inbox — just an identifier)
   - Passphrase: strong, save to a password manager

2. Find the long key ID:
   ```bash
   gpg --list-secret-keys --keyid-format=long
   ```
   Output looks like `sec rsa4096/ABCDEF1234567890 2026-05-10 [SC]` —
   copy `ABCDEF1234567890`.

3. Export the private key (ASCII-armored, single string suitable for a
   GitHub Secret):
   ```bash
   gpg --armor --export-secret-keys ABCDEF1234567890 | pbcopy
   ```

4. Export the public key for users to import:
   ```bash
   gpg --armor --export ABCDEF1234567890 > slaktforskning-release-public.asc
   ```
   Commit `slaktforskning-release-public.asc` to the repo (e.g. under
   `docs/distribution/`) so verifiers know which key signed the
   AppImages.

## GitHub Secrets

| Secret name | Value |
|---|---|
| `LINUX_GPG_PRIVATE_KEY` | The ASCII-armored private key from step 3 |
| `LINUX_GPG_PASSPHRASE` | The passphrase you set in step 1 |
| `LINUX_GPG_KEY_ID` | The long key ID from step 2 |

## Per-release verification flow (for users)

In the GitHub Release notes, include a stanza like:

> **Verify the AppImage:**
> ```bash
> # First-time setup — import our release public key
> curl -O https://raw.githubusercontent.com/jonaseck2/slaktforskning/main/docs/distribution/slaktforskning-release-public.asc
> gpg --import slaktforskning-release-public.asc
>
> # Verify
> gpg --verify Slaktforskning-0.250.0.AppImage.asc Slaktforskning-0.250.0.AppImage
> ```
> A "Good signature from Släktforskning Release" line means the AppImage
> hasn't been tampered with since we built it.

## Rotation

If the key is compromised:

1. Revoke it: `gpg --gen-revoke ABCDEF1234567890 > revoke.asc`
2. Publish the revocation cert (commit alongside the public key).
3. Generate a new key, swap GitHub Secrets, ship the new public key in
   the next release's notes.
