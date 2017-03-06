//**************************************************************************************
/**
 * Making UTC date from local date
 * @param {Date} date Date to convert from
 * @returns {Date}
 */
export function getUTCDate(date)
{
	return new Date(date.getTime() + (date.getTimezoneOffset() * 60000));
}
//**************************************************************************************
/**
 * Get value for input parameters, or set a default value
 * @param {Object} parameters
 * @param {string} name
 * @param defaultValue
 */
export function getParametersValue(parameters, name, defaultValue)
{
	if((parameters instanceof Object) === false)
		return defaultValue;
	
	if(name in parameters)
		return parameters[name];
	
	return defaultValue;
}
//**************************************************************************************
/**
 * Converts "ArrayBuffer" into a hexdecimal string
 * @param {ArrayBuffer} inputBuffer
 * @param {number} [inputOffset=0]
 * @param {number} [inputLength=inputBuffer.byteLength]
 * @returns {string}
 */
export function bufferToHexCodes(inputBuffer, inputOffset = 0, inputLength = inputBuffer.byteLength)
{
	let result = "";
	
	for(const item of (new Uint8Array(inputBuffer, inputOffset, inputLength)))
	{
		const str = item.toString(16).toUpperCase();
		result = result + ((str.length === 1) ? "0" : "") + str;
	}
	
	return result;
}
//**************************************************************************************
/**
 * Check input "ArrayBuffer" for common functions
 * @param {LocalBaseBlock} baseBlock
 * @param {ArrayBuffer} inputBuffer
 * @param {number} inputOffset
 * @param {number} inputLength
 * @returns {boolean}
 */
export function checkBufferParams(baseBlock, inputBuffer, inputOffset, inputLength)
{
	if((inputBuffer instanceof ArrayBuffer) === false)
	{
		baseBlock.error = "Wrong parameter: inputBuffer must be \"ArrayBuffer\"";
		return false;
	}
	
	if(inputBuffer.byteLength === 0)
	{
		baseBlock.error = "Wrong parameter: inputBuffer has zero length";
		return false;
	}
	
	if(inputOffset < 0)
	{
		baseBlock.error = "Wrong parameter: inputOffset less than zero";
		return false;
	}
	
	if(inputLength < 0)
	{
		baseBlock.error = "Wrong parameter: inputLength less than zero";
		return false;
	}
	
	if((inputBuffer.byteLength - inputOffset - inputLength) < 0)
	{
		baseBlock.error = "End of input reached before message was fully decoded (inconsistent offset and length values)";
		return false;
	}
	
	return true;
}
//**************************************************************************************
/**
 * Convert number from 2^base to 2^10
 * @param {Uint8Array} inputBuffer
 * @param {number} inputBase
 * @returns {number}
 */
export function utilFromBase(inputBuffer, inputBase)
{
	let result = 0;
	
	for(let i = (inputBuffer.length - 1); i >= 0; i--)
		result += inputBuffer[(inputBuffer.length - 1) - i] * Math.pow(2, inputBase * i);
	
	return result;
}
//**************************************************************************************
/**
 * Convert number from 2^10 to 2^base
 * @param {!number} value The number to convert
 * @param {!number} base The base for 2^base
 * @param {number} [reserved=0] Pre-defined number of bytes in output array (-1 = limited by function itself)
 * @returns {ArrayBuffer}
 */
export function utilToBase(value, base, reserved = 0)
{
	const internalReserved = reserved || (-1);
	let internalValue = value;
	
	let result = 0;
	let biggest = Math.pow(2, base);
	
	for(let i = 1; i < 8; i++)
	{
		if(value < biggest)
		{
			let retBuf;
			
			if(internalReserved < 0)
			{
				retBuf = new ArrayBuffer(i);
				result = i;
			}
			else
			{
				if(internalReserved < i)
					return (new ArrayBuffer(0));
				
				retBuf = new ArrayBuffer(internalReserved);
				
				result = internalReserved;
			}
			
			const retView = new Uint8Array(retBuf);
			
			for(let j = (i - 1); j >= 0; j--)
			{
				const basis = Math.pow(2, j * base);
				
				retView[result - j - 1] = Math.floor(internalValue / basis);
				internalValue -= (retView[result - j - 1]) * basis;
			}
			
			return retBuf;
		}
		
		biggest *= Math.pow(2, base);
	}
	
	return new ArrayBuffer(0);
}
//**************************************************************************************
/**
 * Concatenate two ArrayBuffers
 * @param {...ArrayBuffer} buffers First ArrayBuffer (first part of concatenated array)
 */
export function utilConcatBuf(...buffers)
{
	//region Initial variables
	let outputLength = 0;
	let prevLength = 0;
	//endregion
	
	//region Calculate output length
	
	for(const buffer of buffers)
		outputLength += buffer.byteLength;
	//endregion
	
	const retBuf = new ArrayBuffer(outputLength);
	const retView = new Uint8Array(retBuf);
	
	for(const buffer of buffers)
	{
		retView.set(new Uint8Array(buffer), prevLength);
		prevLength += buffer.byteLength;
	}
	
	return retBuf;
}
//**************************************************************************************
/**
 * Decoding of "two complement" values
 * The function must be called in scope of instance of "hexBlock" class ("valueHex" and "warnings" properties must be present)
 * @returns {number}
 */
export function utilDecodeTC()
{
	const buf = new Uint8Array(this.valueHex);
	
	if(this.valueHex.byteLength >= 2)
	{
		//noinspection JSBitwiseOperatorUsage
		const condition1 = (buf[0] === 0xFF) && (buf[1] & 0x80);
		const condition2 = (buf[0] === 0x00) && ((buf[1] & 0x80) === 0x00);
		
		if(condition1 || condition2)
			this.warnings.push("Needlessly long format");
	}
	
	//region Create big part of the integer
	const bigIntBuffer = new ArrayBuffer(this.valueHex.byteLength);
	const bigIntView = new Uint8Array(bigIntBuffer);
	for(let i = 0; i < this.valueHex.byteLength; i++)
		bigIntView[i] = 0;
	
	bigIntView[0] = (buf[0] & 0x80); // mask only the biggest bit
	
	const bigInt = utilFromBase(bigIntView, 8);
	//endregion
	
	//region Create small part of the integer
	const smallIntBuffer = new ArrayBuffer(this.valueHex.byteLength);
	const smallIntView = new Uint8Array(smallIntBuffer);
	for(let j = 0; j < this.valueHex.byteLength; j++)
		smallIntView[j] = buf[j];
	
	smallIntView[0] &= 0x7F; // mask biggest bit
	
	const smallInt = utilFromBase(smallIntView, 8);
	//endregion
	
	return (smallInt - bigInt);
}
//**************************************************************************************
/**
 * Encode integer value to "two complement" format
 * @param {number} value Value to encode
 * @returns {ArrayBuffer}
 */
export function utilEncodeTC(value)
{
	const modValue = (value < 0) ? (value * (-1)) : value;
	let bigInt = 128;
	
	for(let i = 1; i < 8; i++)
	{
		if(modValue <= bigInt)
		{
			if(value < 0)
			{
				const smallInt = bigInt - modValue;
				
				const retBuf = utilToBase(smallInt, 8, i);
				const retView = new Uint8Array(retBuf);
				
				retView[0] |= 0x80;
				
				return retBuf;
			}
			
			let retBuf = utilToBase(modValue, 8, i);
			let retView = new Uint8Array(retBuf);
			
			//noinspection JSBitwiseOperatorUsage
			if(retView[0] & 0x80)
			{
				//noinspection JSCheckFunctionSignatures
				const tempBuf = retBuf.slice(0);
				const tempView = new Uint8Array(tempBuf);
				
				retBuf = new ArrayBuffer(retBuf.byteLength + 1);
				retView = new Uint8Array(retBuf);
				
				for(let k = 0; k < tempBuf.byteLength; k++)
					retView[k + 1] = tempView[k];
				
				retView[0] = 0x00;
			}
			
			return retBuf;
		}
		
		bigInt *= Math.pow(2, 8);
	}
	
	return (new ArrayBuffer(0));
}
//**************************************************************************************
/**
 * Compare two array buffers
 * @param {!ArrayBuffer} inputBuffer1
 * @param {!ArrayBuffer} inputBuffer2
 * @returns {boolean}
 */
export function isEqualBuffer(inputBuffer1, inputBuffer2)
{
	if(inputBuffer1.byteLength !== inputBuffer2.byteLength)
		return false;
	
	const view1 = new Uint8Array(inputBuffer1);
	const view2 = new Uint8Array(inputBuffer2);
	
	for(let i = 0; i < view1.length; i++)
	{
		if(view1[i] !== view2[i])
			return false;
	}
	
	return true;
}
//**************************************************************************************
/**
 * Pad input number with leade "0" if needed
 * @returns {string}
 * @param {number} inputNumber
 * @param {number} fullLength
 */
export function padNumber(inputNumber, fullLength)
{
	const str = inputNumber.toString(10);
	const dif = fullLength - str.length;
	
	const padding = new Array(dif);
	for(let i = 0; i < dif; i++)
		padding[i] = "0";
	
	const paddingString = padding.join("");
	
	return paddingString.concat(str);
}
//**************************************************************************************
const base64Template = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
const base64UrlTemplate = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_=";
//**************************************************************************************
/**
 * Encode string into BASE64 (or "base64url")
 * @param {string} input
 * @param {boolean} useUrlTemplate If "true" then output would be encoded using "base64url"
 * @param {boolean} skipPadding Skip BASE-64 padding or not
 * @param {boolean} skipLeadingZeros Skip leading zeros in input data or not
 * @returns {string}
 */
export function toBase64(input, useUrlTemplate = false, skipPadding = false, skipLeadingZeros = false)
{
	let i = 0;
	
	let flag1 = 0;
	let flag2 = 0;
	
	let output = "";
	
	const template = (useUrlTemplate) ? base64UrlTemplate : base64Template;
	
	if(skipLeadingZeros)
	{
		let nonZeroPosition = 0;
		
		for(let i = 0; i < input.length; i++)
		{
			if(input.charCodeAt(i) !== 0)
			{
				nonZeroPosition = i;
				break;
			}
		}
		
		input = input.slice(nonZeroPosition);
	}
	
	while(i < input.length)
	{
		const chr1 = input.charCodeAt(i++);
		if(i >= input.length)
			flag1 = 1;
		const chr2 = input.charCodeAt(i++);
		if(i >= input.length)
			flag2 = 1;
		const chr3 = input.charCodeAt(i++);
		
		const enc1 = chr1 >> 2;
		const enc2 = ((chr1 & 0x03) << 4) | (chr2 >> 4);
		let enc3 = ((chr2 & 0x0F) << 2) | (chr3 >> 6);
		let enc4 = chr3 & 0x3F;
		
		if(flag1 === 1)
			enc3 = enc4 = 64;
		else
		{
			if(flag2 === 1)
				enc4 = 64;
		}
		
		if(skipPadding)
		{
			if(enc3 === 64)
				output += `${template.charAt(enc1)}${template.charAt(enc2)}`;
			else
			{
				if(enc4 === 64)
					output += `${template.charAt(enc1)}${template.charAt(enc2)}${template.charAt(enc3)}`;
				else
					output += `${template.charAt(enc1)}${template.charAt(enc2)}${template.charAt(enc3)}${template.charAt(enc4)}`;
			}
		}
		else
			output += `${template.charAt(enc1)}${template.charAt(enc2)}${template.charAt(enc3)}${template.charAt(enc4)}`;
	}
	
	return output;
}
//**************************************************************************************
/**
 * Decode string from BASE64 (or "base64url")
 * @param {string} input
 * @param {boolean} [useUrlTemplate=false] If "true" then output would be encoded using "base64url"
 * @param {boolean} [cutTailZeros=false] If "true" then cut tailing zeroz from function result
 * @returns {string}
 */
export function fromBase64(input, useUrlTemplate = false, cutTailZeros = false)
{
	const template = (useUrlTemplate) ? base64UrlTemplate : base64Template;
	
	//region Aux functions
	function indexof(toSearch)
	{
		for(let i = 0; i < 64; i++)
		{
			if(template.charAt(i) === toSearch)
				return i;
		}
		
		return 64;
	}
	
	function test(incoming)
	{
		return ((incoming === 64) ? 0x00 : incoming);
	}
	//endregion
	
	let i = 0;
	
	let output = "";
	
	while(i < input.length)
	{
		const enc1 = indexof(input.charAt(i++));
		const enc2 = (i >= input.length) ? 0x00 : indexof(input.charAt(i++));
		const enc3 = (i >= input.length) ? 0x00 : indexof(input.charAt(i++));
		const enc4 = (i >= input.length) ? 0x00 : indexof(input.charAt(i++));
		
		const chr1 = (test(enc1) << 2) | (test(enc2) >> 4);
		const chr2 = ((test(enc2) & 0x0F) << 4) | (test(enc3) >> 2);
		const chr3 = ((test(enc3) & 0x03) << 6) | test(enc4);
		
		output += String.fromCharCode(chr1);
		
		if(enc3 !== 64)
			output += String.fromCharCode(chr2);
		
		if(enc4 !== 64)
			output += String.fromCharCode(chr3);
	}
	
	if(cutTailZeros)
	{
		const outputLength = output.length;
		let nonZeroStart = (-1);
		
		for(let i = (outputLength - 1); i >= 0; i--)
		{
			if(output.charCodeAt(i) !== 0)
			{
				nonZeroStart = i;
				break;
			}
		}
		
		if(nonZeroStart !== (-1))
			output = output.slice(0, nonZeroStart + 1);
	}
	
	return output;
}
//**************************************************************************************
export function arrayBufferToString(buffer)
{
	let resultString = "";
	const view = new Uint8Array(buffer);
	
	for(const element of view)
		resultString = resultString + String.fromCharCode(element);
	
	return resultString;
}
//**************************************************************************************
export function stringToArrayBuffer(str)
{
	const stringLength = str.length;
	
	const resultBuffer = new ArrayBuffer(stringLength);
	const resultView = new Uint8Array(resultBuffer);
	
	for(let i = 0; i < stringLength; i++)
		resultView[i] = str.charCodeAt(i);
	
	return resultBuffer;
}
//**************************************************************************************
const log2 = Math.log(2);
//**************************************************************************************
/**
 * Get nearest to input length power of 2
 * @param {number} length Current length of existing array
 * @returns {number}
 */
export function nearestPowerOf2(length)
{
	const base = (Math.log(length) / log2);
	
	const floor = Math.floor(base);
	const round = Math.round(base);
	
	return ((floor === round) ? floor : round);
}
//**************************************************************************************
//region GeneratorDriver's related functions
//**************************************************************************************
const isGenerator = generator =>
{
	if(typeof generator === "undefined")
		return false;
	
	return ((typeof generator.next === "function") && (typeof generator.throw === "function"));
};
//**************************************************************************************
const isGeneratorFunction = generator =>
{
	if(typeof generator === "undefined")
		return false;
	
	const constructor = generator.constructor;
	
	if(!constructor)
		return false;
	
	if((constructor.name === "GeneratorFunction") || (constructor.displayName === "GeneratorFunction"))
		return true;
	
	return isGenerator(generator);
};
//**************************************************************************************
/**
 * Simple "generator's driver" inspired by "https://github.com/tj/co".
 * @param {Generator|GeneratorFunction} generatorInstance
 * @returns {Promise}
 */
export function generatorsDriver(generatorInstance)
{
	//region Check that we do have instance of "Generator" as input
	if(!isGenerator(generatorInstance))
	{
		if(isGeneratorFunction(generatorInstance))
			generatorInstance = generatorInstance();
		else
			throw new Error("Only generator instance of generator function is a valid input");
	}
	//endregion
	
	return new Promise((resolve, reject) =>
	{
		/**
		 * Driver function called on "reject" status in Promises
		 * @param {*} error
		 * @returns {*}
		 */
		const onReject = error =>
		{
			let result;
			
			try
			{
				result = generatorInstance.throw(error);
			}
			catch(ex)
			{
				return reject(ex);
			}
			
			return callback(result);
		};
		
		/**
		 * Main driver function
		 * @param {*} [result]
		 * @returns {*}
		 */
		const callback = result =>
		{
			/**
			 * @type Object
			 * @property {boolean} done
			 * @property {*} value
			 */
			let generatorResult;
			
			try
			{
				generatorResult = generatorInstance.next(result);
			}
			catch(ex)
			{
				return reject(ex);
			}
			
			switch(true)
			{
				case (generatorResult.value instanceof Promise):
					return ((generatorResult.done) ? resolve(generatorResult.value) : generatorResult.value.then(callback, onReject));
				case isGeneratorFunction(generatorResult.value):
				case isGenerator(generatorResult.value):
					return ((generatorResult.done) ? generatorsDriver(generatorResult.value).then(driverResult =>
						{
							resolve(driverResult);
						}, onReject) : generatorsDriver(generatorResult.value).then(callback, onReject));
				case (typeof generatorResult.value === "function"):
					generatorResult.value = generatorResult.value();
				default:
					return (generatorResult.done) ? resolve(generatorResult.value) : callback(generatorResult.value);
			}
		};
		
		callback();
	});
}
//**************************************************************************************
//endregion
//**************************************************************************************
