// Local implementation of the backend interface. For now it delegates
// everything to the Cloud implementation, so running `npm run dev` on this
// machine still works the same way as the deployed site.
//
// As the Local Agent grows filesystem-backed endpoints for the admin app,
// override the matching functions here (e.g. listProjects, getFolderTree,
// createFolder) without touching the views.
import cloud from './backendCloud.js';

export default {
  ...cloud,
  // Local-specific overrides go here.
};
