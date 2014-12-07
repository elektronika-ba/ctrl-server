'use strict';

/*
    Binary message for communication between "Base <-> Server"
    Also contains implementation of CBC-MAC (CMAC).

    [ALL_LENGTH] { [RANDOM_IV] [MESSAGE_LENGTH] [HEADER] [TX_SENDER] [DATA] [padding when needed] } [CMAC]

    Everything between "{" and "}" is encrypted.
    CMAC is calculated over entire cipertext: Encrypt-then-MAC.
*/

var crypto = require('crypto');

var HEADER_SYNC = 0x01; // if other side should sync to 0?
var HEADER_ACK = 0x02; // this packet IS ack
var HEADER_PROCESSED = 0x04; // this packet is processed on the other side (not ignored because ID is the same as the previous one received)
var HEADER_OUT_OF_SYNC = 0x08; // if the originator of this package is out of sync?
var HEADER_NOTIFICATION = 0x10; // is notification required with this message (only used if this is not an ACK)
var HEADER_SYSTEM_MESSAGE = 0x20; // is this a system message? (not to be forwarded to Client, or sending a system message to Base)
var HEADER_BACKOFF = 0x40; // if receiver can't buffer anymore data (including the data he is acknowledging to) from sender, he will acknowledge with this bit set
var HEADER_SAVE_TXSERVER = 0x80; // when Base sends an ACK to Server, and if this bit is set, then Server will accept 4-byte payload of that ACK and save it to Base's DB as TXserver (server-side-stored TXserver feature)

function baseMessage() {
    this.binaryPackage = null;

    this.header = 0;
    this.TXsender = 0;
    this.data = new Buffer(0);

    this.isExtracted = false;
}

// getters
baseMessage.prototype.getBinaryPackageLength = function () {
    return this.binaryPackage.length;
};

baseMessage.prototype.getBinaryPackage = function () {
    return this.binaryPackage;
};

baseMessage.prototype.getHeader = function () {
    return this.header;
};

baseMessage.prototype.getTXsender = function () {
    return this.TXsender;
};

baseMessage.prototype.getData = function () {
    return this.data;
};

baseMessage.prototype.getIsExtracted = function () {
    return this.isExtracted;
};

baseMessage.prototype.getIsAck = function () {
    return ((this.header & HEADER_ACK) > 0);
};

baseMessage.prototype.getIsSystemMessage = function () {
    return ((this.header & HEADER_SYSTEM_MESSAGE) > 0);
};

baseMessage.prototype.getIsBackoff = function () {
    return ((this.header & HEADER_BACKOFF) > 0);
};

baseMessage.prototype.getIsNotification = function () {
    return ((this.header & HEADER_NOTIFICATION) > 0);
};

baseMessage.prototype.getIsSync = function () {
    return ((this.header & HEADER_SYNC) > 0);
};

baseMessage.prototype.getIsOutOfSync = function () {
    return ((this.header & HEADER_OUT_OF_SYNC) > 0);
};

baseMessage.prototype.getIsProcessed = function () {
    return ((this.header & HEADER_PROCESSED) > 0);
};

baseMessage.prototype.getIsSaveTXserver = function () {
    return ((this.header & HEADER_SAVE_TXSERVER) > 0);
};

// setters
baseMessage.prototype.setHeader = function (header) {
    this.header = header;
};

baseMessage.prototype.setTXsender = function (TXsender) {
    this.TXsender = TXsender;
};

baseMessage.prototype.setDataFromHexString = function (dataValue) {
    this.data = new Buffer(dataValue, 'hex'); // added: ", 'hex'" on 30/11/2014
};

baseMessage.prototype.setData = function (dataBuff) {
    this.data = dataBuff;
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

baseMessage.prototype.setIsBackoff = function (is) {
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

baseMessage.prototype.setIsSync = function (is) {
    if (is) {
        this.header = this.header | HEADER_SYNC;
    }
    else {
        this.header = this.header & ~(HEADER_SYNC);
    }
};

baseMessage.prototype.setIsOutOfSync = function (is) {
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

baseMessage.prototype.setIsSaveTXserver = function (processed) {
    if (processed) {
        this.header = this.header | HEADER_SAVE_TXSERVER;
    }
    else {
        this.header = this.header & ~(HEADER_SAVE_TXSERVER);
    }
};

// this extracts binary stream from both encrypted or unencrypted message
// as the format is the same (first two bytes are the binary stream length)
baseMessage.prototype.extractFrom = function (binaryPackage) {
    if (!binaryPackage) {
        return false;
    }

    this.binaryPackage = binaryPackage;

    if (binaryPackage.length < 2) {
        return false;
    }

    var packageLength = binaryPackage.readUInt16LE(0);

    if (binaryPackage.length < (packageLength + 2)) {
        return false;
    }

    this.isExtracted = true;

    return this.isExtracted;
};

// this unpacks unencrypted message from this.binaryPackage
// returns true on OK, or false on Error
baseMessage.prototype.unpackAsPlainMessage = function () {
    // How many usable bytes follow in this message? Note: there is a posibillity that
    // there is a padding which we need to discard, so this msgLength is important
    var msgLength = this.binaryPackage.readUInt16LE(0);
    if (this.binaryPackage.length < (msgLength + 2)) {
        console.log('Warning in baseMessage.unpack(), erroneous unencrypted binary package. Not enough data to unpack!');
        return false;
    }
    this.header = this.binaryPackage.readUInt8(2);
    this.TXsender = this.binaryPackage.readUInt32LE(3);

    // Finally extract the data if there is any
    if (msgLength > 5) {
        this.data = new Buffer(msgLength - 5);
        this.binaryPackage.copy(this.data, 0, 2 + 1 + 4, msgLength + 1 + 4); // discard data padding here
    }

    // debug
    /*console.log('msg_length:', msgLength);
    console.log('header:', this.header);
    console.log('TXsender:', this.TXsender);
    console.log('data:', this.data);*/
    //--

    return true;
};

// this unpacks the encrypted message from this.binaryPackage
// returns true on OK, or false on Error
baseMessage.prototype.unpackAsEncryptedMessage = function (aes128Key) {
    // minimum encrypted data we should receive is: length (2 bytes) + original encrypted message (at least 32 bytes) + cmac (16 bytes) = 50 bytes
    if (this.binaryPackage.length < 50) {
        console.log('Warning in baseMessage.unpack(), incomplete encrypted binary package (got', this.binaryPackage.length, '/minimum 50)!');
        return false;
    }

	// it also needs to be in 16 byte blocks, plus 2 bytes at the beginning
    if ((this.binaryPackage.length - 2) % 16) {
        console.log('Warning in baseMessage.unpack(), encrypted binary package not in 16 byte blocks (got', this.binaryPackage.length, ')!');
        console.log('Warning in baseMessage.unpack(), here it is:', this.binaryPackage.toString('hex'));
        return false;
    }

    // Get the size of this packet which we received
    var allLength = this.binaryPackage.readUInt16LE(0);

    // Extract CMAC from the end (last 16 bytes)
    var cmac = new Buffer(16);
    this.binaryPackage.copy(cmac, 0, this.binaryPackage.length - 16);

    // Extract encrypted message which is surrounded by 2 bytes of LENGTH and 16 bytes of CMAC
    var encryptedMessage = new Buffer(allLength - 16);
    this.binaryPackage.copy(encryptedMessage, 0, 2);

    /*// debug
    console.log('aes128Key:', aes128Key.toString('hex'));
    console.log('binaryPackage:', this.binaryPackage.toString('hex'));
    console.log('allLength:', allLength);
    console.log('encryptedMessage:', encryptedMessage.toString('hex'));
    console.log('cmac:', cmac.toString('hex'));
    //--*/

    // Validate CMAC first
    var cmacCalculated = this.calcCMAC(encryptedMessage, aes128Key);

	//debug
    //console.log('calculated cmac:', cmacCalculated.toString('hex'));
    //--

	if( cmac.toString('hex') != cmacCalculated.toString('hex') ) {
		//console.log('Warning in baseMessage.unpack(), CMAC not valid!');
        return false;
    }

    // Finally decrypt the message
    var decipher = crypto.createDecipheriv('aes-128-cbc', aes128Key, new Buffer([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    decipher.setAutoPadding(false);
    var decrypted = decipher.update(encryptedMessage, '', ''); //.final('hex') not required?

    // debug
    //console.log('decrypted received message w/IV:', decrypted);
    //--

    // We must discard fist 16 bytes of random IV from the decrypted message
    this.binaryPackage = new Buffer(decrypted.length - 16);
    decrypted.copy(this.binaryPackage, 0, 16);

    // debug
    //console.log('decrypted received message wo/IV:', this.binaryPackage.toString('hex'));
    //--

    // Now in binaryPackage we have [MESSAGE_LENGTH] [HEADER] [TX_SENDER] [DATA] [padding when needed]

    // Finally unpack the message into appropriate data-fields
    return this.unpackAsPlainMessage(); // true if everything went OK, false if something is wrong

    /*
    // How many usable bytes follow in this message? Note: there is a posibillity that
    // there is a padding which we need to discard, so this msgLength is important
    var msgLength = this.binaryPackage.readUInt16LE(0);
    if (this.binaryPackage.length < (msgLength + 2)) {
        console.log('Warning in baseMessage.unpack(), erroneous unencrypted binary package. Not enough data to unpack!');
        return;
    }
    this.header = this.binaryPackage.readUInt8(2);
    this.TXsender = this.binaryPackage.readUInt32LE(3);

    // Finally extract the data if there is any
    if (msgLength > 5) {
        this.data = new Buffer(msgLength - 5);
        this.binaryPackage.copy(this.data, 0, 2 + 1 + 4, msgLength + 1 + 4); // discard data padding here
    }
    */
}

// this builds and returns message part without random IV, padding and encryption stuff
// returns built message on success or empty buffer on error
baseMessage.prototype.buildPlainMessage = function () {
    // [MESSAGE_LENGTH] [HEADER] [TX_SENDER] [DATA]

    var header = new Buffer(1);
    header.writeUInt8(this.header, 0);

    var TXsender = new Buffer(4);
    TXsender.writeUInt32LE(this.TXsender, 0);

    var message = new Buffer.concat([header, TXsender]);

    // debug
    //console.log('buildPlainMessage().message:', message.toString('hex'));
    //--

    if (this.data.length > 0) {
        message = new Buffer.concat([message, this.data]);

		// debug
		//console.log('buildPlainMessage() added data, because this.data.length is > 0:', this.data.length);
		//--
    }

	// debug
    //console.log('buildPlainMessage().message+data:', message.toString('hex'));
	//--

    var messageLength = new Buffer(2);
    messageLength.writeUInt16LE(message.length, 0);

    message = new Buffer.concat([messageLength, message]);

    if (message.length > 65535) {
        console.log('Error in baseMessage.buildMessage(), data too long, can not fit!');
        return new Buffer(0);
    }

    // debug
    //console.log('buildPlainMessage().complete message:', message.toString('hex'));
    //--

    return message;
}

// this encrypts message and prepares the package for sending and returns it as Buffer.
// if something goes wrong it returns empty buffer
baseMessage.prototype.buildEncryptedMessage = function (aes128Key, random16bytes) {
    // [ALL_LENGTH] { [RANDOM_IV] [MESSAGE_LENGTH] [HEADER] [TX_SENDER] [DATA] [padding when needed] } [CMAC]

    var randomIv;
    if (!random16bytes || random16bytes == null) {
        randomIv = crypto.randomBytes(16); // NOTE: This is SLOW. Even though it might be the best way to go, we must not slow things down!
    }
    else {
        randomIv = random16bytes; // we will use provided 16 bytes as randomness
    }

    // Build the message in plaintext (still not encrypted)
    var toEncrypt = this.buildPlainMessage();
    if (toEncrypt == null) {
        return new Buffer(0);
    }

    // debug
    //console.log('buildEncryptedMessage().toEncrypt wo/IV and padd:', toEncrypt.toString('hex'));
    //--

    // Add random IV to beginning
    toEncrypt = new Buffer.concat([randomIv, toEncrypt]);

    // debug
    //console.log('buildEncryptedMessage().toEncrypt w/IV:', toEncrypt.toString('hex'));
    //--

    // Now add padding to end if required
    if (toEncrypt.length % 16) {
        var addThisMuch = 16 - (toEncrypt.length % 16);
        var appendStuff = new Buffer(addThisMuch);
        randomIv.copy(appendStuff, 0, 0, addThisMuch); // use IV as padding

        /*// debug
        console.log('padding count:', addThisMuch);
        console.log('appendStuff:', appendStuff.toString('hex'));
        //--*/

        toEncrypt = new Buffer.concat([toEncrypt, appendStuff]);
    }

    // debug
    //console.log('buildEncryptedMessage().toEncrypt w/IV and padding:', toEncrypt.toString('hex'));
    //--

    // Finally encrypt
    var cipher = crypto.createCipheriv('aes-128-cbc', aes128Key, new Buffer([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    cipher.setAutoPadding(false);
    var encrypted = cipher.update(toEncrypt, '', ''); // .final('hex') not required?

    // debug
    //console.log('buildEncryptedMessage().encrypted:', encrypted);
    //--

    // Calculate CMAC over "encrypted" now and put into "cmac"
    var cmac = this.calcCMAC(encrypted, aes128Key);

    // debug
    //console.log('buildEncryptedMessage().CMAC:', cmac.toString('hex'));
    //--

    // Merge encrypted message and CMAC in "toSend"
    var toSend = new Buffer.concat([encrypted, cmac]);

    // debug
    //console.log('buildEncryptedMessage().toSend:', toSend.toString('hex'));
    //--

    // Calculate the size of this packet that will be send out via TCP link
    var allLength = new Buffer(2);
    allLength.writeUInt16LE(toSend.length, 0);

    // Merge the size and the packet to return it
    this.binaryPackage = new Buffer.concat([allLength, toSend]);

    if (this.binaryPackage.length > 65535) {
        console.log('Error in baseMessage.buildPackage(), data too long, can not fit!');
        return new Buffer(0);
    }

    // debug
    //console.log('buildEncryptedMessage().binaryPackage:', this.binaryPackage.toString('hex'));
    //--

    return this.binaryPackage;
};

///////////// CBC-MAC (CMAC) IMPLEMENTATION FOR NODEJS //////////////////

/*
	http://tools.ietf.org/html/rfc4493#section-2.3

	Subkey Generation
	K              2b7e1516 28aed2a6 abf71588 09cf4f3c
	AES-128(key,0) 7df76b0c 1ab899b3 3e42f047 b91b546f
	K1             fbeed618 35713366 7c85e08f 7236a8de
	K2             f7ddac30 6ae266cc f90bc11e e46d513b
*/
baseMessage.prototype.calcCMACSubKeys = function (aes128Key)
{
	var subKeys = {
		K1: new Buffer(16),
		K2: new Buffer(16)
	};
	var overflow;

	// STEP 1.
	var cipher = crypto.createCipheriv('aes-128-cbc', aes128Key, new Buffer([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]));
	cipher.setAutoPadding(false);
	var L = cipher.update(new Buffer([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]), '', '');

	// STEP 2.
	for (var i=16; i>0; i--) {
		subKeys.K1[i-1] = L[i-1] << 1;
		subKeys.K1[i-1] |= overflow;
		overflow = (L[i-1] & 0x80) ? 1 : 0;
	}
	if( (L[0] & 0x80) > 0 ) {
		subKeys.K1[15] ^= 0x87;
	}

	// STEP 3.
	for (var i=16; i>0; i--) {
		subKeys.K2[i-1] = subKeys.K1[i-1] << 1;
		subKeys.K2[i-1] |= overflow;
		overflow = (subKeys.K1[i-1] & 0x80) ? 1 : 0;
	}
	if( (subKeys.K1[0] & 0x80) > 0 ) {
		subKeys.K2[15] ^= 0x87;
	}

	// STEP 4.
	return subKeys;
}

/*
	http://tools.ietf.org/html/rfc4493#section-2.4

	Example 1: len = 0
	M              <empty string>
	AES-CMAC       bb1d6929 e9593728 7fa37d12 9b756746
	--------------------------------------------------

	Example 2: len = 16
	M              6bc1bee2 2e409f96 e93d7e11 7393172a
	AES-CMAC       070a16b4 6b4d4144 f79bdd9d d04a287c
	--------------------------------------------------

	Example 3: len = 40
	M              6bc1bee2 2e409f96 e93d7e11 7393172a
				   ae2d8a57 1e03ac9c 9eb76fac 45af8e51
				   30c81c46 a35ce411
	AES-CMAC       dfa66747 de9ae630 30ca3261 1497c827
	--------------------------------------------------

	Example 4: len = 64
	M              6bc1bee2 2e409f96 e93d7e11 7393172a
				   ae2d8a57 1e03ac9c 9eb76fac 45af8e51
				   30c81c46 a35ce411 e5fbc119 1a0a52ef
				   f69f2445 df4f9b17 ad2b417b e66c3710
	AES-CMAC       51f0bebf 7e3b9d92 fc497417 79363cfe
*/
baseMessage.prototype.calcCMAC = function (msg, aes128Key)
{
	// STEP 1.
	var subKeys = this.calcCMACSubKeys(aes128Key);

	// STEP 2.
	var n = Math.ceil(msg.length / 16); // n is number of rounds

	// STEP 3.
	var flag;
	if(n == 0) {
		n = 1;
		flag = 0;
	}
	else {
		if ((msg.length % 16) == 0) {
			flag = 1; // last block is a complete block
		}
		else {
			flag = 0; // last block is not complete block
		}
	}

	// STEP 4.
	var M_last = new Buffer(16);

	// last block is complete block
	if (flag) {
		// XOR
		for(var idx = 0; idx<16; idx++) {
			M_last[idx] = msg[(16 * (n-1)) + idx] ^ subKeys.K1[idx];
		}
	}
	else {
		// padding input and xoring with K2 at the same time
		for (var j=0; j<16; j++ ) {
			var temp;
			if ( j < (msg.length % 16) ) { // we have this byte index in input - take it
				temp = msg[(16 * (n-1)) + j];
			}
			else if ( j == (msg.length % 16) ) { // last byte of input is padded with 0x80
				temp = 0x80;
			}
			else {
				temp = 0x00; // the rest is padded with 0x00
			}

			M_last[j] = temp ^ subKeys.K2[j];
		}
	}

	// STEP 5.
	var cmac = new Buffer([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);

	// STEP 6.
	for (var i=0; i<n-1; i++) {
		for(var idx = 0; idx<16; idx++) {
			cmac[idx] = msg[idx+(16*i)] ^ cmac[idx];
		}
		var cipher = crypto.createCipheriv('aes-128-cbc', aes128Key, new Buffer([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]));
		cipher.setAutoPadding(false);
		cmac = cipher.update(cmac, '', '');
	}

	for(var idx = 0; idx<16; idx++) {
		cmac[idx] = M_last[idx] ^ cmac[idx];
	}
	var cipher = crypto.createCipheriv('aes-128-cbc', aes128Key, new Buffer([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]));
	cipher.setAutoPadding(false);
	cmac = cipher.update(cmac, '', '');

	// STEP 7.
	return cmac;
}

module.exports = baseMessage;
