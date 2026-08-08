#!/usr/bin/env node
/** Responsibility: normalize selected-project facts for reports. Invariants: audience prose cannot change facts. Initial implementation. */
'use strict';
const { run } = require('./lib/cli');
const { reportData } = require('./lib/project-state');
run('report-data', reportData);
