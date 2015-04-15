
/**
 * Dependencies
 */

var debug = require('debug')('beam');
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var denodeify = require('promise').denodeify;
var Follower = require('./follower');


/**
 * List of commands used that will need
 * denodeifying for use with co.
 */

var cmds = [
  "smembers",
  "sadd",
  "srem",
  "del",
  "publish"
];


/**
 * Exposing Beam
 */

module.exports = Beam


/**
 * Used to instantiate beam with `opts`
 *
 * Acceptable options include:
 *
 *  * {String} prefix (optional)
 *    - the prefix used on redis keys
 *
 *  * {RedisClient} redis
 *    - client for commands
 *
 *  * {RedisClient} subRedis
 *    - client used to subscribe to
 *      redis channel
 *
 *
 * @param {Object} opts
 * @api public
 */

function Beam(opts){
  if (!(this instanceof Beam)) return new Beam(opts);

  opts = opts || {};
  this.prefix = opts.prefix || 'beam:0:';

  debug('setting up beam with prefix %s', this.prefix);

  if (!opts.redis) {
    throw new Error('no redis');
  }

  this.redis = denodeifyRedisCmds(opts.redis);

  if (opts.subRedis) {
    this.subscriptions = {};
    this.setMaxListeners(0);
    this.listening = true;
    this.subRedis = opts.subRedis;
    this.subRedis.on('message', this.onRedisMessage.bind(this));
    this.subRedis.subscribe(this.prefix + 'channel');
    debug('listening for messages');
  }
}

/**
 * Mixin Emitter
 */

inherits(Beam, EventEmitter);

/**
 * Used to stop redis listening
 *
 * @api public
 */

Beam.prototype.end = function(){
  debug('ending connections');
  this.redis.end();

  if (this.subRedis) {
    this.subRedis.unsubscribe();
    this.subRedis.end();
  }
}

/**
 * Subscribe a given `session` to `resource`
 *
 * @param {String} session
 * @param {String} resource
 * @api public
 */

Beam.prototype.subscribe = function *(session, resource){
  yield this.redis.sadd(this.prefix + 'session:' + session, resource);
  yield this.redis.publish(this.prefix + 'channel', JSON.stringify({
    type: 'subscribe',
    session: session,
    resource: resource
  }))
}


/**
 * Unsubscribe a `session` from `resource`
 * or optionally skip the `resource` 
 * and it will unsubscribe all resources.
 *
 * @param {String} session
 * @param {String} resource
 * @api public
 */

Beam.prototype.unsubscribe = function *(session, resource){
  if (typeof resource === 'undefined') {
    yield this.redis.del(this.prefix + 'session:' + session);
    yield this.redis.publish(this.prefix + 'channel', JSON.stringify({
      type: 'unsubscribe_all',
      session: session
    }))
    return;
  }

  yield this.redis.srem(this.prefix + 'session:' + session, resource);
  yield this.redis.publish(this.prefix + 'channel', JSON.stringify({
    type: 'unsubscribe',
    session: session,
    resource: resource
  }))
}

/**
 * Broadcast a `resource` change along with
 * the `body` you want to emit.
 *
 * @param {String} resource
 * @param {Object} body
 * @api public
 */

Beam.prototype.broadcast = function *(resource, body){
  yield this.redis.publish(this.prefix + 'channel', JSON.stringify({
    type: 'broadcast',
    resource: resource,
    body: body
  }))
}


/**
 * Handles messages coming direct from redis.
 *
 * Makes sure the channel is the one used 
 * by Beam. Parses JSON, and emits message.
 *
 * @param {String} channel
 * @param {string} msg
 * @api private
 */

Beam.prototype.onRedisMessage = function(channel, msg){
  if (channel !== (this.prefix + 'channel')) return;

  try {
    var msg = JSON.parse(msg);
  } catch (e) {
    debug('error parsing redis message json', e, e.stack);
    return;
  }

  this.emit('message', msg); 
  return this;
}


/**
 * Follows a given `session` and invokes
 * the `fn` every time a resource changes
 * that is subscribed to `session`.
 *
 * Returns a Function which is used to
 * unfollow and stop invokation of `fn`
 *
 * @param {String} channel
 * @param {string} msg
 * @return {Function}
 * @api public
 */

Beam.prototype.follow = function *(session, fn) {
  var self = this;
  var subs = this.subscriptions;
  var follower = subs[session];

  if (!follower) {
    debug('new follow for session "%s"', session)
    follower = subs[session] = new Follower(session, this);
    follower.once('destroy', function(){
      self.removeListener('message', follower.onMessage);
      delete self.subscriptions[session];
    });
    this.on('message', follower.onMessage);
  } else {
    debug('existing follow for session "%s"', session)
  }

  var resources = yield this.redis.smembers(this.prefix + 'session:' + session);
  follower.refresh(resources);

  // register a new callback, and return a
  // function for unregistering.
  return follower.register(fn);;
}



/**
 * Loops through the cmds and denodeifys
 * them.
 *
 * @param {RedisClient} redis
 * @api private
 */

function denodeifyRedisCmds(redis){
  for (var i = cmds.length - 1; i >= 0; i--) {
    redis[cmds[i]] = denodeify(redis[cmds[i]]);
  };
  return redis;
}