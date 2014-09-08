ctrl-server
===========

 (v0.4)

CTRL server for the IoT. (Real-time, with sockets)

**This is alpha version, still under active development**

How to install and start the server:

0. Download and install Node (www.nodejs.org)
1. Download and install MySQL server (latest one will work). It might be best to install WAMP because there will be an administration website written in PHP.
2. Start WAMP and go to phpMyAdmin page. Create new database called "ctrl_0v4" and Import CREATE.sql located in "/resources/database" of this package.
3. In command prompt, open directory where this file is located and enter: "npm install ."
4. Start server with command: "node server.js" (if you have MySQL password set, edit the "/js/configuration/configuration.js" file!
5. Get putty.exe terminal and connect to "localhost" at port "8000" for Base, or port "9000" for Client.
6. You will have no idea what to do next because I am still writing the documentation and manuals.

Documentation is under development as well as other things. If you would like to get involved contact me at trax at elektronika dot ba (www.elektronika.ba).


Official page where this server will be located is www.ctrl.ba
