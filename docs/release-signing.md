# Release and signing keys: owner's checklist

The steps here need the repository owner: they touch GitHub settings, secrets or paid accounts. Each one says
what it protects. Nothing here costs money except the optional items marked with a price.

## 1. Plugin gallery signing key (do first)

The web app (2.37.0 and later) only shows the plugin gallery when `plugins/registry.json` carries a valid
Ed25519 signature in `plugins/registry.json.sig`. The public key is built into the app (`Plugins.PUBKEY` in
index.html) and is also in `plugins/registry-signing.pub`. The current `registry.json` is already signed.

1. In GitHub: **Settings › Environments › New environment**, name it `plugin-signing`.
   - **Required reviewers**: add yourself. Every signing run then waits for your OK, so a merged pull request
     cannot get itself signed without you seeing it.
   - **Deployment branches and tags**: Selected branches › `main`.
2. In that environment, **Add environment secret**: name `PLUGIN_SIGNING_KEY`, value = the whole content of the
   private key file you were given (`-----BEGIN PRIVATE KEY-----` ... `-----END PRIVATE KEY-----`).
3. Keep one offline copy in your password manager, then **delete the handed-over file**. GitHub does not let anyone
   read a secret back, so the password-manager copy is the only backup.
4. From now on, after a plugin pull request is merged, approve the "Plugin gallery" run. It signs the list and
   commits `registry.json.sig`. If branch protection blocks the bot's push, either allow `github-actions` to bypass,
   or sign by hand: `python3 plugins/sign_registry.py --key /path/to/key` and commit the `.sig`.

If the key ever leaks: make a new pair (`openssl genpkey -algorithm ed25519 -out new.key`,
`openssl pkey -in new.key -pubout -out plugins/registry-signing.pub`), put the new public key (the last 32 bytes of
the DER public key, base64: `openssl pkey -pubin -in plugins/registry-signing.pub -outform DER | tail -c 32 | base64`)
into `Plugins.PUBKEY`, re-sign, update the secret, and ship a web update.

## 2. Android signing key (keystore)

The keystore and its password currently sit in the shared project folder, where every project thread can read them.
Anyone holding both can sign an APK that Android accepts as an update over everyone's MKCinema, with access to its
saved keys and session. The repository now has an **Android APK** workflow (`.github/workflows/android-apk.yml`)
that builds and signs the APK from GitHub secrets instead. It does nothing until both secrets exist.

1. **Settings › Environments › New environment** `android-release`, with yourself as **required reviewer** and
   deployment branch `main`.
2. Add two environment secrets:
   - `ANDROID_KEYSTORE_B64`: the keystore as one line of base64. On Linux: `base64 -w0 mkcinema.jks`;
     on a Mac: `base64 -i mkcinema.jks`; in PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("mkcinema.jks"))`.
   - `ANDROID_KEYSTORE_PASS`: the keystore password.
3. Run **Actions › Android APK › Run workflow** once and approve it. Check the log shows
   `Signer #1 certificate SHA-256 digest: 9fb8084d9a612d3a3b804921a292959fd2feddf19b8cdf81c0ace824b1cf7fd9`
   (the same certificate as today's APK). The APK and its `.sha256` are in the run's artifacts.
4. Put the keystore and password in your password manager (keep two copies in different places: if the key is lost,
   no further Android updates are possible).
5. **Then delete the shared copies**: the `keystore/` folder (both `mkcinema.jks` and `password.txt`) inside the
   shared `mkcinema-android` project folder, and any other copy outside your password manager.
6. Treat the key as possibly seen, because many threads could read it. Nothing shows it was misused; see section 3
   for the option you have if you ever believe it leaked.

Also suggested (repository root `.gitignore`, not changed by this package): add `**/password.txt`, `**/keystore/`,
`*.p12` and `*.key` next to the existing `*.jks` rule.

## 3. If the Android key is ever believed leaked: key rotation (option)

Today's APK is already signed with APK Signature Scheme v3, which supports rotating to a new key while keeping
updates working:

```sh
keytool -genkeypair -keystore new.jks -alias mkcinema -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=MKCinema, O=MKCinema"
apksigner rotate --out lineage.bin \
  --old-signer --ks mkcinema.jks --set-rollback false \
  --new-signer --ks new.jks
apksigner sign --ks mkcinema.jks --next-signer --ks new.jks --lineage lineage.bin --out MKCinema.apk aligned.apk
apksigner verify -v --print-certs MKCinema.apk
```

(Check `apksigner rotate --help` for the exact capability flags in your build-tools version.)

Trade-offs, plainly:
- Rotation is honoured only on **Android 9 (API 28) and later**. Android 7 and 8, including Fire TV sticks on
  Fire OS 6, only ever trust the original key. Those devices stay exposed to a leaked old key, and every future APK
  still needs a signature from the old key for them.
- Installs on **1.6.x** (and any version before the rotation) must update through an APK that carries the
  rotation lineage. That happens automatically if every APK after the rotation is signed as above; a user who
  skips versions still updates fine, as long as the APK they install carries the lineage.
- After rotation, keep both keys: the old one for older Android, the new one for everything else. If you lose the
  new one you are back to square one.
- Rotation does not stop someone with the old key from shipping a separate app; it only stops their APK from
  updating devices that already have the rotated version (on Android 9+).

## 4. Code signing for Windows and Mac (needs certificates)

Release files now come with `SHA256SUMS` and a provenance attestation, which lets people check a file. Removing the
SmartScreen and Gatekeeper warnings needs real code signing. MKCinema is free forever, so free options first:

**Windows**
- **SignPath Foundation (free for open-source projects)**: recommended. MKCinema is GPL-3.0, which qualifies. Their
  conditions: the exe must be built by a CI workflow from the public source (a GitHub Actions job building
  `windows/`, which SEC-N-06 wants anyway), maintainers use 2FA, and the signing request is approved in their portal.
  The certificate is issued to "SignPath Foundation" on behalf of the project. Apply at signpath.org.
- **Azure Trusted Signing (Microsoft Artifact Signing)**: about USD 10 per month (Basic). Needs identity validation;
  check current eligibility for individuals in your country.
- **Certum Open Source Code Signing**: roughly EUR 30 to 70 per year plus a smart card or cloud option.
- Classic OV certificates cost roughly USD 200 to 400 per year and no longer give instant SmartScreen reputation
  (neither do EV ones), so they are not worth it here.

**Mac**
- Notarization needs the **Apple Developer Program, USD 99 per year**. There is no free route. Without it, keep
  ad-hoc signing and tell Mac users to right-click › Open (or System Settings › Privacy & Security › Open Anyway on
  macOS 15+), and to compare the checksum first.

## 5. GitHub settings that make the rest stick

- **Settings › Branches › Add rule** for `main`: require a pull request, require review from Code Owners
  (`.github/CODEOWNERS` covers `plugins/`, `.github/` and `SECURITY.md`), and block force pushes.
- **Settings › Actions › General › Workflow permissions**: "Read repository contents" as the default. Each workflow
  now asks for the write access it needs per job.
- Release checksums need no setup: the Release workflow adds them to every new release.
