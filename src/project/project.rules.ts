import { ConflictException } from '@nestjs/common';
import { ProjectStatus } from './project.entity';

const PROJECT_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  [ProjectStatus.Inactive]: [ProjectStatus.Active, ProjectStatus.Cancelled],
  [ProjectStatus.Active]: [ProjectStatus.Completed, ProjectStatus.Cancelled],
  [ProjectStatus.Completed]: [],
  [ProjectStatus.Cancelled]: [],
};

export function canTransitionProject(
  from: ProjectStatus,
  to: ProjectStatus,
): boolean {
  return PROJECT_TRANSITIONS[from].includes(to);
}

export function assertProjectTransition(
  from: ProjectStatus,
  to: ProjectStatus,
): void {
  if (!canTransitionProject(from, to)) {
    throw new ConflictException(`A project cannot go from ${from} to ${to}`);
  }
}

// For status changes made through the project endpoints. Activation is left
// out on purpose: only a client accepting a proposal can activate a project.
export function assertOwnerProjectTransition(
  from: ProjectStatus,
  to: ProjectStatus,
): void {
  if (to === ProjectStatus.Active) {
    throw new ConflictException(
      'A project becomes active only when the client accepts a proposal',
    );
  }
  assertProjectTransition(from, to);
}
