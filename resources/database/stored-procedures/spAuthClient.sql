DELIMITER //

CREATE DEFINER=`root`@`localhost` PROCEDURE `spAuthClient`(IN `pAuthToken` VARCHAR(50), IN pRemoteAddr VARCHAR(15), IN pLimit TINYINT, IN pMinutes TINYINT)
BEGIN
	DECLARE oAuthorized TINYINT;
	DECLARE oTooMany TINYINT;
	DECLARE oForceSync TINYINT;
	DECLARE oTXclient INT UNSIGNED;
	DECLARE oIDclient BIGINT UNSIGNED;

	DECLARE vNr TINYINT;

	SET oAuthorized = 0;
	SET oTooMany = 0;
	SET oForceSync = 0;

	### Provjeri failed auth attempts
	SELECT COUNT(*) INTO vNr FROM client_auth_fail WHERE remote_ip = pRemoteAddr AND stamp_system >= DATE_SUB(NOW(), INTERVAL pMinutes MINUTE);
	IF vNr > pLimit THEN
		BEGIN
			SET oTooMany = 1;
		END;
	ELSE
		BEGIN
			### Provjeri imal tog korisnika sistemu
			SELECT c.IDclient, c.TXclient INTO oIDclient, oTXclient FROM client c WHERE c.auth_token = pAuthToken LIMIT 1;
			IF FOUND_ROWS() = 1 THEN
				BEGIN
					SET oAuthorized = 1;

					### Flush acked transmissions
					# DELETE FROM txserver2client WHERE IDclient = oIDclient AND acked=1;
					### NEW: Flush only those until we get to unacked ones. This prevents re-using TXserver values in case Client acks on newer transmission instead of oldest one!!!
					DELETE FROM txserver2client WHERE IDclient = oIDclient AND acked = 1
					AND IDpk < ALL (
						SELECT IDpk FROM
						(
							SELECT IDpk FROM txserver2client WHERE IDclient = oIDclient AND acked = 0
						) AS weMustDoItLikeThis
					);

					### We must mark all pending items as unsent for this connection session!
					UPDATE txserver2client SET sent=0 WHERE IDclient=oIDclient AND sent=1;

					### Lets see if we need to tell Client to sync to 0
					SELECT COUNT(*) INTO vNr FROM txserver2client WHERE IDclient=oIDclient AND acked=0;
					IF vNr = 0 THEN
						SET oForceSync = 1;
					END IF;
				END;
			ELSE
				BEGIN
					### Add auth fail attempt
					INSERT INTO client_auth_fail (stamp_system, auth_token, remote_ip) VALUES(NOW(), pAuthToken, pRemoteAddr);
				END;
			END IF;
		END;
	END IF;

	SELECT oAuthorized, oTooMany, oForceSync, oTXclient, oIDclient;
END//

DELIMITER ;