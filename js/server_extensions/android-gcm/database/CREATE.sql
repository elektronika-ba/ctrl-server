-- phpMyAdmin SQL Dump
-- version 3.3.9
-- http://www.phpmyadmin.net
--
-- Host: localhost
-- Generation Time: Jan 14, 2015 at 11:41 AM
-- Server version: 5.5.8
-- PHP Version: 5.3.5

SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;

--
-- Database: `ctrl_1v0_ext_android_gcm`
--

-- --------------------------------------------------------

--
-- Table structure for table `device`
--

DROP TABLE IF EXISTS `device`;
CREATE TABLE IF NOT EXISTS `device` (
  `IDclient` bigint(20) unsigned NOT NULL,
  `regid` blob NOT NULL,
  PRIMARY KEY (`IDclient`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

--
-- Dumping data for table `device`
--

