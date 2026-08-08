#!/usr/bin/env node
/** Responsibility: validate one selected project. Invariants: read-only and exact v1 envelope. Initial implementation. */
'use strict';
const { run } = require('./lib/cli');
const { validateData } = require('./lib/project-state');
run('validate', validateData);
