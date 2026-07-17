type StepControlsProps = {
  step: number;
  operations: readonly unknown[];
  playing: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onTogglePlayback: () => void;
  onStepChange: (step: number) => void;
};

export function StepControls({
  step,
  operations,
  playing,
  onPrevious,
  onNext,
  onTogglePlayback,
  onStepChange,
}: StepControlsProps) {
  const currentOperation = step > 0 ? operations[step - 1] : null;
  return (
    <>
      <h2 className="section-title">Build-out</h2>
      <div className="step-card">
        <div className="step-buttons">
          <button type="button" disabled={step === 0} onClick={onPrevious}>⏮ Prev</button>
          <button type="button" disabled={step === operations.length} onClick={onNext}>Next ⏭</button>
          <button
            type="button"
            className={playing ? "playing" : undefined}
            title="Auto-play at 600ms per operation"
            aria-label={playing ? "Pause auto-play" : "Auto-play"}
            onClick={onTogglePlayback}
          >
            {playing ? "❚❚" : "▶"}
          </button>
        </div>
        <div className="step-meta">
          <span>Applied operations</span>
          <strong>{step} / {operations.length}</strong>
        </div>
        <input
          type="range"
          min={0}
          max={operations.length}
          step={1}
          value={step}
          aria-label="Applied operation count"
          onChange={(event) => onStepChange(Number(event.currentTarget.value))}
        />
        <div className="op-status">
          {currentOperation
            ? `op ${step - 1}  ${JSON.stringify(currentOperation)}`
            : "No operations applied — empty board."}
        </div>
      </div>
    </>
  );
}
