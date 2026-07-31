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
// FIX680: local-app-only (backendCloud.js has neither) — safe no-op
// fallbacks so a production build (impl === cloud) never hard-crashes if
// something reaches these; the UI itself only exposes them behind
// isLocalApp.
export const isLocalModeActive = impl.isLocalModeActive || (() => false);
export const createLocalProject =
  impl.createLocalProject || (() => Promise.reject(new Error('createLocalProject: local-app only')));
// FIX680.3 / FIX680.3.1: local-app-only start-mode popup support. On a
// production build (impl === cloud) the popup itself never renders, so
// these fallbacks only need to not crash if reached, not be meaningful.
export const forceLocalMode = impl.forceLocalMode || (() => {});
export const checkCloudReachable = impl.checkCloudReachable || (() => Promise.resolve(true));
export const listVisits = impl.listVisits;
export const trackVisit = impl.trackVisit;
export const listIpStats = impl.listIpStats;
export const setIpName = impl.setIpName;
export const listUsers = impl.listUsers;
export const createUser = impl.createUser;
export const updateUser = impl.updateUser;
export const deleteUser = impl.deleteUser;
export const grantUserProject = impl.grantUserProject;
export const revokeUserProject = impl.revokeUserProject;
export const redeemAccount = impl.redeemAccount;
export const signupVisitor = impl.signupVisitor;
export const contactAdmin = impl.contactAdmin;
export const listContactMessages = impl.listContactMessages;
export const listAdminProjects = impl.listAdminProjects;
export const createAdminProject = impl.createAdminProject;
export const updateAdminProject = impl.updateAdminProject;
export const clearProjectManagers = impl.clearProjectManagers;
export const moveAdminProject = impl.moveAdminProject;
export const listAppVersions = impl.listAppVersions;
export const listLanguages = impl.listLanguages;
export const createLanguage = impl.createLanguage;
export const updateLanguage = impl.updateLanguage;
export const deleteLanguage = impl.deleteLanguage;

// Writes
export const saveSetup = impl.saveSetup;
export const importGsheet = impl.importGsheet;
export const getExistingImages = impl.getExistingImages;
export const signUpload = impl.signUpload;
export const confirmImage = impl.confirmImage;
export const deleteOrphanImage = impl.deleteOrphanImage;
export const updateImage = impl.updateImage;
export const replaceImageBytes = impl.replaceImageBytes;
export const setFolderZoomFactor = impl.setFolderZoomFactor;
export const updateFolderImage = impl.updateFolderImage;
export const deleteFolderImage = impl.deleteFolderImage;
export const updateProject = impl.updateProject;
export const signProjectCoverUpload = impl.signProjectCoverUpload;
export const createFolder = impl.createFolder;
export const renameFolder = impl.renameFolder;
export const setFolderProperty = impl.setFolderProperty;
export const getEditLock = impl.getEditLock;
export const acquireEditLock = impl.acquireEditLock;
export const heartbeatEditLock = impl.heartbeatEditLock;
export const releaseEditLock = impl.releaseEditLock;
export const setEditLockPendingChanges = impl.setEditLockPendingChanges;
