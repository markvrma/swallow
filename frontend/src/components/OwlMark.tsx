/** The owl, as a braille dot grid: 16x16 dots, i.e. 8x4 braille cells.
 *  Drawn as dots rather than braille characters because font metrics tile the
 *  glyphs unevenly and the shape falls apart -- edit the grid, one '#' per dot. */
const OWL = [
  '.#............#.',
  '.##..........##.',
  '..############..',
  '.##############.',
  '################',
  '##...######...##',
  '##...######...##',
  '################',
  '#######..#######',
  '.#####....#####.',
  '.##############.',
  '.##..######..##.',
  '..##.######.##..',
  '...##########...',
  '....##....##....',
  '...##......##...',
]

// Braille spacing: dots are tight inside a cell, cells sit further apart.
const PITCH = 3
const CELL_GAP_X = 1.6
const CELL_GAP_Y = 1.6
const RADIUS = 1.15

const dotX = (col: number) => col * PITCH + Math.floor(col / 2) * CELL_GAP_X
const dotY = (row: number) => row * PITCH + Math.floor(row / 4) * CELL_GAP_Y

export default function OwlMark({ className = '' }: { className?: string }) {
  const width = dotX(15) + RADIUS * 2
  const height = dotY(15) + RADIUS * 2

  return (
    <svg
      aria-hidden
      viewBox={`${-RADIUS} ${-RADIUS} ${width} ${height}`}
      className={`h-9 w-auto ${className}`}
      fill="currentColor"
    >
      {OWL.flatMap((line, row) =>
        [...line].map((dot, col) =>
          dot === '#' ? (
            <circle key={`${row}-${col}`} cx={dotX(col)} cy={dotY(row)} r={RADIUS} />
          ) : null,
        ),
      )}
    </svg>
  )
}
