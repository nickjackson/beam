var Beam = require('..');
var Driver = require('../driver');

var expect = require('expect.js');
var wrapper = require('co-redis');
var Redis = require('redis');

function createRedis(){
  return Redis.createClient(49153, '192.168.99.100')
}

var driver = new Driver({
  redis: createRedis(),
})

var redis = wrapper(createRedis());
var pubsub = wrapper(createRedis());

describe('BeamDriver', function(done){
  afterEach(function *(){
    yield redis.flushdb();
  })

  it('requires redis to start', function(){
    function fn(){
      new Driver();
    }
    expect(fn).to.throwException(function(e){
      expect(e.message).to.eql('no redis')
    });
  })

  describe('.subscribe()', function(){
    it('adds item to set corectly', function *(){
      yield driver.subscribe('fred', 'catpix');
      var val = yield redis.smembers('beam:0:session:fred');
      expect(val).to.be.an(Array);
      expect(val[0]).to.eql('catpix');
    })

    it('correctly emits event', function *(done){
      pubsub.once("message", function(channel, message){
        expect(channel).to.eql('beam:0:channel');
        expect(JSON.parse(message)).to.eql({
          type: 'subscribe',
          session: 'fred',
          resource: 'catpix'
        });
        done();
      })
      pubsub.subscribe('beam:0:channel');
      yield driver.subscribe('fred', 'catpix');
    })
  })

  describe('.unsubscribe()', function(){
    it('removes item from set corectly', function *(){
      yield driver.subscribe('sally', 'catpix');
      yield driver.subscribe('fred', 'catpix');
      yield driver.subscribe('sally', 'dogpix');
      yield driver.subscribe('fred', 'dogpix');
 
      yield driver.unsubscribe('sally', 'catpix');

      var fred = yield redis.smembers('beam:0:session:fred');
      expect(fred).to.be.an(Array);
      expect(fred).to.have.length(2);
      expect(fred[0]).to.eql('catpix');
      expect(fred[1]).to.eql('dogpix');

      var sally = yield redis.smembers('beam:0:session:sally')
      expect(sally).to.be.an(Array);
      expect(sally).to.have.length(1);
      expect(sally[0]).to.eql('dogpix');
    })

    it('unsubscribes all correctly', function *(){
      yield driver.subscribe('sally', 'catpix');
      yield driver.subscribe('fred', 'catpix');
      yield driver.subscribe('sally', 'dogpix');
      yield driver.subscribe('fred', 'dogpix');

      var sally = yield redis.smembers('beam:0:session:sally');
      expect(sally).to.be.an(Array);
      expect(sally).to.have.length(2);

      yield driver.unsubscribe('sally');

      var fred = yield redis.smembers('beam:0:session:fred');
      expect(fred).to.be.an(Array);
      expect(fred).to.have.length(2);
      expect(fred[0]).to.eql('catpix');
      expect(fred[1]).to.eql('dogpix');

      var sally = yield redis.smembers('beam:0:session:sally');
      expect(sally).to.be.an(Array);
      expect(sally).to.have.length(0);
    })

    it('correctly emits event', function *(done){
      pubsub.once("message", function(channel, message){
        expect(channel).to.eql('beam:0:channel');
        expect(JSON.parse(message)).to.eql({
          type: 'unsubscribe',
          session: 'fred',
          resource: 'catpix'
        });
        done();
      })
      pubsub.subscribe('beam:0:channel');
      yield driver.unsubscribe('fred', 'catpix');
    })

    it('correctly emits event when unsubscribing all', function *(done){
      pubsub.once("message", function(channel, message){
        expect(channel).to.eql('beam:0:channel');
        expect(JSON.parse(message)).to.eql({
          type: 'unsubscribe_all',
          session: 'fred'
        });
        done();
      })
      pubsub.subscribe('beam:0:channel');
      yield driver.unsubscribe('fred');
    })
  })

  describe('.broadcast()', function(){
    it('correctly emits event', function *(done){
      pubsub.once("message", function(channel, message){
        expect(channel).to.eql('beam:0:channel');
        expect(JSON.parse(message)).to.eql({
          type: 'broadcast',
          resource: 'catpix',
          body: {foo: 'bar'}
        });
        done();
      })
      pubsub.subscribe('beam:0:channel');
      yield driver.broadcast('catpix', {foo: 'bar'});
    })
  })
})






