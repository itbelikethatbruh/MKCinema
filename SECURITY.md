# Security policy

## Supported versions

Security fixes go into the latest web app at https://mkcinema.pages.dev and the latest native app release. The native apps load the web app, so most fixes reach every platform without a new download.

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Instead, use GitHub's private reporting: go to the **Security** tab of this repository and click **Report a vulnerability**.

Include what you found, how to reproduce it, and what an attacker could do with it. You'll get a reply as soon as possible, and credit in the release notes if you'd like it.

## Scope

In scope: the web app, the companion server (`mkcinema-server.js`), the debrid relay, the website and the native apps.

Out of scope: third-party addons, debrid services and other services MKCinema connects to. Report those to their owners.

## Notes

- The Supabase publishable key in the app is public by design. Row-level security keeps each user's row private.
- Never post your debrid keys, account passwords or addon links with keys in an issue.
