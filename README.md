# Background

Chrome "apps" are depricated and going away. However, "extensions" do not support
USB, so are an "app". Still, it's listed under extensions in all Chrome UI (present
version)... Since we are an "app", the contents of `manifest.json` is quite
limited.

So the top of every page in the docs warns us...

_Important: Chrome will be removing support for Chrome Apps on
Windows, Mac, and Linux. Chrome OS will continue to support Chrome
Apps. Additionally, Chrome and the Web Store will continue to support
extensions on all platforms. Read the announcement and learn more
about migrating your app._


# Reference Sources

- <https://developer.chrome.com/apps> top level docs
- <https://developer.chrome.com/apps/app_usb> USB interface stuff
- <https://developer.chrome.com/apps/api_index> useful index page

# Useful Chrome internal links

- <chrome://extensions> keep open all the dev time
- <chrome://device-log> lists USB events!
