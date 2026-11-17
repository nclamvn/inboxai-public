import { z } from 'zod'
import { livingOutput,type LivingMail } from './living-contracts'
import {livingClaims,livingEvidenceRules,livingExtractionVersion,livingModelInput,enrichLivingClaims} from './living-extraction'

export const localLivingModel='qwen3-4b-living'
export const livingModelId=localLivingModel+':85e4a5b7:'+livingExtractionVersion+':guard-v4'
export const livingEndpoint='http://127.0.0.1:57340'
let active=false
export async function livingChat(messages:{role:string;content:string}[],schema:Record<string,unknown>,maxTokens=1800) {
  const start=performance.now()
  const response=await fetch(livingEndpoint+'/v1/chat/completions',{method:'POST',redirect:'error',
    signal:AbortSignal.timeout(60_000),headers:{'content-type':'application/json'},body:JSON.stringify({
      model:localLivingModel,messages,temperature:0,seed:82,max_tokens:maxTokens,cache_prompt:false,
      response_format:{type:'json_schema',json_schema:{name:'commitments',strict:true,schema}},
    })})
  if(!response.ok)throw new Error('Local model unavailable')
  const text=await response.text()
  if(text.length>128000)throw new Error('Model response too large')
  const result=JSON.parse(text)
  if(result.model!==localLivingModel||result.choices?.[0]?.finish_reason!=='stop')throw new Error('Model did not complete within its budget')
  return {output:JSON.parse(result.choices[0].message.content),metrics:{elapsedMs:Math.round(performance.now()-start),
    calls:1,inputTokens:result.usage?.prompt_tokens??0,outputTokens:result.usage?.completion_tokens??0}}
}
export async function interpretLivingMail(messages:LivingMail[]) {
  if(active)throw new Error('Local model busy')
  active=true
  try {
    const input=livingModelInput(messages)
    const result=await livingChat([{role:'system',content:livingEvidenceRules},{role:'user',content:JSON.stringify(input)}],z.toJSONSchema(livingClaims))
    const claims=livingClaims.parse(result.output)
    return {...result,claims:claims.events,events:livingOutput.parse({events:enrichLivingClaims(claims,messages)}).events}
  } finally {active=false}
}
