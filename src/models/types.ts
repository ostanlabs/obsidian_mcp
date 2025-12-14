// Enums
export type AccomplishmentStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Blocked';
export type TaskStatus = 'Open' | 'InProgress' | 'Complete' | 'OnHold';
export type Effort = 'Business' | 'Infra' | 'Engineering' | 'Research';
export type Priority = 'Low' | 'Medium' | 'High' | 'Critical';

// Accomplishment Frontmatter
export interface AccomplishmentFrontmatter {
  type: 'accomplishment';
  title: string;
  id: string;
  effort: Effort;
  status: AccomplishmentStatus;
  priority: Priority;
  inProgress: boolean;
  depends_on: string[];
  created_by_plugin: boolean;
  collapsed_height: number;
  expanded_height: number;
  expanded_width: number;
  created: string;
  updated: string;
  canvas_source: string;
  vault_path: string;
  notion_page_id?: string;
}

// Task
export interface Task {
  number: number;
  name: string;
  goal: string;
  description: string;
  technical_notes?: string;
  estimate?: number;
  status: TaskStatus;
  notes?: string;
}

// Full Accomplishment (parsed from MD file)
export interface Accomplishment {
  frontmatter: AccomplishmentFrontmatter;
  outcome: string;
  acceptance_criteria: string[];
  tasks: Task[];
  notes: string;
  // Computed fields
  is_blocked?: boolean;
}

// Accomplishment Summary (for list operations)
export interface AccomplishmentSummary {
  id: string;
  title: string;
  status: AccomplishmentStatus;
  priority: Priority;
  effort: Effort;
  inProgress: boolean;
  is_blocked: boolean;
  depends_on: string[];
  task_count: number;
  completed_task_count: number;
  updated: string;
}

// Canvas Node
export interface CanvasNode {
  id: string;
  type: 'file' | 'text' | 'link' | 'group';
  file?: string;
  text?: string;
  url?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  styleAttributes?: {
    textAlign?: 'left' | 'center' | 'right';
  };
}

// Canvas Edge
export interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide: 'top' | 'right' | 'bottom' | 'left';
  toSide: 'top' | 'right' | 'bottom' | 'left';
  color?: string;
  label?: string;
}

// Canvas File
export interface CanvasFile {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

// Tool Input Types
export interface CreateAccomplishmentData {
  title: string;
  effort: Effort;
  priority?: Priority;
  status?: AccomplishmentStatus;
  outcome?: string;
  acceptance_criteria?: string[];
  depends_on?: string[];
  canvas_source?: string;
}

export interface UpdateAccomplishmentData {
  title?: string;
  effort?: Effort;
  priority?: Priority;
  status?: AccomplishmentStatus;
  inProgress?: boolean;
  outcome?: string;
  acceptance_criteria?: string[];
  notes?: string;
}

export interface TaskData {
  name: string;
  goal: string;
  description?: string;
  technical_notes?: string;
  estimate?: number;
  status?: TaskStatus;
  notes?: string;
}

// Workspace configuration
export interface WorkspaceConfig {
  path: string;
  description: string;
}

// Configuration
export interface Config {
  vaultPath: string;
  accomplishmentsFolder: string;
  defaultCanvas: string;
  workspaces: Record<string, WorkspaceConfig>; // Map of workspace name to config
}

// Position
export interface Position {
  x: number;
  y: number;
}

// Error types
export class MCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'MCPError';
  }
}

export class NotFoundError extends MCPError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends MCPError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class ConflictError extends MCPError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
  }
}

