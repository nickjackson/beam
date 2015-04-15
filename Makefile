
BIN = iojs

ifeq ($(findstring io.js, $(shell which node)),)
	BIN = node
endif

ifeq (node, $(BIN))
	FLAGS = --harmony-generators
endif


test:
	@NODE_ENV=test $(BIN) $(FLAGS) \
		./node_modules/.bin/_mocha \
		--require co-mocha \
		--reporter spec \
		--bail

test-cov:
	@NODE_ENV=test $(BIN) $(FLAGS) \
		./node_modules/.bin/istanbul cover \
		./node_modules/.bin/_mocha \
		-- -u exports \
		--require co-mocha \
		--reporter spec

test-travis:
	@NODE_ENV=test $(BIN) $(FLAGS) \
		./node_modules/.bin/istanbul cover \
		./node_modules/.bin/_mocha \
		--report lcovonly \
		-- -u exports \
		--require co-mocha \
		--reporter spec

.PHONY: test