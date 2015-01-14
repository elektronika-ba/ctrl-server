android-gcm
===========

Server Extension for Android Google Cloud Messaging used to notify Android CTRL-App of new Message arrival from associated Bases.

---

How to install and enable this extension:

1. Create a database on the same MySQL server where database for ctrl-server is hosted. Give it a name that will match one in "/android-gcm/configuration/configuration.js". Now execute the CREATE.sql found in "/android-gcm/database/" directory.
2. In command prompt, go to directory "/android-gcm" and type: "npm install ."
3. Edit the "/android-gcm/configuration/configuration.js" and enter your Google Cloud Messaging API Auth Key!
4. Edit the "/android-gcm/index.js" and set the first variable EXTENSION_ENABLED and to "true" to enable the Extension
5. Restart the CTRL Server and that's it
