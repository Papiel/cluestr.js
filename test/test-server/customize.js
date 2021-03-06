'use strict';

var should = require('should');
var request = require('supertest');
var async = require('async');

var AnyFetch = require('../../lib/index.js');
var configuration = require('../../config/configuration.js');

describe('<Mock server customization>', function() {
  var endpoint = '/status';
  var overridenContent = require('../samples/mock.json');

  var anyfetch = new AnyFetch('email', 'password');

  var server;
  var port = configuration.test.mockPort;
  var mockUrl = 'http://localhost:' + port;
  var mockRequest = request(mockUrl);

  before(function launchMockServer(done) {
    server = AnyFetch.createMockServer();
    server.listen(port, function() {
      console.log('Mock server running on ' + mockUrl);
      AnyFetch.setManagerUrl(mockUrl);
      anyfetch.setApiUrl(mockUrl);

      done();
    });
  });

  afterEach(function restoreAll() {
    server.restore();
  });

  var checkOverriden = function(expected, done) {
    if(!done) {
      done = expected;
      expected = overridenContent;
    }

    mockRequest.get(endpoint)
      .expect(200)
      .expect(expected)
      .end(done);
  };

  describe('Overriding', function() {
    it('should serve overriden JSON', function(done) {
      server.override('get', endpoint, overridenContent);
      checkOverriden(done);
    });

    it('should serve overriden JSON from filename', function(done) {
      var filename = __dirname + '/../samples/mock.json';
      server.override('get', endpoint, filename);
      checkOverriden(done);
    });

    it('should allow `verb` to be omitted and default to GET', function(done) {
      var filename = __dirname + '/../samples/mock.json';
      server.override(endpoint, filename);
      checkOverriden(done);
    });

    it('should ignore endpoint querystring', function(done) {
      var url = endpoint + '?useful=false&nonsense[0]=true';
      server.override(url, overridenContent);
      mockRequest.get(url)
        .expect(200)
        .expect(overridenContent)
        .end(done);
    });

    it('should be able to override /oauth/access_token as well', function(done) {
      server.override('post', '/oauth/access_token', overridenContent);

      var data = {
        client_id: 'chuck_norris',
        client_secret: 'no_need',
        code: '1234',
        grant_type: 'authorization_code'
      };
      mockRequest.post('/oauth/access_token')
        .send(data)
        .expect(200)
        .expect(overridenContent)
        .end(done);
    });

    it('should respond by exact match, then fallback on default var', function(done) {
      var exactContent = {
        exact_match: true
      };

      server.override('get', '/documents/some_exact_id', exactContent);
      server.override('get', '/documents/:id', overridenContent);

      async.waterfall([
        function exactMatch(cb) {
          mockRequest.get('/documents/some_exact_id')
            .expect(200)
            .expect(exactContent)
            .end(cb);
        },
        function defaultMatch(res, cb) {
          mockRequest.get('/documents/expecting_default')
            .expect(200)
            .expect(overridenContent)
            .end(cb);
        }
      ], done);
    });

    describe('overriding with functions', function() {
      var count = 0;
      var customResponder = function(req, res, next) {
        count += 1;
        res.send({custom: true});
        next();
      };

      it('should use overriden function to respond', function(done) {
        var endpoint = '/status';
        count = 0;
        server.override('get', endpoint, customResponder);

        mockRequest.get(endpoint)
          .expect(200)
          .expect(function(res) {
            res.body.should.have.property('custom', true);
            count.should.eql(1);
          })
          .end(done);
      });

      it('should be able to override particular endpoints with a function', function(done) {
        var endpoint = '/marketplace.json';
        count = 0;
        server.override('get', endpoint, customResponder);

        mockRequest.get(endpoint)
          .expect(200)
          .expect(function(res) {
            res.body.should.have.property('custom', true);
            count.should.eql(1);
          })
          .end(done);
      });
    });
  });

  describe('Restoring', function() {
    it('should restore a single endpoint', function(done) {
      server.override(endpoint, overridenContent);
      server.restore(endpoint);
      mockRequest.get(endpoint)
        .expect(200)
        .expect(function(res) {
          should(res.body).be.ok;
          res.body.should.not.have.properties(overridenContent);
        })
        .end(done);
    });

    it('should restore all endpoints', function(done) {
      server.override('/status', overridenContent);
      server.override('/providers', overridenContent);
      server.restore();

      async.parallel({
        'status': function status(cb) {
          mockRequest.get('/status')
            .expect(200)
            .expect(function(res) {
              should(res.body).be.ok;
              res.body.should.not.have.properties(overridenContent);
            })
            .end(cb);
        },
        'providers': function providers(cb) {
          mockRequest.get('/providers')
            .expect(200)
            .expect(function(res) {
              should(res.body).be.ok;
              res.body.should.not.have.properties(overridenContent);
            })
            .end(cb);
        }
      }, done);
    });
  });

  describe('Edge cases', function() {
    it('should err when overriding GET /batch', function() {
      try {
        server.override('/batch', overridenContent);
      } catch(e) {
        should(e).be.ok;
        e.message.should.match(/cannot override \/batch/i);
      }
    });

    it('should err when overriding unknown HTTP verb', function() {
      try {
        server.override('PONY', '/batch', overridenContent);
      } catch(e) {
        should(e).be.ok;
        e.message.should.match(/unknown http verb/i);
      }
    });

    it('should still serve no content on 204 endpoints', function(done) {
      server.override('DELETE', '/token', overridenContent);
      mockRequest.del('/token')
        .expect(204)
        .expect(function(res) {
          should(res.body).be.empty;
        })
        .end(done);
    });
  });

  describe('Arbitrary endpoints', function() {
    it('should be able to override an arbitrary endpoint', function(done) {
      server.override('post', '/manager.json', overridenContent);

      mockRequest.post('/manager.json')
        .expect(200)
        .expect(overridenContent)
        .end(done);
    });

    it('should respond with 404 after being restored', function(done) {
      server.override('delete', '/pony/and/unicorn', overridenContent);
      server.restore('delete', '/pony/and/unicorn');

      mockRequest.del('/pony/and/unicorn')
        .expect(404)
        .expect(/no mock for/i)
        .expect(/\/pony\/and\/unicorn/i)
        .end(done);
    });
  });

  after(function closeMockServer() {
    server.close();
  });
});
