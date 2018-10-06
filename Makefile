DIR?=${CURDIR}

all:
	deploy

deploy:
	git release
	git flush
	npm publish

run-test:
	docker run --rm -v ${DIR}:/usr/local/app agregad/node babel-node ./node_modules/mocha/bin/_mocha test/
