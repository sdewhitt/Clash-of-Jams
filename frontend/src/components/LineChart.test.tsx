/**
 * User story #33: the reusable line chart, with zero, one and several series.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { LineChart, type ChartSeries } from '@/components/LineChart'

const DAY = 24 * 60 * 60 * 1000
const SEP_1 = Date.UTC(2026, 8, 1)

const labels = { x: 'Date', y: 'Score', series: 'Scenario' }
const formatX = (x: number) => `day ${Math.round((x - SEP_1) / DAY) + 1}`
const formatY = (y: number) => y.toLocaleString()

function renderChart(series: ChartSeries[]) {
  return render(
    <LineChart
      series={series}
      title="Scores over time"
      labels={labels}
      formatX={formatX}
      formatY={formatY}
    />,
  )
}

const warmup: ChartSeries = {
  id: 'warmup',
  label: 'Warmup',
  slot: 0,
  points: [
    { x: SEP_1 + 2 * DAY, y: 80_000, detail: '1 attempt' },
    { x: SEP_1, y: 60_000, detail: '3 attempts' },
  ],
}
const scales: ChartSeries = {
  id: 'scales',
  label: 'Scales',
  slot: 3,
  points: [{ x: SEP_1 + 2 * DAY, y: 50_000 }],
}

describe('LineChart', () => {
  it('shows the empty message for zero data points', () => {
    renderChart([{ ...warmup, points: [] }])

    expect(screen.getByText('No data for this range')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('draws a single data point as a dot, with no line and no legend', () => {
    renderChart([{ ...warmup, points: [warmup.points[0]] }])

    const series = screen.getByTestId('chart-series')
    expect(series.querySelectorAll('circle')).toHaveLength(1)
    expect(series.querySelector('path')).toBeNull()
    expect(screen.queryByRole('list', { name: 'Legend' })).not.toBeInTheDocument()
  })

  it('draws one line per series in its own color slot, with a legend', () => {
    renderChart([warmup, scales])

    const [first, second] = screen.getAllByTestId('chart-series')
    expect(first.querySelector('path')).toHaveAttribute('stroke', 'var(--chart-series-1)')
    expect(second.querySelector('circle')).toHaveAttribute('fill', 'var(--chart-series-4)')
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Warmup',
      'Scales',
    ])
  })

  it('reads out every series at the focused date, moving with the arrow keys', async () => {
    renderChart([warmup, scales])

    await userEvent.tab()
    const latest = screen.getByRole('status')
    expect(latest).toHaveTextContent('day 3')
    expect(latest).toHaveTextContent('80,000')
    expect(latest).toHaveTextContent('Warmup')
    expect(latest).toHaveTextContent('50,000')
    expect(latest).toHaveTextContent('Scales')

    await userEvent.keyboard('{ArrowLeft}')
    const earliest = screen.getByRole('status')
    expect(earliest).toHaveTextContent('day 1')
    expect(earliest).toHaveTextContent('60,000')
    expect(earliest).toHaveTextContent('3 attempts')
    expect(earliest).not.toHaveTextContent('Scales')
  })

  it('snaps the hover readout to the nearest date', () => {
    renderChart([warmup, scales])
    const overlay = screen.getByRole('img').querySelector('rect') as SVGRectElement
    overlay.getBoundingClientRect = () => ({ left: 0, width: 560 }) as DOMRect

    fireEvent.pointerMove(overlay, { clientX: 20 })
    expect(screen.getByRole('status')).toHaveTextContent('day 1')

    fireEvent.pointerLeave(overlay)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('offers every value as a table, oldest first', async () => {
    renderChart([warmup, scales])

    await userEvent.click(screen.getByRole('button', { name: 'Show table' }))

    const rows = within(screen.getByRole('table', { name: 'Scores over time' })).getAllByRole('row')
    expect(rows.slice(1).map((row) => row.textContent)).toEqual([
      'day 1Warmup60,0003 attempts',
      'day 3Scales50,000',
      'day 3Warmup80,0001 attempt',
    ])
    expect(screen.getByRole('button', { name: 'Show chart' })).toBeInTheDocument()
  })
})
