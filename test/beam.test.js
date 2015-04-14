var Beam = require('..');
var Driver = require('../driver');
var co = require('co');
var expect = require('expect.js');
var wrapper = require('co-redis');
var Redis = require('redis');
var Promise = require('promise');


function createRedis(){
  return Redis.createClient(49153, '192.168.99.100')
}

var beam = new Beam({
  redis: createRedis(),
  subRedis: createRedis()
})

var driver = new Driver({
  redis: createRedis(),
})

var redis = wrapper(createRedis());
var pubsub = wrapper(createRedis());



function *wait(b, session){
  return co(function(){
    return new Promise(function(res, rej){
      b.once('message', function(msg){
        process.nextTick(res.bind(null, msg));
      })
    })
  })
}

describe('Beam', function(done){

  beforeEach(function *(){
    yield redis.flushdb();
  })

  after(function *(){
    yield redis.flushdb();
  })

  it('requires redis to start', function(){
    function fn(){
      new Beam();
    }
    expect(fn).to.throwException(function(e){
      expect(e.message).to.eql('no redis')
    });
  })

  it('requires redis subRedis to start', function(){
    function fn(){
      new Beam({redis:createRedis()});
    }
    expect(fn).to.throwException(function(e){
      expect(e.message).to.eql('no subRedis')
    });
  })

  describe('message parsing', function(){
    it('ignores messages to incorrect channels', function (){
      expect(beam.onRedisMessage('foo')).to.be(undefined);
    });

    it('ignores invalid json', function(){
      expect(beam.onRedisMessage('beam:0:channel', '{fffff')).to.be(undefined);
    })

    it('does not ignore messages to correct channels', function (done){
      beam.once('redisMessage', function(msg){
        expect(msg).to.eql({foo: 'bar'})
        done();
      })

      expect(beam.onRedisMessage('beam:0:channel', '{"foo":"bar"}')).to.be(beam);
    });
  })

  

  it('should be able to keep track of subscriptions for a single session', function *(){
    yield driver.subscribe('fred', 'dogpix');
    yield beam.follow('fred', function(){});
    var subs = beam.subscriptions;
    
    expect(beam.listeners('redisMessage')).to.have.length(1);

    expect(subs.fred.has('dogpix')).to.be.ok();
    expect(subs.fred.size).to.eql(1);
    expect(yield redis.smembers('beam:0:session:fred')).to.eql(['dogpix']);

    yield driver.subscribe('fred', 'catpix');
    yield wait(beam, 'fred');

    expect(subs.fred.has('dogpix')).to.be.ok();
    expect(subs.fred.has('catpix')).to.be.ok();
    expect(subs.fred.size).to.eql(2);
    expect(yield redis.smembers('beam:0:session:fred')).to.eql(['catpix', 'dogpix']);

    yield driver.unsubscribe('fred', 'catpix');
    yield wait(beam, 'fred');

    expect(subs.fred.has('dogpix')).to.be.ok();
    expect(subs.fred.size).to.eql(1);
    expect(yield redis.smembers('beam:0:session:fred')).to.eql(['dogpix']);

    yield driver.unsubscribe('fred');
    yield wait(beam, 'fred');

    expect(subs.fred.size).to.eql(0);
    expect(yield redis.smembers('beam:0:session:fred')).to.eql([]);

    beam.unfollow('fred');
    expect(subs.fred).to.be(undefined);
    expect(beam.listeners('redisMessage')).to.have.length(0);

  })

  it('should be able to keep track of subscriptions for multiple sessions', function *(){
    yield driver.subscribe('fred', 'dogpix');
    yield driver.subscribe('sally', 'dogpix');
    yield beam.follow('fred', function(){});
    yield beam.follow('sally', function(){});


    var subs = beam.subscriptions;
    expect(beam.listeners('redisMessage')).to.have.length(2);

    expect(subs.fred.has('dogpix')).to.be.ok();
    expect(subs.fred.size).to.eql(1);
    expect(yield redis.smembers('beam:0:session:fred')).to.eql(['dogpix']);
    expect(subs.sally.has('dogpix')).to.be.ok();
    expect(subs.sally.size).to.eql(1);
    expect(yield redis.smembers('beam:0:session:sally')).to.eql(['dogpix']);

    yield driver.subscribe('fred', 'catpix');
    yield wait(beam, 'fred');

    expect(subs.fred.has('dogpix')).to.be.ok();
    expect(subs.fred.has('catpix')).to.be.ok();
    expect(subs.fred.size).to.eql(2);
    expect(yield redis.smembers('beam:0:session:fred')).to.eql(['catpix', 'dogpix']);
    expect(subs.sally.has('dogpix')).to.be.ok();
    expect(subs.sally.size).to.eql(1);
    expect(yield redis.smembers('beam:0:session:sally')).to.eql(['dogpix']);

    yield driver.unsubscribe('sally', 'dogpix');
    yield wait(beam, 'sally');

    expect(subs.fred.has('dogpix')).to.be.ok();
    expect(subs.fred.has('catpix')).to.be.ok();
    expect(subs.fred.size).to.eql(2);
    expect(yield redis.smembers('beam:0:session:fred')).to.eql(['catpix', 'dogpix']);
    expect(subs.sally.size).to.eql(0);
    expect(yield redis.smembers('beam:0:session:sally')).to.eql([]);

    yield driver.unsubscribe('fred');
    yield driver.subscribe('sally', 'turtlepix');
    yield wait(beam, 'fred');
    yield wait(beam, 'sally');

    expect(subs.fred.size).to.eql(0);
    expect(yield redis.smembers('beam:0:session:fred')).to.eql([]);
    expect(subs.sally.has('turtlepix')).to.be.ok();
    expect(subs.sally.size).to.eql(1);
    expect(yield redis.smembers('beam:0:session:sally')).to.eql(['turtlepix']);

    beam.unfollow('fred');
    expect(subs.fred).to.be(undefined);
    expect(beam.listeners('redisMessage')).to.have.length(1);

    beam.unfollow('sally');
    expect(subs.sally).to.be(undefined);
    expect(beam.listeners('redisMessage')).to.have.length(0);
  })
    
  it('should correctly respond to broadcast event', function *(done){
    yield beam.follow('fred', function(msg){
      expect(msg).to.eql({
        resource: 'catpix',
        body: {bar: 'foo'},
        type: 'broadcast'
      })
      beam.unfollow('fred');
      done();
    });
    
    yield driver.subscribe('fred', 'catpix');
    yield driver.broadcast('catpix', {bar: 'foo'});
  })

  it('should correctly respond to multiple broadcast events', function *(done){
    yield beam.follow('fred', function(msg){
      expect(msg).to.eql({
        resource: 'catpix',
        body: {bar: 'cat'},
        type: 'broadcast'
      })
      beam.unfollow('fred');
    });

    var count = 2;

    yield beam.follow('sally', function(msg){
      if (--count) {
        expect(msg).to.eql({
          resource: 'catpix',
          body: {bar: 'cat'},
          type: 'broadcast'
        })
        return;
      }

      expect(msg).to.eql({
        resource: 'dogpix',
        body: {bar: 'dog'},
        type: 'broadcast'
      })

      beam.unfollow('sally');
      done();
    });
    
    yield driver.subscribe('fred', 'catpix');
    yield driver.subscribe('sally', 'catpix');
    yield driver.subscribe('sally', 'dogpix');

    yield driver.broadcast('catpix', {bar: 'cat'});
    yield driver.broadcast('dogpix', {bar: 'dog'});
  })

  it('should handle multiple follows of the same session', function *(done){
    var two = 2;

    function finished(){
      if (--two) return;
      beam.unfollow('fred');
      done();
    }

    yield beam.follow('fred', function(msg){
      expect(msg).to.eql({
        resource: 'catpix',
        body: {bar: 'cat'},
        type: 'broadcast'
      })
      finished();
    });

    yield beam.follow('fred', function(msg){
      expect(msg).to.eql({
        resource: 'catpix',
        body: {bar: 'cat'},
        type: 'broadcast'
      })
      finished();
    });

    yield driver.subscribe('fred', 'catpix');
    yield driver.broadcast('catpix', {bar: 'cat'});
  })

  it('should ignore broadcasts without resource', function *(done){
    yield beam.follow('fred', function(msg){
      expect(msg).to.eql({
        resource: 'catpix',
        body: {bar: 'foo'},
        type: 'broadcast'
      })
      beam.unfollow('fred');
      done();
    });
    
    yield driver.subscribe('fred', 'catpix');
    yield pubsub.publish('beam:0:channel', JSON.stringify({
      type: 'broadcast',
      body: {bar: 'foo'},
      // resource: 'catpix' // this is what we are testing
    }))
    yield driver.broadcast('catpix', {bar: 'foo'});
  })
})