var Beam = require('..');
var co = require('co');
var expect = require('expect.js');
var wrapper = require('co-redis');
var Redis = require('redis');
var Promise = require('promise');


function createClient(){
  var r = (process.env.REDIS || 'localhost:6379').split(':')
  return Redis.createClient(r[1], r[0]);
}

var driver = Beam({
  redis: createClient(),
})

var beam = Beam({
  redis: createClient(),
  subRedis: createClient()
})

var redis = wrapper(createClient());
var pubsub = wrapper(createClient());


function *wait(b, key){
  return co(function(){
    return new Promise(function(res, rej){
      b.once(key, function(msg){
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

  it('instantiates correctly without listening', function(){
    var beam = new Beam({redis: createClient()});
    expect(beam.listening).to.be(undefined);
    beam.end();

    var beam = Beam({redis: createClient()});
    expect(beam.listening).to.be(undefined);
    beam.end();
  })

  it('instantiates correctly with listening', function(){
    var beam = new Beam({redis: createClient(), subRedis: createClient()});
    expect(beam.listening).to.be(true);
    beam.end();

    var beam = Beam({redis: createClient(), subRedis: createClient()});
    expect(beam.listening).to.be(true);
    beam.end();
  })


  describe('message parsing', function(){
    it('ignores messages to incorrect channels', function (){
      expect(beam.onRedisMessage('foo')).to.be(undefined);
    });

    it('ignores invalid json', function(){
      expect(beam.onRedisMessage('beam:0:channel', '{fffff')).to.be(undefined);
    })

    it('does not ignore messages to correct channels', function (done){
      beam.once('message', function(msg){
        expect(msg).to.eql({foo: 'bar'})
        done();
      })

      expect(beam.onRedisMessage('beam:0:channel', '{"foo":"bar"}')).to.be(beam);
    });
  })
  

  it('should be able to keep track of subscriptions for a single session', function *(){
    yield driver.subscribe('fred', 'dogpix');
    var unfollow = yield beam.follow('fred', function(){});
    var subs = beam.subscriptions;
    
    expect(beam.listeners('message')).to.have.length(1);

    expect(subs.fred.resources.has('dogpix')).to.be.ok();
    expect(subs.fred.resources.size).to.eql(1);
    expect(yield redis.smembers('beam:0:session:fred')).to.only.contain('dogpix');

    yield driver.subscribe('fred', 'catpix');
    yield wait(beam, 'message');

    expect(subs.fred.resources.has('dogpix')).to.be.ok();
    expect(subs.fred.resources.has('catpix')).to.be.ok();
    expect(subs.fred.resources.size).to.eql(2);
    expect(yield redis.smembers('beam:0:session:fred')).to.only.contain('catpix', 'dogpix');

    yield driver.unsubscribe('fred', 'catpix');
    yield wait(beam, 'message');

    expect(subs.fred.resources.has('dogpix')).to.be.ok();
    expect(subs.fred.resources.size).to.eql(1);
    expect(yield redis.smembers('beam:0:session:fred')).to.only.contain('dogpix');

    yield driver.unsubscribe('fred');
    yield wait(beam, 'message');

    expect(subs.fred.resources.size).to.eql(0);
    expect(yield redis.smembers('beam:0:session:fred')).to.be.empty();

    unfollow();
    expect(subs.fred).to.be(undefined);
    expect(beam.listeners('message')).to.have.length(0);

  })

  it('should be able to keep track of subscriptions for multiple sessions', function *(){
    yield driver.subscribe('fred', 'dogpix');
    yield driver.subscribe('sally', 'dogpix');
    var unFred = yield beam.follow('fred', function(){});
    var unSally = yield beam.follow('sally', function(){});


    var subs = beam.subscriptions;
    expect(beam.listeners('message')).to.have.length(2);

    expect(subs.fred.resources.has('dogpix')).to.be.ok();
    expect(subs.fred.resources.size).to.eql(1);
    expect(yield redis.smembers('beam:0:session:fred')).to.only.contain('dogpix');
    expect(subs.sally.resources.has('dogpix')).to.be.ok();
    expect(subs.sally.resources.size).to.eql(1);
    expect(yield redis.smembers('beam:0:session:sally')).to.only.contain('dogpix');

    yield driver.subscribe('fred', 'catpix');
    yield wait(beam, 'message');

    expect(subs.fred.resources.has('dogpix')).to.be.ok();
    expect(subs.fred.resources.has('catpix')).to.be.ok();
    expect(subs.fred.resources.size).to.eql(2);
    expect(yield redis.smembers('beam:0:session:fred')).to.only.contain('catpix', 'dogpix');
    expect(subs.sally.resources.has('dogpix')).to.be.ok();
    expect(subs.sally.resources.size).to.eql(1);
    expect(yield redis.smembers('beam:0:session:sally')).to.only.contain('dogpix');

    yield driver.unsubscribe('sally', 'dogpix');
    yield wait(beam, 'message');

    expect(subs.fred.resources.has('dogpix')).to.be.ok();
    expect(subs.fred.resources.has('catpix')).to.be.ok();
    expect(subs.fred.resources.size).to.eql(2);
    expect(yield redis.smembers('beam:0:session:fred')).to.only.contain('catpix', 'dogpix');
    expect(subs.sally.resources.size).to.eql(0);
    expect(yield redis.smembers('beam:0:session:sally')).to.be.empty();

    yield driver.unsubscribe('fred');
    yield wait(beam, 'message');
    yield driver.subscribe('sally', 'turtlepix');
    yield wait(beam, 'message');

    expect(subs.fred.resources.size).to.eql(0);
    expect(yield redis.smembers('beam:0:session:fred')).to.be.empty();
    expect(subs.sally.resources.has('turtlepix')).to.be.ok();
    expect(subs.sally.resources.size).to.eql(1);
    expect(yield redis.smembers('beam:0:session:sally')).to.only.contain('turtlepix');

    unFred();
    expect(subs.fred).to.be(undefined);
    expect(beam.listeners('message')).to.have.length(1);

    unSally();
    expect(subs.sally).to.be(undefined);
    expect(beam.listeners('message')).to.have.length(0);
  })
    
  it('should correctly respond to broadcast event', function *(done){
    var unfollow = yield beam.follow('fred', function(msg){
      expect(msg).to.eql({
        resource: 'catpix',
        body: {bar: 'foo'},
        type: 'broadcast'
      })
      unfollow();
      done();
    });
    
    yield driver.subscribe('fred', 'catpix');
    yield driver.broadcast('catpix', {bar: 'foo'});
  })

  it('should not respond to a broadcast that its not subscribed to', function *(done){
    var unfollow = yield beam.follow('fred', function(msg){
      throw new Error('should not have reached here');
    });
    
    yield driver.broadcast('catpix', {bar: 'foo'});
    setTimeout(function(){
      unfollow();
      done();
    }, 30)
  })

  it('should correctly respond to multiple broadcast events', function *(done){
    var unfollowFred = yield beam.follow('fred', function(msg){
      expect(msg).to.eql({
        resource: 'catpix',
        body: {bar: 'cat'},
        type: 'broadcast'
      })
      unfollowFred();
    });

    var count = 2;

    var unfollowSally = yield beam.follow('sally', function(msg){
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

      unfollowSally();
      done();
    });
    
    yield driver.subscribe('fred', 'catpix');
    yield driver.subscribe('sally', 'catpix');
    yield driver.subscribe('sally', 'dogpix');

    yield driver.broadcast('catpix', {bar: 'cat'});
    yield driver.broadcast('dogpix', {bar: 'dog'});
  })

  it('should handle multiple follows of the same session', function *(done){
    var subs = beam.subscriptions;
    var two = 2;

    function finished(){
      if (--two) return;
      expect(subs.fred.registers).to.eql(2);
      unfollow1();
      expect(subs.fred.registers).to.eql(1);
      unfollow2();
      expect(subs.fred).to.be(undefined);
      done();
    }

    var unfollow1 = yield beam.follow('fred', function(msg){
      expect(msg).to.eql({
        resource: 'catpix',
        body: {bar: 'cat'},
        type: 'broadcast'
      })
      finished();
    });

    var unfollow2 = yield beam.follow('fred', function(msg){
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

  it('should not do anything when unfollow already complete', function *(){
    var subs = beam.subscriptions;
    var unfollow = yield beam.follow('fred', function(){});
    expect(unfollow()).to.be(true);
    expect(subs.fred).to.be(undefined);
    expect(unfollow()).to.be(false);
  })

  it('should ignore broadcasts without resource', function *(done){
    var unfollow = yield beam.follow('fred', function(msg){
      expect(msg).to.eql({
        resource: 'catpix',
        body: {bar: 'foo'},
        type: 'broadcast'
      })
      unfollow();
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

  describe('.subscribe()', function(){
    it('adds item to set corectly', function *(){
      yield driver.subscribe('fred', 'catpix');
      var val = yield redis.smembers('beam:0:session:fred');
      expect(val).to.be.an(Array);
      expect(val).to.only.contain('catpix');
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
      expect(fred).to.only.contain('catpix', 'dogpix');

      var sally = yield redis.smembers('beam:0:session:sally')
      expect(sally).to.be.an(Array);
      expect(sally).to.only.contain('dogpix');
    })

    it('unsubscribes all correctly', function *(){
      yield driver.subscribe('sally', 'catpix');
      yield driver.subscribe('fred', 'catpix');
      yield driver.subscribe('sally', 'dogpix');
      yield driver.subscribe('fred', 'dogpix');

      var sally = yield redis.smembers('beam:0:session:sally');
      expect(sally).to.be.an(Array);
      expect(sally).to.only.contain('catpix', 'dogpix');

      yield driver.unsubscribe('sally');

      var fred = yield redis.smembers('beam:0:session:fred');
      expect(fred).to.be.an(Array);
      expect(fred).to.only.contain('catpix', 'dogpix');

      var sally = yield redis.smembers('beam:0:session:sally');
      expect(sally).to.be.an(Array);
      expect(sally).to.be.empty();
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