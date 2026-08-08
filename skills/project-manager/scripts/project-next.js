#!/usr/bin/env node
/** Responsibility: rank selected-project ready work. Invariants: blockers filtered; stable tie-breaks. Initial implementation. */
'use strict';
const { run } = require('./lib/cli');
const { nextData } = require('./lib/project-state');
run('next', nextData);
