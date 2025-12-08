import {
  Config,
  NotFoundError,
  ValidationError,
} from '../models/types.js';
import { getAccomplishment, repositionAccomplishment } from './accomplishment-service.js';
import { serializeAccomplishment } from '../parsers/markdown-parser.js';
import { getAccomplishmentFilePath, getRelativeAccomplishmentPath } from '../utils/config.js';
import { writeFileAtomic } from '../utils/file-utils.js';
import {
  loadCanvas,
  addDependencyEdge,
  removeDependencyEdge,
} from './canvas-service.js';
import { wouldCreateCycle, findNodeByFile } from '../parsers/canvas-parser.js';

/**
 * Add a dependency between two accomplishments
 */
export async function addDependency(
  config: Config,
  blockerId: string,
  blockedId: string
): Promise<{ position: { x: number; y: number } }> {
  // Validate both accomplishments exist
  const blocker = await getAccomplishment(config, blockerId);
  const blocked = await getAccomplishment(config, blockedId);
  
  if (!blocker) {
    throw new NotFoundError(`Blocker accomplishment not found: ${blockerId}`);
  }
  if (!blocked) {
    throw new NotFoundError(`Blocked accomplishment not found: ${blockedId}`);
  }
  
  // Check for circular dependency
  const canvasSource = blocked.frontmatter.canvas_source;
  const canvas = await loadCanvas(config, canvasSource);
  
  const blockerFilePath = getRelativeAccomplishmentPath(config, blocker.frontmatter.title);
  const blockedFilePath = getRelativeAccomplishmentPath(config, blocked.frontmatter.title);
  
  const blockerNode = findNodeByFile(canvas, blockerFilePath);
  const blockedNode = findNodeByFile(canvas, blockedFilePath);
  
  if (blockerNode && blockedNode) {
    if (wouldCreateCycle(canvas, blockerNode.id, blockedNode.id)) {
      throw new ValidationError(
        `Adding dependency would create a circular dependency: ${blockerId} -> ${blockedId}`
      );
    }
  }
  
  // Check if dependency already exists
  if (blocked.frontmatter.depends_on.includes(blockerId)) {
    // Already exists, just return current position
    const node = findNodeByFile(canvas, blockedFilePath);
    return { position: { x: node?.x || 0, y: node?.y || 0 } };
  }
  
  // Add to depends_on array
  blocked.frontmatter.depends_on.push(blockerId);
  blocked.frontmatter.updated = new Date().toISOString();
  
  // Save blocked accomplishment
  const filePath = getAccomplishmentFilePath(config, blocked.frontmatter.title);
  const content = serializeAccomplishment(blocked);
  await writeFileAtomic(filePath, content);
  
  // Add edge to canvas
  await addDependencyEdge(config, blockerFilePath, blockedFilePath, canvasSource);
  
  // Reposition blocked node
  const position = await repositionAccomplishment(config, blockedId);
  
  return { position };
}

/**
 * Remove a dependency between two accomplishments
 */
export async function removeDependency(
  config: Config,
  blockerId: string,
  blockedId: string
): Promise<void> {
  // Get blocked accomplishment
  const blocked = await getAccomplishment(config, blockedId);
  const blocker = await getAccomplishment(config, blockerId);
  
  if (!blocked) {
    throw new NotFoundError(`Blocked accomplishment not found: ${blockedId}`);
  }
  
  // Remove from depends_on array
  const index = blocked.frontmatter.depends_on.indexOf(blockerId);
  if (index === -1) {
    return; // Dependency doesn't exist
  }
  
  blocked.frontmatter.depends_on.splice(index, 1);
  blocked.frontmatter.updated = new Date().toISOString();
  
  // Save blocked accomplishment
  const filePath = getAccomplishmentFilePath(config, blocked.frontmatter.title);
  const content = serializeAccomplishment(blocked);
  await writeFileAtomic(filePath, content);
  
  // Remove edge from canvas
  const canvasSource = blocked.frontmatter.canvas_source;
  const blockerFilePath = blocker 
    ? getRelativeAccomplishmentPath(config, blocker.frontmatter.title)
    : '';
  const blockedFilePath = getRelativeAccomplishmentPath(config, blocked.frontmatter.title);
  
  if (blockerFilePath) {
    await removeDependencyEdge(config, blockerFilePath, blockedFilePath, canvasSource);
  }
}

/**
 * Get all dependencies for an accomplishment
 */
export async function getDependencies(
  config: Config,
  accomplishmentId: string
): Promise<{ blockers: string[]; blocking: string[] }> {
  const accomplishment = await getAccomplishment(config, accomplishmentId);
  
  // Get what this accomplishment depends on (blockers)
  const blockers = accomplishment.frontmatter.depends_on;
  
  // Get what this accomplishment blocks
  // We need to scan all accomplishments to find ones that depend on this one
  const { listAllAccomplishments } = await import('./accomplishment-service.js');
  const allAccomplishments = await listAllAccomplishments(config);
  
  const blocking = allAccomplishments
    .filter(a => a.frontmatter.depends_on.includes(accomplishmentId))
    .map(a => a.frontmatter.id);
  
  return { blockers, blocking };
}

