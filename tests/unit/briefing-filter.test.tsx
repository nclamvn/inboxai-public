// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { useBriefingFilter } from '@/hooks/use-briefing-filter'

beforeEach(() => sessionStorage.clear())
afterEach(cleanup)
const saved = { type:'needs_reply', title:'Thư cần phản hồi', emailIds:['source-a'] }

it('keeps the SSR snapshot empty while restoring the matching browser filter', () => {
  sessionStorage.setItem('briefing_filter',JSON.stringify(saved))
  function Server() { return <span>{useBriefingFilter('needs_reply').filter?.title ?? 'Empty'}</span> }
  expect(renderToString(<Server />)).toContain('Empty')
  const hook = renderHook(({type})=>useBriefingFilter(type),{initialProps:{type:'needs_reply'}})
  expect(hook.result.current.filter).toEqual(saved)
  hook.rerender({type:'overdue'})
  expect(hook.result.current.filter).toBeNull()
})

it('clears the visible filter immediately and removes its saved source IDs', () => {
  sessionStorage.setItem('briefing_filter',JSON.stringify(saved))
  const hook=renderHook(()=>useBriefingFilter('needs_reply'))
  act(()=>hook.result.current.clear())
  expect(hook.result.current.filter).toBeNull()
  expect(sessionStorage.getItem('briefing_filter')).toBeNull()
})

it.each(['{invalid',JSON.stringify({...saved,emailIds:[42]})])('ignores malformed saved filters without crashing the inbox: %s', raw => {
  sessionStorage.setItem('briefing_filter',raw)
  const hook=renderHook(()=>useBriefingFilter('needs_reply'))
  expect(hook.result.current.filter).toBeNull()
})
