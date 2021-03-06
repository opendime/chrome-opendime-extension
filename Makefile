TIME=$(shell date +%s)
export TIME

FILES = manifest.json main.html background.js chain.js code.js css font/ img/ libs/
export FILES

ifeq ($(version),)
VERSION = `python -c "import json; print(json.load(open('manifest.json'))['version'])"`
export VERSION
else
VERSION = `python$(version) -c "import json; print(json.load(open('manifest.json'))['version'])"`
export VERSION
endif

TARGET = opendime-extension-$(VERSION)-$(TIME).zip
export TARGET

help:
	@echo Select python version
	@echo Example:
	@echo version=2.7 make zip

zip:
	-rm -f $(TARGET)
	zip -r $(TARGET) $(FILES)
	open -R $(TARGET)
	@echo 
	@echo "Did you remember to bump the version number? ... " $(VERSION)

