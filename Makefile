

test:
	@node_modules/.bin/mocha \
		--require co-mocha \
		--reporter spec \
		--bail

test-cov:
	@node \
		./node_modules/.bin/istanbul cover \
		./node_modules/.bin/_mocha \
		-- -u exports \
		--require co-mocha \
		--reporter spec

.PHONY: test