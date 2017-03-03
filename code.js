var VENDOR_ID = 0xD13E;
var PRODUCT_ID = 0x0100;
var DEVICE_INFO = {"vendorId": VENDOR_ID, "productId": PRODUCT_ID};

var od_dev;
var knob = document.getElementById('knob');
var requestButton = document.getElementById("requestPermission");

var amount = 0;
var ROTATE_DEGREE = 4;

var transfer = {
  direction: 'in',
  endpoint: 1,
  length: 6
};

var onEvent = function(usbEvent) {
    
    if (usbEvent.resultCode) {
      console.log("Error: " + usbEvent.error);
      return;
    }

    var dv = new DataView(usbEvent.data);
    var knobState = {
      _ledStatus: dv.getUint8(4),
      buttonState: dv.getUint8(0),
      knobDisplacement: dv.getInt8(1),
      ledBrightness: dv.getUint8(3),
      pulseEnabled: (dv.getUint8(4) & 1) == 1,
      pulseWhileAsleep: (dv.getUint8(4) & 4) == 4,
      pulseSpeed: null,
      pulseStyle: null,
      ledMultiplier: dv.getUint8(5)
    };

    knobState.pulseSpeed = pulseDescriptionFromStatusByte(
      knobState, ["slower", "normal", "faster"], 4);

    knobState.pulseStyle = pulseDescriptionFromStatusByte(
      knobState, ["style1", "style2", "style3"], 6);

    var transform = '';
    if (knobState.buttonState == 1) {
      transform = 'scale(0.5) ';
    }

    amount += (knobState.knobDisplacement * ROTATE_DEGREE);
    transform += 'rotate(' + amount + 'deg)';
    knob.style.webkitTransform = transform;
    
    console.log("RotateEvent", knobState);

    chrome.usb.interruptTransfer(od_dev, transfer, onEvent);
  };

var pulseDescriptionFromStatusByte = function(knobState, descriptions, offset) {
    if(descriptions && offset >= 0 && offset < 8) {
      var index = (knobState._ledStatus >> offset) & 3;
      if(descriptions.length > index) {
        return descriptions[index];
      }
    }

    return "unknown";
  };
/*

def get_debug_value(dev, idx, expect_works=True):
    # Use a special setup packet to read a value from device under test
    rv = dev.ctrl_transfer(bmRequestType=0xc0, bRequest=0, wValue=int(idx),
                                data_or_wLength=2000)

def set_debug_value(dev, code, expect_works=True, data=None):
    # use a special setup packet to WRITE a command/value to device under test
    rv = dev.ctrl_transfer(bmRequestType=0x40, bRequest=0, wValue=ord(code),
        data_or_wLength=(data if data is not None else 0))
    
*/

var probe_opendime = function(od_dev)
{
/*
    // read everything.
  var ti = {
    "requestType": "vendor",
    "recipient": "device",
    "direction": "in",
    "request": 0,
    "value": 96,        // firmware checksum
    "index": 0,
    "length": 32,
    "data": new ArrayBuffer(32)
  };
  chrome.usb.controlTransfer(od_dev, ti, sendCompleted);

  ti = {
    "requestType": "vendor",
    "recipient": "device",
    "direction": "out",
    "request": 0,
    "value": 103,       // 'g'
    "index": 0,
    "length": 0,
    "data": new ArrayBuffer(0)
  };
  chrome.usb.controlTransfer(od_dev, ti, sendCompleted);
*/
  var ti = {
    "requestType": "vendor",
    "recipient": "device",
    "direction": "in",
    "request": 0,
    "value": 97,        // unit.crt
    "index": 0,
    "length": 960,
    "data": new ArrayBuffer(960)
  };
  chrome.usb.controlTransfer(od_dev, ti, function(usbEvent) {
      if(usbEvent && usbEvent.data) {
          var utf8 = new TextDecoder('ascii')
          var buf = new Uint8Array(usbEvent.data);
          console.log("event = ", usbEvent);
          console.log("Unit.crt = ", utf8.decode(buf));
console.trace();
        }
    });

}

var check_interf = function(od_dev, interfaces) {
    // check the USB interface properties are what we expect
    console.log("Interfaces: ", interfaces);

    if(    (interfaces.length == 1)
        && (interfaces[0].interfaceClass == 8)
        && (interfaces[0].endpoints.length == 2)
        && (interfaces[0].endpoints[0].maximumPacketSize == 64)
        && (interfaces[0].endpoints[1].maximumPacketSize == 64)
    ) {
        console.log("USB interface looks right!");

        probe_opendime(od_dev);
    } else {
        console.log("Failed basic checks")
    }
};

var show_qr = function(data)
{
    var qrcode = new QRCode("main_qr", {
        text: data,
        width: 200,
        height: 200,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    var el = $('#main_qr');
};

var gotPermission = function(result) {
    requestButton.style.display = 'none';
    //knob.style.display = 'block';
    console.log('App was granted the "usbDevices" permission.');
    chrome.usb.findDevices( DEVICE_INFO,
      function(devices) {
        if (!devices || !devices.length) {
          console.log('device not found');
          return;
        }
        console.log('Found device: ' + devices[0].handle);
        var od_dev = devices[0];
        chrome.usb.listInterfaces(od_dev, function(ifs) { check_interf(od_dev, ifs);} );
    });

  };

var permissionObj = {permissions: [{'usbDevices': [DEVICE_INFO] }]};

requestButton.addEventListener('click', function() {
  chrome.permissions.request( permissionObj, function(result) {
    if (result) {
      gotPermission();
    } else {
      console.log('App was not granted the "usbDevices" permission.');
      console.log(chrome.runtime.lastError);
    }
  });
});

if(chrome.permissions) {
    chrome.permissions.contains(permissionObj, function(result) {
      if (result) {
        gotPermission();
      }
    });
}

function setLEDBrightness(brightness) {
  if ((brightness >= 0) && (brightness <= 255)) {
    var info = {
      "direction": "out",
      "endpoint": 2,
      "data": new Uint8Array([brightness]).buffer
    };
    chrome.usb.interruptTransfer(od_dev, info, sendCompleted);
  } else {
    console.error("Invalid brightness setting (0-255)", brightness);
  }
}

function enablePulse(val) {
  if (val === true) {
    sendCommand(1, 3, 1);
  } else {
    sendCommand(1, 3, 0);
  }
}

function enablePulseDuringSleep(val) {
  if (val === true) {
    sendCommand(1, 2, 1);
  } else {
    sendCommand(1, 2, 0);
  }
}

function sendCommand(request, val, idx) {
  var ti = {
    "requestType": "vendor",
    "recipient": "interface",
    "direction": "out",
    "request": request,
    "value": val,
    "index": idx,
    "data": new ArrayBuffer(0)
  };
  chrome.usb.controlTransfer(od_dev, ti, sendCompleted);
}

function buf2hex(byteArray)
{
  const hexParts = [];
  for(let i = 0; i < byteArray.length; i++) {
    const hex = byteArray[i].toString(16);
    
    const paddedHex = ('00' + hex).slice(-2);
    
    hexParts.push(paddedHex);
  }
  
  return hexParts.join('');
}


function sendCompleted(usbEvent) {
  if (chrome.runtime.lastError) {
    console.error("sendCompleted Error:", chrome.runtime.lastError);
  }

  if (usbEvent) {
    if (usbEvent.data) {
      var buf = new Uint8Array(usbEvent.data);
      console.log("sendCompleted Buffer:", usbEvent.data.byteLength, buf2hex(buf));
    }
    if (usbEvent.resultCode !== 0) {
      console.error("Error writing to device", usbEvent.resultCode);
    }
  }
}


/* some fun commands to try:
 *   sendCommand(1, 0x0104, 0x3002) // fast flashing
 *   sendCommand(1, 0x0104, 0xff02) // fastest flashing possible
 *   sendCommand(1, 0x0104, 0xff01) // normal speed flashing
 *   sendCommand(1, 0x0104, 0x0f00) // super slow flashing
 */
