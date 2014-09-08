DELIMITER //

CREATE DEFINER=`root`@`localhost` PROCEDURE `spGetNextTxServer2Client`(IN `pIDclient` BIGINT UNSIGNED) NOT DETERMINISTIC CONTAINS SQL SQL SECURITY DEFINER
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
END//

DELIMITER ;