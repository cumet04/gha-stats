import { DB } from "https://deno.land/x/sqlite/mod.ts";
import {
  ActionsService,
  Job,
  Step,
  Workflow,
  WorkflowRun,
} from "./actionsService.ts";

// deno run --allow-read --allow-env --allow-net ./main.ts owner repo
// tokenに必要な権限の精査はできてない。classicのrepo fullで動くのは確認済

const token = Deno.env.get("GHA_STATS_TOKEN") || Deno.env.get("GITHUB_TOKEN");
if (!token) throw "token not found";
const owner = Deno.args[0];
const repo = Deno.args[1];

const service = new ActionsService(token, owner, repo);

// TODO: 継続利用するのであれば、不要な過去データを取ってこないようにpaginateしたりする必要がある

const workflows = await service.workflows();
const workflow_records = workflows.map((w) => sliceWorkflow(w));

const all_runs = await Promise.all(
  workflows.map((w) => service.workflowRunsFor(w.id)),
);

// TODO: 型の取り方が大変アレなのでちゃんと定義したい
const run_records: ReturnType<typeof sliceRun>[] = [];
const job_records: ReturnType<typeof sliceJob>[] = [];
const step_records:
  (ReturnType<typeof sliceStep> & { id: string; job_id: number })[] = [];

all_runs.forEach((runs) => {
  runs.forEach((run) => {
    run_records.push(sliceRun(run));

    run.jobs.forEach((job) => {
      job_records.push(sliceJob(job));

      job.steps?.forEach((step) => {
        step_records.push({
          id: `${job.id}-${step.number}`,
          job_id: job.id,
          ...sliceStep(step),
        });
      });
    });
  });
});

const db = new DB("gha_stats.db");

sqliteInsertWorkflows(db, workflow_records);
sqliteInsertRuns(db, run_records);
sqliteInsertJobs(db, job_records);
sqliteInsertSteps(db, step_records);

db.close();

// MEMO: githubのAPIから取得できるタイムスタンプはISO8601形式(ミリ秒付き)なので、特にparseせずそのまま文字列で保持する

function sliceWorkflow(workflow: Workflow) {
  const { id, name, path, state, created_at, updated_at } = workflow;
  return { id, name, path, state, created_at, updated_at };
}

function sqliteInsertWorkflows(
  db: DB,
  workflows: ReturnType<typeof sliceWorkflow>[],
) {
  db.query(`
    CREATE TABLE IF NOT EXISTS workflows (
      id INTEGER PRIMARY KEY,
      name TEXT,
      path TEXT,
      state TEXT,
      created_at TEXT,
      updated_at TEXT
    );
  `);
  workflows.forEach((workflow) => {
    db.query(
      `INSERT OR IGNORE INTO workflows (id, name, path, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [
        workflow.id,
        workflow.name,
        workflow.path,
        workflow.state,
        workflow.created_at,
        workflow.updated_at,
      ],
    );
  });
}

function sliceRun(run: WorkflowRun) {
  const {
    id,
    name, // workflowと同じ？
    head_branch,
    head_sha,
    display_title,
    run_number,
    event,
    status,
    conclusion,
    workflow_id,
    created_at,
    updated_at,
    run_attempt,
    run_started_at,
  } = run;
  return {
    id,
    name,
    head_branch,
    head_sha,
    display_title,
    run_number,
    event,
    status,
    conclusion,
    workflow_id,
    created_at,
    updated_at,
    run_attempt,
    run_started_at,
  };
}

function sqliteInsertRuns(db: DB, runs: ReturnType<typeof sliceRun>[]) {
  db.query(`
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY,
      name TEXT,
      head_branch TEXT,
      head_sha TEXT,
      display_title TEXT,
      run_number INTEGER,
      event TEXT,
      status TEXT,
      conclusion TEXT,
      workflow_id INTEGER,
      created_at TEXT,
      updated_at TEXT,
      run_attempt INTEGER,
      run_started_at TEXT
    );
  `);
  runs.forEach((run) => {
    db.query(
      `INSERT OR IGNORE INTO runs (id, name, head_branch, head_sha, display_title, run_number,
        event, status, conclusion, workflow_id, created_at, updated_at, run_attempt, run_started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        run.id,
        run.name,
        run.head_branch,
        run.head_sha,
        run.display_title,
        run.run_number,
        run.event,
        run.status,
        run.conclusion,
        run.workflow_id,
        run.created_at,
        run.updated_at,
        run.run_attempt,
        run.run_started_at,
      ],
    );
  });
}

function sliceJob(job: Job) {
  const {
    id,
    run_id,
    run_attempt, // runとは独立なのか？
    status,
    conclusion,
    created_at,
    started_at,
    completed_at,
    name,
  } = job;
  return {
    id,
    run_id,
    run_attempt,
    status,
    conclusion,
    created_at,
    started_at,
    completed_at,
    name,
  };
}

function sqliteInsertJobs(db: DB, jobs: ReturnType<typeof sliceJob>[]) {
  db.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY,
      run_id INTEGER,
      run_attempt INTEGER,
      status TEXT,
      conclusion TEXT,
      created_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      name TEXT
    );
  `);
  jobs.forEach((job) => {
    db.query(
      `INSERT OR IGNORE INTO jobs (id, run_id, run_attempt, status, conclusion, created_at, started_at, completed_at, name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        job.id,
        job.run_id,
        job.run_attempt,
        job.status,
        job.conclusion,
        job.created_at,
        job.started_at,
        job.completed_at,
        job.name,
      ],
    );
  });
}

function sliceStep(step: Step) {
  const {
    name,
    status,
    conclusion,
    number,
    started_at,
    completed_at,
  } = step;
  return {
    name,
    status,
    conclusion,
    number,
    started_at,
    completed_at,
  };
}

function sqliteInsertSteps(db: DB, steps: typeof step_records) {
  db.query(`
    CREATE TABLE IF NOT EXISTS steps (
      id TEXT PRIMARY KEY,
      job_id INTEGER,
      name TEXT,
      status TEXT,
      conclusion TEXT,
      number INTEGER,
      started_at TEXT,
      completed_at TEXT
    );
  `);
  steps.forEach((step) => {
    db.query(
      `INSERT OR IGNORE INTO steps (id, job_id, name, status, conclusion, number, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        step.id,
        step.job_id,
        step.name,
        step.status,
        step.conclusion,
        step.number,
        step.started_at,
        step.completed_at,
      ],
    );
  });
}
