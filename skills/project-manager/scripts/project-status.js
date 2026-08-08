#!/usr/bin/env node
/** Responsibility: calculate selected-project status. Invariants: read-only and stable facts. Initial implementation. */
'use strict';
const { run } = require('./lib/cli');
const { statusData } = require('./lib/project-state');
run('status', statusData);
