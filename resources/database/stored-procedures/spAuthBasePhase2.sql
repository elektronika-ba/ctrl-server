DELIMITER //

CREATE DEFINER=`root`@`localhost` PROCEDURE `spAuthBasePhase2`(IN `pIDbase` BIGINT UNSIGNED)
BEGIN
	DECLARE oForceSync TINYINT;
	DECLARE vNr TINYINT;

	SET oForceSync = 0;

	### Flush acked transmissions
	# DELETE FROM txserver2base WHERE IDbase = pIDbase AND acked=1;
	### NEW: Flush only those until we get to unacked ones. This prevents re-using TXserver values in case Base acks on newer transmission instead of oldest one!!!
	DELETE FROM txserver2base WHERE IDbase = pIDbase AND acked = 1
	AND IDpk < ALL (
		SELECT IDpk FROM
		(
			SELECT IDpk FROM txserver2base WHERE IDbase = pIDbase AND acked = 0
		) AS weMustDoItLikeThis
	);

	### We must mark all pending items as unsent for this connection session!
	UPDATE txserver2base SET sent=0 WHERE IDbase=pIDbase AND sent=1;

	### Lets see if we need to tell Base to sync to 0
	SELECT COUNT(*) INTO vNr FROM txserver2base WHERE IDbase=pIDbase AND acked=0;
	IF vNr = 0 THEN
		SET oForceSync = 1;
	END IF;

	SELECT oForceSync;
END//

DELIMITER ;