#!/usr/bin/env python3
"""Writes release.json, the machine-readable list of what a GitHub release carries.

    python3 tools/release/manifest.py --dist DIR --tag v2.0 --repo owner/name --commit SHA \
        [--versions versions.json] [--title "MKCinema 2.0 · Android 1.9.1"] > release.json

Every file in DIR is listed with its platform, size and SHA-256 and a download URL on this release. Updaters read the
newest one at https://github.com/<repo>/releases/latest/download/release.json (the format is in docs/releases.md).
"""
import argparse
import datetime
import hashlib
import json
import pathlib
import re
import sys
import urllib.parse

# file name -> (platform, kind). First match wins.
RULES = [
    (r"MKCinema-TV\.apk", "android-tv", "apk"),
    (r"MKCinema(-[0-9.]+)?\.apk", "android", "apk"),
    (r"MKCinema(-[0-9.]+)?\.exe", "windows", "exe"),
    (r"MKCinema-engine-windows-x64\.zip", "windows", "engine"),
    (r"MKCinema-([0-9.]+)\.dmg", "macos", "dmg"),
    (r"MKCinema-([0-9.]+)-mac\.zip", "macos", "zip"),
    (r"mkcinema_([0-9.]+)_amd64\.deb", "linux", "deb"),
    (r"mkcinema-([0-9.]+)-linux-x86_64\.tar\.gz", "linux", "tar.gz"),
    (r"com\.mkcinema\.app_([0-9.]+)_all\.ipk", "webos", "ipk"),
]

NEEDS = {
    "android": "Android 7 or later",
    "android-tv": "Android TV, Google TV or Fire TV, Android 7 or later",
    "windows": "Windows 10 or 11, 64-bit, Microsoft Edge WebView2",
    "macos": "macOS 11 or later, Apple silicon and Intel",
    "linux": "x86-64, WebKitGTK 4.1 (2.40 or newer)",
    "webos": "LG webOS (beta)",
}

# What each platform's files are signed with. Nothing here is code-signed by Microsoft or notarized by Apple yet.
SIGNING = {
    "android": "apk-signature-v2-v3",
    "android-tv": "apk-signature-v2-v3",
    "windows": "none",
    "macos": "none (not notarized)",
    "linux": "none",
    "webos": "none",
}

# Obtainium: follow releases whose title names an Android version, use that version (so it matches the installed
# app's versionName) and always pick MKCinema.apk. Keys are Obtainium's own setting names.
OBTAINIUM_SETTINGS = {
    "releaseTitleAsVersion": True,
    "filterReleaseTitlesByRegEx": r"Android \d",
    "versionExtractionRegEx": r"Android (\d+(?:\.\d+)+)",
    "matchGroupToUse": "1",
    "apkFilterRegEx": r"^MKCinema\.apk$",
    "includePrereleases": False,
}


def obtainium_link(repo):
    app = {
        "id": "com.mkcinema.app",
        "url": f"https://github.com/{repo}",
        "author": "MKCinema",
        "name": "MKCinema",
        "additionalSettings": json.dumps(OBTAINIUM_SETTINGS, separators=(",", ":")),
    }
    return "obtainium://app/" + urllib.parse.quote(json.dumps(app, separators=(",", ":")), safe="")


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist")
    ap.add_argument("--tag")
    ap.add_argument("--repo", required=True)
    ap.add_argument("--commit")
    ap.add_argument("--versions", help="JSON like tools/release/versions.py prints: the version of each platform's files; left out, versions come from file names")
    ap.add_argument("--title", default="")
    ap.add_argument("--built", default="", help="comma-separated platforms built from source in this release")
    ap.add_argument("--obtainium-link", action="store_true", help="print only the Obtainium link and exit")
    a = ap.parse_args()

    if a.obtainium_link:
        print(obtainium_link(a.repo))
        return
    if not (a.dist and a.tag and a.commit):
        ap.error("--dist, --tag and --commit are needed")

    versions = json.loads(pathlib.Path(a.versions).read_text()) if a.versions else {}
    built = {x for x in a.built.split(",") if x}
    base = f"https://github.com/{a.repo}/releases/download/{urllib.parse.quote(a.tag)}"
    platforms = {}
    for p in sorted(pathlib.Path(a.dist).iterdir()):
        if not p.is_file() or p.name in ("SHA256SUMS", "release.json"):
            continue
        for rx, plat, kind in RULES:
            m = re.fullmatch(rx, p.name)
            if m:
                break
        else:
            print(f"manifest.py: {p.name} matches no platform, left out", file=sys.stderr)
            continue
        src = "android" if plat == "android-tv" else plat
        entry = platforms.setdefault(plat, {
            "version": (versions.get(src) or {}).get("version"),
            "needs": NEEDS[plat],
            "signing": SIGNING[plat],
            "built_from_source": src in built,
            "files": [],
        })
        if src == "android" and "build" in versions.get("android", {}):
            entry["build"] = versions["android"]["build"]
        # the version in the file name, when it has one (Mac, Linux, webOS); used when this release did not build it
        named = m.group(1).lstrip("-") if m.groups() and m.group(1) else None
        if entry["version"] is None and named:
            entry["version"] = named
        entry["files"].append({
            "name": p.name,
            "kind": kind,
            "size": p.stat().st_size,
            "sha256": sha256(p),
            "url": f"{base}/{urllib.parse.quote(p.name)}",
        })
    if not platforms:
        sys.exit("manifest.py: no app files in " + a.dist)

    out = {
        "format": 1,
        "app": "MKCinema",
        "tag": a.tag,
        "title": a.title or f"MKCinema {a.tag}",
        "published": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "commit": a.commit,
        "release_url": f"https://github.com/{a.repo}/releases/tag/{urllib.parse.quote(a.tag)}",
        "checksums_url": f"{base}/SHA256SUMS",
        "platforms": platforms,
        "obtainium": {"link": obtainium_link(a.repo), "settings": OBTAINIUM_SETTINGS},
    }
    json.dump(out, sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
