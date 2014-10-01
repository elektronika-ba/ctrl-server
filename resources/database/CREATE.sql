-- phpMyAdmin SQL Dump
-- version 3.3.9
-- http://www.phpmyadmin.net
--
-- Host: localhost
-- Generation Time: Oct 01, 2014 at 07:42 AM
-- Server version: 5.5.8
-- PHP Version: 5.3.5

SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;

--
-- Database: `ctrl_0v4`
--

-- --------------------------------------------------------

--
-- Table structure for table `account`
--

DROP TABLE IF EXISTS `account`;
CREATE TABLE IF NOT EXISTS `account` (
  `IDaccount` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `stamp_system` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `email` varchar(100) NOT NULL,
  `password` varchar(32) NOT NULL,
  PRIMARY KEY (`IDaccount`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 AUTO_INCREMENT=1 ;

--
-- Dumping data for table `account`
--


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
  PRIMARY KEY (`IDbase`),
  UNIQUE KEY `baseid` (`baseid`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8 AUTO_INCREMENT=2 ;

--
-- Dumping data for table `base`
--

INSERT INTO `base` (`IDbase`, `IDaccount`, `baseid`, `timezone`, `TXbase`) VALUES
(1, 1, '17171717171717171717171717171717', -120, 0);

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
(1, '2014-09-29 16:11:23', 1, 1);

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
  PRIMARY KEY (`IDclient`),
  UNIQUE KEY `username` (`auth_token`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8 AUTO_INCREMENT=2 ;

--
-- Dumping data for table `client`
--

INSERT INTO `client` (`IDclient`, `IDaccount`, `auth_token`, `TXclient`) VALUES
(1, 1, '16b5bb101392fac8b6264c8382cfa278', 0);

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
) ENGINE=InnoDB  DEFAULT CHARSET=utf8 COMMENT='FIFO queue Server -> Base. This table must be of InnoDB type' AUTO_INCREMENT=3 ;

--
-- Dumping data for table `txserver2base`
--

INSERT INTO `txserver2base` (`IDpk`, `stamp_system`, `IDbase`, `TXserver`, `binary_package`, `sent`, `acked`) VALUES
(1, '2014-10-01 08:29:54', 1, 1, 0x3030316430303030303030303030333633383336333533363633333636333336363633323330333733373336363633373332333636333336333433323331, 0, 0),
(2, '2014-10-01 08:32:37', 1, 2, 0x3030316430303030303030303030333633383336333533363633333636333336363633323330333733373336363633373332333636333336333433323331, 0, 0);

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

