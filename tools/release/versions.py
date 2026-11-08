#!/usr/bin/env python3
"""Prints the version of every MKCinema app, read from its source, as JSON.

Used by .github/workflows/release.yml (and handy before tagging): each app keeps its own version, so a release
tag (v2.0) is not any one app's version. Run from anywhere: python3 tools/release/versions.py
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]


def grab(path, pattern, what):
    text = (ROOT / path).read_text(encoding="utf-8")
    m = re.search(pattern, text)
    if not m:
        sys.exit(f"versions.py: no {what} in {path}")
    return m.group(1)


def main():
    v = {
        "android": {
            "version": grab("android/AndroidManifest.xml", r'android:versionName="([^"]+)"', "versionName"),
            "build": int(grab("android/AndroidManifest.xml", r'android:versionCode="(\d+)"', "versionCode")),
        },
        "windows": {"version": grab("windows/main.go", r'\bversion\s*=\s*"([^"]+)"', "version")},
        "macos": {
            "version": grab("mac/Info.plist", r"<key>CFBundleShortVersionString</key>\s*<string>([^<]+)</string>", "CFBundleShortVersionString"),
            "build": grab("mac/Info.plist", r"<key>CFBundleVersion</key>\s*<string>([^<]+)</string>", "CFBundleVersion"),
        },
        "linux": {"version": grab("linux/package.sh", r"\bV=([0-9][0-9A-Za-z.]*)", "V=")},
    }
    # the Mac zip name comes from mac/package.sh; it must agree with Info.plist or the release names the wrong file
    mac_pkg = grab("mac/package.sh", r"\bV=([0-9][0-9A-Za-z.]*)", "V=")
    if mac_pkg != v["macos"]["version"]:
        sys.exit(f"versions.py: mac/package.sh builds {mac_pkg} but mac/Info.plist says {v['macos']['version']}")
    for k, x in v.items():
        if not re.fullmatch(r"\d+(\.\d+){1,3}", x["version"]):
            sys.exit(f"versions.py: {k} version {x['version']!r} is not like 1.2.3")
    json.dump(v, sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
