#!/usr/bin/env node
/** Responsibility: list selected-project blockers. Invariants: dependencies and explicit blockers remain distinct. Initial implementation. */
'use strict';
const { run } = require('./lib/cli');
const { blockerItems } = require('./lib/project-state');
run('blocked', (state) => ({ schema_version: 1, tasks: blockerItems(state) }));
