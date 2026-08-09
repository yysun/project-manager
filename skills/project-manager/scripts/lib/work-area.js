/**
 * Responsibility: single shared definition of the isolated same-filesystem
 * project work area contract (prefix, name pattern, and recovery marker).
 * Invariants: mutations.js (which creates work areas) and project-state.js
 * (which must recognize and exclude them from project discovery) read from
 * this one source so the two can never drift apart.
 */
'use strict';

const PROJECT_WORK_PREFIX = '.project-manager-work-';
const PROJECT_WORK_NAME = /^\.project-manager-work-[a-f0-9]{24}$/;
const PROJECT_WORK_MARKER = '.rpd-project-manager-work-v1';
const PROJECT_WORK_MARKER_TEXT = 'RPD Project Manager work area v1\n';

module.exports = { PROJECT_WORK_PREFIX, PROJECT_WORK_NAME, PROJECT_WORK_MARKER, PROJECT_WORK_MARKER_TEXT };
