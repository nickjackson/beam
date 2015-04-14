# beam

beam is a


## Example

```
var Beam = require('beam.js');
var BeamDriver = require('beam.js/driver');

var beam = new Beam(...)
var driver = new BeamDriver(...)

// subscribe sharon to catpix resource
driver.subscribe('sharon', 'catpix');

// follow events that sharon subscribed to.
beam.follow('sharon', function(body){
	console.log(body.some) // 'data'
})

// broadcast change to catpix resource
driver.broadcast('catpix', {some: 'data'})
```


##API

```
var beam = new beam({
	redis: redis.createClient()
});

```


## subscribe(session, resource)
Subscribes a resource to a session or user.

```
beam.subscribe(session.id, resource.id);

```


## listen(session.id, opts, fn)
Listen for changes

```
beam.listen(session.id, {}, function(event){
	// event.type == 'payload'
	// event.resource == resource.id
	// event.payload == {something: 'changed'}
});

```


## emit(id, payload)
Emits data about a specific resource

```
beam.emit(resource.id, {
	something: 'changed'
});

```