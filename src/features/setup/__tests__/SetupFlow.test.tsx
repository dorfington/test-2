import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../../../App'
import { useBudgetStore } from '../../../store/useBudgetStore'

beforeEach(() => {
  localStorage.clear()
  useBudgetStore.getState().reset()
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never
  window.scrollTo = () => {}
})

describe('setup flow', () => {
  it('validates, walks through all steps and shows take-home pay', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Enter your annual salary.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Annual salary (before taxes)'), '75000')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await user.selectOptions(screen.getByLabelText('State you live in'), 'TX')
    expect(screen.getByText("Texas doesn't tax wages.")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await user.click(screen.getByRole('button', { name: 'See my budget' }))
    // Texas single $75,000 (2026): 75,000 - 7,670 federal - 5,737.50 FICA = 61,592.50/yr = 5,132.71/mo
    expect((await screen.findAllByText('$5,132.71')).length).toBeGreaterThan(0)

    // Saved to localStorage and editable later via the stepper
    expect(localStorage.getItem('take-home-budget')).toContain('"annualSalary":75000')
    await user.click(screen.getByRole('button', { name: /Income/ }))
    expect(screen.getByLabelText('Annual salary (before taxes)')).toHaveValue(75000)
  })
})
