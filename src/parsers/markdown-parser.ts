import YAML from 'yaml';
import {
  Accomplishment,
  AccomplishmentFrontmatter,
  Task,
  TaskStatus,
  MCPError,
} from '../models/types.js';

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
const TASK_HEADER_REGEX = /^### Task (\d+): (.+)$/;
const TASK_FIELD_REGEX = /^- \*\*(.+?):\*\* (.*)$/;

/**
 * Parse an accomplishment markdown file
 */
export function parseAccomplishment(content: string): Accomplishment {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) {
    throw new MCPError('Invalid markdown format: missing frontmatter', 'PARSE_ERROR', 500);
  }

  const [, frontmatterYaml, body] = match;
  
  // Parse frontmatter
  let frontmatter: AccomplishmentFrontmatter;
  try {
    frontmatter = YAML.parse(frontmatterYaml) as AccomplishmentFrontmatter;
  } catch (e) {
    throw new MCPError(`Failed to parse frontmatter YAML: ${e}`, 'PARSE_ERROR', 500);
  }

  // Ensure depends_on is an array
  if (!frontmatter.depends_on) {
    frontmatter.depends_on = [];
  }

  // Parse body sections
  const sections = parseBodySections(body);

  return {
    frontmatter,
    outcome: sections.outcome,
    acceptance_criteria: sections.acceptance_criteria,
    tasks: sections.tasks,
    notes: sections.notes,
  };
}

interface BodySections {
  outcome: string;
  acceptance_criteria: string[];
  tasks: Task[];
  notes: string;
}

/**
 * Parse body sections from markdown
 */
function parseBodySections(body: string): BodySections {
  const lines = body.split('\n');
  
  let currentSection = '';
  let outcome = '';
  let acceptance_criteria: string[] = [];
  let tasks: Task[] = [];
  let notes = '';
  
  let currentTask: Partial<Task> | null = null;
  let taskLines: string[] = [];

  for (const line of lines) {
    // Check for H2 section headers
    if (line.startsWith('## ')) {
      // Save previous task if any
      if (currentTask && currentSection === 'tasks') {
        tasks.push(finalizeTask(currentTask, taskLines));
        currentTask = null;
        taskLines = [];
      }
      
      const sectionName = line.substring(3).trim().toLowerCase();
      if (sectionName.includes('outcome')) {
        currentSection = 'outcome';
      } else if (sectionName.includes('acceptance')) {
        currentSection = 'acceptance';
      } else if (sectionName.includes('task')) {
        currentSection = 'tasks';
      } else if (sectionName.includes('note')) {
        currentSection = 'notes';
      }
      continue;
    }

    // Check for H3 task headers
    const taskMatch = line.match(TASK_HEADER_REGEX);
    if (taskMatch && currentSection === 'tasks') {
      // Save previous task
      if (currentTask) {
        tasks.push(finalizeTask(currentTask, taskLines));
        taskLines = [];
      }
      
      currentTask = {
        number: parseInt(taskMatch[1], 10),
        name: taskMatch[2],
        status: 'Not Started',
      };
      continue;
    }

    // Process content based on current section
    switch (currentSection) {
      case 'outcome':
        if (line.trim()) {
          outcome += (outcome ? '\n' : '') + line;
        }
        break;
        
      case 'acceptance':
        if (line.trim().startsWith('- [')) {
          // Extract criterion text (remove checkbox)
          const criterion = line.replace(/^- \[.\] /, '').trim();
          if (criterion) {
            acceptance_criteria.push(criterion);
          }
        }
        break;
        
      case 'tasks':
        if (currentTask) {
          taskLines.push(line);
        }
        break;
        
      case 'notes':
        notes += (notes ? '\n' : '') + line;
        break;
    }
  }

  // Save last task
  if (currentTask) {
    tasks.push(finalizeTask(currentTask, taskLines));
  }

  return {
    outcome: outcome.trim(),
    acceptance_criteria,
    tasks,
    notes: notes.trim(),
  };
}

/**
 * Finalize a task from collected lines
 */
function finalizeTask(partial: Partial<Task>, lines: string[]): Task {
  const task: Task = {
    number: partial.number || 0,
    name: partial.name || '',
    goal: '',
    description: '',
    status: 'Not Started',
  };

  for (const line of lines) {
    const match = line.match(TASK_FIELD_REGEX);
    if (match) {
      const [, field, value] = match;
      const fieldLower = field.toLowerCase();

      if (fieldLower === 'goal') {
        task.goal = value;
      } else if (fieldLower === 'description') {
        task.description = value;
      } else if (fieldLower === 'technical notes') {
        task.technical_notes = value;
      } else if (fieldLower === 'estimate') {
        const hours = parseFloat(value.replace('h', ''));
        if (!isNaN(hours)) {
          task.estimate = hours;
        }
      } else if (fieldLower === 'status') {
        task.status = parseTaskStatus(value);
      } else if (fieldLower === 'notes') {
        task.notes = value;
      }
    }
  }

  return task;
}

/**
 * Parse task status from string
 */
function parseTaskStatus(value: string): TaskStatus {
  const normalized = value.toLowerCase().replace(/[^a-z]/g, '');

  if (normalized.includes('inprogress') || normalized.includes('progress')) {
    return 'In Progress';
  } else if (normalized.includes('complete') || normalized.includes('done')) {
    return 'Completed';
  } else if (normalized.includes('hold') || normalized.includes('paused') || normalized.includes('block')) {
    return 'Blocked';
  }
  return 'Not Started';
}

/**
 * Serialize an accomplishment to markdown
 */
export function serializeAccomplishment(accomplishment: Accomplishment): string {
  const { frontmatter, outcome, acceptance_criteria, tasks, notes } = accomplishment;
  
  // Serialize frontmatter
  const frontmatterYaml = YAML.stringify(frontmatter).trim();
  
  // Build body
  let body = `# ${frontmatter.title} (Accomplishment)\n\n`;
  
  // Outcome section
  body += `## Outcome\n\n${outcome || 'Describe the final state that will be true once this is done.'}\n\n`;
  
  // Acceptance Criteria section
  body += `## Acceptance Criteria\n\n`;
  if (acceptance_criteria.length > 0) {
    for (const criterion of acceptance_criteria) {
      body += `- [ ] ${criterion}\n`;
    }
  } else {
    body += `- [ ] Criterion 1\n- [ ] Criterion 2\n`;
  }
  body += '\n';
  
  // Tasks section
  body += `## Tasks\n\n`;
  if (tasks.length > 0) {
    for (const task of tasks) {
      body += serializeTask(task);
    }
  }
  
  // Notes section
  body += `## Notes\n\n${notes || ''}\n`;
  
  return `---\n${frontmatterYaml}\n---\n\n${body}`;
}

/**
 * Serialize a single task to markdown
 */
function serializeTask(task: Task): string {
  let md = `### Task ${task.number}: ${task.name}\n`;
  md += `- **Goal:** ${task.goal || '[What this task achieves]'}\n`;
  md += `- **Description:** ${task.description || '[Details]'}\n`;
  
  if (task.technical_notes !== undefined) {
    md += `- **Technical Notes:** ${task.technical_notes}\n`;
  }
  
  if (task.estimate !== undefined) {
    md += `- **Estimate:** ${task.estimate}h\n`;
  }
  
  md += `- **Status:** ${task.status}\n`;
  
  if (task.notes !== undefined) {
    md += `- **Notes:** ${task.notes}\n`;
  }
  
  md += '\n';
  return md;
}

/**
 * Generate task ID from accomplishment ID and task
 */
export function generateTaskId(accomplishmentId: string, task: Task): string {
  return `${accomplishmentId}:Task ${task.number}:${task.name}`;
}

/**
 * Parse task ID to extract components
 */
export function parseTaskId(taskId: string): { accomplishmentId: string; taskNumber: number; taskName: string } | null {
  const match = taskId.match(/^(.+):Task (\d+):(.+)$/);
  if (!match) return null;
  
  return {
    accomplishmentId: match[1],
    taskNumber: parseInt(match[2], 10),
    taskName: match[3],
  };
}

