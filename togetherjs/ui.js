/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

define(["require", "jquery", "util", "session", "templates", "templating", "linkify", "peers", "windowing", "tinycolor", "elementFinder", "visibilityApi"], function (require, $, util, session, templates, templating, linkify, peers, windowing, tinycolor, elementFinder, visibilityApi) {
  var ui = util.Module('ui');
  var assert = util.assert;
  var AssertionError = util.AssertionError;
  var chat;
  var $window = $(window);
  // This is also in togetherjs.less, as @button-height:
  var BUTTON_HEIGHT = 60 + 1; // 60 is button height, 1 is border
  // chat TextArea
  var TEXTAREA_LINE_HEIGHT = 20; // in pixels
  var TEXTAREA_MAX_LINES = 5;
  // This is also in togetherjs.less, under .togetherjs-animated
  var ANIMATION_DURATION = 1000;
  // Time the new user window sticks around until it fades away:
  var NEW_USER_FADE_TIMEOUT = 5000;
  // This is set when an animation will keep the UI from being ready
  // (until this time):
  var finishedAt = null;
  // Time in milliseconds for the dock to animate out:
  var DOCK_ANIMATION_TIME = 300;
  // If two chat messages come from the same person in this time
  // (milliseconds) then they are collapsed into one message:
  var COLLAPSE_MESSAGE_LIMIT = 5000;

  var COLORS = [
    "#8A2BE2", "#7FFF00", "#DC143C", "#00FFFF", "#8FBC8F", "#FF8C00", "#FF00FF",
    "#FFD700", "#F08080", "#90EE90", "#FF6347"];

  // This would be a circular import, but we just need the chat module sometime
  // after everything is loaded, and this is sure to complete by that time:
  require(["chat"], function (c) {
    chat = c;
  });

  /* Displays some toggleable element; toggleable elements have a
     data-toggles attribute that indicates what other elements should
     be hidden when this element is shown. */
  ui.displayToggle = function (el) {
    // el = $(el);
    // assert(el.length, "No element", arguments[0]);
    // var other = $(el.attr("data-toggles"));
    // assert(other.length, "Cannot toggle", el[0], "selector", other.selector);
    // other.hide();
    // el.show();
  };

  ui.container = null;

  // This is used for some signalling when ui.prepareUI and/or
  // ui.activateUI is called before the DOM is fully loaded:
  var deferringPrepareUI = null;

  function deferForContainer(func) {
    /* Defers any calls to func() until after ui.container is set
       Function cannot have a return value (as sometimes the call will
       become async).  Use like:

       method: deferForContainer(function (args) {...})
       */
    return function () {
      if (ui.container) {
        func.apply(this, arguments);
      }
      var self = this;
      var args = Array.prototype.slice.call(arguments);
      session.once("ui-ready", function () {
        func.apply(self, args);
      });
    };
  }

  // This is called before activateUI; it doesn't bind anything, but does display
  // the dock
  // FIXME: because this module has lots of requirements we can't do
  // this before those requirements are loaded.  Maybe worth splitting
  // this out?  OTOH, in production we should have all the files
  // combined so there's not much problem loading those modules.
  ui.prepareUI = function () {
    if (! (document.readyState == "complete" || document.readyState == "interactive")) {
      // Too soon!  Wait a sec...
      deferringPrepareUI = "deferring";
      document.addEventListener("DOMContentLoaded", function () {
        var d = deferringPrepareUI;
        deferringPrepareUI = null;
        ui.prepareUI();
        // This happens when ui.activateUI is called before the document has been
        // loaded:
        if (d == "activate") {
          ui.activateUI();
        }
      });
      return;
    }
    var container = ui.container = $(templates("interface"));
    $("body").append(container);
  };

  // After prepareUI, this actually makes the interface live.  We have
  // to do this later because we call prepareUI when many components
  // aren't initialized, so we don't even want the user to be able to
  // interact with the interface.  But activateUI is called once
  // everything is loaded and ready for interaction.
  ui.activateUI = function () {
    if (deferringPrepareUI) {
      console.warn("ui.activateUI called before document is ready; waiting...");
      deferringPrepareUI = "activate";
      return;
    }
    if (! ui.container) {
      ui.prepareUI();
    }
    var container = ui.container;

    //create the overlay
    // if($.browser.mobile) {
    //   // $("body").append( "\x3cdiv class='overlay' style='position: absolute; top: 0; left: 0; background-color: rgba(0,0,0,0); width: 120%; height: 100%; z-index: 1000; margin: -10px'>\x3c/div>" );
    // }

    // The following lines should be at the end of this function
    // (new code goes above)
    session.emit("new-element", ui.container);

    session.emit("ui-ready", ui);

  }; // End ui.activateUI()


  session.on('start', function () {
    console.log('session start');
    console.log("Share url", session.shareUrl());
    $('#logBox').append(session.shareUrl() + '\n');
  });

  session.on("close", function () {

    console.log("Close session");

    // if($.browser.mobile) {
    //   // remove bg overlay
    //   //$(".overlay").remove();
    //
    //   //after hitting End, reset window draggin
    //   $("body").css({
    //     "position": "",
    //     top: "",
    //     left: ""
    //   });
    //
    // }

    if (ui.container) {
      ui.container.remove();
      ui.container = null;
    }
    // // Clear out any other spurious elements:
    $(".togetherjs").remove();
    var starterButton = $("#togetherjs-starter button");
    starterButton.removeClass("togetherjs-running");
    if (starterButton.attr("data-start-text")) {
      starterButton.text(starterButton.attr("data-start-text"));
      starterButton.attr("data-start-text", "");
    }
    if (TogetherJS.startTarget) {
      var el = $(TogetherJS.startTarget);
      if (el.attr("data-start-togetherjs-html")) {
        el.html(el.attr("data-start-togetherjs-html"));
      }
      el.removeClass("togetherjs-started");
    }
  });

  ui.chat = {
    text: function (attrs) {},

    joinedSession: function (attrs) {},

    leftSession: function (attrs) {},

    system: function (attrs) {},

    clear: function () {},

    urlChange: function (attrs) {},

    invite: function (attrs) {},

    hideTimeout: null,

    add: function () {},

    scroll: function () {}

  };

  /* This class is bound to peers.Peer instances as peer.view.
     The .update() method is regularly called by peer objects when info changes. */
  ui.PeerView = util.Class({

    constructor: function (peer) {
      assert(peer.isSelf !== undefined, "PeerView instantiated with non-Peer object");
      this.peer = peer;
    },

    /* Takes an element and sets any person-related attributes on the element
       Different from updates, which use the class names we set here: */
    setElement: function (el) {},

    updateDisplay: function () {},

    update: function () {
      this.updateUrlDisplay();
    },

    updateUrlDisplay: function (force) {
      var url = this.peer.url;
      if ((! url) || (url == this._lastUpdateUrlDisplay && ! force)) {
        return;
      }
      this._lastUpdateUrlDisplay = url;
      var sameUrl = url == session.currentUrl();
      if(!sameUrl) {
        console.log('User went to', url, this.peer.title);
        $('#logBox').append('user went to ' + url + '\n');
      }
      return;
    },

    urlNudge: function () {},

    notifyJoined: function () {
      console.log('new peer', this.peer);
      $('#logBox').append('Agent joined' + '\n');
      return;
    },

    // when there are too many participants in the dock, consolidate the participants to one avatar, and on mouseOver, the dock expands down to reveal the rest of the participants
    // if there are X users in the session
    // then hide the users in the dock
    // and shrink the size of the dock
    // and if you rollover the dock, it expands and reveals the rest of the participants in the dock

    //if users hit X then show the participant button with the consol

    dock: function () {},

    undock: function () {},

    scrollTo: function () {
      if (this.peer.url != session.currentUrl()) {
        return;
      }
      var pos = this.peer.scrollPosition;
      if (! pos) {
        console.warn("Peer has no scroll position:", this.peer);
        return;
      }
      pos = elementFinder.pixelForPosition(pos);
      $("html, body").easeTo(pos);
    },

    updateFollow: function () {},

    maybeHideDetailWindow: function (windows) {},

    dockClick: function () {},

    cursor: function () {
      return require("cursor").getClient(this.peer.id);
    },

    destroy: function () {}
  });

  function updateChatParticipantList() {}

  function inviteHubUrl() {}

  var inRefresh = false;

  function refreshInvite() {}

  session.hub.on('invite', function (msg) {
    console.log('session invite', msg);
  });

  function invite(clientId) {}

  ui.showUrlChangeMessage = function () {};

  var setToolName = false;
  ui.updateToolName = function (container) {};

  return ui;

});
