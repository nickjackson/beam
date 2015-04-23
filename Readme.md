# beam.js

[![Build Status](https://travis-ci.org/nickjackson/beam.svg?branch=master)](https://travis-ci.org/nickjackson/beam)

beam.js is a distributed realtime broadcast emitter, built on top of redis.

## Description
You can use beam to subscribe users to certain resources, such as database records or feeds. When those resources change, you can use beam to broadcast messages with details about the change to the users subscribed.

## API

```js

// setup a driver without watching
var driver = Beam({ redis: redis.createClient() });

// subscribe sharon to catpix resource
yield driver.subscribe('sharon', 'catpix');

// broadcast change to catpix resource
yield driver.broadcast('catpix', {some: 'data'});

// unsubscribe sharon from catpix resource
yield driver.unsubscribe('sharon', 'catpix');

// sets up beam to watch for messages
var beam = Beam({
    redis: redis.createClient(),
    subRedis: redis.createClient()
})

// follow events that sharon subscribed to.
var unfollow = yield beam.follow('sharon', function(msg){
    // this callback will be invoked when a `broadcast`
    // occours for a resource that sharon is subscribed to.
    
    // when you're done unfollow
    unfollow();
})

```
