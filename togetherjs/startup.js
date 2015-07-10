/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This module handles all the different UI that happens (sometimes in order) when
   TogetherJS is started:

   - Introduce the session when you've been invited
   - Show any browser compatibility indicators
   - Show the walkthrough the first time
   - Show the share link window

   When everything is done it fires session.emit("startup-ready")

*/
define(["util", "require", "jquery", "storage"], function (util, require, $, storage) {
  var assert = util.assert;
  var startup = util.Module("startup");
  // Avoid circular import:
  var session = null;

  var STEPS = [
    "browserBroken",
    "browserUnsupported"
    ];

  var currentStep = null;

  startup.start = function () {
    if (! session) {
      require(["session"], function (sessionModule) {
        session = sessionModule;
        startup.start();
      });
      return;
    }
    var index = -1;
    if (currentStep) {
      index = STEPS.indexOf(currentStep);
    }
    index++;
    if (index >= STEPS.length) {
      session.emit("startup-ready");
      return;
    }
    currentStep = STEPS[index];
    handlers[currentStep](startup.start);
  };

  var handlers = {

    browserBroken: function (next) {
      if (window.WebSocket) {
        next();
        return;
      }

      // TODO: warn about not supported browser
      console.warn('Browser not supported');
      session.close();

      if ($.browser.msie) {
        // TODO: warn about internet explorer
        console.warn("MSIE");
      }
    },

    browserUnsupported: function (next) {
        next();
    }

  };

  return startup;
});
