#
# Make the file needed for chrome web store... just type "make"
#

FILES = manifest.json main.html background.js chain.js code.js css font/ img/ libs/
VERSION = `python2 -c "import json; print(json.load(open('manifest.json'))['version'])"`
TARGET = opendime-extension-$(VERSION).zip

zip:
	-rm -f $(TARGET)
	zip -r $(TARGET) $(FILES)
	open -R $(TARGET)
	@echo 
	@echo "Did you remember to bump the version number? ... " $(VERSION)

