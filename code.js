
// Details of our hardware's USB specs
var VENDOR_ID = 0xD13E;
var PRODUCT_ID = 0x0100;
var DEVICE_INFO = {"vendorId": VENDOR_ID, "productId": PRODUCT_ID};
var permissionObj = {permissions: [{'usbDevices': [DEVICE_INFO] }]};

var current_device;

var QR_code;
var CLIPBOARD = '';

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

    //console.log("get_value: ", index);
    chrome.usb.controlTransfer(od_dev, ti, function(usbEvent) {
        err = chrome.runtime.lastError;

        if(usbEvent) {
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

    //console.log("put_value: ", cmd_code);
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

function put_n_get_sig(od_dev, cmd_code, nonce, resp_len)
{
    // do 'm' or 'f' command and wait 100ms for response; returns a promise.
    //
    return new Promise(function(resolve, reject) {
 
        console.log(cmd_code + ": msg/nonce = " + encode_hex(nonce));

        // send the value to be signed aka. nonce

        put_value(od_dev, cmd_code, nonce, function(rc, resp) {
            if(rc) {
                return reject("put fail: " + rc);
            }

            // empty response expected

            // takes minimum 100ms for response, and we must
            // poll for it... errors here are just stalling.

            var failures = 0;
            var handle = setInterval(function() {
                get_value(od_dev, 4, resp_len, function(rc, response) {
                    if(rc) {
                        failures ++;

                        if(failures > 50) {
                            clearInterval(handle);
                            reject("put_n_get_sig timeout: " + rc);
                        }
                    } else {
                        clearInterval(handle);
                        resolve(response);
                    }
                });
            }, 50);
        });
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

        //console.log("vars", vars);
        render_state(vars);
        start_verify(vars);
    }, 200);
}

function pick_keys()
{
    const TARGET = 256*1024;

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
    $('#js-fresh-msg').hide()
    $('#js-get-balance').hide()
    $('button.js-if-verified').addClass('disabled');
    $('button.js-copy-clipboard').hide();

    $('#nada-modal').modal(show_empty);

    if(QR_code) {
        $('#main-qr').empty();
        QR_code = false;
    }

    CLIPBOARD = '';
}

function render_state(vars)
{
    reset_ui('hide');

    if(vars.is_fresh) {
        $('#js-fresh-msg').show()

        return;
    }

    $('button.js-copy-clipboard').show();

    $('#js-get-balance').show()

    if(!vars.is_sealed) {
        $('.js-unsealed-warn').show();
        $('.js-privkey').text(vars.pk);
    }


    // bitcoin addr
    $('.js-addr').text(vars.ad);
    show_qr(vars.ad);
}

// take from pvutils
function stringToArrayBuffer(str)
{
	const stringLength = str.length;
	const resultBuffer = new ArrayBuffer(stringLength);
	const resultView = new Uint8Array(resultBuffer);
	
	for(let i = 0; i < stringLength; i++)
		resultView[i] = str.charCodeAt(i);
	
	return resultBuffer;
}

function check_signature(pubkey, numin, response, vars)
{
    const toArray = elliptic.utils.toArray;               // misc to array
    const parseBytes = elliptic.utils.parseBytes;         // hex->bytes in array

    // Take any binary, hash it and return 32-byte digest as binary (string)
    // see https://github.com/indutny/hash.js
    const H = function (m) {
        return pubkey.ec.hash().update(m).digest();
    };

    var slot13, lock;
    if(vars.ad) {
        slot13 = toArray((vars.ad + '        ').substr(0, 32));
        lock = [0];
    } else {
        slot13 = parseBytes('ff'.repeat(32));
        lock = [1];
    }

    // NOTE: response is 64 bytes of r+s, then 32 bytes of nonce picked by the chip.
    const sig_r = new Uint8Array(response.slice(0, 32));
    const sig_s = new Uint8Array(response.slice(32, 64));
    const ae_rand = toArray(new Uint8Array(response.slice(64, 96)));

    numin = toArray(numin);

    const slot14 = toArray((vars.sn + "+" + vars.ae).substr(0, 32));

    const fixed = parseBytes('00EE0123' + '00'.repeat(25));
    const msg1 = slot14.concat(parseBytes('15020e'), fixed, 
                    H(ae_rand.concat(numin, parseBytes('160000'))));
    const msg2 = slot13.concat(parseBytes('15020d'), fixed, H(msg1));

    const SN = toArray(vars.ae, 'hex');

    const body = H(msg2).concat(parseBytes('4140000000003c002d0000EE'),
                SN.slice(2,6), parseBytes('0123'),
                SN.splice(0, 2), lock,
                parseBytes('0000'));
    
    const sig = {r: sig_r, s: sig_s};

    const ok = pubkey.verify(H(body), sig)

    return ok;
}

function do_v2_checks(vars, el, FAIL)
{
    const od_dev = vars.dev;
    var unit_der = atob(vars.cert.replace(/-----(BEGIN|END) CERTIFICATE-----/g,''));

    var asn1 = org.pkijs.fromBER(stringToArrayBuffer(unit_der));
    var cert = new org.pkijs.simpl.CERT({ schema: asn1.result });

    // Simple syntax-only check: expect p256 curve pubkey in the cert.
    if(cert.subjectPublicKeyInfo.algorithm.algorithm_id == '1.2.840.10045.2.1') {
        //boring//$('<li>Has unit certificate.</li>').appendTo(el);
    } else {
        return FAIL("Wrong key type");
    }

    // read subject name's serial number
    var sn = cert.subject.types_and_values[0].value.value_block.value;

    if(sn == vars.sn + '+' + vars.ae) {
        $('<li>Unit certificate and actual serial numbers match.</li>').appendTo(el);
    } else {
        return FAIL("serial # mismatch");
    }

    // verify certificate is signed properly
    var asn1 = org.pkijs.fromBER(stringToArrayBuffer(factory_root_cert));
    var factory = new org.pkijs.simpl.CERT({ schema: asn1.result });

    var asn1 = org.pkijs.fromBER(stringToArrayBuffer(batch_cert));
    var batch = new org.pkijs.simpl.CERT({ schema: asn1.result });

    var chain = new Array();
    chain.push(batch);
    chain.push(factory);

    var untrusted = new Array();
    untrusted.push(cert);

    var cert_chain_simpl = new org.pkijs.simpl.CERT_CHAIN({
            trusted_certs: chain,
            certs: untrusted,
        });

    cert_chain_simpl.verify().then(
        function(result)
        {
            if(result.result === true) {
                $('<li>Unit certificate is properly signed by factory.</li>').appendTo(el);
            } else {
                return FAIL("Unit certificate does not check out: signature");
            }
        },
        function(error)
        {
            return FAIL("Unit certificate does not check out: " + error);
        }
    );

    // secp256r1 pubkey, DER encoded (sequence of 2 ints: (x, y) = point).
    var pubkey_bin = cert.subjectPublicKeyInfo.subjectPublicKey.value_block.value_hex;
    console.log("Pubkey = " + encode_hex(pubkey_bin));

    var curve = new elliptic.ec('p256');
    var pubkey = curve.keyFromPublic(encode_hex(pubkey_bin), 'hex');

    // pick our side's nonce
    var numin = new Uint8Array(20);
    window.crypto.getRandomValues(numin);

    var pp = put_n_get_sig(od_dev, 'f', numin, 64+32);

    pp.then(function(response) {
        console.log("Response(Sig+nonce) = " + encode_hex(response));

        if(check_signature(pubkey, numin, response, vars)) {
            $('<li>Correct signature by anti-counterfeiting chip.</li>').appendTo(el);
        } else {
            FAIL("Signature fail for 508a");
        }
    }).catch(function() {
        FAIL("Signature didn't happen");
    });
    
    return pp;
}

function check_btc_signature(address, msg, response)
{
    const toArray = elliptic.utils.toArray;               // misc to array
    const parseBytes = elliptic.utils.parseBytes;         // hex->bytes in array

    // address, signature, message, network
}


function do_btc_checks(vars, el, FAIL)
{
    // check the device has the private key it claims to
    // .. and that address is valid, etc.

    if(vars.is_fresh || !vars.ad) {
        // just do nothing but in a promise, gag.
        return Promise.resolve();
    }

    const od_dev = vars.dev;

    // pick a random nonce to be signed
    var nonce = new Uint8Array(32);
    window.crypto.getRandomValues(nonce);

    var pp = put_n_get_sig(od_dev, 'm', nonce, 65);

    return pp.then(function(sig) {
        if(BTC.bitcoin.message.verify(vars.ad, sig, nonce)) {
            $('<li>Bitcoin address verified with signed message.</li>').appendTo(el);
        } else {
            FAIL("Bad signature for bitcoin!");
        }
    }).catch(function(err) {
        FAIL("Bitcoin signature never finished/failed");
    });
}

function start_verify(vars)
{
    var el = $('#js-verify-list');

    el.empty();
    $("<li>Implements our USB protocol.</li>").appendTo(el);

    $('.js-verified-good').hide()
    $('.js-verified-bad').hide()
    $('.js-verified-spinner').show()

    FAIL = function(msg) {
        console.log("FAILED verification: " + msg);
        $('.js-verified-spinner').hide()
        $('.js-verified-good').hide();
        $('.js-verified-bad').show();
    }

    // can usually check the bitcoin signatures
    var pp = do_btc_checks(vars, el, FAIL);

    if(!vars.is_v1) {
        // do the new hard stuff
        pp = pp.then(function() {
            do_v2_checks(vars, el, FAIL);
        });
    }

    pp.then(function() {
        $('.js-verified-spinner').hide()
        if(!$('.js-verified-bad').is(":visible")) {
            $('.js-verified-good').show()
            $('button.js-if-verified').removeClass('disabled');
        }
    });
}

function show_qr(data)
{
    if(QR_code) {
        QR_code.makeCode(data);
    } else {
        QR_code = new QRCode('main-qr', {
            text: data,
            width: 256, height: 256,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
    }
};

function have_permission(result)
{
    // TODO: block any attempt to work with 2+ opendimes at once.

    // cannot use findDevices because I want to serial number!
    chrome.usb.getDevices( DEVICE_INFO,
      function(devices) {
        if (!devices || !devices.length) {
          console.log('Device not yet found');
          reset_ui('show');
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


document.addEventListener('copy', function(e){
    e.clipboardData.setData('text/plain', CLIPBOARD);
    e.preventDefault();
});
function copy_clipboard()
{
    if(!current_device || !current_device.ad) return;
    CLIPBOARD = current_device.ad;
    document.execCommand('copy');
}
function copy_pk_clipboard()
{
    if(!current_device || !current_device.pk) return;
    CLIPBOARD = current_device.pk;
    document.execCommand('copy');
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
{"sn":"4QR6SUSUJVGVCIBAEBDTIHQK74","is_fresh":false,"is_sealed":false,"is_v1":false,"ad":"1E8t4b3bSoVPGPW84D2i8pJs3ckK6fuRaH","ae":"c5adbafe8b3d","pk":"5KZ13kVzh9G8m7B6cS8QxQQ6E37wRwTgHAcoKEAPRe7vs1rxuXH","cert":"-----BEGIN CERTIFICATE-----\nXXXXXX-----END CERTIFICATE-----\n\r\n"};

    // OR pretend it's sealed...
    vars.is_sealed = true;

    // OR pretend it's brand new
    //vars.is_fresh = true;

    render_state(vars);
}

function reverify_btn()
{
    if(current_device) {
        start_verify(current_device);
    }
}


function go_explore()
{
    var addr = current_device.ad;
    var w = $('.js-which-bce').dropdown('get value').replace('ADDR', addr);
    console.log(w);

    window.open(w, 'opendime-bce');
}

$('select.dropdown').dropdown();
$('button.js-start-pick').click(pick_keys);
$('.js-reverify-btn').click(reverify_btn);
$('button.js-copy-clipboard').click(copy_clipboard);
$('button.js-copy-pk-clipboard').click(copy_pk_clipboard);
$('.js-version').text(chrome.runtime.getManifest().version);

$('.js-explore-btn').click(go_explore)

/* TODO:

- make topbar link work
- leftside pin line missing
- spinner + checking not perfect


*/
