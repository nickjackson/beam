

test:
	@NODE_ENV=test node_modules/.bin/mocha \
		--require co-mocha \
		--reporter spec \
		--bail

test-cov:
	@NODE_ENV=test node \
		./node_modules/.bin/istanbul cover \
		./node_modules/.bin/_mocha \
		-- -u exports \
		--require co-mocha \
		--reporter spec

test-travis:
	@NODE_ENV=test node \
		./node_modules/.bin/istanbul cover \
		./node_modules/.bin/_mocha \
		--report lcovonly \
		-- -u exports \
		--require co-mocha \
		--reporter spec

.PHONY: test