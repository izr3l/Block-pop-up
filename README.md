# Popup & New Tab Blocker

This project is a Manifest V3 browser extension that blocks popups and newly opened tabs when they originate from a site on the user's blacklist.

## What It Does

- Lets the user blacklist the current site from the popup UI.
- Stores blacklist rules locally with `chrome.storage.local`.
- Monitors newly created tabs and popup windows in the background.
- Closes tabs or popup windows opened by blocked domains.
- Tracks how many times each blacklist rule has blocked a popup or new tab.

## How Blocking Works

- Domains are normalized before storage and matching.
- Matching is subdomain-aware, so blocking `example.com` also blocks `www.example.com` and `shop.example.com`.
- Common `www.` prefixes are removed during normalization.

## Current Limits

- Domain normalization uses a lightweight heuristic and does not implement the full public suffix list.
- Internal browser pages such as `chrome://` and `edge://` cannot be blacklisted from the popup UI.

## Files

- `manifest.json`: extension manifest and permissions
- `background.js`: popup/new-tab blocking logic and block counters
- `popup/popup.html`: popup markup
- `popup/popup.js`: popup behavior and blacklist management
- `popup/popup.css`: popup styling
