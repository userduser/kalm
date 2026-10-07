# Install the development preview

Download the matching ZIP from [Releases](https://github.com/userduser/kalm/releases).
These are development packages, not store-signed releases. Use a test browser
profile and report the browser version with any failures.

## Chromium

1. Extract `kalm-0.1.0-chromium.zip` into a folder.
2. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**
   and select the extracted folder containing `manifest.json`.
3. Pin Kalm, open a website and confirm the popup says **Ready**.
4. Allow website access for Optimal/Complete filtering, then reload the site.
5. On YouTube, open comments and use the comment setup button to edit rules.

## Firefox 140+

1. Extract `kalm-0.1.0-firefox.zip`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on** and select the extracted `manifest.json`.
4. Grant website access when requested and reload YouTube after installation.

The temporary add-on is removed when Firefox restarts. Permanent installation
requires a Kalm-specific Mozilla signature; the upstream signature is deliberately
removed because it cannot authenticate modified files. Do not change signature
enforcement settings. [Mozilla temporary installation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).

## Safari 18.6+ on macOS

1. Open Safari Settings → Advanced and enable **Show features for web developers**.
2. Open Safari Settings → Developer → **Add Temporary Extension** (or Develop →
   Web Extension → **Add Temporary Extension**, depending on Safari's version).
3. Select `kalm-0.1.0-safari.zip` or its extracted folder containing `manifest.json`.
4. Enable Kalm in Extensions, allow access to the websites you want to filter,
   and reload YouTube.

Safari's temporary loader does not require an Xcode build or an Apple Developer
account. This is for development testing. Permanent distribution needs a signed,
notarized host app or App Store release. [Apple instructions](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension).

For a native macOS host compilation check, run `npm run build:safari` with Xcode
installed. Output lives under `.artifacts/`; this command does not sign or install
a public app. Temporary loading is the simplest preview path.

## Updating an existing preview

Replace the unpacked folder and reload the extension in Chromium/Firefox, or
remove and re-add the temporary Safari extension. Reload website tabs too, so
the new `document_start` scripts run. Settings are retained when the extension ID
and browser profile remain the same; uninstalling or changing the extension ID
can reset them. Kalm has its own identity, so old standalone comment-filter
settings do not automatically move into it. Re-enter those rules in Kalm.
