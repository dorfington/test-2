/** A pdf.js text item (only the fields we use). */
export interface TextItem {
  str: string
  /** [a, b, c, d, x, y] */
  transform: number[]
  width?: number
}

/**
 * Rebuilds printed rows from PDF text items: items whose baselines are within
 * a couple of points are one row, read left to right.
 */
export function linesFromTextItems(items: TextItem[], tolerance = 2.5): string[] {
  const rows: { y: number; items: TextItem[] }[] = []
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue
    const y = it.transform[5]
    const row = rows.find((r) => Math.abs(r.y - y) <= tolerance)
    if (row) row.items.push(it)
    else rows.push({ y, items: [it] })
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) =>
      r.items
        .sort((a, b) => a.transform[4] - b.transform[4])
        .map((i) => i.str.trim())
        .join(' '),
    )
}
