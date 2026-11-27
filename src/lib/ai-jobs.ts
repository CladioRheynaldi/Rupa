import type { AIJob, State } from "./model";
// Preserve daily request accounting when visible generation history is replaced.
export function indexAIRequests(state: State) {
  for (const job of state.jobs) {
    if (!state.audit.some(a=>a.action==="request_ai"&&a.target===job.id))
      state.audit.push({id:`ai-request-${job.id}`,actor:job.ownerId,action:"request_ai",target:job.id,detail:job.mode,at:job.createdAt});
  }
}
export function replaceDesignJob(state: State, job: AIJob) {
  indexAIRequests(state);
  if (["design","preview"].includes(job.mode))
    state.jobs=state.jobs.filter(old=>old.orderId!==job.orderId || old.ownerId!==job.ownerId || !["design","preview"].includes(old.mode));
  state.jobs.push(job);
  indexAIRequests(state);
}

export function dailyAILimit(localDemo:boolean,configured?:string) {
  if (!localDemo) return 20;
  const value=Number(configured);
  return Number.isInteger(value)&&value>=20&&value<=100?value:20;
}
