import { ProjectStatus } from './project.entity';
import {
  assertOwnerProjectTransition,
  assertProjectTransition,
  canTransitionProject,
} from './project.rules';

describe('project rules', () => {
  it('lets an inactive project become active', () => {
    expect(
      canTransitionProject(ProjectStatus.Inactive, ProjectStatus.Active),
    ).toBe(true);
  });

  it('does not reopen completed or cancelled projects', () => {
    for (const from of [ProjectStatus.Completed, ProjectStatus.Cancelled]) {
      for (const to of Object.values(ProjectStatus)) {
        expect(() => assertProjectTransition(from, to)).toThrow();
      }
    }
  });

  it('does not let an inactive project skip straight to completed', () => {
    expect(() =>
      assertProjectTransition(ProjectStatus.Inactive, ProjectStatus.Completed),
    ).toThrow('A project cannot go from inactive to completed');
  });

  it('does not let the owner activate a project directly', () => {
    expect(() =>
      assertOwnerProjectTransition(
        ProjectStatus.Inactive,
        ProjectStatus.Active,
      ),
    ).toThrow(
      'A project becomes active only when the client accepts a proposal',
    );
  });

  it('lets the owner cancel or complete projects', () => {
    expect(() =>
      assertOwnerProjectTransition(
        ProjectStatus.Inactive,
        ProjectStatus.Cancelled,
      ),
    ).not.toThrow();
    expect(() =>
      assertOwnerProjectTransition(
        ProjectStatus.Active,
        ProjectStatus.Completed,
      ),
    ).not.toThrow();
  });
});
