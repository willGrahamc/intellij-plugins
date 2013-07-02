var cli = require("./intellijCli.js")
  , BaseReporter = cli.requireKarmaModule('lib/reporters/Base.js')
  , intellijUtil = require('./intellijUtil.js')
  , util = require('util')
  , Tree = require('./tree.js');

function getOrCreateBrowserNode(tree, browser) {
  var configFileNode = tree.configFileNode;
  var browserNode = configFileNode.lookupMap[browser.id];
  if (!browserNode) {
    browserNode = configFileNode.addChild(browser.name, true, 'browser', null);
    configFileNode.lookupMap[browser.id] = browserNode;
    browserNode.writeStartMessage();
  }
  return browserNode;
}

function addBrowserErrorNode(tree, browser, error) {
  var browserNode = getOrCreateBrowserNode(tree, browser);
  var browserErrorNode = browserNode.addChild('Error', false, 'browserError', null);
  browserErrorNode.writeStartMessage();
  browserErrorNode.setStatus(3, null, error);
  browserErrorNode.writeFinishMessage();
}

function getOrCreateLowerSuiteNode(browserNode, suiteNames, write) {
  var node = browserNode
    , len = suiteNames.length;
  for (var i = 0; i < len; i++) {
    var suiteName = suiteNames[i];
    if (suiteName == null) {
      suiteNames.splice(i, 1);
      var message = "[Karma bug found] Suite name is null. Please file an issue in the https://github.com/karma-runner/karma/issues";
      console.error(message);
      write(message + '\n');
      continue;
    }
    var nextNode = node.lookupMap[suiteName];
    if (!nextNode) {
      var locationHint = intellijUtil.joinList(suiteNames, 0, i + 1, '.');
      nextNode = node.addChild(suiteName, true, 'suite', locationHint);
      node.lookupMap[suiteName] = nextNode;
      nextNode.writeStartMessage();
    }
    node = nextNode;
  }
  return node;
}

function createSpecNode(suiteNode, suiteNames, specName) {
  var specNode = suiteNode.lookupMap[specName];
  if (specNode) {
    throw Error("Spec node is already created");
  }
  var names = suiteNames.slice();
  names.push(specName);
  var locationHint = intellijUtil.joinList(names, 0, names.length, '.');
  specNode = suiteNode.addChild(specName, false, 'test', locationHint);
  specNode.writeStartMessage();
  return specNode;
}

function FileListTracker(globalEmitter) {
  var currentFilesPromise = null;
  globalEmitter.on('file_list_modified', function(filesPromise) {
    currentFilesPromise = filesPromise;
  });
  this.dumpFiles = function() {
    if (currentFilesPromise) {
      currentFilesPromise.then(function(files) {
        if (files) {
          intellijUtil.sendIntellijEvent('servedFiles', files.served);
        }
        currentFilesPromise = null;
      });
    }
  };
}

function sendBrowserEvents(eventType, connectionId2BrowserNameObjA, connectionId2BrowserNameObjB) {
  for (var connectionId in connectionId2BrowserNameObjA) {
    if (connectionId2BrowserNameObjA.hasOwnProperty(connectionId)) {
      if (!connectionId2BrowserNameObjB.hasOwnProperty(connectionId)) {
        var event = {id: connectionId, name: connectionId2BrowserNameObjA[connectionId]};
        intellijUtil.sendIntellijEvent(eventType, event);
      }
    }
  }
}

function startBrowsersTracking(globalEmitter) {
  var oldConnectionId2BrowserNameObj = {};
  globalEmitter.on('browsers_change', function(capturedBrowsers) {
    if (!capturedBrowsers.forEach) {
      // filter out events from Browser object
      return;
    }
    var newConnectionId2BrowserNameObj = {};
    var proceed = true;
    capturedBrowsers.forEach(function(newBrowser) {
      if (!newBrowser.id || !newBrowser.name || newBrowser.id === newBrowser.name) {
        proceed = false;
      }
      newConnectionId2BrowserNameObj[newBrowser.id] = newBrowser.name;
    });
    if (proceed) {
      sendBrowserEvents('browserConnected', newConnectionId2BrowserNameObj, oldConnectionId2BrowserNameObj);
      sendBrowserEvents('browserDisconnected', oldConnectionId2BrowserNameObj, newConnectionId2BrowserNameObj);
      oldConnectionId2BrowserNameObj = newConnectionId2BrowserNameObj;
    }
  });
}

function IntellijReporter(formatError, globalEmitter) {
  var fileListManager = new FileListTracker(globalEmitter);
  startBrowsersTracking(globalEmitter);
  BaseReporter.call(this, formatError, false);
  this.adapters = [];

  var that = this;
  var write = function (msg) {
    that.adapters.forEach(function(adapter) {
      adapter(msg);
    });
  };

  var tree;

  this.onRunStart = function (browsers) {
    tree = new Tree(cli.getConfigFile(), write);
    fileListManager.dumpFiles();
  };

  this.onBrowserError = function (browser, error) {
    addBrowserErrorNode(tree, browser, error);
  };

  this.onBrowserDump = function (browser, dump) {
    if (dump.length === 1) {
      dump = dump[0];
    }

    dump = util.inspect(dump, false, undefined, true);
    write(dump + '\n');
  };

  this.onSpecComplete = function (browser, result) {
    var browserNode = getOrCreateBrowserNode(tree, browser);
    var suiteNode = getOrCreateLowerSuiteNode(browserNode, result.suite, write);
    var specNode = createSpecNode(suiteNode, result.suite, result.description);
    var status;
    if (result.success) {
      status = 0;
    }
    else if (result.skipped) {
      status = 1;
    }
    else {
      status = 2;
    }
    var failureMsg = '';
    result.log.forEach(function (log) {
      failureMsg += formatError(log, '\t');
    });
    specNode.setStatus(status, result.time, failureMsg);
    specNode.writeFinishMessage();
  };

  this.onRunComplete = function (browsers, results) {
    tree.configFileNode.finishIfStarted();
    tree = null;
  };
}

IntellijReporter.$inject = ['formatError', 'emitter'];

module.exports = IntellijReporter;
