'use strict';

var restify = require('restify');

var filename = require('../helpers/endpoint-filename.js');
var configuration = require('../../config/configuration.js');

var server = restify.createServer();

var respondTo = function(config) {
  if(config.requireId) {
    config.endpoint = config.endpoint.replace('{id}', ':id');
  }
  if(config.requireIdentifier) {
    config.endpoint = config.endpoint.replace('{identifier}', ':identifier');
  }

  server[config.method](config.endpoint, function(req, res, next) {
    // TODO
    // if (invalid request)
    //   next(new restify.error))

    // No content
    if (config.expectedStatus === 204) {
      res.send(204);
    }
    // Some mocked content
    else {
      var json = require('./mocks/' + filename(config) + '.json');
      res.send(config.expectedStatus, json);
    }

    return next();
  });
};

Object.keys(configuration.apiDescriptors).forEach(function(name) {
  var config = configuration.apiDescriptors[name];

  respondTo(config);

  if(config.subFunctions) {
    Object.keys(config.subFunctions).forEach(function(name) {
      var subConfig = config.subFunctions[name];
      respondTo(subConfig);
    });
  }
});

module.exports = server;