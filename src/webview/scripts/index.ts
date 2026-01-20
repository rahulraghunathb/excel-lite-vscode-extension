/**
 * Script Module Index
 * Exports all script modules in the correct order
 */

import { CONSTANTS } from './constants';
import { stateScript } from './state';
import { domScript } from './dom';
import { utilsScript } from './utils';
import { renderScript } from './render';
import { selectionScript } from './selection';
import { resizeScript } from './resize';
import { filterScript } from './filter';
import { eventsScript } from './events';
import { gridEventsScript } from './grid-events';
import { initScript } from './init';

/**
 * Get all scripts combined in correct order
 */
export function getAllScripts(): string {
    return [
        CONSTANTS,
        stateScript,
        domScript,
        utilsScript,
        renderScript,
        selectionScript,
        resizeScript,
        filterScript,
        eventsScript,
        gridEventsScript,
        initScript
    ].join('\n');
}

export {
    CONSTANTS,
    stateScript,
    domScript,
    utilsScript,
    renderScript,
    selectionScript,
    resizeScript,
    filterScript,
    eventsScript,
    gridEventsScript,
    initScript
};
