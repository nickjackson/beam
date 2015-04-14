var debug = require('debug')('beam');
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var promise = require('promise');
var denodeify = promise.denodeify;

module.exports = Beam



function Beam(opts){
  opts = opts || {};
  this.prefix = opts.prefix || 'beam:0:';
  this.subscriptions = {};

  debug('setting up beam with prefix %s', this.prefix);

  if (!opts.redis) {
    throw new Error('no redis');
  }

  if (!opts.subRedis) {
    throw new Error('no subRedis');
  }

  this.redis = opts.redis;
  this.redis.smembers = denodeify(this.redis.smembers);

  this.subRedis = opts.subRedis;
  this.subRedis.on('message', this.onRedisMessage.bind(this));
  this.subRedis.subscribe(this.prefix + 'channel');
}


inherits(Beam, EventEmitter);


Beam.prototype.onRedisMessage = function(channel, msg){
  if (channel !== (this.prefix + 'channel')) return;

  try {
    var msg = JSON.parse(msg);
  } catch (e) {
    debug('error parsing redis message json', e, e.stack);
    return;
  }

  this.emit('redisMessage', msg); 
  return this;
}


Beam.prototype.follow = function *(session, fn) {
  var self = this;
  var resources = new Set(yield this.redis.smembers(this.prefix + 'session:' + session));
  this.subscriptions[session] = resources;

  debug('following %s and its %s subscribed resources', session, resources.length);

  var onMessage = this.onMessage.bind(this, session, fn);
  this.on('redisMessage', onMessage);

  this.once('unfollow:' + session, function(){
    self.removeListener('redisMessage', onMessage);
    delete self.subscriptions[session];
    delete resources;
  })

  return true;
}


Beam.prototype.unfollow = function(session){
  this.emit('unfollow:' + session);
}



Beam.prototype.onMessage = function(session, fn, msg){
  var self = this;
  var subs = this.subscriptions;
  var resources = subs[session];

  if (msg.type === 'broadcast') {
    if (!msg.resource) {
      debug('broadcast: no "resource", so ignoring. %o', msg);
      return;
    }

    // if this session is not subscribed to resource,
    // return early.
    if (!resources.has(msg.resource)) return;

    debug('broadcast: for "%s" : sending to "%s"', msg.resource, session);
    process.nextTick(function(){
      self.emit('message', msg);
      fn(msg);
    });
    return;
  }

  // all tasks below require session matching session
  if (!msg.session || msg.session !== session) return;
  
  // unsubscribes all resources from current session
  if (msg.type === 'unsubscribe_all') {
    debug('unsubscribing all from %s', session);
    resources.clear();
    self.emit('message', msg);
    return;
  }

  if (msg.type === 'subscribe') {
    debug('subscribing resource "%s" to "%s"', msg.resource, session);
    resources.add(msg.resource);
    self.emit('message', msg);
  }

  if (msg.type === 'unsubscribe') {
    debug('unsubscribing resource "%s" from "%s"', msg.resource, session);
    resources.delete(msg.resource);
    self.emit('message', msg);
  }
}
