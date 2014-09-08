DELIMITER //

CREATE DEFINER=`root`@`localhost` PROCEDURE `spAuthBase`(IN `pBaseid` VARCHAR(32), IN pRemoteAddr VARCHAR(15), IN pLimit TINYINT, IN pMinutes TINYINT)
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
END//

DELIMITER ;