import {
  difference,
  parse,
} from "https://deno.land/std@0.182.0/datetime/mod.ts";
import { ActionsService } from "./actionsService.ts";

// deno run --allow-read --allow-env --allow-net ./main.ts owner repo
// tokenに必要な権限の精査はできてない。classicのrepo fullで動くのは確認済

const token = Deno.env.get("GHA_STATS_TOKEN") || Deno.env.get("GITHUB_TOKEN");
if (!token) throw "token not found";
const owner = Deno.args[0];
const repo = Deno.args[1];

const service = new ActionsService(token, owner, repo);

const workflows = await service.workflows();
console.log(workflows);

const workflow_id = 12345; // console.logを見ながらそれっぽいやつを埋める
const runs = await service.workflowRunsFor(workflow_id);

const all_steps = runs.flatMap((run) =>
  run.jobs.flatMap((job) =>
    (job.steps ?? []).map((step) => {
      const iso8601 = "yyyy-MM-ddTHH:mm:ss.SSS+09:00";
      const start = parse(step.started_at!, iso8601);
      const end = parse(step.completed_at!, iso8601);

      return {
        job_id: job.id,
        run_id: job.run_id,
        workflow_name: run.name ?? "",
        ...step,
        seconds: difference(start, end).seconds ?? 0,
      };
    })
  )
);

const keys = Object.keys(all_steps[0]);
console.log(keys.join(","));

all_steps.forEach((step) => {
  // deno-lint-ignore no-explicit-any
  const values = keys.map((k) => (step as any)[k]);
  console.log(values.join(",")); // workflow名にカンマがあったら知らん
});
