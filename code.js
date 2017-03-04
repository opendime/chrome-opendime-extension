
// Details of our hardware's USB specs
var VENDOR_ID = 0xD13E;
var PRODUCT_ID = 0x0100;
var DEVICE_INFO = {"vendorId": VENDOR_ID, "productId": PRODUCT_ID};
var permissionObj = {permissions: [{'usbDevices': [DEVICE_INFO] }]};

var current_device;

var transfer = {
  direction: 'in',
  endpoint: 1,
  length: 6
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
    "value": index,
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

function put_value(od_dev, cmd_code, data, callback)
{
  var ti = {
    "requestType": "vendor",
    "recipient": "device",
    "direction": "out",
    "request": 0,
    "value": cmd_code.charCodeAt(0),
    "index": 0,
    "data": data.buffer
  };

  chrome.usb.controlTransfer(od_dev, ti, function(usbEvent) {
      err = chrome.runtime.lastError;

      if(!callback) return;

      if(usbEvent) {
        callback(usbEvent.resultCode, usbEvent.data);
      } else {
        callback(err);
      }
  });
}


function decode_LE32(data)
{
    const aa = new Uint8Array(data);
    return aa[0] | (aa[1] << 8) | (aa[2] << 16) | (aa[3] << 32);
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
*/

function probe_opendime(od_dev, serial_number)
{
    var vars = { sn: serial_number, is_fresh: false, is_sealed: true, is_v1: false,
                dev: od_dev };

    // get all bitcoin-related values
    get_value(od_dev, 3, 64, function(rc, d) {
        if(rc) {
            console.log("is fresh");
            vars.is_fresh = true;
        } else {
            vars.ad = decode_utf8(d);

            get_value(od_dev, 2, 64, function(rc, d) {
                if(!rc) {
                    vars.pk = decode_utf8(d);
                    vars.is_sealed = false;
                }
            });
        }
    });

    // get V2-related values
    get_value(od_dev, 8, 16, function(rc, d) {
        if(rc) {
            vars.is_v1 = true;
        } else {
            vars.ae = encode_hex(d);
            get_value(od_dev, 7, 1000, function(rc, d) {
                if(!rc) {
                    vars.cert = decode_utf8(d);
                }
            });
        }
    });

    // I don't know how we're supposed to know 
    // the above process has completed?!?

    setTimeout(function() {
        current_device = vars;

        console.log("vars", vars);
        render_state(vars);
        start_verify(vars);
    }, 200);
}

function pick_keys()
{
    //const TARGET = 256*1024;
    const TARGET = 248*1024;

    console.log("Picking keys");

    $('#picking-modal').modal({
            closable: false,
            duration: 0,
        }).modal('show');

    var prog = $('#picking-modal .ui.progress');
    prog.progress();

    // reset first
    var od_dev = current_device.dev;
    put_value(od_dev, 'e', new Uint8Array(0));

    var handle = setInterval(function() {
        get_value(od_dev, 9, 4, function(rc, d) {
            if(rc) {
                clearInterval(handle);
                prog.progress('complete');
                prog.progress('set percent', 100);
            } else {
                var done = decode_LE32(d);
                prog.progress('set percent', done * 99.0 / TARGET);

                if(done >= TARGET) {
                    clearInterval(handle);
                    prog.progress('complete');
                } else {
                    for(var i=0; i<128; i++) {
                        var noise = new Uint8Array(32);
                        window.crypto.getRandomValues(noise);
                        put_value(od_dev, 'e', noise);
                    }
                }
            }
        });
    }, 100);

    return false;
}

function reset_ui(show_empty)
{
    // reset much
    $('.js-stateful').text('');
    $('.js-unsealed-warn').hide();
    $('#picking-modal').modal('hide');
    $('#fresh-modal').modal('hide');

    $('#nada-modal').modal(show_empty);
    if(show_empty == 'show') {
        show_qr('xxx -- xxx');
    }
}

function render_state(vars)
{
    reset_ui('hide');

    if(vars.is_fresh) {
        $('#fresh-modal').modal({
            closable: false,
            onApprove: pick_keys,
            duration: 100,
        }).modal('show');

        return;
    }

    if(!vars.is_sealed) {
        $('.js-unsealed-warn').show();
    }

    // bitcoin addr
    $('.js-addr').text(vars.ad);
    show_qr(vars.ad);
}

function start_verify(vars)
{
    if(!vars.is_fresh) {
        // can always check the bitcoin signatures
    }
    
    if(!vars.is_v1) {
        // do the new hard stuff
    }
}

function show_qr(data)
{
    var el = $('#main-qr');

    var qrcode = new QRCode('main-qr', {
        text: data,
        // width: 300, height: 300,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });
};

function have_permission(result)
{
    // TODO: block any attempt to work with 2+ opendimes at once.

    // cannot use findDevices because I want to serial number!
    chrome.usb.getDevices( DEVICE_INFO,
      function(devices) {
        if (!devices || !devices.length) {
          console.log('Device not yet found');
          return;
        }
        dev_inserted(devices[0]);
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


/* JUNK

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
*/

function dev_removed(dev)
{
    // gets a Device
    if(current_device && current_device.sn == dev.serialNumber) {
        console.log("Current one removed!");

        current_device = null;
        reset_ui('show');
    }
}

function dev_inserted(dev)
{
    const sn = dev.serialNumber;
    console.log('Found device: ' + sn, dev);
    chrome.usb.openDevice(dev, function(ch) {
        probe_opendime(ch, sn);
    });
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

    chrome.usb.onDeviceRemoved.addListener(dev_removed);
    chrome.usb.onDeviceAdded.addListener(dev_inserted);
} else {
    // Local debug case, when not an app

    // (uncomment to test modal, but ok button doesn't work)
    //$('#perms-modal').modal('show');
    //ask_for_permission();
    var vars = 
{"sn":"4QR6SUSUJVGVCIBAEBDTIHQK74","is_fresh":false,"is_sealed":false,"is_v1":false,"ad":"1E8t4b3bSoVPGPW84D2i8pJs3ckK6fuRaH","ae":"c5adbafe8b3d","pk":"5KZ13kVzh9G8m7B6cS8QxQQ6E37wRwTgHAcoKEAPRe7vs1rxuXH","cert":"-----BEGIN CERTIFICATE-----\nMIICbzCCAVegAwIBAgIIPE25afsphhMwDQYJKoZIhvcNAQELBQAwFjEUMBIGA1UE\nAwwLQmF0Y2ggIzEgQ0EwHhcNMTcwMzAxMDAwMDAwWhcNMzcwMTAxMDAwMDAwWjBF\nMTAwLgYDVQQFEyc0UVI2U1VTVUpWR1ZDSUJBRUJEVElIUUs3NCtjNWFkYmFmZThi\nM2QxETAPBgNVBAMMCE9wZW5kaW1lMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\nAHhk+Wudf27ye/x0Xi+6Kx4UB2ib8iz98metsYN3vlwWydtBEeR8HDkAn5xOVXmT\nTWQVpkg2kmrnAS4sbYxWx6NdMFswHwYDVR0jBBgwFoAUnYVWYkYMVgGc59hdR/k0\nTaG3yJAwCQYDVR0TBAIwADAdBgNVHQ4EFgQU6Bezb+VFDNezZNVSPjNijSYaLeQw\nDgYDVR0PAQH/BAQDAgeAMA0GCSqGSIb3DQEBCwUAA4IBAQCtvuw8geubwGhR0GK2\noq9Tfz65vLgIYsEkatgyJQewDgUk3mzErzNVmKw45V7EIsnBZIMRHFV0W2qge/9Y\nRc4yTsjbf6+h+47sU+2KIVjMe55vW71VSv7JzVOJEvmfZxNdYSlxYAf7hhNT4rOf\nuOuUMDZKMfkoMEBtp1pulgpL7/hE+ZbNxDaSKxbKquvgeMzEkrmPmB8YQtdVpupN\nqQTmC+mdRPMxqBRtxLjPH07Tbu/E8JnmI2uRxgYvnFQtTjYaEHDFOS+kEVO6SOID\nU/QfGw7DbvYvhBmxbHG2YHEst9nyqkhUNbABSpGlAz71njpFvcE9e+jCRZAoYrOX\nD49m\n-----END CERTIFICATE-----\n\r\n"};

    // OR pretend it's sealed...
    //vars.is_sealed = true;

    // OR pretend it's brand new
    vars.is_fresh = true;

    render_state(vars);
}

$('select.dropdown').dropdown();

