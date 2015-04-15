
/**
 * Dependencies
 */

var debug = require('debug')('beam:follower')
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;

/**
 * Exposing Follower
 */

module.exports = Follower;


/**
 * Instantiates a follower with `session`
 *
 * @param {String} session
 * @api private
 */

function Follower(session){
  this.id = session;
  this.resources = new Set();
  this.registers = 0;
  this.onMessage = this.onMessage.bind(this);
}


/**
 * Mixin Emitter
 */

inherits(Follower, EventEmitter);


/**
 * Destroys self
 *
 * @api private
 */

Follower.prototype.destroy = function(){
  debug('destroying session "%s"', this.id);
  this.registers = 0;
  this.emit('destroy');
  this.removeAllListeners();
  delete this.resources;
  delete this.onMessage;
  this.destroyed = true;
}


/**
 * Refreshes the followers resources
 *
 * @param {Array} resources
 * @api private
 */

Follower.prototype.refresh = function(resources){
  this.resources = new Set(resources);
  debug('refreshing "%s" has "%s" subscribed resources', this.id, this.resources.size);
  return this;
}


/**
 * Register another `fn` callback for this
 * follower, to be invoked on a broadcast
 * event.
 *
 * Returns a function to be used as a
 * way of unregistering the `fn` callback
 * and destroying the follower when
 * the last fn is unregistered.
 *
 * @param {Function} fn
 * @return {Function}
 * @api private
 */

Follower.prototype.register = function(fn){
  var self = this;
  this.on('broadcast', fn);
  this.registers++;

  return function(){
    if (self.destroyed) return false;
    debug('unfollow for session "%s"', self.id);
    self.registers--;
    if (self.registers < 1) {
      self.destroy();
      return true;
    }
    return self.removeListener('broadcast', fn);
  }
}


/**
 * Handles messages passed down by beam.
 *
 * 1) Checks to see if the message is a broadcast
 *     and targeted at resource this follower
 *     is subscribed to. If thats the case, it
 *     will trigger emitters assigned to
 *     the broadcast event.
 *
 * 2) Keeps follower resources up to date by
 *     updating `this.resources` when an event
 *     comes targeted to the current follower/session.
 *
 *
 * @param {Object} msg
 * @api private
 */

Follower.prototype.onMessage = function(msg){
  var resources = this.resources;
  var session = this.id;

  if (msg.type === 'broadcast') {
    if (!msg.resource) {
      debug('broadcast: no "resource", so ignoring. %o', msg);
      return;
    }

    // if this session is not subscribed to resource,
    // return early.
    if (!resources.has(msg.resource)) return;

    debug('broadcast: for "%s" : sending to "%s"', msg.resource, session);
    this.emit('broadcast', msg);
    return;
  }

  // all tasks below require session matching session
  if (!msg.session || msg.session !== session) return;
  
  // unsubscribes all resources from current session
  if (msg.type === 'unsubscribe_all') {
    debug('unsubscribing all from %s', session);
    resources.clear();
  }

  if (msg.type === 'subscribe') {
    debug('subscribing resource "%s" to "%s"', msg.resource, session);
    resources.add(msg.resource);
  }

  if (msg.type === 'unsubscribe') {
    debug('unsubscribing resource "%s" from "%s"', msg.resource, session);
    resources.delete(msg.resource);
  }
}