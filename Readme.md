# beam.js

[![Build Status](https://travis-ci.org/nickjackson/beam.svg?branch=master)](https://travis-ci.org/nickjackson/beam)

beam.js is a realtime, subscription based, distributed broadcast emitter built on redis.

## Description
You can use beam to subscribe users to certain resources, such as database records or feeds. When those resources change, you can use beam to broadcast messages with details about the change to the users subscribed.

## Example

```js
// sets up beam with 
var beam = Beam({
    redis: redis.createClient(),
    subRedis: redis.createClient()
})

// follow events that sharon subscribed to.
var unfollow = yield beam.follow('sharon', function(msg){
    console.log(msg.resource)  // 'catpix'
    console.log(msg.body.some) // 'data'
    
    // when you're done unfollow
    unfollow();
})

// setup a driver without 
var driver = Beam({ redis: redis.createClient() });

// subscribe sharon to catpix resource
yield driver.subscribe('sharon', 'catpix');

// broadcast change to catpix resource
yield driver.broadcast('catpix', {some: 'data'});

// unsubscribe sharon from catpix resource
yield driver.unsubscribe('sharon', 'catpix');

```


##API