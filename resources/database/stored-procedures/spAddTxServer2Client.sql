DELIMITER //

CREATE DEFINER=`root`@`localhost` PROCEDURE `spAddTxServer2Client`(IN `pIDclient` BIGINT UNSIGNED, IN `pJsonPackage` BLOB) NOT DETERMINISTIC CONTAINS SQL SQL SECURITY DEFINER
BEGIN
	DECLARE oTXserver INT UNSIGNED;

	START TRANSACTION;

	SELECT COALESCE(MAX(TXserver),0)+1 INTO oTXserver FROM txserver2client WHERE IDclient=pIDclient;

	INSERT INTO txserver2client (IDclient, json_package, TXserver, sent, acked)
	VALUES(pIDclient, pJsonPackage, oTXserver, 0, 0);

	COMMIT;
	
	SELECT oTXserver;
END//

DELIMITER ;