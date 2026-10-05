import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeExpense } from '../../../model/profile'
import { useBudgetStore } from '../../../store/useBudgetStore'
import { ResultsPage } from '../ResultsPage'

beforeEach(() => {
  useBudgetStore.getState().reset()
  useBudgetStore.getState().update((p) => {
    p.income.annualSalary = 75_000
    p.income.payFrequency = 'monthly'
    p.taxes.state = 'TX'
    p.expenses = [makeExpense('housing', { amount: 2_400 }), makeExpense('dining', { amount: 300 })]
  })
})

describe('results dashboard', () => {
  it('shows take-home pay, the split and flags', () => {
    render(<ResultsPage onEdit={() => {}} />)
    // Texas single $75,000: 61,592.50/yr, paid monthly
    // paid monthly, so the paycheck figure and the monthly breakdown agree
    expect(screen.getAllByText('$5,132.71').length).toBeGreaterThan(0)
    expect(screen.getByText(/Housing is 38% of your gross income/)).toBeInTheDocument()
    expect(screen.getByText('No emergency fund')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Monthly spending: Needs \$2,400/ })).toBeInTheDocument()
  })

  it('updates instantly from the what-if sliders without saving', () => {
    render(<ResultsPage onEdit={() => {}} />)
    fireEvent.change(screen.getByLabelText('Rent / mortgage'), { target: { value: '1500' } })
    expect(screen.queryByText(/Housing is .* of your gross income/)).not.toBeInTheDocument()
    expect(screen.getByText('What-if view, not saved.')).toBeInTheDocument()
    expect(useBudgetStore.getState().profile.expenses[0].amount).toBe(2_400)

    fireEvent.change(screen.getByLabelText('Salary'), { target: { value: '100000' } })
    expect(screen.getByText(/Take-home up/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save to my plan' }))
    const saved = useBudgetStore.getState().profile
    expect(saved.income.annualSalary).toBe(100_000)
    expect(saved.expenses[0].amount).toBe(1_500)
    expect(useBudgetStore.getState().whatIf).toEqual({})
  })
})
