'use strict';

var crypto = require('crypto');

/*
    Binary message for communication between "Base <-> Server"
    	    <MESSAGE_LEN_2bytes><HEADER_1byte><TX_of_whoever_sends_4bytes><DATA> for raw, or:
    <LENGTH><MESSAGE_LEN_2bytes><HEADER_1byte><TX_of_whoever_sends_4bytes><DATA><optional:DATA_PADDING><CMAC> for encrypted
*/

var HEADER_SYNC = 0x01; // should other side sync to 0?
var HEADER_ACK = 0x02; // this packet IS ack
var HEADER_PROCESSED = 0x04; // this packet is processed on the other side (not ignored because ID is the same as the previous one received)
var HEADER_OUT_OF_SYNC = 0x08; // if the originator of this package is out of sync?
var HEADER_NOTIFICATION = 0x10; // is notification required with this message (only used if this is not an ACK)
var HEADER_SYSTEM_MESSAGE = 0x20; // is this a system message? (not to be forwarded to Client, or sending a system message to Base)
var HEADER_BACKOFF = 0x40; // if receiver can't buffer anymore data (including the data he is acknowledging to) from sender, he will acknowledge with this bit set

function baseMessage() {
    this.binaryPackage = null;

    this.header = null;
    this.TXsender = null;
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

    var packageLength = binaryPackage.readUInt16BE(0);

    if (binaryPackage.length < (packageLength + 2)) {
        return;
    }

    this.isExtracted = true;
};

/*
baseMessage.prototype.unpackRaw = function () {
    // minimum length of entire package is <MSG_LEN_2bytes>+<HEADER_1byte>+<TX_of_whoever_sends_4bytes> = 7 bytes
    if (this.binaryPackage.length < 7) {
        console.log('Warning in baseMessage(), attempt to unpackRaw from incomplete binary package.');
        return;
    }

	//[MSG_LENGTH] [HEADER] [TXSENDER] [optional:DATA]
	//[MSG_LENGTH] contains length of Header+TXsender+Data

	var msgLength = this.binaryPackage.readUInt16BE(0);
    this.header = this.binaryPackage.readUInt8(2);
    this.TXsender = new Buffer(4);
    this.binaryPackage.copy(this.TXsender, 0, 3, 7);

    // has data?
    if (binaryPackage.length > 7) {
        this.data = new Buffer(packageLength - 5);
        binaryPackage.copy(this.data, 0, 7, msgLength-7);
    }
}
*/

baseMessage.prototype.unpack = function (aes128Key) {
	// unpacking encrypted message?
	if(aes128Key != null) {

		// minimum length of entire package is <LENGTH_2bytes>+<MSG_LEN_2bytes>+<HEADER_1byte>+<TX_of_whoever_sends_4bytes>+<optional:DATA_0bytes>+<CMAC_16bytes> = 25 bytes
		if (this.binaryPackage.length < 25) {
			console.log('Warning in baseMessage.unpackEncrypted(), incomplete binary package (got ',this.binaryPackage.length,'/25)!');
			return;
		}

		//[LENGTH] [MSG_LENGTH] [HEADER] [TXSENDER] [optional:DATA] [when-required:PADDING_TO_16_MODULO] [CMAC]
		//[LENGTH] contains length of MsgLength+Header+TXsender+Data+Padding+Cmac
		//[MSG_LENGTH] contains length of Header+TXsender+Data so that we can extract all three parts
		//[CMAC] is the last 16 bytes of the binaryPackage

		var len = this.binaryPackage.readUInt16BE(0);
		var cmac = new Buffer(16);
		this.binaryPackage.copy(cmac, 0, this.binaryPackage.length-16);
		var msg = new Buffer(len - 16); // message is surrounded by 2 bytes of LENGTH and 16 bytes of CMAC
		this.binaryPackage.copy(msg, 0, 2);

		console.log('len:', len);
		console.log('msg:', msg);
		console.log('binaryPackage:', this.binaryPackage);
		console.log('cmac:', cmac);
		return;

		// Validate CMAC first: TODO
		this.isCmacValid = true; // for now lets not validate it
		/*
			encrypted message to is in: msg
			key is in: aes128Key
			expected CMAC is in: cmac
		*/
		if(!this.isCmacValid) {
			console.log('Warning in baseMessage.unpackEncrypted(), CMAC not valid!');
			return;
		}

		// Decrypt
		var decipher = crypto.createDecipheriv('aes-128-cbc', pass, iv);
		decipher.setAutoPadding(false);
		var decrypted = decipher.update(msg, 'hex', 'hex'); //.final('hex') not required!
		//new Buffer(decrypted, 'hex');
	}

	// Unpack
	var msgLength = this.binaryPackage.readUInt16BE(2);
    this.header = this.binaryPackage.readUInt8(4);
    this.TXsender = new Buffer(4);
    this.binaryPackage.copy(this.TXsender, 0, 5, 9);

    // has data?
    if (msgLength.length > 5) {
        this.data = new Buffer(msgLength - 7);
        binaryPackage.copy(this.data, 0, 9, msgLength);
    }
}


// TEST
var ke = new Buffer([0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa]);
var bp = new baseMessage();
bp.extractFrom(new Buffer([
0x00, 0x20,

0x00, 0x10, 0xBB, 0x12, 0x34, 0x56, 0x78, 0xBA, 0xBA, 0xBA, 0xBA, 0xBA, 0xBA, 0xBA, 0xBA, 0xBA,

0xCC, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa ]));
bp.unpack(ke);
//--


// getters
baseMessage.prototype.isCmacValid = function () {
	return this.isCmacValid;
}

baseMessage.prototype.getBinaryPackage = function () {
    return this.binaryPackage;
};

baseMessage.prototype.getIsExtracted = function () {
    return this.isExtracted;
};

baseMessage.prototype.getHeader = function () {
    return this.header;
};

baseMessage.prototype.getTXsender = function () {
    if (this.TXsender === null) {
        return new Buffer(4);
    }

    return this.TXsender;
};

baseMessage.prototype.getData = function () {
    return this.data;
};

baseMessage.prototype.getIsAck = function () {
    if (this.header === null) {
        return false;
    }

    return ((this.header & HEADER_ACK) > 0);
};

baseMessage.prototype.getIsSystemMessage = function () {
    if (this.header === null) {
        return false;
    }

    return ((this.header & HEADER_SYSTEM_MESSAGE) > 0);
};

baseMessage.prototype.getBackoff = function () {
    if (this.header === null) {
        return false;
    }

    return ((this.header & HEADER_BACKOFF) > 0);
};

baseMessage.prototype.getIsNotification = function () {
    if (this.header === null) {
        return false;
    }

    return ((this.header & HEADER_NOTIFICATION) > 0);
};

baseMessage.prototype.getHasSync = function () {
    if (this.header === null) {
        return false;
    }

    return ((this.header & HEADER_SYNC) > 0);
};

baseMessage.prototype.getOutOfSync = function () {
    if (this.header === null) {
        return false;
    }

    return ((this.header & HEADER_OUT_OF_SYNC) > 0);
};

baseMessage.prototype.getIsProcessed = function () {
    if (this.header === null) {
        return false;
    }

    return ((this.header & HEADER_PROCESSED) > 0);
};

// setters
baseMessage.prototype.setHeader = function (headerValue) {
    if (this.header === null) {
        this.header = 0;
    }

    this.header = headerValue;
};

baseMessage.prototype.setIsAck = function (is) {
    if (this.header === null) {
        this.header = 0;
    }

    if (is) {
        this.header = this.header | HEADER_ACK;
    }
    else {
        this.header = this.header & ~(HEADER_ACK);
    }
};

baseMessage.prototype.setIsSystemMessage = function (is) {
    if (this.header === null) {
        this.header = 0;
    }

    if (is) {
        this.header = this.header | HEADER_SYSTEM_MESSAGE;
    }
    else {
        this.header = this.header & ~(HEADER_SYSTEM_MESSAGE);
    }
};

baseMessage.prototype.setBackoff = function (is) {
    if (this.header === null) {
        this.header = 0;
    }

    if (is) {
        this.header = this.header | HEADER_BACKOFF;
    }
    else {
        this.header = this.header & ~(HEADER_BACKOFF);
    }
};

baseMessage.prototype.setIsNotification = function (is) {
    if (this.header === null) {
        this.header = 0;
    }

    if (is) {
        this.header = this.header | HEADER_NOTIFICATION;
    }
    else {
        this.header = this.header & ~(HEADER_NOTIFICATION);
    }
};

baseMessage.prototype.setHasSync = function (is) {
    if (this.header === null) {
        this.header = 0;
    }

    if (is) {
        this.header = this.header | HEADER_SYNC;
    }
    else {
        this.header = this.header & ~(HEADER_SYNC);
    }
};

baseMessage.prototype.setOutOfSync = function (is) {
    if (this.header === null) {
        this.header = 0;
    }

    if (is) {
        this.header = this.header | HEADER_OUT_OF_SYNC;
    }
    else {
        this.header = this.header & ~(HEADER_OUT_OF_SYNC);
    }
};

baseMessage.prototype.setIsProcessed = function (processed) {
    if (this.header === null) {
        this.header = 0;
    }

    if (processed) {
        this.header = this.header | HEADER_PROCESSED;
    }
    else {
        this.header = this.header & ~(HEADER_PROCESSED);
    }
};

baseMessage.prototype.setTXsender = function (TXsender) {
    this.TXsender = new Buffer(4);
    TXsender.copy(this.TXsender, 0, 0, 4);
};

baseMessage.prototype.clearData = function () {
    this.data = new Buffer(0);
};

baseMessage.prototype.appendData = function (dataValue) {
    this.data = Buffer.concat([this.data, dataValue]);
};

baseMessage.prototype.setData = function (dataValue) {
    this.data = new Buffer(dataValue, 'hex'); // added: ", 'hex'" 30/11/2014
};

baseMessage.prototype.buildPackage = function () {
    if (this.data.length > (65535 - 5)) {
        console.log('Error in baseMessage.buildPackage(), command to long - can not fit!');
        return null;
    }

    if (this.TXsender === null) {
        this.TXsender = new Buffer([0, 0, 0, 0]);
    }
    if (this.header === null) {
        this.header = 0x00;
    }

    var bh = new Buffer(1);
    bh.writeUInt8(this.header, 0);

    var l2 = Buffer.concat([bh, this.TXsender]);

    if (this.data.length !== 0) {
        l2 = Buffer.concat([l2, this.data]);
    }

    var l2Length = new Buffer(2);
    l2Length.writeInt16BE(l2.length, 0);

    return new Buffer.concat([l2Length, l2]);
};

module.exports = baseMessage;
