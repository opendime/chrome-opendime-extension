function open(dev) {
  chrome.app.window.create('main.html', {
    innerBounds: {
      width: 840,
      minWidth: 840,
      height: 640,
      minHeight: 640
    },
    id: "OpendimeApp-main" });
}

// maybe: show window when the extension is "launched" .. aside from dev "reload" not
// sure when that happens.
chrome.app.runtime.onLaunched.addListener(open);

// awesomeness: launch window as soon as an Opendime is detected!!
chrome.usb.onDeviceAdded.addListener(open);
