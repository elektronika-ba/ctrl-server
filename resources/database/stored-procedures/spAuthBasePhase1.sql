DELIMITER //

CREATE DEFINER=`root`@`localhost` PROCEDURE `spAuthBasePhase1`(IN `pBaseid` VARCHAR(32), IN pRemoteAddr VARCHAR(15), IN pLimit TINYINT, IN pMinutes TINYINT)
BEGIN
	DECLARE oOK TINYINT;
	DECLARE oIDbase BIGINT UNSIGNED;
	DECLARE oTimezone SMALLINT;
	DECLARE oDst TINYINT;
	DECLARE oTXbase INT UNSIGNED;
	DECLARE oCryptKey VARCHAR(32);

	DECLARE vNr TINYINT;

	SET oOK = 0;

	
	SELECT COUNT(*) INTO vNr FROM base_auth_fail WHERE remote_ip = pRemoteAddr AND stamp_system >= DATE_SUB(NOW(), INTERVAL pMinutes MINUTE);
	IF vNr <= pLimit THEN
		BEGIN
			
			SELECT IDbase, timezone, dst, TXbase, crypt_key INTO oIDbase, oTimezone, oDst, oTXbase, oCryptKey FROM base WHERE LOWER(baseid) = LOWER(pBaseid) LIMIT 1;
			IF FOUND_ROWS() = 1 THEN
				BEGIN
					SET oOK = 1;
				END;
			END IF;
		END;
	END IF;

	SELECT oOK, oIDbase, oTimezone, oTXbase, oCryptKey, oDst;
END//

DELIMITER ;