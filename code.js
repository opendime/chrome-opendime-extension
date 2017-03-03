
// Details of our hardware's USB specs
var VENDOR_ID = 0xD13E;
var PRODUCT_ID = 0x0100;
var DEVICE_INFO = {"vendorId": VENDOR_ID, "productId": PRODUCT_ID};
var permissionObj = {permissions: [{'usbDevices': [DEVICE_INFO] }]};

var od_dev;

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

function get_value(od_dev, index, max_resp, callback)
{
  var ti = {
    "requestType": "vendor",
    "recipient": "device",
    "direction": "in",
    "request": 0,
    "value": index,        // firmware checksum
    "index": 0,
    "length": max_resp,
    "data": new ArrayBuffer(max_resp)
  };

  chrome.usb.controlTransfer(od_dev, ti, function(usbEvent) {
/* not really an error if we expect it and so on.
      if (chrome.runtime.lastError) {
        console.error("sendCompleted Error:", chrome.runtime.lastError);
      }
*/
      err = chrome.runtime.lastError;

      if(usbEvent) {
/*
        if(usbEvent.resultCode !== 0) {
          console.error("Error writing to device", usbEvent.resultCode);
        }
        if (usbEvent.data) {
        }
*/
        callback(usbEvent.resultCode, usbEvent.data);
      } else {
        callback(err);
      }
  });
}

function decode_utf8(data)
{
    var utf8 = new TextDecoder('ascii')
    var buf = new Uint8Array(data);
    return utf8.decode(buf);
}

function encode_hex(data)
{
    const byteArray = new Uint8Array(data);
    const hexParts = [];
    for(let i = 0; i < byteArray.length; i++) {
        const hex = byteArray[i].toString(16);
        const paddedHex = ('00' + hex).slice(-2);

        hexParts.push(paddedHex);
    }

    return hexParts.join('');
}

/*
1 | Secret exponent (if unsealed)
2 | WIF version of private key (if unsealed)
3 | Bitcoin payment address (if set yet)
4 | Result of previous signature request (`m` or `f`), 65 or 96 bytes
5 | Firmware checksum (32 bytes)
6 | Firmware version as a string
7 | Readback unit x.509 certificate `unit.crt`
8 | Serial number of ATECC508A chip (6 bytes)
9 | Readback number of bytes entropy so far (unsigned LE32)

"ad": "1E8t4b3bSoVPGPW84D2i8pJs3ckK6fuRaH   ",
"pk": "5KZ13kVzh9G8m7B6cS8QxQQ6E37wRwTgHAcoKEAPRe7vs1rxuXH",
"ex": "e4af8379ce016e415c2fe6d2962958c7fafa95c13bced23ee9356a5cf1c7c156",
"on": "6778b1e7e0f28c1fd38d0c488b06ad230c8846a10f8471e5da30e431b48d10b0",
"sn": "4QR6SUSUJVGVCIBAEBDTIHQK74",
"ae": "c5adbafe8b3d",
"va": "nonce:7a4600e32459949aec42052a|1E8t4b3bSoVPGPW84D2i8pJs3ckK6fuRaH|Gz2xhXdrK7q9UKKpTzFN0sr02AR97BTgkBTMHwtDxnpGIt74zJ6TYJtvRO2co7_kMMQ__GC73OKXPZO43_y6ZOk|U"           
*/

function probe_opendime(od_dev, serial_number)
{
    var vars = { 'sn': serial_number };

    // get all bitcoin-related values
    get_value(od_dev, 3, 64, function(rc, d) {
        if(rc) {
            console.log("is fresh");
            vars['fresh'] = true;
        } else {
            vars['ad'] = decode_utf8(d);

            get_value(od_dev, 2, 64, function(rc, d) {
                if(!rc) {
                    vars['pk'] = decode_utf8(d);
                }
            });
        }
    });

    // get v2 values
    get_value(od_dev, 8, 16, function(rc, d) {
        if(rc) {
            vars['v1'] = true;
        } else {
            vars['ae'] = encode_hex(d);
            get_value(od_dev, 7, 1000, function(rc, d) {
                if(!rc) {
                    vars['cert'] = decode_utf8(d);
                }
            });
        }
    });

    console.log("vars", vars);

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
/*
  var ti = {
    "requestType": "vendor",
    "recipient": "device",
    "direction": "in",
    "request": 0,
    "value": 7,        // unit.crt
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
*/

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

function have_permission(result)
{
    // TODO: block any attempt to work with 2+ opendimes at once.

    // cannot use findDevices because I want to serial number!
    chrome.usb.getDevices( DEVICE_INFO,
      function(devices) {
        if (!devices || !devices.length) {
          console.log('device not found');
          return;
        }
        const sn = devices[0].serialNumber;
        console.log('Found device: ' + sn, devices[0]);
        chrome.usb.openDevice(devices[0], function(ch) {
            probe_opendime(ch, sn);
        });
    });

}


function ask_for_permission()
{
    $('#perms-modal').modal({
        closable: false,
        onApprove: function() {
            chrome.permissions.request(permissionObj, function(result) {
                if(result) {
                  have_permission();
                } else {
                  console.log('App was not granted the "usbDevices" permission!');
                  console.log(chrome.runtime.lastError);

                  return false;
                }
              })
            },
        }).modal('show');
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

// Startup code.
//
if(chrome.permissions) {
    chrome.permissions.contains(permissionObj, function(result) {
      if(result) {
        have_permission();
      } else {
        ask_for_permission();
      }
    });
} else {
    // Local debug case, not an app

    // (uncomment to test modal, but ok button doesn't work)
    //$('#perms-modal').modal('show');
    //ask_for_permission();
}
