'use strict';

/*
    Binary message for communication between "Base <-> Server"

    [ALL_LENGTH] {[RANDOM_IV] [MESSAGE_LENGTH]  [HEADER] [TX_SENDER] [DATA] [padding when needed] [CMAC]} for encrypted, or:
                              [MESSAGE_LENGTH] {[HEADER] [TX_SENDER] [DATA]} for raw unencrypted data

    CMAC is calculated over entire cipertext: Encrypt-then-MAC.

    Encrypted is:
    [RANDOM IV] + [MESSAGE_LEN] + [HEADER] + [TX_SENDER] + [DATA] + [padding when needed]
*/

var crypto = require('crypto');

var HEADER_SYNC = 0x01; // if other side should sync to 0?
var HEADER_ACK = 0x02; // this packet IS ack
var HEADER_PROCESSED = 0x04; // this packet is processed on the other side (not ignored because ID is the same as the previous one received)
var HEADER_OUT_OF_SYNC = 0x08; // if the originator of this package is out of sync?
var HEADER_NOTIFICATION = 0x10; // is notification required with this message (only used if this is not an ACK)
var HEADER_SYSTEM_MESSAGE = 0x20; // is this a system message? (not to be forwarded to Client, or sending a system message to Base)
var HEADER_BACKOFF = 0x40; // if receiver can't buffer anymore data (including the data he is acknowledging to) from sender, he will acknowledge with this bit set

function baseMessage() {
    this.binaryPackage = null;

    this.header = 0;
    this.TXsender = 0;
    this.data = new Buffer(0);

    this.isExtracted = false;
    this.isCmacValid = false;
}

baseMessage.prototype.extractFrom = function (binaryPackage) {
    this.isExtracted = false;

    if (!binaryPackage) {
        return;
    }

    this.binaryPackage = binaryPackage;

    if (binaryPackage.length < 2) {
        return;
    }

    var packageLength = binaryPackage.readUInt16LE(0);

    if (binaryPackage.length < (packageLength + 2)) {
        return;
    }

    this.isExtracted = true;
};

baseMessage.prototype.unpack = function (aes128Key) {
	// unpacking encrypted message?
	if(aes128Key != null) {

		// minimum encrypted data we should receive is: length (2 bytes) + original encrypted message (at least 32 bytes) + cmac (16 bytes) = 50 bytes
		if (this.binaryPackage.length < 50) {
			console.log('Warning in baseMessage.unpack(), incomplete encrypted binary package (got ',this.binaryPackage.length,'/minimum 50)!');
			return;
		}

        // [LENGTH] {[RANDOM_IV] [MESSAGE_LENGTH]  [HEADER] [TX_SENDER] [DATA] [padding when needed] [CMAC]} for encrypted, or:
		// [LENGTH] contains length of binary stream RandomIV+MsgLength+Header+TXsender+Data+PaddingWhenNeeded+Cmac
		// [CMAC] is the last 16 bytes of the binaryPackage

		var len = this.binaryPackage.readUInt16LE(0);
		var cmac = new Buffer(16);
		this.binaryPackage.copy(cmac, 0, this.binaryPackage.length-16);
		var msg = new Buffer(len - 16); // message is surrounded by 2 bytes of LENGTH and 16 bytes of CMAC
		this.binaryPackage.copy(msg, 0, 2);

		// Validate CMAC first: TODO
		this.isCmacValid = true; // for now lets not validate it
		/*
			encrypted message is in: msg
			key is in: aes128Key
			expected CMAC is in: cmac
		*/
		if(!this.isCmacValid) {
			console.log('Warning in baseMessage.unpack(), CMAC not valid!');
			return;
		}

		// Decrypt
        var decipher = crypto.createDecipheriv('aes-128-cbc', aes128Key, new Buffer([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]));
		decipher.setAutoPadding(false);
		var decrypted = decipher.update(msg, 'hex', 'hex'); //.final('hex') not required?

        // we must discard fist 16 bytes of random IV from the decrypted message
        new Buffer(decrypted, 'hex').copy(this.binaryPackage, 0, 16);
	}

    if (this.binaryPackage.length < 7) {
        console.log('Warning in baseMessage.unpack(), incomplete binary package (got ',this.binaryPackage.length,'/minimum 7)!');
        return;
    }

	// Unpack. Now in binaryPackage we have:
    //[MESSAGE_LENGTH] {[HEADER] [TX_SENDER] [DATA] [padding when required]}

    // How many bytes follow in this message? Note: there is a posibillity that
    // there is a padding that we need to discard, so this msgLength is very important.
	var msgLength = this.binaryPackage.readUInt16LE(0);
    if (this.binaryPackage.length < (msgLength + 2)) {
        console.log('Warning in baseMessage.unpack(), erroneous unencrypted binary package. Not enough data to unpack!');
        return;
    }
    this.header = this.binaryPackage.readUInt8(2);
    this.TXsender = this.binaryPackage.readInt32LE(3);

    // has data?
    if (msgLength > 5) {
        this.data = new Buffer(msgLength - 5);
        this.binaryPackage.copy(this.data, 0, 2+1+4, msgLength+1+4); // discard data padding here
    }
}

// getters
baseMessage.prototype.getIsCmacValid = function () {
	return this.isCmacValid;
}

baseMessage.prototype.getBinaryPackage = function () {
    return this.binaryPackage;
};

baseMessage.prototype.getHeader = function () {
    return this.header;
};

baseMessage.prototype.getTXsender = function () {
    return this.TXsender;
};

baseMessage.prototype.getIsExtracted = function () {
    return this.isExtracted;
};

baseMessage.prototype.getData = function () {
    return this.data;
};

/*
// TEST
var ke = new Buffer([0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa]);
var bp = new baseMessage();
bp.extractFrom(new Buffer([
    //6, 0, 150, 0x3,0,0,0, 0xAA

    0x40, 0x00,

    0xcc, 0x4f, 0x9e, 0x20, 0xd1, 0x39, 0x54, 0xdb, 0x5e, 0x74, 0x40, 0x7d, 0x9e, 0x52, 0x35, 0x9d,
    0x82, 0x63, 0xcf, 0x53, 0x8a, 0x0b, 0x6d, 0x8d, 0x8b, 0xa9, 0x2e, 0x8e, 0xde, 0xb3, 0x61, 0xad,
    0x8e, 0xb9, 0x46, 0xcc, 0x19, 0x68, 0xfa, 0x33, 0x6e, 0xff, 0x36, 0x5a, 0x0a, 0x23, 0x1a, 0x08,

    0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 0xCC
]));
bp.unpack(ke);
console.log(bp.getHeader());
console.log(bp.getTXsender());
console.log(bp.getData());
//--
*/

baseMessage.prototype.getIsAck = function () {
    return ((this.header & HEADER_ACK) > 0);
};

baseMessage.prototype.getIsSystemMessage = function () {
    return ((this.header & HEADER_SYSTEM_MESSAGE) > 0);
};

baseMessage.prototype.getBackoff = function () {
    return ((this.header & HEADER_BACKOFF) > 0);
};

baseMessage.prototype.getIsNotification = function () {
    return ((this.header & HEADER_NOTIFICATION) > 0);
};

baseMessage.prototype.getHasSync = function () {
    return ((this.header & HEADER_SYNC) > 0);
};

baseMessage.prototype.getOutOfSync = function () {
    return ((this.header & HEADER_OUT_OF_SYNC) > 0);
};

baseMessage.prototype.getIsProcessed = function () {
    return ((this.header & HEADER_PROCESSED) > 0);
};

// setters
baseMessage.prototype.setHeader = function (header) {
    this.header = header;
};

baseMessage.prototype.setIsAck = function (is) {
    if (is) {
        this.header = this.header | HEADER_ACK;
    }
    else {
        this.header = this.header & ~(HEADER_ACK);
    }
};

baseMessage.prototype.setIsSystemMessage = function (is) {
    if (is) {
        this.header = this.header | HEADER_SYSTEM_MESSAGE;
    }
    else {
        this.header = this.header & ~(HEADER_SYSTEM_MESSAGE);
    }
};

baseMessage.prototype.setBackoff = function (is) {
    if (is) {
        this.header = this.header | HEADER_BACKOFF;
    }
    else {
        this.header = this.header & ~(HEADER_BACKOFF);
    }
};

baseMessage.prototype.setIsNotification = function (is) {
    if (is) {
        this.header = this.header | HEADER_NOTIFICATION;
    }
    else {
        this.header = this.header & ~(HEADER_NOTIFICATION);
    }
};

baseMessage.prototype.setHasSync = function (is) {
    if (is) {
        this.header = this.header | HEADER_SYNC;
    }
    else {
        this.header = this.header & ~(HEADER_SYNC);
    }
};

baseMessage.prototype.setOutOfSync = function (is) {
    if (is) {
        this.header = this.header | HEADER_OUT_OF_SYNC;
    }
    else {
        this.header = this.header & ~(HEADER_OUT_OF_SYNC);
    }
};

baseMessage.prototype.setIsProcessed = function (processed) {
    if (processed) {
        this.header = this.header | HEADER_PROCESSED;
    }
    else {
        this.header = this.header & ~(HEADER_PROCESSED);
    }
};

baseMessage.prototype.setTXsender = function (TXsender) {
    this.TXsender = TXsender;
};

baseMessage.prototype.clearData = function () {
    this.data = new Buffer(0);
};

baseMessage.prototype.appendData = function (dataValue) {
    this.data = Buffer.concat([this.data, dataValue]);
};

baseMessage.prototype.setData = function (dataValue) {
    this.data = new Buffer(dataValue, 'hex'); // added: ", 'hex'" on 30/11/2014
};

baseMessage.prototype.buildPackage = function (aes128Key, random16bytes) {
    /*
    [LENGTH] {[RANDOM_IV] [MESSAGE_LENGTH]  [HEADER] [TX_SENDER] [DATA] [padding when needed] [CMAC]} for encrypted, or:
                          [MESSAGE_LENGTH] {[HEADER] [TX_SENDER] [DATA]} for raw unencrypted data
    */

    var header = new Buffer(1);
    header.writeUInt8(this.header, 0);

    var TXsender = new Buffer(4);
    TXsender.writeUInt32LE(this.TXsender, 0);

    var htx = Buffer.concat([header, TXsender]);

    if (this.data.length > 0) {
        htx = Buffer.concat([htx, this.data]);
    }

    var messageLength = new Buffer(2);
    messageLength.writeUInt16LE(htx.length, 0);

    var userPayload = new Buffer.concat([messageLength, htx]);

    if(!aes128Key || aes128Key == null) {
		if (userPayload.length > (65535)) {
			console.log('Error in baseMessage.buildPackage(), data to long, can not fit!');
			return null;
		}

        this.binaryPackage = new Buffer.concat([userPayload]); // we might need it in this.binaryPackage...
        return userPayload;
    }

    var randomIv = random16bytes; // we will use provided 16 bytes as randomness
    if(!random16bytes || random16bytes == null) {
		var randomIv = crypto.randomBytes(16); // THIS IS SLOW. Even though it might be the best way to go, we shouldn't slow things down.
	}

    var toEncrypt = new Buffer.concat([randomIv, userPayload]);

    // add padding if required
    if(toEncrypt.length % 16) {
        var addThisMuch = 16 - (toEncrypt.length % 16);
        var appendStuff = new Buffer(addThisMuch);
        randomIv.copy(appendStuff, 0, 0, addThisMuch);

        var toEncrypt = new Buffer.concat([toEncrypt, appendStuff]);
    }

	var cipher = crypto.createCipheriv('aes-128-cbc', aes128Key, new Buffer([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]));
	cipher.setAutoPadding(false);
	var encrypted = cipher.update(toEncrypt, 'hex', 'hex'); // .final('hex') not required?

	var cmac = new Buffer(16);
	// TODO: Calculate CMAC over "encrypted" now and put into "cmac"

	var toSend = new Buffer.concat([new Buffer(encrypted,'hex'), cmac]);

    var allLength = new Buffer(2);
    allLength.writeUInt16LE(toSend.length, 0);

	if (toSend.length > (65535-2)) {
		console.log('Error in baseMessage.buildPackage(), data to long, can not fit!');
		return null;
	}

	return new Buffer.concat([allLength, toSend]);
};

/*
// TEST 2
var ke = new Buffer([0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa]);
var bp = new baseMessage();
bp.setHeader(150);
bp.setTXsender(3);
bp.setData(new Buffer([0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xbb, 0xff]));
var xxx = bp.buildPackage(ke, new Buffer([12,0,45,45,45,45,45,45,45,45,45,45,45,4,5,6,7,8,8,9,0]));
console.log(xxx);
//--
*/

module.exports = baseMessage;
