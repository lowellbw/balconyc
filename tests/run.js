#!/usr/bin/env node
// Test entry point: node tests/run.js  (or: npm test)

const harness = require('./harness');

require('./sun-position.test.js');
require('./geometry.test.js');
require('./shadow-model.test.js');
require('./self-consumption.test.js');
require('./model.test.js');
require('./pvwatts-path.test.js');
require('./content.test.js');

// Async assertions resolve on the microtask queue; report after they settle.
setImmediate(() => { harness.report(); });
