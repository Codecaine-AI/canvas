export type BoardFactsProps = { facts: string[] };

/** The board facts list of the end-of-turn board-render detail block. */
export function BoardFacts({ facts }: BoardFactsProps) {
  return (
    <ul
      data-canvas-board-facts=""
      className="space-y-1 text-[length:var(--ds-font-size-ui-lg)] leading-[var(--ds-line-height-reading)] text-foreground"
    >
      {facts.map((fact, index) => (
        <li key={`${index}:${fact}`} className="break-words">
          {fact}
        </li>
      ))}
    </ul>
  );
}
