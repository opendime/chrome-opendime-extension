# Background

Chrome "apps" are depricated and going away. However, "extensions"
do not support USB, so we are an "app" today. Still, it's listed
under 'extensions' in all Chrome UI (present version)... But since
we are an "app", the contents of `manifest.json` is quite limited.

Also the top of every page in the docs warns us...

_Important: Chrome will be removing support for Chrome Apps on
Windows, Mac, and Linux. Chrome OS will continue to support Chrome
Apps. Additionally, Chrome and the Web Store will continue to support
extensions on all platforms. Read the announcement and learn more
about migrating your app._

Timeline for app non-support is 2018, and WebUSB won't be ready
for years anyway...

# References

- <https://developer.chrome.com/apps> top level docs
- <https://developer.chrome.com/apps/app_usb> USB interface stuff
- <https://developer.chrome.com/apps/api_index> useful index page
- <http://semantic-ui.com/examples/theming.html> Sematic UI CSS cheatsheet
- <https://davidshimjs.github.io/qrcodejs/> for QR code rendering
- <http://pkijs.org/> Certificate stuff
- <https://github.com/indutny/elliptic> EC curve stuff

# Useful Chrome internal links

- <chrome://extensions> keep open all the dev time
- <chrome://device-log> lists USB events!

# HTML and Front End Devs...

- look at the end of `code.js` for some things that can be commented one
  way or the other; you can make it display test data for most cases
- simply load `main.html` into chrome from the filesystem:

```
open main.html
```

- app window is currently coded to be 800x600px but we can change that, you should
  work in a similarly-sized window.

# Debug As Extension.

To debug/change it as an extension, go to `chrome://extensions/` and...

- click on "Developer mode"
- click "Load upacked extension"
- give it this directory (ie. where `manifest.json` is located)
- Use the Launch and/or Reload buttons
- once installed, will also pop up if opendime is inserted


