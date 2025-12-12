// Export all tool definitions and handlers
export {
  manageAccomplishmentDefinition,
  handleManageAccomplishment,
  type ManageAccomplishmentInput,
} from './manage-accomplishment.js';

export {
  manageDependencyDefinition,
  handleManageDependency,
  type ManageDependencyInput,
} from './manage-dependency.js';

export {
  manageTaskDefinition,
  handleManageTask,
  type ManageTaskInput,
} from './manage-task.js';

export {
  setWorkFocusDefinition,
  handleSetWorkFocus,
  type SetWorkFocusInput,
} from './set-work-focus.js';

export {
  getAccomplishmentDefinition,
  handleGetAccomplishment,
  type GetAccomplishmentInput,
} from './get-accomplishment.js';

export {
  listAccomplishmentsDefinition,
  handleListAccomplishments,
  type ListAccomplishmentsInput,
} from './list-accomplishments.js';

export {
  getCurrentWorkDefinition,
  handleGetCurrentWork,
  type GetCurrentWorkInput,
} from './get-current-work.js';

export {
  getBlockedItemsDefinition,
  handleGetBlockedItems,
  type GetBlockedItemsInput,
} from './get-blocked-items.js';

export {
  getReadyToStartDefinition,
  handleGetReadyToStart,
  type GetReadyToStartInput,
} from './get-ready-to-start.js';

export {
  getProjectStatusDefinition,
  handleGetProjectStatus,
  type GetProjectStatusInput,
} from './get-project-status.js';

export {
  readDocsDefinition,
  handleReadDocs,
  type ReadDocsInput,
} from './read-docs.js';

export {
  updateDocDefinition,
  handleUpdateDoc,
  type UpdateDocInput,
} from './update-doc.js';

export {
  listWorkspacesDefinition,
  handleListWorkspaces,
  type ListWorkspacesInput,
} from './list-workspaces.js';

export {
  listFilesDefinition,
  handleListFiles,
  type ListFilesInput,
} from './list-files.js';

export {
  getAccomplishmentsGraphDefinition,
  handleGetAccomplishmentsGraph,
  type GetAccomplishmentsGraphInput,
} from './get-accomplishments-graph.js';

// All tool definitions for registration
export const allToolDefinitions = [
  manageAccomplishmentDefinition,
  manageDependencyDefinition,
  manageTaskDefinition,
  setWorkFocusDefinition,
  getAccomplishmentDefinition,
  listAccomplishmentsDefinition,
  getCurrentWorkDefinition,
  getBlockedItemsDefinition,
  getReadyToStartDefinition,
  getProjectStatusDefinition,
  getAccomplishmentsGraphDefinition,
  readDocsDefinition,
  updateDocDefinition,
  listWorkspacesDefinition,
  listFilesDefinition,
];

// Import definitions for the array
import { manageAccomplishmentDefinition } from './manage-accomplishment.js';
import { manageDependencyDefinition } from './manage-dependency.js';
import { manageTaskDefinition } from './manage-task.js';
import { setWorkFocusDefinition } from './set-work-focus.js';
import { getAccomplishmentDefinition } from './get-accomplishment.js';
import { listAccomplishmentsDefinition } from './list-accomplishments.js';
import { getCurrentWorkDefinition } from './get-current-work.js';
import { getBlockedItemsDefinition } from './get-blocked-items.js';
import { getReadyToStartDefinition } from './get-ready-to-start.js';
import { getProjectStatusDefinition } from './get-project-status.js';
import { readDocsDefinition } from './read-docs.js';
import { updateDocDefinition } from './update-doc.js';
import { listWorkspacesDefinition } from './list-workspaces.js';
import { listFilesDefinition } from './list-files.js';
import { getAccomplishmentsGraphDefinition } from './get-accomplishments-graph.js';

