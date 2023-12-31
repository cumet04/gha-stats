import { Octokit } from "npm:@octokit/rest@19.0.7";

type ActionsClient = InstanceType<typeof Octokit>["rest"]["actions"];

export type Workflow = Awaited<
  ReturnType<ActionsClient["listRepoWorkflows"]>
>["data"]["workflows"][0];

export type WorkflowRun = Awaited<
  ReturnType<ActionsClient["listWorkflowRuns"]>
>["data"]["workflow_runs"][0];

export type Job = Awaited<
  ReturnType<ActionsClient["listJobsForWorkflowRun"]>
>["data"]["jobs"][0];

export type Step = Exclude<Job["steps"], undefined>[0];

export class ActionsService {
  private octokit: Octokit;
  constructor(
    githubToken: string,
    private owner: string,
    private repo: string,
  ) {
    this.octokit = new Octokit({ auth: githubToken });
  }

  async workflows(): Promise<Workflow[]> {
    const resp = await this.octokit.rest.actions.listRepoWorkflows({
      owner: this.owner,
      repo: this.repo,
    });
    return resp.data.workflows;
  }

  async workflowRunsFor(workflow_id: string | number) {
    const runs = (await this.octokit.rest.actions.listWorkflowRuns({
      owner: this.owner,
      repo: this.repo,
      workflow_id,
      per_page: 100, // TODO: いい感じの値にする？
    })).data.workflow_runs;

    return await Promise.all(runs.map((run) => this.attachJobsTo(run)));
  }

  private async attachJobsTo(
    run: WorkflowRun,
  ): Promise<WorkflowRun & { jobs: Job[] }> {
    const jobs = (await this.octokit.rest.actions.listJobsForWorkflowRun({
      owner: this.owner,
      repo: this.repo,
      run_id: run.id,
    })).data.jobs;

    return {
      ...run,
      jobs,
    };
  }
}
