DELIMITER //

CREATE DEFINER=`root`@`localhost` PROCEDURE `spAckTxServer2Base`(IN `pIDbase` BIGINT UNSIGNED, IN `pTXserver` INT)
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
END//

DELIMITER ;