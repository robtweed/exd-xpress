/*

 ----------------------------------------------------------------------------
 | ewd-xpress: Express and ewd-qoper8 based application container           |
 |                                                                          |
 | Copyright (c) 2016 M/Gateway Developments Ltd,                           |
 | Reigate, Surrey UK.                                                      |
 | All rights reserved.                                                     |
 |                                                                          |
 | http://www.mgateway.com                                                  |
 | Email: rtweed@mgateway.com                                               |
 |                                                                          |
 |                                                                          |
 | Licensed under the Apache License, Version 2.0 (the "License");          |
 | you may not use this file except in compliance with the License.         |
 | You may obtain a copy of the License at                                  |
 |                                                                          |
 |     http://www.apache.org/licenses/LICENSE-2.0                           |
 |                                                                          |
 | Unless required by applicable law or agreed to in writing, software      |
 | distributed under the License is distributed on an "AS IS" BASIS,        |
 | WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. |
 | See the License for the specific language governing permissions and      |
 |  limitations under the License.                                          |
 ----------------------------------------------------------------------------

  27 April 2016

*/

/*
var params = {
  managementPassword: 'keepThisSecret!',
  serverName: 'New EWD Server',
  port: 8081,
  poolSize: 1
};
var ewdXpress = require('ewd-xpress').master;
ewdXpress(config);
*/

var express = require('express');
var bodyParser = require('body-parser');
var qoper8 = require('ewd-qoper8');
var qx = require('ewd-qoper8-express');
var sockets = require('./sockets');
var fs = require('fs');
var util = require('util');
var app = express();
app.use(bodyParser.json());

var q = new qoper8.masterProcess();
qx.addTo(q);

module.exports = function(params) {


  var config = {
    managementPassword: params.managementPassword || 'keepThisSecret',
    serverName: params.serverName || 'ewd-xpress',
    port: params.port || 8080,
    poolSize: params.poolSize || 1,
    webServerRootPath: params.webServerRootPath || process.cwd() + '/www/',
    no_sockets: params.no_sockets || false,
    qxBuild: qx.build,
    masterProcessPid: process.pid,
    database: params.database
  };

  app.post('/ajax', function(req, res) {
    console.log('/ajax body: ' + JSON.stringify(req.body));
    qx.handleMessage(req, res);
  });

  console.log('webServerRootPath = ' + config.webServerRootPath);
  app.use('/', express.static(config.webServerRootPath))

  q.on('start', function() {
    this.worker.module = 'ewd-xpress.worker';
    //this.worker.loaderFilePath = 'node_modules/ewd-xpress/node_modules/ewd_qoper8-worker.js';
    this.setWorkerPoolSize(config.poolSize);
  });

  q.on('started', function() {
    this.userDefined = {
      config: config
    };
    var q = this;
    var io;
    var server = app.listen(config.port);
    if (!config.no_sockets) io = require('socket.io')(server);
    // load ewd-xpress socket handling logic
    if (io) sockets(q, io);

    q.on('response', function(messageObj) {
      // handle intermediate messages from worker (which hasn't finished)
      if (messageObj.socketId) {
        var id = messageObj.socketId;
        delete messageObj.socketId;
        delete messageObj.finished;
        io.to(id).emit('ewdjs', messageObj);
      }
    });

  });

  q.start();

};

