-- phpMyAdmin SQL Dump
-- version 4.0.4
-- http://www.phpmyadmin.net
--
-- Host: localhost
-- Generation Time: Dec 07, 2014 at 04:38 PM
-- Server version: 5.6.12-log
-- PHP Version: 5.4.16

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;

--
-- Database: `ctrl_1v0`
--
CREATE DATABASE IF NOT EXISTS `ctrl_1v0` DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;
USE `ctrl_1v0`;

DELIMITER $$
--
-- Procedures
--
DROP PROCEDURE IF EXISTS `spAckTxServer2Base`$$
CREATE DEFINER=`root`@`localhost` PROCEDURE `spAckTxServer2Base`(IN `pIDbase` BIGINT UNSIGNED, IN `pTXserver` INT UNSIGNED)
BEGIN
	DECLARE oQueueSize INT UNSIGNED;
	DECLARE oAcked TINYINT;

	START TRANSACTION;
	
	UPDATE txserver2base SET acked=1 WHERE IDbase=pIDbase AND TXserver=pTXserver AND acked=0 LIMIT 1;
	IF ROW_COUNT() = 1 THEN
		SET oAcked = 1;
	ELSE
		SET oAcked = 0;
	END IF;
	
	SELECT COUNT(*) INTO oQueueSize FROM txserver2base WHERE IDbase=pIDbase AND acked=0;

	COMMIT;

	SELECT oQueueSize, oAcked;
END$$

DROP PROCEDURE IF EXISTS `spAckTxServer2Client`$$
CREATE DEFINER=`root`@`localhost` PROCEDURE `spAckTxServer2Client`(IN `pIDclient` BIGINT, IN `pTXserver` INT)
BEGIN
	DECLARE oQueueSize INT UNSIGNED;
	DECLARE oAcked TINYINT;

	START TRANSACTION;
	
	UPDATE txserver2client SET acked=1 WHERE IDclient=pIDclient AND TXserver=pTXserver AND acked=0 LIMIT 1;
	IF ROW_COUNT() = 1 THEN
		SET oAcked = 1;
	ELSE
		SET oAcked = 0;
	END IF;

	SELECT COUNT(*) INTO oQueueSize FROM txserver2client WHERE IDclient=pIDclient AND acked=0;

	COMMIT;

	SELECT oQueueSize, oAcked;
END$$

DROP PROCEDURE IF EXISTS `spAddTxServer2Base`$$
CREATE DEFINER=`root`@`localhost` PROCEDURE `spAddTxServer2Base`(IN `pIDbase` BIGINT UNSIGNED, IN `pBinaryPackage` BLOB)
BEGIN
	DECLARE oTXserver INT UNSIGNED;

	START TRANSACTION;
	
	SELECT COALESCE(MAX(TXserver),0)+1 INTO oTXserver FROM txserver2base WHERE IDbase=pIDbase;

	INSERT INTO txserver2base (IDbase, binary_package, TXserver, sent, acked)
	VALUES(pIDbase, pBinaryPackage, oTXserver, 0, 0);

	COMMIT;

	SELECT oTXserver;
END$$

DROP PROCEDURE IF EXISTS `spAddTxServer2Client`$$
CREATE DEFINER=`root`@`localhost` PROCEDURE `spAddTxServer2Client`(IN `pIDclient` BIGINT UNSIGNED, IN `pJsonPackage` BLOB)
BEGIN
	DECLARE oTXserver INT UNSIGNED;

	START TRANSACTION;

	SELECT COALESCE(MAX(TXserver),0)+1 INTO oTXserver FROM txserver2client WHERE IDclient=pIDclient;

	INSERT INTO txserver2client (IDclient, json_package, TXserver, sent, acked)
	VALUES(pIDclient, pJsonPackage, oTXserver, 0, 0);

	COMMIT;
	
	SELECT oTXserver;
END$$

DROP PROCEDURE IF EXISTS `spAuthBasePhase1`$$
CREATE DEFINER=`root`@`localhost` PROCEDURE `spAuthBasePhase1`(IN `pBaseid` VARCHAR(32), IN pRemoteAddr VARCHAR(15), IN pLimit TINYINT, IN pMinutes TINYINT)
BEGIN
	DECLARE oOK TINYINT;
	DECLARE oIDbase BIGINT UNSIGNED;
	DECLARE oTimezone SMALLINT;
	DECLARE oTXbase INT UNSIGNED;
	DECLARE oCryptKey VARCHAR(32);

	DECLARE vNr TINYINT;

	SET oOK = 0;

	### Check failed auth attempts in past "pMinutes" minutes from this IP
	SELECT COUNT(*) INTO vNr FROM base_auth_fail WHERE remote_ip = pRemoteAddr AND stamp_system >= DATE_SUB(NOW(), INTERVAL pMinutes MINUTE);
	IF vNr <= pLimit THEN
		BEGIN
			### Fetch Base information from database
			SELECT IDbase, timezone, TXbase, crypt_key INTO oIDbase, oTimezone, oTXbase, oCryptKey FROM base WHERE LOWER(baseid) = LOWER(pBaseid) LIMIT 1;
			IF FOUND_ROWS() = 1 THEN
				BEGIN
					SET oOK = 1;
				END;
			END IF;
		END;
	END IF;

	SELECT oOK, oIDbase, oTimezone, oTXbase, oCryptKey;
END$$

DROP PROCEDURE IF EXISTS `spAuthBasePhase2`$$
CREATE DEFINER=`root`@`localhost` PROCEDURE `spAuthBasePhase2`(IN `pIDbase` BIGINT UNSIGNED)
BEGIN
	DECLARE oForceSync TINYINT;
	DECLARE vNr TINYINT;
	DECLARE oTXserver INT UNSIGNED;

	SET oForceSync = 0;

	### Flush acked transmissions
	# DELETE FROM txserver2base WHERE IDbase = pIDbase AND acked=1;
	### NEW: Flush only those until we get to unacked ones. This prevents re-using TXserver values in case Base acks on newer transmission instead of oldest one!!!
	DELETE FROM txserver2base WHERE IDbase = pIDbase AND acked = 1
	AND IDpk < ALL (
		SELECT IDpk FROM
		(
			SELECT IDpk FROM txserver2base WHERE IDbase = pIDbase AND acked = 0
		) AS weMustDoItLikeThis
	);

	### We must mark all pending items as unsent for this connection session!
	UPDATE txserver2base SET sent=0 WHERE IDbase=pIDbase AND sent=1;

	### Lets see if we need to tell Base to sync to 0
	SELECT COUNT(*) INTO vNr FROM txserver2base WHERE IDbase=pIDbase AND acked=0;
	IF vNr = 0 THEN
		SET oForceSync = 1;
	END IF;
	
	### Lets load server-stored TXserver value (Bases use this feature to store their local TXserver value
	### since updating it on Bases hardware would wear out the Flash or EEPROM memory).
	SELECT TXserver INTO oTXserver FROM base WHERE IDbase=pIDbase LIMIT 1;

	SELECT oForceSync, oTXserver;
END$$

DROP PROCEDURE IF EXISTS `spAuthClient`$$
CREATE DEFINER=`root`@`localhost` PROCEDURE `spAuthClient`(IN `pAuthToken` VARCHAR(50), IN pRemoteAddr VARCHAR(15), IN pLimit TINYINT, IN pMinutes TINYINT)
BEGIN
	DECLARE oAuthorized TINYINT;
	DECLARE oTooMany TINYINT;
	DECLARE oForceSync TINYINT;
	DECLARE oTXclient INT UNSIGNED;
	DECLARE oIDclient BIGINT UNSIGNED;
	DECLARE oTXserver INT UNSIGNED;

	DECLARE vNr TINYINT;

	SET oAuthorized = 0;
	SET oTooMany = 0;
	SET oForceSync = 0;
	SET oTXserver = 0;

	### Provjeri failed auth attempts
	SELECT COUNT(*) INTO vNr FROM client_auth_fail WHERE remote_ip = pRemoteAddr AND stamp_system >= DATE_SUB(NOW(), INTERVAL pMinutes MINUTE);
	IF vNr > pLimit THEN
		BEGIN
			SET oTooMany = 1;
		END;
	ELSE
		BEGIN
			### Provjeri imal tog korisnika sistemu
			SELECT c.IDclient, c.TXclient INTO oIDclient, oTXclient FROM client c WHERE c.auth_token = pAuthToken LIMIT 1;
			IF FOUND_ROWS() = 1 THEN
				BEGIN
					SET oAuthorized = 1;

					### Flush acked transmissions
					# DELETE FROM txserver2client WHERE IDclient = oIDclient AND acked=1;
					### NEW: Flush only those until we get to unacked ones. This prevents re-using TXserver values in case Client acks on newer transmission instead of oldest one!!!
					DELETE FROM txserver2client WHERE IDclient = oIDclient AND acked = 1
					AND IDpk < ALL (
						SELECT IDpk FROM
						(
							SELECT IDpk FROM txserver2client WHERE IDclient = oIDclient AND acked = 0
						) AS weMustDoItLikeThis
					);

					### We must mark all pending items as unsent for this connection session!
					UPDATE txserver2client SET sent=0 WHERE IDclient=oIDclient AND sent=1;

					### Lets see if we need to tell Client to sync to 0
					SELECT COUNT(*) INTO vNr FROM txserver2client WHERE IDclient=oIDclient AND acked=0;
					IF vNr = 0 THEN
						SET oForceSync = 1;
					END IF;
					
					### Lets load server-stored TXserver value (Clients might use this feature to store their local TXserver
					### value only for convinience purposes. Clients do not have problems with wearing out their Flash or EEPROM storage).
					SELECT TXserver INTO oTXserver FROM client WHERE IDclient=oIDclient LIMIT 1;
				END;
			ELSE
				BEGIN
					### Add auth fail attempt
					INSERT INTO client_auth_fail (stamp_system, auth_token, remote_ip) VALUES(NOW(), pAuthToken, pRemoteAddr);
				END;
			END IF;
		END;
	END IF;

	SELECT oAuthorized, oTooMany, oForceSync, oTXclient, oIDclient, oTXserver;
END$$

DROP PROCEDURE IF EXISTS `spGetNextTxServer2Base`$$
CREATE DEFINER=`root`@`localhost` PROCEDURE `spGetNextTxServer2Base`(IN `pIDbase` BIGINT UNSIGNED)
BEGIN
	DECLARE vIDpk BIGINT UNSIGNED;
	
	DECLARE oFetched TINYINT UNSIGNED;
	DECLARE oMoreInQueue TINYINT UNSIGNED;
	DECLARE oTXserver INT UNSIGNED;
	DECLARE oBinaryPackage BLOB;

	SET vIDpk = NULL;
	SET oMoreInQueue = 0;
	SET oFetched = 0;

	START TRANSACTION;

	SELECT IDpk, TXserver, binary_package INTO vIDpk, oTXserver, oBinaryPackage FROM txserver2base WHERE IDbase = pIDbase AND acked = 0 AND sent = 0 ORDER BY TXserver ASC LIMIT 1;

	IF vIDpk IS NOT NULL THEN
		BEGIN
			UPDATE txserver2base SET sent = 1 WHERE IDpk = vIDpk;
			SELECT COUNT(IDpk) INTO oMoreInQueue FROM txserver2base WHERE IDbase = pIDbase AND acked = 0 AND sent = 0 LIMIT 1;
			
			SET oFetched = 1;
		END;
	END IF;

	COMMIT;

	SELECT oFetched, oMoreInQueue, oTXserver, CAST(oBinaryPackage AS CHAR) AS oBinaryPackage;

END$$

DROP PROCEDURE IF EXISTS `spGetNextTxServer2Client`$$
CREATE DEFINER=`root`@`localhost` PROCEDURE `spGetNextTxServer2Client`(IN `pIDclient` BIGINT UNSIGNED)
BEGIN
	DECLARE vIDpk BIGINT UNSIGNED;
	
	DECLARE oFetched TINYINT UNSIGNED;
	DECLARE oMoreInQueue TINYINT UNSIGNED;
	DECLARE oTXserver INT UNSIGNED;
	DECLARE oJsonPackage BLOB;

	SET vIDpk = NULL;
	SET oMoreInQueue = 0;
	SET oFetched = 0;

	START TRANSACTION;

	SELECT IDpk, TXserver, json_package INTO vIDpk, oTXserver, oJsonPackage FROM txserver2client WHERE IDclient = pIDclient AND acked = 0 AND sent = 0 ORDER BY TXserver ASC LIMIT 1;

	IF vIDpk IS NOT NULL THEN
		BEGIN
			UPDATE txserver2client SET sent = 1 WHERE IDpk = vIDpk;
			SELECT COUNT(IDpk) INTO oMoreInQueue FROM txserver2client WHERE IDclient = pIDclient AND acked = 0 AND sent = 0 LIMIT 1;
			
			SET oFetched = 1;
		END;
	END IF;

	COMMIT;

	SELECT oFetched, oMoreInQueue, oTXserver, oJsonPackage;
END$$

DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `account`
--

DROP TABLE IF EXISTS `account`;
CREATE TABLE IF NOT EXISTS `account` (
  `IDaccount` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `stamp_system` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `email` varchar(100) NOT NULL,
  `password` varchar(100) NOT NULL,
  `active` tinyint(1) unsigned NOT NULL DEFAULT '0',
  `recovery_started` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`IDaccount`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8 AUTO_INCREMENT=2 ;

--
-- Dumping data for table `account`
--

INSERT INTO `account` (`IDaccount`, `stamp_system`, `email`, `password`, `active`, `recovery_started`) VALUES
(1, '2014-12-09 10:13:57', 'test@ctrl.ba', 'sha256:1000:Lj4+dVkjAAn3DNv7gMDtIszDniFgNA6s:1HSQtZ/qqfSDwKCpNgxjo/wY5RwMwr+R', 1, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `account_auth_fail`
--

DROP TABLE IF EXISTS `account_auth_fail`;
CREATE TABLE IF NOT EXISTS `account_auth_fail` (
  `IDpk` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `stamp_system` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `email` varchar(100) NOT NULL,
  `password` varchar(32) NOT NULL,
  `remote_ip` varchar(15) NOT NULL,
  PRIMARY KEY (`IDpk`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COMMENT='Keeps only failed auth attempts' AUTO_INCREMENT=1 ;

--
-- Dumping data for table `account_auth_fail`
--


-- --------------------------------------------------------

--
-- Table structure for table `base`
--

DROP TABLE IF EXISTS `base`;
CREATE TABLE IF NOT EXISTS `base` (
  `IDbase` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `IDaccount` bigint(20) unsigned NOT NULL,
  `baseid` varchar(32) NOT NULL,
  `timezone` smallint(5) NOT NULL DEFAULT '0',
  `TXbase` int(10) unsigned NOT NULL DEFAULT '0' COMMENT 'Sequence No - Base to Server for binary protocol',
  `crypt_key` varchar(32) NOT NULL COMMENT 'AES 128',
  `basename` varchar(100) NOT NULL,
  `last_online` datetime DEFAULT NULL,
  `online` tinyint(3) unsigned NOT NULL DEFAULT '0',
  `TXserver` int(10) unsigned NOT NULL COMMENT 'Server-stored TXserver value',
  PRIMARY KEY (`IDbase`),
  UNIQUE KEY `baseid` (`baseid`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8 AUTO_INCREMENT=2 ;

--
-- Dumping data for table `base`
--

INSERT INTO `base` (`IDbase`, `IDaccount`, `baseid`, `timezone`, `TXbase`, `crypt_key`, `basename`, `last_online`, `online`, `TXserver`) VALUES
(1, 1, 'aacca539d159a7ca300aee98deda7e92', -120, 0, '206aadf27bfeb331d8cbb270d37e458a', 'Test Base', NULL, 0, 0);

-- --------------------------------------------------------

--
-- Table structure for table `base_auth_fail`
--

DROP TABLE IF EXISTS `base_auth_fail`;
CREATE TABLE IF NOT EXISTS `base_auth_fail` (
  `IDpk` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `stamp_system` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `baseid` varchar(32) NOT NULL,
  `remote_ip` varchar(15) NOT NULL,
  PRIMARY KEY (`IDpk`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COMMENT='Keeps only failed auth attempts' AUTO_INCREMENT=1 ;

--
-- Dumping data for table `base_auth_fail`
--


-- --------------------------------------------------------

--
-- Table structure for table `base_client`
--

DROP TABLE IF EXISTS `base_client`;
CREATE TABLE IF NOT EXISTS `base_client` (
  `IDbase_client` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `stamp_system` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `IDbase` bigint(20) unsigned NOT NULL,
  `IDclient` bigint(20) unsigned NOT NULL,
  PRIMARY KEY (`IDbase_client`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8 AUTO_INCREMENT=2 ;

--
-- Dumping data for table `base_client`
--

INSERT INTO `base_client` (`IDbase_client`, `stamp_system`, `IDbase`, `IDclient`) VALUES
(1, '2014-12-09 10:14:46', 1, 1);

-- --------------------------------------------------------

--
-- Table structure for table `base_variable`
--

DROP TABLE IF EXISTS `base_variable`;
CREATE TABLE IF NOT EXISTS `base_variable` (
  `IDbase` bigint(20) unsigned NOT NULL,
  `variable_id` int(10) unsigned NOT NULL,
  `variable_value` int(10) unsigned NOT NULL,
  UNIQUE KEY `IDbase` (`IDbase`,`variable_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

--
-- Dumping data for table `base_variable`
--


-- --------------------------------------------------------

--
-- Table structure for table `client`
--

DROP TABLE IF EXISTS `client`;
CREATE TABLE IF NOT EXISTS `client` (
  `IDclient` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `IDaccount` bigint(20) unsigned NOT NULL,
  `auth_token` varchar(50) NOT NULL,
  `TXclient` int(10) unsigned NOT NULL DEFAULT '0' COMMENT 'Sequence No - Client to Server for JSON protocol',
  `clientname` varchar(100) NOT NULL,
  `last_online` datetime DEFAULT NULL,
  `online` tinyint(3) unsigned NOT NULL DEFAULT '0',
  `TXserver` int(10) unsigned NOT NULL COMMENT 'Server-stored TXserver value',
  PRIMARY KEY (`IDclient`),
  UNIQUE KEY `auth_token` (`auth_token`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8 AUTO_INCREMENT=2 ;

--
-- Dumping data for table `client`
--

INSERT INTO `client` (`IDclient`, `IDaccount`, `auth_token`, `TXclient`, `clientname`, `last_online`, `online`, `TXserver`) VALUES
(1, 1, 'fiBBBpb2PRbpbSAwQ6X1Wt2gUeewzqCFz583k9T1RWgTDHgkE4', 0, 'Test Account', NULL, 0, 0);

-- --------------------------------------------------------

--
-- Table structure for table `client_auth_fail`
--

DROP TABLE IF EXISTS `client_auth_fail`;
CREATE TABLE IF NOT EXISTS `client_auth_fail` (
  `IDpk` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `stamp_system` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `auth_token` varchar(50) NOT NULL,
  `remote_ip` varchar(15) NOT NULL,
  PRIMARY KEY (`IDpk`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COMMENT='Keeps only failed auth attempts' AUTO_INCREMENT=1 ;

--
-- Dumping data for table `client_auth_fail`
--


-- --------------------------------------------------------

--
-- Table structure for table `txserver2base`
--

DROP TABLE IF EXISTS `txserver2base`;
CREATE TABLE IF NOT EXISTS `txserver2base` (
  `IDpk` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `stamp_system` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `IDbase` bigint(20) unsigned NOT NULL,
  `TXserver` int(10) unsigned NOT NULL DEFAULT '0',
  `binary_package` blob NOT NULL,
  `sent` tinyint(3) unsigned NOT NULL DEFAULT '0',
  `acked` tinyint(3) unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`IDpk`),
  UNIQUE KEY `IDbase` (`IDbase`,`TXserver`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COMMENT='FIFO queue Server -> Base. This table must be of InnoDB type' AUTO_INCREMENT=1 ;

--
-- Dumping data for table `txserver2base`
--


-- --------------------------------------------------------

--
-- Table structure for table `txserver2client`
--

DROP TABLE IF EXISTS `txserver2client`;
CREATE TABLE IF NOT EXISTS `txserver2client` (
  `IDpk` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `stamp_system` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `IDclient` bigint(20) unsigned NOT NULL,
  `TXserver` int(10) unsigned NOT NULL DEFAULT '0',
  `json_package` blob NOT NULL,
  `sent` tinyint(3) unsigned NOT NULL DEFAULT '0',
  `acked` tinyint(3) unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`IDpk`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COMMENT='FIFO queue Server -> Base. This table must be of InnoDB type' AUTO_INCREMENT=1 ;

--
-- Dumping data for table `txserver2client`
--

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
