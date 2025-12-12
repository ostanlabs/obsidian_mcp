import {
  Accomplishment,
  AccomplishmentFrontmatter,
  AccomplishmentSummary,
  Config,
  CreateAccomplishmentData,
  UpdateAccomplishmentData,
  NotFoundError,
  Effort,
  Priority,
  AccomplishmentStatus,
} from '../models/types.js';
import { parseAccomplishment, serializeAccomplishment } from '../parsers/markdown-parser.js';
import { readFile, writeFileAtomic, deleteFile, fileExists, listFiles } from '../utils/file-utils.js';
import {
  getAccomplishmentsPath,
  getAccomplishmentFilePath,
  getRelativeAccomplishmentPath,
} from '../utils/config.js';
import {
  generateAccomplishmentId,
  addAccomplishmentNode,
  removeAccomplishmentNode,
  loadCanvas,
  getNodeIdsByFilePaths,
  updateNodePosition,
  addDependencyEdge,
} from './canvas-service.js';
import { calculatePosition } from '../utils/positioning.js';
import { findNodeByFile } from '../parsers/canvas-parser.js';

/**
 * Create a new accomplishment
 */
export async function createAccomplishment(
  config: Config,
  data: CreateAccomplishmentData
): Promise<Accomplishment> {
  const canvasSource = data.canvas_source || config.defaultCanvas;
  
  // Generate ID
  const id = await generateAccomplishmentId(config, canvasSource);
  
  // Create frontmatter
  const now = new Date().toISOString();
  const frontmatter: AccomplishmentFrontmatter = {
    type: 'accomplishment',
    title: data.title,
    id,
    effort: data.effort,
    status: data.status || 'Not Started',
    priority: data.priority || 'High',
    inProgress: false,
    depends_on: data.depends_on || [],
    created_by_plugin: true,
    collapsed_height: 300,
    expanded_height: 300,
    expanded_width: 400,
    created: now,
    updated: now,
    canvas_source: canvasSource,
    vault_path: getRelativeAccomplishmentPath(config, data.title),
  };

  // Create accomplishment object
  const accomplishment: Accomplishment = {
    frontmatter,
    outcome: data.outcome || 'Describe the final state that will be true once this is done.',
    acceptance_criteria: data.acceptance_criteria || [],
    tasks: [],
    notes: '',
  };

  // Write MD file
  const filePath = getAccomplishmentFilePath(config, data.title);
  const content = serializeAccomplishment(accomplishment);
  await writeFileAtomic(filePath, content);

  // Calculate position based on dependencies
  const canvas = await loadCanvas(config, canvasSource);
  let dependsOnNodeIds: string[] = [];
  
  if (data.depends_on && data.depends_on.length > 0) {
    // Get file paths for dependencies
    const depFilePaths = await getFilePathsForIds(config, data.depends_on);
    dependsOnNodeIds = await getNodeIdsByFilePaths(config, depFilePaths, canvasSource);
  }
  
  const position = calculatePosition(canvas, dependsOnNodeIds);

  // Add node to canvas
  const newNodeFilePath = getRelativeAccomplishmentPath(config, data.title);
  await addAccomplishmentNode(
    config,
    newNodeFilePath,
    position,
    canvasSource
  );

  // Create edges for dependencies
  if (data.depends_on && data.depends_on.length > 0) {
    const depFilePaths = await getFilePathsForIds(config, data.depends_on);
    for (const blockerFilePath of depFilePaths) {
      await addDependencyEdge(config, blockerFilePath, newNodeFilePath, canvasSource);
    }
  }

  return accomplishment;
}

/**
 * Get an accomplishment by ID
 */
export async function getAccomplishment(
  config: Config,
  id: string
): Promise<Accomplishment> {
  const filePath = await findAccomplishmentFileById(config, id);
  if (!filePath) {
    throw new NotFoundError(`Accomplishment not found: ${id}`);
  }

  const content = await readFile(filePath);
  const accomplishment = parseAccomplishment(content);
  
  // Compute is_blocked
  accomplishment.is_blocked = await isAccomplishmentBlocked(config, accomplishment);
  
  return accomplishment;
}

/**
 * Update an accomplishment
 */
export async function updateAccomplishment(
  config: Config,
  id: string,
  data: UpdateAccomplishmentData
): Promise<Accomplishment> {
  const accomplishment = await getAccomplishment(config, id);
  const oldTitle = accomplishment.frontmatter.title;

  // Update frontmatter fields
  if (data.title !== undefined) accomplishment.frontmatter.title = data.title;
  if (data.effort !== undefined) accomplishment.frontmatter.effort = data.effort;
  if (data.priority !== undefined) accomplishment.frontmatter.priority = data.priority;
  if (data.status !== undefined) accomplishment.frontmatter.status = data.status;
  if (data.inProgress !== undefined) accomplishment.frontmatter.inProgress = data.inProgress;

  // Update body sections
  if (data.outcome !== undefined) accomplishment.outcome = data.outcome;
  if (data.acceptance_criteria !== undefined) accomplishment.acceptance_criteria = data.acceptance_criteria;
  if (data.notes !== undefined) accomplishment.notes = data.notes;

  // Update timestamp
  accomplishment.frontmatter.updated = new Date().toISOString();

  // Handle title change (file rename)
  if (data.title && data.title !== oldTitle) {
    const oldFilePath = getAccomplishmentFilePath(config, oldTitle);
    const newFilePath = getAccomplishmentFilePath(config, data.title);
    
    // Update vault_path in frontmatter
    accomplishment.frontmatter.vault_path = getRelativeAccomplishmentPath(config, data.title);
    
    // Write to new file
    const content = serializeAccomplishment(accomplishment);
    await writeFileAtomic(newFilePath, content);
    
    // Delete old file
    await deleteFile(oldFilePath);
    
    // TODO: Update canvas node file reference
  } else {
    // Write to existing file
    const filePath = getAccomplishmentFilePath(config, accomplishment.frontmatter.title);
    const content = serializeAccomplishment(accomplishment);
    await writeFileAtomic(filePath, content);
  }

  return accomplishment;
}

/**
 * Delete an accomplishment
 */
export async function deleteAccomplishment(
  config: Config,
  id: string
): Promise<void> {
  const accomplishment = await getAccomplishment(config, id);
  const title = accomplishment.frontmatter.title;
  const canvasSource = accomplishment.frontmatter.canvas_source;

  // Delete MD file
  const filePath = getAccomplishmentFilePath(config, title);
  await deleteFile(filePath);

  // Remove from canvas
  await removeAccomplishmentNode(
    config,
    getRelativeAccomplishmentPath(config, title),
    canvasSource
  );

  // Update other accomplishments that depend on this one
  const allAccomplishments = await listAllAccomplishments(config);
  for (const acc of allAccomplishments) {
    if (acc.frontmatter.depends_on.includes(id)) {
      acc.frontmatter.depends_on = acc.frontmatter.depends_on.filter(depId => depId !== id);
      acc.frontmatter.updated = new Date().toISOString();
      
      const accFilePath = getAccomplishmentFilePath(config, acc.frontmatter.title);
      const content = serializeAccomplishment(acc);
      await writeFileAtomic(accFilePath, content);
    }
  }
}

/**
 * List all accomplishments
 */
export async function listAllAccomplishments(config: Config): Promise<Accomplishment[]> {
  const accomplishmentsPath = getAccomplishmentsPath(config);
  const files = await listFiles(accomplishmentsPath);
  
  const accomplishments: Accomplishment[] = [];
  
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    
    try {
      const filePath = `${accomplishmentsPath}/${file}`;
      const content = await readFile(filePath);
      const accomplishment = parseAccomplishment(content);
      accomplishment.is_blocked = await isAccomplishmentBlocked(config, accomplishment);
      accomplishments.push(accomplishment);
    } catch {
      // Skip files that can't be parsed
    }
  }
  
  return accomplishments;
}

/**
 * List accomplishments with optional filtering
 */
export async function listAccomplishments(
  config: Config,
  status?: AccomplishmentStatus,
  canvasSource?: string
): Promise<AccomplishmentSummary[]> {
  const accomplishments = await listAllAccomplishments(config);
  
  let filtered = accomplishments;
  
  if (status) {
    filtered = filtered.filter(a => a.frontmatter.status === status);
  }
  
  if (canvasSource) {
    filtered = filtered.filter(a => a.frontmatter.canvas_source === canvasSource);
  }
  
  return filtered.map(a => toSummary(a));
}

/**
 * Convert accomplishment to summary
 */
function toSummary(accomplishment: Accomplishment): AccomplishmentSummary {
  const completedTasks = accomplishment.tasks.filter(t => t.status === 'Complete').length;
  
  return {
    id: accomplishment.frontmatter.id,
    title: accomplishment.frontmatter.title,
    status: accomplishment.frontmatter.status,
    priority: accomplishment.frontmatter.priority,
    effort: accomplishment.frontmatter.effort,
    inProgress: accomplishment.frontmatter.inProgress,
    is_blocked: accomplishment.is_blocked || false,
    depends_on: accomplishment.frontmatter.depends_on,
    task_count: accomplishment.tasks.length,
    completed_task_count: completedTasks,
  };
}

/**
 * Check if an accomplishment is blocked by incomplete dependencies
 */
async function isAccomplishmentBlocked(
  config: Config,
  accomplishment: Accomplishment
): Promise<boolean> {
  const dependsOn = accomplishment.frontmatter.depends_on;
  if (!dependsOn || dependsOn.length === 0) {
    return false;
  }

  for (const depId of dependsOn) {
    try {
      const dep = await getAccomplishmentById(config, depId);
      if (dep && dep.frontmatter.status !== 'Completed') {
        return true;
      }
    } catch {
      // Dependency not found - consider it blocking
      return true;
    }
  }

  return false;
}

/**
 * Find accomplishment file path by ID
 */
async function findAccomplishmentFileById(
  config: Config,
  id: string
): Promise<string | null> {
  const accomplishmentsPath = getAccomplishmentsPath(config);
  const files = await listFiles(accomplishmentsPath);
  
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    
    const filePath = `${accomplishmentsPath}/${file}`;
    try {
      const content = await readFile(filePath);
      const idMatch = content.match(/^id:\s*(.+)$/m);
      if (idMatch && idMatch[1].trim() === id) {
        return filePath;
      }
    } catch {
      // Skip unreadable files
    }
  }
  
  return null;
}

/**
 * Get accomplishment by ID (internal helper)
 */
async function getAccomplishmentById(
  config: Config,
  id: string
): Promise<Accomplishment | null> {
  const filePath = await findAccomplishmentFileById(config, id);
  if (!filePath) return null;
  
  const content = await readFile(filePath);
  return parseAccomplishment(content);
}

/**
 * Get file paths for accomplishment IDs
 */
async function getFilePathsForIds(
  config: Config,
  ids: string[]
): Promise<string[]> {
  const paths: string[] = [];
  
  for (const id of ids) {
    const acc = await getAccomplishmentById(config, id);
    if (acc) {
      paths.push(getRelativeAccomplishmentPath(config, acc.frontmatter.title));
    }
  }
  
  return paths;
}

/**
 * Reposition an accomplishment based on its dependencies
 */
export async function repositionAccomplishment(
  config: Config,
  id: string
): Promise<{ x: number; y: number }> {
  const accomplishment = await getAccomplishment(config, id);
  const canvasSource = accomplishment.frontmatter.canvas_source;
  
  // Get dependency node IDs
  const depFilePaths = await getFilePathsForIds(config, accomplishment.frontmatter.depends_on);
  const depNodeIds = await getNodeIdsByFilePaths(config, depFilePaths, canvasSource);
  
  // Calculate new position
  const canvas = await loadCanvas(config, canvasSource);
  const position = calculatePosition(canvas, depNodeIds);
  
  // Update node position
  const filePath = getRelativeAccomplishmentPath(config, accomplishment.frontmatter.title);
  await updateNodePosition(config, filePath, position, canvasSource);
  
  return position;
}

