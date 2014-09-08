DELIMITER //

CREATE DEFINER=`root`@`localhost` PROCEDURE `spAddTxServer2Base`(IN `pIDbase` BIGINT UNSIGNED, IN `pParam` BLOB)
BEGIN
	DECLARE oTXserver INT UNSIGNED;

	START TRANSACTION;
	
	SELECT COALESCE(MAX(TXserver),0)+1 INTO oTXserver FROM txserver2base WHERE IDbase=pIDbase;

	INSERT INTO txserver2base (IDbase, binary_package, TXserver, sent, acked)
	VALUES(pIDbase, pBinaryPackage, oTXserver, 0, 0);

	COMMIT;

	SELECT oTXserver;
END//

DELIMITER ;