import {
  Task,
  TaskData,
  TaskStatus,
  Config,
  NotFoundError,
  Accomplishment,
} from '../models/types.js';
import { parseTaskId, generateTaskId, serializeAccomplishment } from '../parsers/markdown-parser.js';
import { getAccomplishment, updateAccomplishment } from './accomplishment-service.js';
import { getAccomplishmentFilePath } from '../utils/config.js';
import { writeFileAtomic } from '../utils/file-utils.js';

/**
 * Add a task to an accomplishment
 */
export async function addTask(
  config: Config,
  accomplishmentId: string,
  data: TaskData
): Promise<Task> {
  const accomplishment = await getAccomplishment(config, accomplishmentId);
  
  // Determine next task number
  const maxNumber = accomplishment.tasks.reduce(
    (max, t) => Math.max(max, t.number),
    0
  );
  
  const task: Task = {
    number: maxNumber + 1,
    name: data.name,
    goal: data.goal,
    description: data.description || '',
    technical_notes: data.technical_notes,
    estimate: data.estimate,
    status: data.status || 'Open',
    notes: data.notes,
  };
  
  accomplishment.tasks.push(task);
  accomplishment.frontmatter.updated = new Date().toISOString();
  
  // Save accomplishment
  const filePath = getAccomplishmentFilePath(config, accomplishment.frontmatter.title);
  const content = serializeAccomplishment(accomplishment);
  await writeFileAtomic(filePath, content);
  
  return task;
}

/**
 * Update a task
 */
export async function updateTask(
  config: Config,
  accomplishmentId: string,
  taskId: string,
  data: Partial<TaskData>
): Promise<Task> {
  const accomplishment = await getAccomplishment(config, accomplishmentId);
  
  // Parse task ID to get task number
  const parsed = parseTaskId(taskId);
  if (!parsed) {
    throw new NotFoundError(`Invalid task ID format: ${taskId}`);
  }
  
  // Find task by number
  const taskIndex = accomplishment.tasks.findIndex(t => t.number === parsed.taskNumber);
  if (taskIndex === -1) {
    throw new NotFoundError(`Task not found: ${taskId}`);
  }
  
  const task = accomplishment.tasks[taskIndex];
  
  // Update task fields
  if (data.name !== undefined) task.name = data.name;
  if (data.goal !== undefined) task.goal = data.goal;
  if (data.description !== undefined) task.description = data.description;
  if (data.technical_notes !== undefined) task.technical_notes = data.technical_notes;
  if (data.estimate !== undefined) task.estimate = data.estimate;
  if (data.status !== undefined) task.status = data.status;
  if (data.notes !== undefined) task.notes = data.notes;
  
  accomplishment.frontmatter.updated = new Date().toISOString();
  
  // Save accomplishment
  const filePath = getAccomplishmentFilePath(config, accomplishment.frontmatter.title);
  const content = serializeAccomplishment(accomplishment);
  await writeFileAtomic(filePath, content);
  
  return task;
}

/**
 * Remove a task from an accomplishment
 */
export async function removeTask(
  config: Config,
  accomplishmentId: string,
  taskId: string
): Promise<void> {
  const accomplishment = await getAccomplishment(config, accomplishmentId);
  
  // Parse task ID to get task number
  const parsed = parseTaskId(taskId);
  if (!parsed) {
    throw new NotFoundError(`Invalid task ID format: ${taskId}`);
  }
  
  // Find and remove task
  const taskIndex = accomplishment.tasks.findIndex(t => t.number === parsed.taskNumber);
  if (taskIndex === -1) {
    throw new NotFoundError(`Task not found: ${taskId}`);
  }
  
  accomplishment.tasks.splice(taskIndex, 1);
  
  // Renumber remaining tasks
  accomplishment.tasks.forEach((task, index) => {
    task.number = index + 1;
  });
  
  accomplishment.frontmatter.updated = new Date().toISOString();
  
  // Save accomplishment
  const filePath = getAccomplishmentFilePath(config, accomplishment.frontmatter.title);
  const content = serializeAccomplishment(accomplishment);
  await writeFileAtomic(filePath, content);
}

/**
 * Get a task by ID
 */
export async function getTask(
  config: Config,
  accomplishmentId: string,
  taskId: string
): Promise<Task> {
  const accomplishment = await getAccomplishment(config, accomplishmentId);
  
  const parsed = parseTaskId(taskId);
  if (!parsed) {
    throw new NotFoundError(`Invalid task ID format: ${taskId}`);
  }
  
  const task = accomplishment.tasks.find(t => t.number === parsed.taskNumber);
  if (!task) {
    throw new NotFoundError(`Task not found: ${taskId}`);
  }
  
  return task;
}

/**
 * Set task status and optionally update accomplishment inProgress
 */
export async function setTaskStatus(
  config: Config,
  accomplishmentId: string,
  taskId: string,
  status: TaskStatus
): Promise<{ task: Task; accomplishment: Accomplishment }> {
  const accomplishment = await getAccomplishment(config, accomplishmentId);
  
  const parsed = parseTaskId(taskId);
  if (!parsed) {
    throw new NotFoundError(`Invalid task ID format: ${taskId}`);
  }
  
  const task = accomplishment.tasks.find(t => t.number === parsed.taskNumber);
  if (!task) {
    throw new NotFoundError(`Task not found: ${taskId}`);
  }
  
  task.status = status;
  
  // If task is set to InProgress, auto-set accomplishment inProgress
  if (status === 'InProgress') {
    accomplishment.frontmatter.inProgress = true;
  }
  
  accomplishment.frontmatter.updated = new Date().toISOString();
  
  // Save accomplishment
  const filePath = getAccomplishmentFilePath(config, accomplishment.frontmatter.title);
  const content = serializeAccomplishment(accomplishment);
  await writeFileAtomic(filePath, content);
  
  return { task, accomplishment };
}

/**
 * Get all tasks with a specific status across all accomplishments
 */
export async function getTasksByStatus(
  config: Config,
  status: TaskStatus,
  accomplishments: Accomplishment[]
): Promise<Array<{ accomplishmentId: string; task: Task }>> {
  const results: Array<{ accomplishmentId: string; task: Task }> = [];
  
  for (const acc of accomplishments) {
    for (const task of acc.tasks) {
      if (task.status === status) {
        results.push({
          accomplishmentId: acc.frontmatter.id,
          task,
        });
      }
    }
  }
  
  return results;
}

