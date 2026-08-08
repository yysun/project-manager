#!/usr/bin/env node
/** Responsibility: calculate configured traceability coverage. Invariants: absent means unconfigured. Initial implementation. */
'use strict';
const { run } = require('./lib/cli');
const { coverageData } = require('./lib/project-state');
run('coverage', coverageData);
