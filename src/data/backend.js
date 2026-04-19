// Single entry point that views import from. Auto-picks the implementation:
// `npm run dev` on the admin machine → Local; production bundle → Cloud.
// Views never import backendCloud/backendLocal directly.
import cloud from './backendCloud.js';
import local from './backendLocal.js';

const impl = import.meta.env.DEV ? local : cloud;

export const setAuthToken = impl.setAuthToken;

// Reads
export const listProjects = impl.listProjects;
export const getShowcase = impl.getShowcase;
export const getFolderImages = impl.getFolderImages;

// Writes
export const saveSetup = impl.saveSetup;
export const importGsheet = impl.importGsheet;
export const createFolder = impl.createFolder;
export const renameFolder = impl.renameFolder;
export const setFolderProperty = impl.setFolderProperty;
