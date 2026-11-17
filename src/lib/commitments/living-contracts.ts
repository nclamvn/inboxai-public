import { z } from 'zod'
import { createCommitment } from './contracts'

export const livingEvent = z.strictObject({
  source:z.string().min(1).max(80), origin:z.string().min(1).max(80), item:z.number().int().min(1).max(4),
  kind:z.enum(['create','deadline','owner','completed','cancelled']),
  certainty:z.enum(['firm','tentative','request','quoted']),
  title:z.string().min(1).max(200), owner:z.string().max(254).nullable(),due:z.string().max(40).nullable(),
  quote:z.string().min(1).max(480),
})
export const livingOutput=z.strictObject({events:z.array(livingEvent).max(32)})
export type LivingEvent=z.infer<typeof livingEvent>
export type LivingMail={id:string;sender:string;account:string|null;subject:string|null;body:string;at:string;arrivedAt:string;fingerprint:string}
export type LivingScope={scopeKey:string;fingerprint:string;messages:LivingMail[];analyses:{id:string;model:string}[]}
export type ReviewedEvent=LivingEvent & {referenceKey:string;blocked:string|null;index:number;target:string|null;version:number|null;
  disposition?:{version:number;active:boolean;reason:'not_commitment'|'not_relevant'|'duplicate'|null;at?:string}|null;
  previous:z.infer<typeof createCommitment.shape.state>|null;receipt:{id:string;version:number}|null;
  dateResolution?:{value:string|null;status:'resolved'|'absent'|'ambiguous';reason?:string}|null}
export type LivingReview={id:string;sourceId:string;subject?:string|null;model:string;metrics:{elapsedMs:number;inputTokens:number;outputTokens:number;calls:number;inputDigest?:string;
  coverage?:{messages:number;proposals:number;blocked:number;unresolvedDates:number}};stale:boolean;events:ReviewedEvent[]}
export const livingCommand=z.discriminatedUnion('action',[
  z.strictObject({action:z.literal('analyze'),sourceId:z.uuid()}),
  z.strictObject({action:z.literal('review'),analysisId:z.uuid(),index:z.number().int().min(0).max(31),expectedDecisionVersion:z.number().int().min(0),expectedVersion:z.number().int().positive().nullable(),decision:z.enum(['dismiss','restore']),reason:z.enum(['not_commitment','not_relevant','duplicate']).nullable()}),
  z.strictObject({action:z.literal('confirm'),analysisId:z.uuid(),index:z.number().int().min(0).max(31),expectedVersion:z.number().int().positive().nullable(),state:createCommitment.shape.state}),
])

export function proposedLivingState(event:ReviewedEvent) {
  const initial={title:event.title,ownerName:null,ownerEmail:event.owner,dueOn:event.due,dueAt:null,status:'open' as const}
  if(event.kind==='create') return initial
  if(!event.previous) return null
  const {review:ignored,...previous}=event.previous as typeof event.previous & {review?:unknown}
  void ignored
  if(event.kind==='deadline') return {...previous,dueOn:event.due,dueAt:null}
  if(event.kind==='owner') return {...previous,ownerEmail:event.owner,ownerName:null}
  return {...previous,status:event.kind==='cancelled'?'cancelled' as const:'completed' as const}
}
