#!/usr/bin/env node
// Test entry point: node tests/run.js  (or: npm test)

const harness = require('./harness');

require('./sun-position.test.js');
require('./shadow-model.test.js');
require('./model.test.js');
require('./content.test.js');

// Async assertions inside model.test.js resolve on the microtask/immediate
// queue, so report after the queue drains.
setImmediate(() => setImmediate(() => harness.report()));
