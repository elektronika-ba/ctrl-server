-- phpMyAdmin SQL Dump
-- version 4.0.4
-- http://www.phpmyadmin.net
--
-- Host: localhost
-- Generation Time: Sep 04, 2014 at 05:56 PM
-- Server version: 5.6.12-log
-- PHP Version: 5.4.16

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;

--
-- Database: `ctrl_0v4`
--
CREATE DATABASE IF NOT EXISTS `ctrl_0v4` DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;
USE `ctrl_0v4`;

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

DROP PROCEDURE IF EXISTS `spAuthBase`$$
CREATE DEFINER=`root`@`localhost` PROCEDURE `spAuthBase`(IN `pBaseid` VARCHAR(32), IN `pRemoteAddr` VARCHAR(15), IN `pLimit` TINYINT UNSIGNED, IN `pMinutes` TINYINT UNSIGNED)
BEGIN
	DECLARE oAuthorized TINYINT;
	DECLARE oTooMany TINYINT;
	DECLARE oForceSync TINYINT;
	DECLARE oIDbase BIGINT UNSIGNED;
	DECLARE oTimezone SMALLINT;
	DECLARE oTXbase INT UNSIGNED;

	DECLARE vNr TINYINT;

	SET oAuthorized = 0;
	SET oTooMany = 0;
	SET oForceSync = 0;

	### Provjeri failed auth attempts
	SELECT COUNT(*) INTO vNr FROM base_auth_fail WHERE remote_ip = pRemoteAddr AND stamp_system >= DATE_SUB(NOW(), INTERVAL pMinutes MINUTE);
	IF vNr > pLimit THEN
		BEGIN
			SET oTooMany = 1;
		END;
	ELSE
		BEGIN
			### Provjeri imal te baze u sistemu
			SELECT IDbase, timezone, TXbase INTO oIDbase, oTimezone, oTXbase FROM base WHERE baseid = pBaseid LIMIT 1;
			IF FOUND_ROWS() = 1 THEN
				BEGIN
					SET oAuthorized = 1;
					
					### Flush acked transmissions
					DELETE FROM txserver2base WHERE IDbase = oIDbase AND acked=1;

					### We must mark all pending items as unsent for this connection session!
					UPDATE txserver2base SET sent=0 WHERE IDbase=oIDbase AND sent=1;

					### Lets see if we need to tell Base to sync to 0
					SELECT COUNT(*) INTO vNr FROM txserver2base WHERE IDbase=oIDbase AND acked=0;
					IF vNr = 0 THEN
						SET oForceSync = 1;
					END IF;
				END;
			ELSE
				BEGIN
					### Add auth fail attempt
					INSERT INTO base_auth_fail (stamp_system, baseid, remote_ip) VALUES(NOW(), pBaseid, pRemoteAddr);
				END;
			END IF;
		END;
	END IF;

	SELECT oAuthorized, oTooMany, oForceSync, oIDbase, oTimezone, oTXbase;
END$$

DROP PROCEDURE IF EXISTS `spAuthClient`$$
CREATE DEFINER=`root`@`localhost` PROCEDURE `spAuthClient`(IN `pUsername` VARCHAR(50), IN `pPassword` VARCHAR(50), IN `pRemoteAddr` VARCHAR(15), IN `pLimit` TINYINT UNSIGNED, IN `pMinutes` TINYINT UNSIGNED)
BEGIN
	DECLARE oAuthorized TINYINT;
	DECLARE oTooMany TINYINT;
	DECLARE oForceSync TINYINT;
	DECLARE oIDbase BIGINT UNSIGNED;
	DECLARE oTimezone SMALLINT;
	DECLARE oTXclient INT UNSIGNED;
	DECLARE oBaseid VARCHAR(32);
	DECLARE oIDclient BIGINT UNSIGNED;

	DECLARE vNr TINYINT;

	SET oAuthorized = 0;
	SET oTooMany = 0;
	SET oForceSync = 0;

	### Provjeri failed auth attempts
	SELECT COUNT(*) INTO vNr FROM client_auth_fail WHERE remote_ip = pRemoteAddr AND stamp_system >= DATE_SUB(NOW(), INTERVAL pMinutes MINUTE);
	IF vNr > pLimit THEN
		BEGIN
			SET oTooMany = 1;
		END;
	ELSE
		BEGIN
			### Provjeri imal tog korisnika sistemu
			SELECT c.IDclient, c.TXclient, b.IDbase, b.baseid, b.timezone INTO oIDclient, oTXclient, oIDbase, oBaseid, oTimezone FROM client c JOIN base b ON b.IDbase=c.IDbase WHERE c.username = pUsername AND c.password=MD5(CONCAT(c.IDclient,'-',pPassword)) LIMIT 1;
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
				END;
			ELSE
				BEGIN
					### Add auth fail attempt
					INSERT INTO client_auth_fail (stamp_system, username, password, remote_ip) VALUES(NOW(), pUsername, pPassword, pRemoteAddr);
				END;
			END IF;
		END;
	END IF;

	SELECT oAuthorized, oTooMany, oForceSync, oIDbase, oBaseid, oTimezone, oTXclient, oIDclient;
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
-- Table structure for table `base`
--

DROP TABLE IF EXISTS `base`;
CREATE TABLE IF NOT EXISTS `base` (
  `IDbase` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `baseid` varchar(32) NOT NULL,
  `email` varchar(255) NOT NULL,
  `timezone` smallint(5) NOT NULL DEFAULT '0',
  `TXbase` int(10) unsigned NOT NULL DEFAULT '0' COMMENT 'Sequence No - Base to Server for binary protocol',
  PRIMARY KEY (`IDbase`),
  UNIQUE KEY `baseid` (`baseid`),
  UNIQUE KEY `email` (`email`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 AUTO_INCREMENT=1 ;

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

-- --------------------------------------------------------

--
-- Table structure for table `client`
--

DROP TABLE IF EXISTS `client`;
CREATE TABLE IF NOT EXISTS `client` (
  `IDclient` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `IDbase` bigint(20) unsigned NOT NULL,
  `username` varchar(50) NOT NULL,
  `password` varchar(32) NOT NULL,
  `TXclient` int(10) unsigned NOT NULL DEFAULT '0' COMMENT 'Sequence No - Client to Server for JSON protocol',
  PRIMARY KEY (`IDclient`),
  UNIQUE KEY `username` (`username`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 AUTO_INCREMENT=1 ;

-- --------------------------------------------------------

--
-- Table structure for table `client_auth_fail`
--

DROP TABLE IF EXISTS `client_auth_fail`;
CREATE TABLE IF NOT EXISTS `client_auth_fail` (
  `IDpk` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `stamp_system` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `username` varchar(50) NOT NULL,
  `password` varchar(50) NOT NULL,
  `remote_ip` varchar(15) NOT NULL,
  PRIMARY KEY (`IDpk`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COMMENT='Keeps only failed auth attempts' AUTO_INCREMENT=1 ;

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

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
