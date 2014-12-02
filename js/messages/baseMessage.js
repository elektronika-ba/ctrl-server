'use strict';

/*
    Binary message for communication between "Base <-> Server"

    [ALL_LENGTH] { [RANDOM_IV] [MESSAGE_LENGTH] [HEADER] [TX_SENDER] [DATA] [padding when needed] } [CMAC]

    Everything between { and } is encrypted.
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
    console.log('msg_length:', msgLength);
    console.log('header:', this.header);
    console.log('TXsender:', this.TXsender);
    console.log('data:', this.data);
    //--

    return true;
};

// this unpacks the encrypted message from this.binaryPackage
// returns true on OK, or false on Error
baseMessage.prototype.unpackAsEncryptedMessage = function (aes128Key) {
    // minimum encrypted data we should receive is: length (2 bytes) + original encrypted message (at least 32 bytes) + cmac (16 bytes) = 50 bytes
    if (this.binaryPackage.length < 50) {
        console.log('Warning in baseMessage.unpack(), incomplete encrypted binary package (got ', this.binaryPackage.length, '/minimum 50)!');
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

    // debug
    console.log('binaryPackage:', this.binaryPackage.toString('hex'));
    console.log('allLength:', allLength);
    console.log('encryptedMessage:', encryptedMessage.toString('hex'));
    console.log('cmac:', cmac.toString('hex'));
    //--

    // Validate CMAC first
    var isCmacValid = true; // for now lets not validate it
    /*
        TODO !
        encrypted message is in: encryptedMessage
        key is in: aes128Key
        expected CMAC is in: cmac
    */
    if (!isCmacValid) {
        console.log('Warning in baseMessage.unpack(), CMAC not valid!');
        return false;
    }

    // Finally decrypt the message
    var decipher = crypto.createDecipheriv('aes-128-cbc', aes128Key, new Buffer([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    decipher.setAutoPadding(false);
    var decrypted = decipher.update(encryptedMessage, 'hex', 'hex'); //.final('hex') not required?

    // debug
    console.log('decrypted received message w/IV:', decrypted);
    //--

    // We must discard fist 16 bytes of random IV from the decrypted message
    this.binaryPackage = new Buffer(decrypted.length - 16);
    new Buffer(decrypted, 'hex').copy(this.binaryPackage, 0, 16);

    // debug
    console.log('decrypted received message wo/IV:', this.binaryPackage.toString('hex'));
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
    console.log('buildPlainMessage().message:', message.toString('hex'));
    //--

    if (this.data.length > 0) {
        message = new Buffer.concat([message, this.data]);
    }

    var messageLength = new Buffer(2);
    messageLength.writeUInt16LE(message.length, 0);

    message = new Buffer.concat([messageLength, message]);

    if (message.length > 65535) {
        console.log('Error in baseMessage.buildMessage(), data too long, can not fit!');
        return new Buffer(0);
    }

    // debug
    console.log('buildPlainMessage().message:', message.toString('hex'));
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
    console.log('buildEncryptedMessage().toEncrypt wo/IV and padd:', toEncrypt.toString('hex'));
    //--

    // Add random IV to beginning
    toEncrypt = new Buffer.concat([randomIv, toEncrypt]);

    // debug
    console.log('buildEncryptedMessage().toEncrypt w/IV:', toEncrypt.toString('hex'));
    //--

    // Now add padding to end if required
    if (toEncrypt.length % 16) {
        var addThisMuch = 16 - (toEncrypt.length % 16);
        var appendStuff = new Buffer(addThisMuch);
        randomIv.copy(appendStuff, 0, 0, addThisMuch); // use IV as padding

        // debug
        console.log('padding count:', addThisMuch);
        console.log('appendStuff:', appendStuff.toString('hex'));
        //--

        toEncrypt = new Buffer.concat([toEncrypt, appendStuff]);
    }

    // debug
    console.log('buildEncryptedMessage().toEncrypt w/IV and padding:', toEncrypt.toString('hex'));
    //--

    // Finally encrypt
    var cipher = crypto.createCipheriv('aes-128-cbc', aes128Key, new Buffer([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    cipher.setAutoPadding(false);
    var encrypted = cipher.update(toEncrypt, 'hex', 'hex'); // .final('hex') not required?

    // debug
    console.log('buildEncryptedMessage().encrypted:', encrypted);
    //--

    // calculate CMAC
    var cmac = new Buffer(16);
    // TODO: Calculate CMAC over "encrypted" now and put into "cmac"

    // debug
    console.log('buildEncryptedMessage().CMAC:', cmac.toString('hex'));
    //--

    // Merge encrypted message and CMAC in "toSend"
    var toSend = new Buffer.concat([new Buffer(encrypted, 'hex'), cmac]);

    // debug
    console.log('buildEncryptedMessage().toSend:', toSend.toString('hex'));
    //--

    // Calculate the size of this packet that will be send out via TCP link
    var allLength = new Buffer(2);
    allLength.writeUInt16LE(toSend.length, 0);

    // Merge the size and the packet to return it
    this.binaryPackage = new Buffer.concat([allLength, toSend]);

    // debug
    console.log('buildEncryptedMessage().binaryPackage:', this.binaryPackage.toString('hex'));
    //--

    if (this.binaryPackage.length > 65535) {
        console.log('Error in baseMessage.buildPackage(), data too long, can not fit!');
        return new Buffer(0);
    }

    return this.binaryPackage;
};

module.exports = baseMessage;
