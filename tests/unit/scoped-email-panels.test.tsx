// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ActionItemsCard } from '@/components/email/action-items-card'
import { SmartReply } from '@/components/email/smart-reply'

const action = (title: string) => ({ actions: [{ id:title, type:'task', title, description:null,
  due_date:null, priority:'medium', status:'pending', context:'Synthetic source' }] })
const suggestion = (label: string) => ({ suggestions: [{ intent:'confirm', label, icon:'check',
  preview:label, fullReply:label, subject:'Re: Synthetic mail' }] })

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it.each(['actions','suggestions'] as const)('%s arriving late cannot replace the newly selected email', async kind => {
  const requests: { signal: AbortSignal; resolve: (response: Response) => void }[] = []
  vi.stubGlobal('fetch',vi.fn((_url: string, options: RequestInit) => new Promise<Response>(resolve => {
    requests.push({ signal:options.signal as AbortSignal, resolve })
  })))
  const panel = (id: string) => kind==='actions' ? <ActionItemsCard emailId={id} /> : <SmartReply emailId={id} onReply={vi.fn()} />
  const payload = kind==='actions' ? action : suggestion
  const view = render(panel('email-a'))
  expect(requests).toHaveLength(1)
  view.rerender(panel('email-b'))
  expect(requests).toHaveLength(2)
  expect(requests[0].signal.aborted).toBe(true)
  await act(async () => { requests[1].resolve(Response.json(payload('Current email B'))) })
  expect(screen.getByText('Current email B')).toBeTruthy()
  // Simulate a transport that still delivers the old response after abort.
  await act(async () => { requests[0].resolve(Response.json(payload('Old email A'))) })
  expect(screen.queryByText('Old email A')).toBeNull()
  expect(screen.getByText('Current email B')).toBeTruthy()
  view.unmount()
  expect(requests[1].signal.aborted).toBe(true)
})

it('a rejected status update restores the unfinished action instead of showing success', async () => {
  const errors=vi.spyOn(console,'error').mockImplementation(()=>{})
  vi.stubGlobal('fetch',vi.fn((_url: string, options?: RequestInit) => Promise.resolve(
    options?.method==='PATCH' ? Response.json({error:'Denied'},{status:403}) : Response.json(action('Receive corrected invoice')),
  )))
  render(<ActionItemsCard emailId="email-a" />)
  const toggle=await screen.findByRole('button',{name:'Hoàn thành: Receive corrected invoice'})
  await act(async () => { toggle.click() })
  expect(screen.getByRole('button',{name:'Hoàn thành: Receive corrected invoice'}).getAttribute('aria-pressed')).toBe('false')
  expect(errors).toHaveBeenCalled()
  errors.mockRestore()
})
