DELIMITER //

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
END//

DELIMITER ;