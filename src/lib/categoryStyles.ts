import type { Category } from '../model/profile'

/** Category colors come from CSS variables so light/dark values swap in one place (see index.css). */
export const CATEGORY_COLOR: Record<Category | 'unassigned', string> = {
  needs: 'var(--c-needs)',
  wants: 'var(--c-wants)',
  savings: 'var(--c-savings)',
  unassigned: 'var(--c-unassigned)',
}

export const CATEGORY_DOT: Record<Category, string> = { needs: 'bg-(--c-needs)', wants: 'bg-(--c-wants)', savings: 'bg-(--c-savings)' }
