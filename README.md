ctrl-server
===========

CTRL server for the IoT. (Real-time, with sockets)

The idea is to connect the Base Station (internet connected hardware) to the Server and forward incoming message to all connected Clients (REST API, Android app, socket connection...) associated to that Base and vice versa. Multiple Clients can be associated to multiple Bases. Administration is done by webadmin found here: https://github.com/elektronika-ba/ctrl-webadmin

---

How to install and start the server:

1. Download and install Node (www.nodejs.org)
2. Now install and start ctrl-webadmin found here: https://github.com/elektronika-ba/ctrl-webadmin
3. In command prompt, go to directory "/js" and type: "npm install ."
4. Now start the Server with command: "node server.js" (if you have MySQL password set, first edit the "/js/configuration/configuration.js" file and then start the server.)
5. Start two more command prompt terminals and navigate to "/resources/client-test" and "/resources/base-test". Type "node test.js" in both and this should connect them both to your local server. In case it doesn't, edit these test.js files and set the IP address to 127.0.0.1 because it might be set to the official CTRL Server (www.ctrl.ba).
6. Take a look at the documentation which is now available in PDF in "/resources/doc".

---

Official page where this server is located is www.ctrl.ba

If you would like to get involved in development/testing contact me at trax at elektronika dot ba (www.elektronika.ba).
