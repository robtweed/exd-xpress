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

var sessions = require('ewd-session');

function extendSession() {

  Object.defineProperty(this, 'socketId', {
    get: function() {
      return this.data.$('ewd-session').$('socketId').value;
    },
    set: function(socketId) {
      this.data.$('ewd-session').$('socketId').value = socketId;
    }
  });

}

module.exports = function() {

  this.on('message', function(messageObj, send, finished) {

    if (!this.documentStore) {
      finished({error: 'No Document Store has been created - you must use ewd-document-store!'});
      return;
    }

    var session;
    var type = messageObj.type;

    if (type === 'ewd-qoper8-express') {
      messageObj = messageObj.body;
      type = messageObj.type;
      console.log('ewd-qoper8-express message remapped to: type ' + type + ': ' + JSON.stringify(messageObj));
    }

    if (type === 'ewd-register') {
      // register a new application user
      session = sessions.create(messageObj.application, 300);
      extendSession.call(session);
      session.socketId = messageObj.socketId;

      finished({token: session.token});
      return;
    }

    var result = sessions.authenticate(messageObj.token, 'noCheck');
    if (result.error) {
      finished({
        error: result.error,
        disconnect: true
      });
      return;
    }
    session = result.session;
    extendSession.call(session);

    if (type === 'ewd-reregister') {
      console.log('re-register token ' + messageObj.token);
      session.socketId = messageObj.socketId;
      finished({ok: true});
      return;
    }

    session.updateExpiry();
    var application = session.application;
    var error;

    // if no handlers have yet been loaded for the incoming application request
    //  load them now...

    if (!this.handlers[application]) {
      try {
        var appModule = require(application);
        if (appModule.handlers) this.handlers[application] = appModule.handlers;
        if (appModule.servicesAllowed) this.servicesAllowed[application] = appModule.servicesAllowed;
        console.log('handler module loaded for ' + application);
      }
      catch(err) {
        error = 'Unable to load handler module for: ' + application;
        console.log(error);
        finished({error: error});
        return;
      }
    }

    // is this a service request, and if so, is it allowed for this application?

    var appHandlers = this.handlers[application];
    var servicesAllowed = this.servicesAllowed[application];
    var service = messageObj.service;

    if (service) {
      // this is a request for a service handler
      //  first, check if the service is permitted for the user's application, and if so,
      //  make sure the service handlers are loaded

      if (servicesAllowed && servicesAllowed[service]) {
        if (!this.handlers[service]) {
          try {
            this.handlers[service] = require(service).handlers;
            console.log('handler module loaded for ' + service);
          }
          catch(err) {
            error = 'Unable to load handler module: ' + service;
            console.log(error);
            finished({error: error});
            return;
          }
        }
        if (this.handlers[service][type]) {
          // invoke the handler for this message
          this.handlers[service][type].call(this, messageObj, session, send, finished);
          return;
        }
        else {
          finished({error: 'No handler defined for ' + service + ' service messages of type ' + type});
          return;
        }        
      }
      else {
        finished({error: service + ' service is not permitted for the ' + application + ' application'})
        return;
      }
    }

    // handlers are available for this user's application
    // try to invoked the appropriate one for the incoming request

    if (this.handlers[application][type]) {
      // invoke the handler for this message
      var fin = function(results) {
        results.ewd_application = application;
        finished(results);
      };
      this.handlers[application][type].call(this, messageObj, session, send, fin);
    }
    else {
      finished({error: 'No handler defined for ' + application + ' messages of type ' + type});
    }

  });
  
};