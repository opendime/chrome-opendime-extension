function open(dev) {
  chrome.app.window.create('main.html', {
    innerBounds: {
      width: 800,
      height: 868
    },
    id: "OpendimeApp-main" });
}

// maybe: show window when the extension is "launched" .. aside from dev "reload" not
// sure when that happens.
chrome.app.runtime.onLaunched.addListener(open);

// awesomeness: launch window as soon as an Opendime is detected!!
chrome.usb.onDeviceAdded.addListener(open);
