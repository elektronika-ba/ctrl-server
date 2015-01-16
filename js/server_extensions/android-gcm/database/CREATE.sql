-- phpMyAdmin SQL Dump
-- version 4.0.4
-- http://www.phpmyadmin.net
--
-- Host: localhost
-- Generation Time: Jan 16, 2015 at 09:14 PM
-- Server version: 5.6.12-log
-- PHP Version: 5.4.16

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;

--
-- Database: `ctrl_1v0_ext_android_gcm`
--
CREATE DATABASE IF NOT EXISTS `ctrl_1v0_ext_android_gcm` DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;
USE `ctrl_1v0_ext_android_gcm`;

-- --------------------------------------------------------

--
-- Table structure for table `base_config`
--

CREATE TABLE IF NOT EXISTS `base_config` (
  `IDbase` bigint(20) unsigned NOT NULL,
  `disable_status_change_event` tinyint(1) unsigned NOT NULL DEFAULT '0',
  `disable_new_data_event` tinyint(1) unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`IDbase`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

--
-- Dumping data for table `base_config`
--

INSERT INTO `base_config` (`IDbase`, `disable_status_change_event`, `disable_new_data_event`) VALUES
(1, 0, 0);

-- --------------------------------------------------------

--
-- Table structure for table `client_config`
--

CREATE TABLE IF NOT EXISTS `client_config` (
  `IDclient` bigint(20) unsigned NOT NULL,
  `disable_status_change_event` tinyint(1) unsigned NOT NULL DEFAULT '0',
  `disable_new_data_event` tinyint(1) unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`IDclient`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `device`
--

CREATE TABLE IF NOT EXISTS `device` (
  `IDclient` bigint(20) unsigned NOT NULL,
  `regid` blob NOT NULL,
  PRIMARY KEY (`IDclient`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

--
-- Dumping data for table `device`
--

INSERT INTO `device` (`IDclient`, `regid`) VALUES
(1, 0x626c61626c61626c61626c61626c61626c61626c61626c61626c61626c61626c61626c61626c61626c61626c61626c61626c61626c61);

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
