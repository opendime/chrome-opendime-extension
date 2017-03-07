# Makefile to capture the parts of bitcoinjs-lib that we need and
# browser-ify them.
#
# You'll probably need to do this first:
#
#   npm install -g browserify
#

update:
	browserify index.js --standalone BTC | sed -e s'/global.localStorage/false/' > ../libs/btc.js

once:
	npm install bs58 bitcoinjs-lib ecurve bigi buffer
