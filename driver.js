
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var promise = require('promise');
var denodeify = promise.denodeify;

module.exports = BeamDriver



function BeamDriver(opts){
  opts = opts || {};
  this.prefix = opts.prefix || 'beam:0:';

  if (!opts.redis) {
    throw new Error('no redis');
  }

  this.redis = opts.redis;
  this.redis.sadd = denodeify(this.redis.sadd);
  this.redis.srem = denodeify(this.redis.srem);
  this.redis.del = denodeify(this.redis.del);
}

inherits(BeamDriver, EventEmitter);


BeamDriver.prototype.subscribe = function *(session, resource){
  yield this.redis.sadd(this.prefix + 'session:' + session, resource);
  this.redis.publish(this.prefix + 'channel', JSON.stringify({
    type: 'subscribe',
    session: session,
    resource: resource
  }))
}


BeamDriver.prototype.unsubscribe = function *(session, resource){
  if (typeof resource === 'undefined') {
    yield this.redis.del(this.prefix + 'session:' + session);
    this.redis.publish(this.prefix + 'channel', JSON.stringify({
      type: 'unsubscribe_all',
      session: session
    }))
    return;
  }

  yield this.redis.srem(this.prefix + 'session:' + session, resource);
  this.redis.publish(this.prefix + 'channel', JSON.stringify({
    type: 'unsubscribe',
    session: session,
    resource: resource
  }))

}

BeamDriver.prototype.broadcast = function *(resource, body){
  this.redis.publish(this.prefix + 'channel', JSON.stringify({
    type: 'broadcast',
    resource: resource,
    body: body
  }))
}

